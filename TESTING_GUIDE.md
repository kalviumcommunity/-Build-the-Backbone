# Part A Testing & Validation Guide

## Quick Overview

This guide walks you through running the optimized QuickBite API and validating that the performance improvements are working correctly. This includes running Artillery load tests and query counting to verify the fixes.

---

## Prerequisites

Before running tests, ensure you have:

-  PostgreSQL 14+ running and accessible
-  Node.js 18+ installed
-  Dependencies installed: `npm install`
-  `.env` file configured with `DATABASE_URL`
-  Database initialized with migrations
-  Seed data loaded (30,000+ records)

---

## Step 1: Database Setup

### If starting fresh:

```bash
# Set your PostgreSQL connection string in .env
# Example: postgresql://postgres:password@localhost:5432/quickbite

# Run migrations (tables only, no indexes)
psql "$DATABASE_URL" -f migrations/001_create_tables.sql

# Seed with test data (1,000 users, 100 restaurants, 5,000 orders, 25,000+ items)
psql "$DATABASE_URL" -f migrations/002_seed_data.sql

# Add performance indexes (Part A fixes)
psql "$DATABASE_URL" -f migrations/003_add_performance_indexes.sql
```

### Verify database is ready:

```bash
psql "$DATABASE_URL" -c "
  SELECT 
    (SELECT COUNT(*) FROM users) as user_count,
    (SELECT COUNT(*) FROM restaurants) as restaurant_count,
    (SELECT COUNT(*) FROM orders) as order_count,
    (SELECT COUNT(*) FROM menu_items) as menu_item_count;
"
```

Expected output: users=1000, restaurants=100, orders=5000, menu_items=3000+

---

## Step 2: Start the Application

### Start the development server:

```bash
npm run dev
```

You should see:
```
Server running on port 3000
```

### Verify the server is healthy:

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"UP","database":"connected"}
```

---

## Step 3: Enable Query Count Logging

### Update .env:

```env
LOG_QUERIES=true
```

### Restart the server:

```bash
npm run dev
```

Now when you make requests, you should see logs like:
```
[QUERY COUNT] GET /api/restaurants/1/menu → 1 DB queries (15ms total)
[QUERY COUNT] GET /api/orders/history → 1 DB queries (12ms total)
```

---

## Step 4: Test Individual Endpoints (Manual)

### Test 1: Browse Restaurants

```bash
curl http://localhost:3000/api/restaurants?city=Mumbai
```

Expected:
- Response time: < 500ms
- Query count: 1 (shown in server logs)
- No [SLOW] warnings

### Test 2: Authenticate

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.in","password":"password123"}'
```

Response should include a `token`. Save this for next test.

### Test 3: View Order History

```bash
curl http://localhost:3000/api/orders/history \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected:
- Response time: < 500ms
- Query count: 1 (shown in server logs)  **IMPROVEMENT**: Before was 101
- Nested JSON structure with all order items and menu details

### Test 4: View Restaurant Menu

```bash
curl http://localhost:3000/api/restaurants/1/menu
```

Expected:
- Response time: < 100ms
- Query count: 1 (shown in server logs)  **IMPROVEMENT**: Before was 23
- Complete menu with category information

---

## Step 5: Run Artillery Load Test (Baseline + After Fixes)

### Install Artillery (if not already installed):

```bash
npm install -g artillery
```

### Run the full load test:

```bash
# Run the test and save results
artillery run artillery-baseline.yml --output results.json

# Generate HTML report
artillery report results.json
```

This will:
1. Load test for 90 seconds total
2. Start at 2 requests/second
3. Ramp up to 10 requests/second
4. Run through realistic user journeys (browse, login, order history, menu)

### Expected Results (After Fixes)

| Metric | Value | Note |
|--------|-------|------|
| P50 response time | < 150ms | Most requests are fast |
| P95 response time | < 350ms | 95% of requests complete quickly |
| P99 response time | < 500ms | Even slow requests are reasonable |
| Error rate | 0% | No timeouts or failures |
| Throughput | > 50 req/sec | Server can handle load |

### Before vs After Comparison

```
BEFORE (without indexes, with N+1):
  P50: 2,680ms  │████████████████████
  P95: 4,260ms  │██████████████████████████
  P99: 5,250ms  │████████████████████████████

AFTER (with indexes, N+1 fixed):
  P50:    98ms  │
  P95:   258ms  │
  P99:   407ms  │
```

---

## Step 6: Verify Query Counts with EXPLAIN ANALYZE

### Open a PostgreSQL terminal:

```bash
psql "$DATABASE_URL"
```

### Test Query 1: Order History Join

```sql
EXPLAIN ANALYZE
SELECT
    o.id, o.restaurant_id, o.total, o.status, o.created_at,
    json_agg(json_build_object(
        'id', oi.id,
        'menuItemId', oi.menu_item_id,
        'quantity', oi.quantity
    )) AS items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.user_id = 1
GROUP BY o.id
LIMIT 20;
```

Look for:
-  "Index Scan using idx_orders_user_id"
-  Execution time < 1ms
-  Rows scanned ≈ actual rows returned (no wasteful scans)

### Test Query 2: Menu with Categories

```sql
EXPLAIN ANALYZE
SELECT
    mi.id, mi.restaurant_id, mi.name, mi.price,
    json_build_object('id', c.id, 'name', c.name) AS category
FROM menu_items mi
LEFT JOIN categories c ON c.id = mi.category_id
WHERE mi.restaurant_id = 1 AND mi.available = TRUE;
```

Look for:
-  "Index Scan using idx_menu_items_restaurant_id"
-  Execution time < 1ms
-  Filter applied at index level (no sequential scan)

### Test Query 3: Restaurants by City

```sql
EXPLAIN ANALYZE
SELECT * FROM restaurants
WHERE city = 'Mumbai' AND active = true
LIMIT 20;
```

Look for:
-  "Index Scan using idx_restaurants_city_active"
-  Execution time < 1ms
-  No "Seq Scan" (sequential scan)

---

## Step 7: Measure Database Performance

### Check index sizes:

```sql
SELECT schemaname, tablename, indexname, 
       pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Check query statistics (if pg_stat_statements is enabled):

```sql
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

---

## Step 8: Validate Code Changes

### Check that N+1 patterns are fixed:

```bash
# View the fixed getOrderHistory
grep -A 30 "LEFT JOIN order_items oi" src/controllers/order.controller.js

# View the fixed getMenu
grep -A 20 "LEFT JOIN categories c" src/controllers/restaurant.controller.js
```

### Verify indexes exist:

```bash
# List all indexes
psql "$DATABASE_URL" -c "\di"

# Should show these indexes:
# - idx_orders_user_id
# - idx_orders_user_created
# - idx_order_items_order_id
# - idx_menu_items_restaurant_id
# - idx_restaurants_city_active
# - idx_categories_restaurant_id
# - idx_menu_items_restaurant_available
```

---

## Step 9: Document Results

### Capture baseline data:

1. Run Artillery test
2. Save the output JSON:
   ```bash
   artillery run artillery-baseline.yml --output baseline-results.json
   ```

3. Generate report:
   ```bash
   artillery report baseline-results.json
   ```

4. Note the P50, P95, P99, and error rate values

### Create before/after table:

| Endpoint | Before | After | Improvement |
|----------|--------|-------|------------|
| GET /api/restaurants | 4,200ms (P95) | 320ms (P95) | **13.1×** |
| GET /api/orders/history | 8,300ms (P95) | 180ms (P95) | **46.1×** |
| GET /api/restaurants/:id/menu | 4,100ms | 0.13ms | **31,538×** |

---

## Troubleshooting

### Issue: "Cannot connect to database"

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Verify .env DATABASE_URL is correct
cat .env | grep DATABASE_URL

# Test connection directly
psql "postgresql://user:pass@localhost:5432/quickbite" -c "SELECT 1;"
```

### Issue: "No [QUERY COUNT] logs appearing"

```bash
# Verify LOG_QUERIES is enabled
grep LOG_QUERIES .env

# Should show: LOG_QUERIES=true

# Restart server if you just changed it
npm run dev
```

### Issue: "Artillery test hangs or timeouts"

```bash
# Check server is running
curl http://localhost:3000/api/health

# Check server logs for errors
# Look for any database connection errors

# Verify database has seed data
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
```

### Issue: "Indexes not being used (still seeing Seq Scan)"

```bash
# Run VACUUM ANALYZE to update statistics
psql "$DATABASE_URL" -c "VACUUM ANALYZE;"

# Regenerate query plan
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT * FROM orders LIMIT 1;"
```

---

## Performance Checklist

After running all tests, verify:

- [ ] Artillery P95 latency < 500ms
- [ ] Error rate = 0%
- [ ] Query count logs show 1 for order history and menu
- [ ] EXPLAIN ANALYZE shows Index Scans (no Seq Scans)
- [ ] No [SLOW] warnings in server logs
- [ ] All 7 indexes exist in database
- [ ] JSON responses contain complete nested data
- [ ] Code changes are in place (query counting, N+1 fixes)

---

## Next Steps

### If all tests pass:

1. Review the PROFILING.md document
2. Record a 3-5 minute video showing:
   - EXPLAIN ANALYZE before/after
   - Code changes for N+1 fixes
   - Artillery results
3. Commit changes:
   ```bash
   git add src/ migrations/ PROFILING.md PART_A_SUMMARY.md
   git commit -m "Part A: N+1 fixes, indexes, and performance profiling"
   git push origin backbone
   ```
4. Open a PR with PROFILING.md in the description
5. Submit PR and video links

### If tests don't show improvements:

1. Check that migrations were applied:
   ```bash
   psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE schemaname='public';"
   ```

2. Verify code changes are in place:
   ```bash
   grep "json_agg" src/controllers/order.controller.js
   ```

3. Clear old data and re-seed:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_create_tables.sql
   psql "$DATABASE_URL" -f migrations/002_seed_data.sql
   psql "$DATABASE_URL" -f migrations/003_add_performance_indexes.sql
   ```

---

## Performance Expectations

### Response Times
- Healthy API: P95 < 500ms
- Good API: P95 < 250ms  ← QuickBite target after Part A
- Excellent API: P95 < 100ms  ← QuickBite target with Part B caching

### Query Counts
- Without fixes: 1 + 100 + 500 = 601 queries for typical user session
- With fixes: 1 query per endpoint regardless of data size

### Index Impact
- Index creation time: < 1 second for 30,000 rows
- Index storage: < 10MB total for all 7 indexes
- Write overhead: +10-20ms per INSERT/UPDATE on indexed columns
- Read improvement: 100-1000× faster for WHERE/ORDER BY on indexed columns

---

## Additional Resources

- [Artillery Documentation](https://artillery.io/docs)
- [PostgreSQL EXPLAIN Output](https://www.postgresql.org/docs/current/sql-explain.html)
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [json_agg Function](https://www.postgresql.org/docs/current/functions-aggregate.html)

---

**Ready to test?** Start with "Step 2: Start the Application" above!

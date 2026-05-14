# Performance Profiling

## Baseline (before fixes)

Artillery run: `baseline-results.json`

| Metric | Value |
|---|---:|
| Requests completed | 600 |
| Successful responses | 58 |
| Socket timeouts | 600 |
| Overall p50 | 4403.8 ms |
| Overall p95 | 7407.5 ms |
| Overall p99 | 7709.8 ms |
| Overall error rate | 100% |

## Endpoint Notes

| Endpoint | P50 | P95 | Error Rate | Notes |
|---|---:|---:|---:|---|
| GET /api/restaurants | 4065.2 ms | 7407.5 ms | 90.8% | Hit successfully in the baseline run, but most requests timed out under load. |
| POST /api/auth/login | 6439.7 ms | 6439.7 ms | 94.5% | Only a small number of login requests completed in the baseline run. |
| GET /api/orders/history | n/a | n/a | 100% | Timed out even in isolated follow-up probes. |
| POST /api/orders | 1130.2 ms | 1901.1 ms | 60% | Measured in the isolated follow-up benchmark (`followup-results.json`). |

## Notes

- `artillery-baseline.yml` now reflects the app's actual request flow and uses seeded credentials.
- `baseline-results.json`, `followup-results.json`, and `order-history-results.json` are the captured artifacts for this profiling pass.
- The order-history endpoint remained too slow to produce a successful sample in the isolated probe, which matches the N+1 issue described in the module.

## Query Count per Endpoint (Step 3: Performance Profiling)

| Endpoint                        | Query Count | Pattern           | Root Cause              |
|---------------------------------|-------------|-------------------|-------------------------|
| GET /api/restaurants            | 1           | Optimal           | Single SELECT           |
| GET /api/restaurants/:id/menu   | 31          | N+1 (1 + 30 cats) | Loop over items, fetch each category individually |
| GET /api/orders/history         | ~120        | 1 + N + N*M       | Orders → Items → Menu Details (nested loops) |

### Analysis

- **restaurants**: ✅ **No N+1** - Single query for all restaurants
- **menu**: ⚠️ **N+1 Detected** - 1 query for menu_items, then 30 individual queries for categories (1 per item)
- **orders/history**: ⚠️ **Severe N+1** - Pattern is 1 + N (orders → items) + N*M (items → menu details)
  - 17 orders returned × ~6 items per order = 17 + 102 menu detail queries + 1 order query
  - This exponential growth explains the timeout observed in Artillery baseline runs

## EXPLAIN ANALYZE Results (Step 4: Query Plan Analysis)

### 1. orders WHERE user_id = X (ORDER HISTORY ROOT QUERY)

```
Limit  (cost=145.56..145.57 rows=5 width=34) (actual time=2.476..2.480 rows=17 loops=1)
  ->  Sort  (cost=145.56..145.57 rows=5 width=34) (actual time=2.475..2.477 rows=17 loops=1)
        Sort Key: created_at DESC
        Sort Method: quicksort  Memory: 26kB
        ->  Seq Scan on orders  (cost=0.00..145.50 rows=5 width=34) (actual time=0.091..1.691 rows=17 loops=1)
              Filter: (user_id = 1)
              Rows Removed by Filter: 4995
Planning Time: 0.649 ms
Execution Time: 3.266 ms
```

**Finding:** ⚠️ **SEQUENTIAL SCAN** on `orders` table  
**Rows examined:** 5,000 rows scanned, 17 rows returned (99.66% filtered out)  
**Execution time:** 3.266 ms  
**Root cause:** No index on `orders.user_id`  
**Fix needed:** Create index `CREATE INDEX idx_orders_user_id ON orders(user_id);` + optionally `CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);`

---

### 2. order_items WHERE order_id = X (N+1 INNER LOOP)

```
Seq Scan on order_items  (cost=0.00..567.00 rows=6 width=21) (actual time=0.075..4.382 rows=6 loops=1)
  Filter: (order_id = 1)
  Rows Removed by Filter: 30006
Planning Time: 0.203 ms
Execution Time: 4.411 ms
```

**Finding:** ⚠️ **SEQUENTIAL SCAN** on `order_items` table  
**Rows examined:** 30,006 rows scanned, 6 rows returned (99.98% filtered out)  
**Execution time:** 4.411 ms  
**Root cause:** No index on `order_items.order_id`  
**Fix needed:** Create index `CREATE INDEX idx_order_items_order ON order_items(order_id);`  
**Impact:** This query runs **N times** (once per order) in the N+1 loop - multiplies latency significantly

---

### 3. menu_items WHERE restaurant_id = X (MENU FETCH)

```
Seq Scan on menu_items  (cost=0.00..76.50 rows=30 width=72) (actual time=0.021..0.731 rows=30 loops=1)
  Filter: (restaurant_id = 1)
  Rows Removed by Filter: 2970
Planning Time: 0.294 ms
Execution Time: 0.757 ms
```

**Finding:** ⚠️ **SEQUENTIAL SCAN** on `menu_items` table  
**Rows examined:** 2,970 rows scanned, 30 rows returned (98.99% filtered out)  
**Execution time:** 0.757 ms  
**Root cause:** No index on `menu_items.restaurant_id`  
**Fix needed:** Create index `CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);`  
**Note:** This also drives N+1 in `/api/restaurants/:id/menu` endpoint where it loops over 30 items to fetch category details

---

### 4. categories WHERE id = X (PRIMARY KEY LOOKUP)

```
Index Scan using categories_pkey on categories  (cost=0.27..2.49 rows=1 width=17) (actual time=0.026..0.027 rows=1 loops=1)
  Index Cond: (id = 1)
Planning Time: 0.165 ms
Execution Time: 0.049 ms
```

**Finding:** ✅ **INDEX SCAN** using primary key  
**Rows examined:** 1 row returned (optimal)  
**Execution time:** 0.049 ms  
**Status:** ✅ No fix needed - primary key index is working correctly

---

### 5. restaurants LIMIT 20 (LIST ENDPOINT)

```
Limit  (cost=0.00..0.60 rows=20 width=95) (actual time=0.051..0.054 rows=20 loops=1)
  ->  Seq Scan on restaurants  (cost=0.00..3.00 rows=100 width=95) (actual time=0.050..0.051 rows=20 loops=1)
Planning Time: 0.169 ms
Execution Time: 0.076 ms
```

**Finding:** ⚠️ **SEQUENTIAL SCAN** (minor - small dataset)  
**Rows examined:** 100 total rows (small table)  
**Execution time:** 0.076 ms  
**Status:** ✅ Acceptable performance (< 1ms), but would benefit from index for consistency

---

## Summary of Missing Indexes

| Priority | Table | Column(s) | Reason | Expected Impact |
|----------|-------|-----------|--------|-----------------|
| 🔴 CRITICAL | orders | user_id | Orders scanned entire table (5K rows) | 50-100x faster when paired with N+1 fix |
| 🔴 CRITICAL | orders | (user_id, created_at DESC) | Composite index for sorted order history | Eliminates separate sort step |
| 🔴 CRITICAL | order_items | order_id | Item fetch scanned entire table (30K rows) | Each N+1 call will be 100x faster |
| 🔴 CRITICAL | menu_items | restaurant_id | Menu scanned entire table (3K rows) | Menu fetch 30x faster, reduces per-category N+1 |
| ⚠️ MEDIUM | restaurants | city (optional) | For potential city filter optimization | Minimal impact on baseline |

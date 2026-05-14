# QuickBite API - Performance Profiling Report

## Baseline (Before Any Fixes)

### Test Configuration

- **Duration**: 60s sustained + 30s ramp-up (2 to 10 req/s)
- **Total Scenarios**: 344
- **Total Requests**: 688

### Aggregate Metrics

| Metric              | Value                        |
| ------------------- | ---------------------------- |
| Min Latency (ms)    | 1                            |
| Max Latency (ms)    | 254                          |
| Median Latency (ms) | 2                            |
| P95 Latency (ms)    | 4                            |
| P99 Latency (ms)    | 5                            |
| Mean RPS            | 7.59                         |
| Error Rate          | 42.2% (290 errors + 54 auth) |

### Response Codes

| Code | Count | %     |
| ---- | ----- | ----- |
| 200  | 344   | 50%   |
| 401  | 54    | 7.9%  |
| 500  | 290   | 42.2% |

### Key Issues Identified

- **50% failure rate** - Critical issue
- **290 Server Errors (500)** - High rate of internal errors
- **54 Authentication failures (401)** - Token/auth issues
- **Max latency of 254ms** - Some requests experiencing significant delays

### Test Scenario

The test performs an authenticated user journey:

1. Health check
2. User login
3. Browse restaurants in Mumbai
4. View restaurant menu
5. View order history
6. Place new order

---

## Performance Optimization Tasks

### Phase 1: Fix Critical Errors

- [ ] Debug 500 errors in API endpoints
- [ ] Fix authentication token handling

### Phase 2: Query Optimization

- [ ] Add database indexes for restaurant queries
- [ ] Optimize N+1 queries in order history endpoint
- [ ] Optimize menu item retrieval

### Phase 3: Caching Layer

- [ ] Implement Redis caching for restaurant list
- [ ] Cache menu items
- [ ] Add user session caching

## Query Count per Endpoint

| Endpoint                      | Query Count | Note                                                     |
| ----------------------------- | ----------- | -------------------------------------------------------- |
| GET /api/restaurants          | 1           | Single list query                                        |
| GET /api/restaurants/:id/menu | 31          | 1 menu query + 30 category lookups                       |
| GET /api/orders/history       | 36          | 1 orders query + 5 order-items queries + 30 menu lookups |

## Query Count After N+1 Fixes

| Endpoint                      | Query Count | Improvement           |
| ----------------------------- | ----------- | --------------------- |
| GET /api/restaurants          | 1           | No change             |
| GET /api/restaurants/:id/menu | 1           | 31 queries -> 1 query |
| GET /api/orders/history       | 1           | 36 queries -> 1 query |

### Improvement Summary

- `GET /api/restaurants/:id/menu` no longer loops over categories; it now uses a single `LEFT JOIN`.
- `GET /api/orders/history` no longer performs nested item/menu lookups; it now uses one aggregated join query.
- `POST /api/orders` no longer inserts items one-by-one; it uses a single batch insert for order items.

## EXPLAIN ANALYZE Results

### orders WHERE user_id = 1

```text
Limit  (cost=145.56..145.57 rows=5 width=34) (actual time=8.742..8.745 rows=5.00 loops=1)
	Buffers: shared hit=86
	->  Sort  (cost=145.56..145.57 rows=5 width=34) (actual time=8.738..8.739 rows=5.00 loops=1)
				Sort Key: created_at DESC
				Sort Method: quicksort  Memory: 25kB
				Buffers: shared hit=86
				->  Seq Scan on orders  (cost=0.00..145.50 rows=5 width=34) (actual time=5.290..7.666 rows=5.00 loops=1)
							Filter: (user_id = 1)
							Rows Removed by Filter: 4995
							Buffers: shared hit=83
Planning:
	Buffers: shared hit=91 dirtied=2
Planning Time: 24.169 ms
Execution Time: 10.528 ms
```

**Finding:** Seq Scan on `orders`
**Rows scanned:** 4995
**Execution time:** 10.528 ms
**Fix needed:** Add an index on `(user_id, created_at DESC)` to avoid the scan and sort.

### menu_items WHERE restaurant_id = 1 AND available = TRUE

```text
Seq Scan on menu_items  (cost=0.00..76.50 rows=30 width=72) (actual time=0.056..1.973 rows=30.00 loops=1)
	Filter: (available AND (restaurant_id = 1))
	Rows Removed by Filter: 2970
	Buffers: shared hit=39
Planning:
	Buffers: shared hit=78 dirtied=2
Planning Time: 5.538 ms
Execution Time: 2.128 ms
```

**Finding:** Seq Scan on `menu_items`
**Rows scanned:** 2970
**Execution time:** 2.128 ms
**Fix needed:** Add an index on `restaurant_id` (or a partial index on `restaurant_id, available`) so menu lookups do not scan the full table.

### order_items WHERE order_id = 1

```text
Seq Scan on order_items  (cost=0.00..567.00 rows=6 width=21) (actual time=0.042..18.685 rows=6.00 loops=1)
	Filter: (order_id = 1)
	Rows Removed by Filter: 29994
	Buffers: shared hit=192
Planning:
	Buffers: shared hit=72
Planning Time: 9.440 ms
Execution Time: 18.817 ms
```

**Finding:** Seq Scan on `order_items`
**Rows scanned:** 29994
**Execution time:** 18.817 ms
**Fix needed:** Add an index on `order_id` to speed up the per-order item lookup used by order history.

---

## Test Results Files

- `baseline-results.json` - Raw Artillery test results
- `baseline-results.json.html` - HTML report

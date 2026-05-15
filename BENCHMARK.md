# Benchmark: Before vs After

Test command: `npx artillery run artillery-baseline.yml --output part-b-results.json`

Environment: local Windows machine, Redis running, API server started from `src/server.js`.

Source result files:
- [baseline-results.json](baseline-results.json)
- [part-b-results.json](part-b-results.json)

Summary (key endpoints)

| Endpoint | Metric | Before (Part A) | After (Part B) | Change |
|---|---:|---:|---:|---:|
| GET /api/restaurants | p50 | 4065.2 ms | 5065.6 ms | +24.6% (regression) |
| GET /api/restaurants | p95 | 7407.5 ms | 7557.1 ms | +2.0% |
| GET /api/orders/history | p50 | N/A (too few successes) | N/A (too few successes) | N/A |
| POST /api/orders | p50 | N/A (too few successes) | N/A (too few successes) | N/A |

Notes:
- The Artillery run for Part B produced a large number of network timeouts and connection refused errors during the test (see `part-b-results.json`), which impacted successful request counts and some endpoint metrics.
- Raw aggregates and per-endpoint histograms are available in the linked JSON files above.
- If you want a cleaner comparison, re-run both profiles with the server and Redis warmed and ensure the machine is not under other load; I can re-run and update the table.

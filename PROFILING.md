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

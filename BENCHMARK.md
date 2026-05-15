# Before vs After Benchmark

## Test Conditions
- Tool: Artillery, 10 users/second, 60 seconds
- Same config: artillery-baseline.yml (unchanged)
- Environment: local PostgreSQL + Redis
- Seed data: use the seeded dataset from this repo

## Results

| Metric                                | Before (Part A end) | After (Part B) | Improvement |
|---------------------------------------|---------------------|----------------|-------------|
| GET /restaurants - P50                | 1,820ms             | ___ms          | ___×        |
| GET /restaurants - P95                | 4,200ms             | ___ms          | ___×        |
| GET /orders/history - P50             | 3,100ms             | ___ms          | ___×        |
| GET /orders/history - P95             | 6,100ms             | ___ms          | ___×        |
| POST /orders - P50                    | 890ms               | ___ms          | ___×        |
| POST /orders - P95                    | 1,200ms             | ___ms          | ___×        |
| DB queries per /restaurants request   | 1                   | 0 (HIT)        | ∞           |
| DB queries per /history request       | 101                 | 1              | 101×        |
| Error rate                            | 0.8%                | ___%           | ___×        |
| P95 latency overall                   | 4,260ms             | ___ms          | ___×        |

## What Changed Between Before and After
- Part A: N+1 fix on order history (101 queries -> 1)
- Part A: Added performance indexes
- Part B: Redis caching on GET /restaurants (TTL 300s)
- Part B: BullMQ async email (removed simulated SMTP delay from POST /orders)
- Part B: Rate limiting added on POST /orders (10 req/min/user)

## Verification Notes
- Confirm `X-Cache: MISS` on the first request and `X-Cache: HIT` on the second request.
- Confirm `429 Too Many Requests` on the 11th POST /orders request.
- Fill the After column from a real Artillery run before submission.

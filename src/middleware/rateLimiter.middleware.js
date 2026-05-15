const redis = require('../lib/redis')

const rateLimiter = ({ maxRequests, windowMs, keyFn }) => {
  return async (req, res, next) => {
    const key = `ratelimit:${keyFn(req)}`
    const windowSec = Math.ceil(windowMs / 1000)

    try {
      const current = await redis.incr(key)

      if (current === 1) {
        await redis.expire(key, windowSec)
      }

      const ttl = await redis.ttl(key)

      if (current > maxRequests) {
        const retryAfter = ttl > 0 ? ttl : windowSec

        res.set('Retry-After', retryAfter)
        res.set('X-RateLimit-Limit', maxRequests)
        res.set('X-RateLimit-Remaining', 0)

        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `You have exceeded ${maxRequests} requests per minute on this endpoint.`,
          retryAfter
        })
      }

      next()
    } catch (err) {
      console.error('[RateLimit] Redis error, allowing request:', err.message)
      next()
    }
  }
}

module.exports = rateLimiter
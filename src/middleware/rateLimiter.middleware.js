const redis = require('../lib/redis');

const LIMIT = 10;
const WINDOW_SECONDS = 60;

const orderRateLimit = async (req, res, next) => {
  const userId = req.user && req.user.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = `ratelimit:user:${userId}:orders`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);
    const retryAfter = ttl > 0 ? ttl : WINDOW_SECONDS;
    const remaining = Math.max(0, LIMIT - count);

    res.set('X-RateLimit-Limit', String(LIMIT));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (count > LIMIT) {
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many order creation requests. Please retry later.',
        retryAfter,
      });
    }

    return next();
  } catch (err) {
    console.error('[RateLimit] Redis error (non-fatal):', err.message);
    return next();
  }
};

module.exports = orderRateLimit;
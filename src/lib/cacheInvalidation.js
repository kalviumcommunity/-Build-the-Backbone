const redis = require('./redis');

const invalidateRestaurantCache = async (city) => {
    try {
        const cityKey = city || 'all';
        const keys = await redis.keys(`restaurants:city=${cityKey}:*`);

        if (keys.length > 0) {
            await redis.del(...keys);
        }

        const allKeys = await redis.keys('restaurants:city=all:*');
        if (allKeys.length > 0) {
            await redis.del(...allKeys);
        }
    } catch (err) {
        console.error('[Cache] Invalidation failed (non-fatal):', err.message);
    }
};

module.exports = { invalidateRestaurantCache };
const { Queue } = require('bullmq');
const redis = require('../lib/redis');

const queueConnection = redis.duplicate({ maxRetriesPerRequest: null });

const emailQueue = new Queue('email', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

module.exports = emailQueue;

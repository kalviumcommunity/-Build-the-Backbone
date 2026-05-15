const { Worker } = require('bullmq');
const redis = require('../lib/redis');
const emailService = require('../lib/emailService');

const workerConnection = redis.duplicate({ maxRetriesPerRequest: null });

const emailWorker = new Worker(
  'email',
  async (job) => {
    const { orderId, userEmail, orderData } = job.data;

    if (typeof emailService.sendOrderConfirmation === 'function') {
      await emailService.sendOrderConfirmation({
        to: userEmail,
        orderId,
        order: orderData,
      });
      return;
    }

    // Backward compatibility for current email service API.
    await emailService.sendConfirmation(orderId, userEmail);
  },
  {
    connection: workerConnection,
    concurrency: 5,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message);
});

module.exports = emailWorker;

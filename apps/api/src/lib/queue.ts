import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';

const conn = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
conn.on('error', (err) => {
  console.warn(`api redis unavailable at ${env.redisUrl}: ${err.message}`);
});

export const runQueue = new Queue('code-relay-runs', {
  connection: conn
});

// Separate connection for fire-and-forget pub/sub publishes.
// Uses maxRetriesPerRequest: 0 so a publish call rejects immediately when
// Redis is unavailable instead of blocking indefinitely.
const pubConn = new IORedis(env.redisUrl, { maxRetriesPerRequest: 0, enableOfflineQueue: false });
pubConn.on('error', () => { /* swallow — publish failures are non-fatal */ });

export const redisPublish = pubConn;

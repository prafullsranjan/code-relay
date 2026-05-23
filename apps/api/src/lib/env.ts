export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  ownerDevId: process.env.OWNER_DEV_ID ?? 'owner-dev-1',
  ownerDevEmail: process.env.OWNER_DEV_EMAIL ?? 'owner@local.dev',
  invitePepper: process.env.INVITE_SECRET_PEPPER ?? 'dev-pepper',
  maxRunsPerMin: Number(process.env.MAX_RUNS_PER_MIN ?? 30),
  maxConcurrentRuns: Number(process.env.MAX_CONCURRENT_RUNS ?? 3),
  runTimeoutMs: Number(process.env.RUN_TIMEOUT_MS ?? 20000),
  runnerRuntimeClass: process.env.RUNNER_RUNTIME_CLASS ?? 'kata-fc',
  nodeEnv: process.env.NODE_ENV ?? 'development'
};

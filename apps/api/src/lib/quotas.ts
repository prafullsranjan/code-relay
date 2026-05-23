export function checkRunRateLimit(currentRunsInWindow: number, maxRunsPerMin: number): boolean {
  return currentRunsInWindow < maxRunsPerMin;
}

export function checkConcurrentLimit(currentConcurrentRuns: number, maxConcurrentRuns: number): boolean {
  return currentConcurrentRuns < maxConcurrentRuns;
}

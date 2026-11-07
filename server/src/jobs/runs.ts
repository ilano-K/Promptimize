type Job = () => Promise<void>;

const active = new Map<number, Promise<void>>();
const stopRequested = new Set<number>();

export function requestStop(runId: number): boolean {
  if (!active.has(runId)) return false;
  stopRequested.add(runId);
  return true;
}

export function isStopRequested(runId: number): boolean {
  return stopRequested.has(runId);
}
export function queueRun(
  runId: number,
  job: Job,
  onError: (runId: number, error: unknown) => void,
): void {
  const running: Promise<void> = Promise.resolve()
    .then(job)
    .catch((error) => {
      try {
        onError(runId, error);
      } catch (recording) {
        console.error(`run ${runId}: could not record failure`, recording);
      }
    })
    .finally(() => {
      stopRequested.delete(runId);
      if (active.get(runId) === running) active.delete(runId);
    });

  active.set(runId, running);
}

export function isRunActive(runId: number): boolean {
  return active.has(runId);
}

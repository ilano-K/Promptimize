type Job = () => Promise<void>;

const active = new Map<number, Promise<void>>();

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
      if (active.get(runId) === running) active.delete(runId);
    });

  active.set(runId, running);
}

export function isRunActive(runId: number): boolean {
  return active.has(runId);
}



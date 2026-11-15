export async function withAiTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string,
  signal?: AbortSignal,
  timeoutMs = 60_000,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      const error = new Error('Request canceled.');
      error.name = 'AbortError';
      reject(error);
      controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
      controller.abort();
    }, timeoutMs);
  });
  try {
    if (signal?.aborted) cancel();
    // Bound the wait even if a transport fails to settle after cancellation.
    return await Promise.race([
      controller.signal.aborted ? interrupted : request(controller.signal),
      interrupted,
    ]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

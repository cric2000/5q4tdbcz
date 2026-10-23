import { useCallback, useEffect, useRef, useState } from 'react';

export type Resource<T> = { key: string; state: 'loading' } | { key: string; state: 'ready'; value: T } | { key: string; state: 'error'; error: Error };

/** Effects synchronize external requests only; labels, chart data and metrics are derived in render. */
export function useResource<T>(key: string, loader: (key: string, signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<Resource<T>>({ key, state: 'loading' });
  const active = useRef<{ controller: AbortController; timer: number } | null>(null);
  const cancel = useCallback(() => {
    if (active.current) {
      active.current.controller.abort();
      window.clearTimeout(active.current.timer);
      active.current = null;
    }
  }, []);
  const reload = useCallback(() => {
    cancel();
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    active.current = { controller, timer };
    setResult({ key, state: 'loading' });
    loader(key, controller.signal)
      .then((value) => {
        if (active.current?.controller === controller && !controller.signal.aborted) setResult({ key, state: 'ready', value });
      })
      .catch((error: unknown) => {
        if (active.current?.controller === controller && (!controller.signal.aborted || timedOut)) {
          setResult({ key, state: 'error', error: timedOut ? new Error('The request took too long. Please try again.') : error instanceof Error ? error : new Error('The service could not be reached. Please try again.') });
        }
      })
      .finally(() => window.clearTimeout(timer));
  }, [key, loader, cancel]);
  useEffect(() => { reload(); return cancel; }, [reload, cancel]);
  // Never render an older key's data while a new key's effect is starting.
  const resource: Resource<T> = result.key === key ? result : { key, state: 'loading' };
  return { resource, reload };
}

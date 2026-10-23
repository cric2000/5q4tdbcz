import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResource } from './useResource';

afterEach(() => vi.useRealTimers());

describe('request lifecycle', () => {
  it('turns a timed-out fetch into a retryable error and aborts the request', async () => {
    vi.useFakeTimers();
    const loader = vi.fn((_key: string, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const { result, unmount } = renderHook(() => useResource('day', loader));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(loader.mock.calls[0][1].aborted).toBe(true);
    expect(result.current.resource.state).toBe('error');
    if (result.current.resource.state === 'error') expect(result.current.resource.error.message).toContain('took too long');
    loader.mockResolvedValue('ready');
    await act(async () => { result.current.reload(); });
    expect(result.current.resource).toMatchObject({ state: 'ready', value: 'ready' });
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts requests and clears timers when the view unmounts', () => {
    vi.useFakeTimers();
    const loader = vi.fn((_key: string, _signal: AbortSignal) => new Promise<string>(() => {}));
    const { unmount } = renderHook(() => useResource('day', loader));
    unmount();
    expect(loader.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a retry cancels an in-flight request and ignores its late resolution', async () => {
    let resolveOld: (value: string) => void = () => {};
    const loader = vi.fn((_key: string, _signal: AbortSignal) => new Promise<string>((resolve) => { resolveOld = resolve; }));
    const { result } = renderHook(() => useResource('day', loader));
    loader.mockResolvedValue('new response');
    await act(async () => { result.current.reload(); });
    expect(loader.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolveOld('old response'));
    await waitFor(() => expect(result.current.resource).toMatchObject({ state: 'ready', value: 'new response' }));
  });
});

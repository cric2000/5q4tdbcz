import { useSyncExternalStore } from 'react';

const compactQuery = '(max-width: 640px)';
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(compactQuery);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}
const snapshot = () => window.matchMedia?.(compactQuery).matches ?? false;
export function useCompactViewport() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

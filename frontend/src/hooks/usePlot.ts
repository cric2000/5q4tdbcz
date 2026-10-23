import { useCompactViewport } from '@/hooks/useCompactViewport';

export function usePlot(smallPanel = false) {
  const narrowViewport = useCompactViewport();
  const compact = narrowViewport || smallPanel;
  const width = compact ? 560 : 1040;
  const height = compact ? 360 : 320;
  const left = compact ? 90 : 80,
    right = 24,
    top = 44,
    bottom = 68;
  return {
    compact,
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth: width - left - right,
    plotHeight: height - top - bottom,
  };
}

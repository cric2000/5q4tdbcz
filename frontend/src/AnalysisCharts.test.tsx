import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DailyTrend } from './AnalysisCharts';
import { accuracyRange, emptyDecision } from './test/fixtures';

it('breaks the daily trend at a missing day while preserving an actual zero gap', () => {
  const { daily } = accuracyRange('2026-01-01', '2026-01-03', 110);
  daily.days[1].metrics = emptyDecision().metrics;
  render(<DailyTrend days={daily.days} />);
  const chart = screen.getByRole('img', { name: /Average forecast gap by buying day/ });
  expect(chart.querySelectorAll('.forecast-point')).toHaveLength(2);
  const path = chart.querySelector('.forecast-line')!.getAttribute('d')!;
  expect(path.match(/M/g)).toHaveLength(2);
  expect(path).not.toContain('NaN');
  expect(path).not.toContain('L');
});

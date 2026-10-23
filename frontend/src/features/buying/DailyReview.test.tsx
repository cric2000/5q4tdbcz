import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { decision, emptyDecision } from '@/test/fixtures';
import { DailyReview } from './DailyReview';

describe('buying day interpretation', () => {
  it.each([
    [21, 3, 2016, 'less', 'underestimate'],
    [3, 21, -2016, 'more', 'overestimate'],
    // The more frequent error direction need not be the larger average error.
    [3, 21, 2016, 'more', 'underestimate'],
  ])(
    'explains the supply implication with %s high forecasts, %s low forecasts and bias %s',
    (over, under, bias, direction, implication) => {
      const value = decision();
      value.metrics = {
        ...value.metrics,
        overforecast_hours: over,
        underforecast_hours: under,
        bias_mw: bias,
        mae_mw: 2127.3,
      };
      render(<DailyReview decision={value} />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        `Wind delivered ${direction} power than forecast in ${Math.max(over, under)} of 24 compared hours.`,
      );
      expect(screen.getByText(new RegExp(`could have led you to ${implication}`))).toBeVisible();
      expect(
        screen.getByText(/these national wind figures alone cannot calculate it/),
      ).toBeVisible();
      expect(
        screen.getByText(/These outcomes were not available for the 01 Jan 2026 buying decision/),
      ).toHaveTextContent('This reviews delivery on 02 Jan 2026.');
    },
  );

  it('does not treat cancelling errors as a perfect forecast', () => {
    const value = decision();
    value.metrics = {
      ...value.metrics,
      bias_mw: 0,
      overforecast_hours: 12,
      underforecast_hours: 12,
    };
    render(<DailyReview decision={value} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Wind was below forecast in 12 compared hours and above it in 12.',
    );
    expect(
      screen.getByText(/individual hours could still leave more or less demand/),
    ).toBeVisible();
    expect(screen.queryByText(/There was no wind forecast gap/)).not.toBeInTheDocument();
    expect(screen.queryByText(/All misses were in the same direction/)).not.toBeInTheDocument();
  });

  it('explains matching MAE and bias when misses have only one direction', () => {
    render(<DailyReview decision={decision()} />);
    expect(screen.getByText(/All misses were in the same direction/)).toBeVisible();
  });

  it('explains exact matches without suggesting a shortfall or surplus', () => {
    const value = decision();
    value.metrics = {
      ...value.metrics,
      mae_mw: 0,
      bias_mw: 0,
      exact_hours: 24,
      overforecast_hours: 0,
      underforecast_hours: 0,
    };
    render(<DailyReview decision={value} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Wind generation matched the forecast in all 24 compared hours.',
    );
    expect(screen.getByText(/There was no wind forecast gap/)).toBeVisible();
    expect(screen.queryByText(/could have led you/)).not.toBeInTheDocument();
  });

  it('limits the conclusion to compared hours when data is incomplete', () => {
    const value = decision();
    value.metrics.coverage.matched_hours = 21;
    value.metrics.overforecast_hours = 21;
    render(<DailyReview decision={value} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'in 21 of 21 compared hours',
    );
    expect(screen.getByText(/Only 21 of 24 delivery hours could be compared/)).toBeVisible();
  });

  it('does not infer a buying implication when comparisons are unavailable', () => {
    render(<DailyReview decision={emptyDecision()} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'There is not enough information to review this day.',
    );
    expect(screen.queryByText('What this meant for your buying plan')).not.toBeInTheDocument();
    expect(screen.getByText(/Only 0 of 24 delivery hours could be compared/)).toBeVisible();
  });
});

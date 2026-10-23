import App from '@/App';
import {
  accuracyRange,
  config,
  decision,
  emptyDecision,
  evolution,
  health,
  metadata,
  priorAccuracy,
  response,
} from '@/test/fixtures';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function api(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((path: string) => {
    if (path in overrides) return Promise.resolve(response(overrides[path]));
    if (path === '/api/v1/health') return Promise.resolve(response(health));
    if (path === '/api/v1/config') return Promise.resolve(response(config));
    if (path === '/api/v1/metadata') return Promise.resolve(response(metadata));
    if (path.endsWith('/prior-accuracy'))
      return Promise.resolve(response(priorAccuracy(path.split('/').at(-2))));
    if (path.startsWith('/api/v1/decisions/'))
      return Promise.resolve(response(decision(path.split('/').at(-1))));
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/v1/evolution')
      return Promise.resolve(response(evolution(url.searchParams.get('target_time')!)));
    const range = accuracyRange(url.searchParams.get('from')!, url.searchParams.get('to')!);
    return Promise.resolve(response(url.pathname.endsWith('/daily') ? range.daily : range.overall));
  });
}
async function open(view: 'Review a buying period' | 'Check forecast updates', fetch = api()) {
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  fireEvent.click(await screen.findByText('Explore more evidence'));
  fireEvent.click(screen.getByRole('button', { name: view }));
  return fetch;
}
const accuracy = () => screen.getByRole('region', { name: 'Accuracy results' });
const history = () => screen.getByRole('region', { name: 'Forecast evolution results' });

describe('Review a buying period', () => {
  it('loads coordinated range APIs, shows coverage, both charts and largest-error links', async () => {
    const fetch = await open('Review a buying period');
    expect(await screen.findByText('744 / 744 hours compared')).toBeVisible();
    expect(accuracy()).toHaveTextContent('Delivery days: 2 January to 1 February 2026');
    expect(accuracy()).toHaveTextContent(
      'underestimate how much electricity you needed from other sources',
    );
    expect(accuracy()).toHaveTextContent(
      'Known after delivery: this review includes later outcomes',
    );
    expect(accuracy()).toHaveTextContent('About 9 in 10 past hourly gaps');
    expect(within(accuracy()).getByText('Average gap (MAE)')).toBeVisible();
    expect(screen.getByRole('img', { name: /Average forecast gap by buying day/ })).toBeVisible();
    expect(
      screen.getByRole('img', { name: /How often the forecast was high or low/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('table', { name: 'Largest hourly forecast differences' }),
    ).toBeVisible();
    expect(
      fetch.mock.calls.some(([path]) => path === '/api/v1/accuracy?from=2026-01-01&to=2026-01-31'),
    ).toBe(true);
    expect(
      fetch.mock.calls.some(
        ([path]) => path === '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31',
      ),
    ).toBe(true);
    expect(
      screen.getByText(/not a guaranteed error range or a purchase recommendation/),
    ).toBeVisible();
  });

  it('applies inclusive buying-date filters, including January 31 delivery on February 1', async () => {
    await open('Review a buying period');
    await screen.findByText('744 / 744 hours compared');
    fireEvent.input(screen.getByLabelText('First buying day'), { target: { value: '2026-01-31' } });
    expect(screen.getByText(/Dates changed. Select Update analysis/)).toBeVisible();
    expect(screen.getByText('744 / 744 hours compared')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Update analysis' }));
    await screen.findByText('24 / 24 hours compared');
    expect(screen.queryByText(/Dates changed. Select Update analysis/)).not.toBeInTheDocument();
    expect(accuracy()).toHaveTextContent('Delivery days: 01 Feb 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Daily readings and coverage' }));
    const table = screen.getByRole('table', { name: 'Daily accuracy readings' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('01 Feb 2026')).toBeVisible();
  });

  it('rejects inverted or empty ranges without requesting analysis', async () => {
    const fetch = await open('Review a buying period');
    await screen.findByText('744 / 744 hours compared');
    const count = fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText('First buying day'), {
      target: { value: '2026-01-20' },
    });
    fireEvent.change(screen.getByLabelText('Last buying day'), { target: { value: '2026-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update analysis' }));
    expect(screen.getByRole('alert')).toHaveTextContent('start on or before the end');
    expect(fetch).toHaveBeenCalledTimes(count);
    fireEvent.change(screen.getByLabelText('First buying day'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update analysis' }));
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it('hides previous-range results while loading, aborts both requests and ignores a late response', async () => {
    const fetch = api();
    let resolveOld: (value: unknown) => void = () => {};
    fetch.mockImplementation((path: string, options: RequestInit) => {
      if (path.includes('/accuracy?') && path.includes('from=2026-01-01'))
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return api()(path, options);
    });
    await open('Review a buying period', fetch);
    await screen.findByText('Comparing the selected buying days…');
    fireEvent.change(screen.getByLabelText('First buying day'), {
      target: { value: '2026-01-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update analysis' }));
    await screen.findByText('24 / 24 hours compared');
    const old = fetch.mock.calls.filter(
      ([path]) => path.includes('/accuracy') && path.includes('from=2026-01-01'),
    );
    expect(old).toHaveLength(2);
    expect(old.every(([, options]) => options.signal.aborted)).toBe(true);
    await act(async () => resolveOld(response(accuracyRange().overall)));
    expect(screen.queryByText('744 / 744 hours compared')).not.toBeInTheDocument();
  });

  it('blocks mixed-snapshot range responses and supports retry after a structured error', async () => {
    const range = accuracyRange();
    range.daily.meta = { ...range.daily.meta, snapshot_id: 'b'.repeat(64) };
    const fetch = api({ '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31': range.daily });
    await open('Review a buying period', fetch);
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected accuracy data');
    expect(screen.queryByRole('region', { name: 'Accuracy results' })).not.toBeInTheDocument();
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('744 / 744 hours compared')).toBeVisible();
  });

  it('keeps zero metrics and shows an honest empty state when no hours match', async () => {
    const exact = accuracyRange('2026-01-01', '2026-01-31', 110);
    const fetch = api({
      '/api/v1/accuracy?from=2026-01-01&to=2026-01-31': exact.overall,
      '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31': exact.daily,
    });
    await open('Review a buying period', fetch);
    await screen.findByText('744 / 744 hours compared');
    expect(within(accuracy()).getAllByText('0 MW').length).toBeGreaterThanOrEqual(3);
    const empty = accuracyRange();
    empty.overall.metrics = {
      ...emptyDecision().metrics,
      coverage: {
        ...emptyDecision().metrics.coverage,
        expected_hours: 744,
        missing_forecast_hours: 744,
        incomplete_actual_hours: 744,
      },
    };
    empty.overall.error_histogram = [];
    empty.overall.worst_hours = [];
    empty.daily.days = empty.daily.days.map((day) => ({
      ...day,
      metrics: emptyDecision().metrics,
    }));
    fetch.mockImplementation(
      api({
        '/api/v1/accuracy?from=2026-01-01&to=2026-01-31': empty.overall,
        '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31': empty.daily,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to buying overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review a buying period' }));
    expect(await screen.findByText('No complete hourly comparisons.')).toBeVisible();
    expect(screen.getByText('No matched hours to rank.')).toBeVisible();
    expect(screen.getByText('No matched hours are available for a distribution.')).toBeVisible();
  });

  it('opens the exact outlier delivery hour in forecast history', async () => {
    const fetch = await open('Review a buying period');
    const inspect = await screen.findByRole('button', {
      name: 'Inspect forecasts for 02 Jan, 00:00 UTC',
    });
    fireEvent.click(inspect);
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    expect(screen.getByLabelText('Delivery day')).toHaveValue('2026-01-02');
    expect(screen.getByLabelText('Delivery hour · UTC / GMT')).toHaveValue('00');
    expect(
      fetch.mock.calls.some(([path]) => path.endsWith('target_time=2026-01-02T00%3A00%3A00Z')),
    ).toBe(true);
  });
});

describe('Check forecast updates', () => {
  it('selects the exact-cutoff publication, retains unchanged later republications and uses chronological spacing', async () => {
    const fetch = await open('Check forecast updates');
    const inspector = await screen.findByRole('region', { name: 'Selected publication details' });
    expect(within(inspector).getByText('Used for the buying decision')).toBeVisible();
    expect(within(inspector).getByText('01 Jan, 10:15 UTC')).toBeVisible();
    const count = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next publication' }));
    expect(within(inspector).getByText('After the deadline · excluded')).toBeVisible();
    expect(
      within(inspector).getByText(/Same value as the previous stored publication/),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(count);
    const chart = screen.getByRole('group', { name: /Forecast publication timeline/ });
    const points = chart.querySelectorAll('.forecast-point');
    const xs = Array.from(points).map((point) => Number(point.getAttribute('cx')));
    expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(150 / 135);
    expect(Number(chart.querySelector('.cutoff-line')!.getAttribute('x1'))).toBeCloseTo(xs[1]);
  });

  it('supports keyboard publication inspection and table selection without refetching', async () => {
    const fetch = await open('Check forecast updates');
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    const count = fetch.mock.calls.length;
    const point = screen.getByRole('button', { name: /Inspect publication 01 Jan, 10:15 UTC/ });
    fireEvent.keyDown(point, { key: 'End' });
    expect(
      screen.getByRole('button', { name: /Inspect publication 01 Jan, 12:45 UTC/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: 'All publications and deadline eligibility' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect stored publication 01 Jan, 08:00 UTC' }),
    );
    expect(screen.getByRole('button', { name: 'Previous publication' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it('reveals inspected publications without changing the buying-time forecast or refetching', async () => {
    const fetch = await open('Check forecast updates');
    const details = await screen.findByRole('region', { name: 'Selected publication details' });
    const scroll = vi.fn();
    details.scrollIntoView = scroll;
    const buyingValue = screen.getByRole('heading', {
      name: 'Available at the buying deadline',
    }).nextElementSibling;
    const count = fetch.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'All publications and deadline eligibility' }),
    );
    const table = screen.getByRole('table', { name: 'Forecast publication history' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    const action = screen.getByRole('button', {
      name: 'Inspect stored publication 01 Jan, 08:00 UTC',
    });
    fireEvent.click(action);
    expect(details).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    expect(within(details).getByText('01 Jan, 08:00 UTC')).toBeVisible();
    expect(within(details).getByText('100 MW')).toBeVisible();
    expect(within(details).getByText('Available · superseded by a newer forecast')).toBeVisible();
    expect(details).toHaveTextContent('the buying decision uses 120 MW instead');
    expect(buyingValue).toHaveTextContent('120 MW');
    // Re-inspecting the selected row must still reveal its details.
    fireEvent.click(action);
    expect(scroll).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect stored publication 01 Jan, 12:45 UTC' }),
    );
    expect(details).toHaveFocus();
    expect(within(details).getByText('After the deadline · excluded')).toBeVisible();
    expect(details).toHaveTextContent('arrived too late to use for the original buying decision');
    expect(buyingValue).toHaveTextContent('120 MW');
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it('keeps arrow navigation in the timeline and reveals details on explicit activation', async () => {
    await open('Check forecast updates');
    const details = await screen.findByRole('region', { name: 'Selected publication details' });
    const scroll = vi.fn();
    details.scrollIntoView = scroll;
    const point = screen.getByRole('button', { name: /Inspect publication 01 Jan, 10:15 UTC/ });
    point.focus();
    fireEvent.keyDown(point, { key: 'ArrowRight' });
    const next = screen.getByRole('button', { name: /Inspect publication 01 Jan, 12:45 UTC/ });
    expect(next).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.keyDown(next, { key: 'Enter' });
    expect(details).toHaveFocus();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('maps the final January buying day to February delivery and respects the target-hour boundary', async () => {
    await open('Check forecast updates');
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    expect(screen.getByRole('button', { name: 'Previous target hour' })).toBeDisabled();
    fireEvent.input(screen.getByLabelText('Delivery day'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Delivery hour · UTC / GMT'), {
      target: { value: '23' },
    });
    await waitFor(() =>
      expect(within(history()).getByRole('status')).toHaveTextContent('Buying day: 31 Jan 2026'),
    );
    expect(screen.getByRole('button', { name: 'Next target hour' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous target hour' }));
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    expect(screen.getByLabelText('Delivery hour · UTC / GMT')).toHaveValue('22');
  });

  it('handles absent history and incomplete actual readings', async () => {
    const value = evolution();
    value.publications = [];
    value.comparison = { ...emptyDecision().hours[0], target_time: value.comparison.target_time };
    await open(
      'Check forecast updates',
      api({ '/api/v1/evolution?target_time=2026-01-02T00%3A00%3A00Z': value }),
    );
    expect(
      await screen.findByText('No publications were acquired for this delivery hour.'),
    ).toBeVisible();
    expect(
      screen.getByText(/No stored forecast was published by the buying deadline/),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Selected publication details' }),
    ).not.toBeInTheDocument();
  });

  it('shows an error for malformed or mismatched history and can retry', async () => {
    const value = evolution();
    value.publications[2].available_at_cutoff = true;
    const fetch = api({ '/api/v1/evolution?target_time=2026-01-02T00%3A00%3A00Z': value });
    await open('Check forecast updates', fetch);
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected forecast history data');
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('region', { name: 'Selected publication details' }),
    ).toBeVisible();
  });
});

describe('Analysis integrity and edge cases', () => {
  it('blocks accuracy results that disagree with loaded metadata', async () => {
    const range = accuracyRange();
    range.overall.meta = { ...range.overall.meta, snapshot_id: 'b'.repeat(64) };
    range.daily.meta = range.overall.meta;
    await open(
      'Review a buying period',
      api({
        '/api/v1/accuracy?from=2026-01-01&to=2026-01-31': range.overall,
        '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31': range.daily,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Refresh analysis' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Accuracy results' })).not.toBeInTheDocument();
  });

  it('preserves zero forecast and actual readings in the publication timeline', async () => {
    const value = evolution();
    value.publications = [
      { ...value.publications[1], generation_mw: 0, value_changed_from_previous: null },
    ];
    value.comparison = {
      ...value.comparison,
      forecast_mw: 0,
      actual_mw: 0,
      actual_half_hours_mw: [0, 0],
      error_mw: 0,
      absolute_error_mw: 0,
    };
    await open(
      'Check forecast updates',
      api({ '/api/v1/evolution?target_time=2026-01-02T00%3A00%3A00Z': value }),
    );
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    expect(within(history()).getAllByText('0 MW').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('The forecast matched reported wind power.')).toBeVisible();
    const graph = screen.getByRole('group', { name: /Forecast publication timeline/ });
    expect(graph.querySelectorAll('.forecast-point')).toHaveLength(1);
    expect(graph.querySelector('.actual-line')).toBeInTheDocument();
  });

  it('shows later-only publications without treating any as available for the buying decision', async () => {
    const value = evolution();
    value.publications = [{ ...value.publications[2], value_changed_from_previous: null }];
    value.comparison = {
      ...value.comparison,
      forecast_mw: null,
      forecast_published_at: null,
      forecast_age_hours_at_cutoff: null,
      error_mw: null,
      absolute_error_mw: null,
      status: 'missing_data',
      missing_reasons: ['no_eligible_forecast'],
    };
    await open(
      'Check forecast updates',
      api({ '/api/v1/evolution?target_time=2026-01-02T00%3A00%3A00Z': value }),
    );
    const inspector = await screen.findByRole('region', { name: 'Selected publication details' });
    expect(within(inspector).getByText('After the deadline · excluded')).toBeVisible();
    expect(
      screen.getByText(/No stored forecast was published by the buying deadline/),
    ).toBeVisible();
    expect(screen.queryByText('Used for the buying decision')).not.toBeInTheDocument();
    const graph = screen.getByRole('group', { name: /Forecast publication timeline/ });
    expect(Number(graph.querySelector('.cutoff-line')!.getAttribute('x1'))).toBeLessThan(
      Number(graph.querySelector('.forecast-point')!.getAttribute('cx')),
    );
  });

  it('ignores an abandoned target-hour result after moving to the next hour', async () => {
    const fetch = api();
    let resolveOld: (value: unknown) => void = () => {};
    fetch.mockImplementation((path: string, options: RequestInit) =>
      path.endsWith('target_time=2026-01-02T00%3A00%3A00Z')
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : api()(path, options),
    );
    await open('Check forecast updates', fetch);
    await screen.findByText('Loading publications for this delivery hour…');
    fireEvent.click(screen.getByRole('button', { name: 'Next target hour' }));
    await screen.findByRole('region', { name: 'Forecast evolution results' });
    expect(within(history()).getByRole('status')).toHaveTextContent('01:00 UTC');
    expect(
      fetch.mock.calls.find(([path]) => path.endsWith('target_time=2026-01-02T00%3A00%3A00Z'))?.[1]
        .signal.aborted,
    ).toBe(true);
    await act(async () => resolveOld(response(evolution())));
    expect(within(history()).getByRole('status')).toHaveTextContent('01:00 UTC');
  });

  it('keeps low forecasts and negative differences visible without reversing their meaning', async () => {
    const range = accuracyRange('2026-01-01', '2026-01-31', 100);
    await open(
      'Review a buying period',
      api({
        '/api/v1/accuracy?from=2026-01-01&to=2026-01-31': range.overall,
        '/api/v1/accuracy/daily?from=2026-01-01&to=2026-01-31': range.daily,
      }),
    );
    expect(await screen.findByText('Forecast lower on average')).toBeVisible();
    expect(accuracy()).toHaveTextContent(
      'overestimate how much electricity you needed from other sources',
    );
    expect(
      within(
        screen.getByRole('table', { name: 'Largest hourly forecast differences' }),
      ).getAllByText('10 MW more wind'),
    ).toHaveLength(10);
    expect(
      screen
        .getByRole('img', { name: /How often the forecast was high or low/ })
        .querySelector('.error-under'),
    ).toBeInTheDocument();
  });
});

describe('buyer workflow across views', () => {
  it('opens publication history for the hour selected in replay', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await screen.findByRole('button', {
      name: 'Why this forecast?',
    });
    fireEvent.change(screen.getByLabelText('Buying decision date'), {
      target: { value: '2026-01-14' },
    });
    await screen.findByText('Wind forecast for 15 Jan 2026');
    const beforeHourChange = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next forecast hour' }));
    const inspector = screen.getByRole('region', {
      name: 'Buying-time forecast',
    });
    expect(within(inspector).getByText('01:00–02:00 UTC')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(beforeHourChange);
    fireEvent.click(screen.getByRole('button', { name: 'Why this forecast?' }));
    expect(await screen.findByRole('region', { name: 'Forecast evolution results' })).toBeVisible();
    expect(screen.getByLabelText('Delivery day')).toHaveValue('2026-01-15');
    expect(screen.getByLabelText('Delivery hour · UTC / GMT')).toHaveValue('01');
    expect(
      fetch.mock.calls.some(
        ([path]) => path === '/api/v1/evolution?target_time=2026-01-15T01%3A00%3A00Z',
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to buying overview' }));
    expect(await screen.findByRole('region', { name: 'Buying-time forecast' })).toHaveTextContent(
      '01:00–02:00 UTC',
    );
    expect(screen.getByLabelText('Buying decision date')).toHaveValue('2026-01-14');
  });

  it('moves from one buying day to a range review without treating daily error as overall reliability', async () => {
    vi.stubGlobal('fetch', api());
    render(<App />);
    const action = await screen.findByRole('button', {
      name: 'Explore historical accuracy',
    });
    expect(screen.getByRole('region', { name: 'Historical reliability' })).toBeVisible();
    fireEvent.click(action);
    expect(await screen.findByText('744 / 744 hours compared')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to buying overview' })).toBeVisible();
    expect(screen.getByRole('note', { name: 'How to use this accuracy review' })).toBeVisible();
  });
});

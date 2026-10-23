import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  accuracyRange,
  config,
  decision,
  emptyDecision,
  health,
  metadata,
  priorAccuracy,
  response,
} from './test/fixtures';

function api(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((path: string) => {
    const defaults: Record<string, unknown> = {
      '/api/v1/health': health,
      '/api/v1/config': config,
      '/api/v1/metadata': metadata,
    };
    if (path.startsWith('/api/v1/accuracy?') && !Object.hasOwn(overrides, path))
      return Promise.resolve(response(accuracyRange().overall));
    if (path.endsWith('/prior-accuracy') && !Object.hasOwn(overrides, path))
      return Promise.resolve(response(priorAccuracy(path.split('/').at(-2))));
    const value = Object.hasOwn(overrides, path)
      ? overrides[path]
      : (defaults[path] ?? decision(path.split('/').at(-1)));
    return Promise.resolve(response(value));
  });
}
const dateInput = () => screen.getByLabelText('Buying decision date');
const metrics = () => screen.getByRole('region', { name: 'Daily accuracy metrics' });
async function openEvidence() {
  await screen.findByRole('button', { name: 'Review this day after delivery' });
  const compare = screen.queryByRole('button', { name: 'Compare with actual generation' });
  if (compare) fireEvent.click(compare);
  const day = await screen.findByRole('button', { name: 'Review this day after delivery' });
  if (day.getAttribute('aria-expanded') !== 'true') fireEvent.click(day);
  const toggle = await screen.findByRole('button', { name: /View all 24 hourly readings/ });
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
  return screen.findByRole('table');
}

describe('Decision Replay', () => {
  it('loads real API contracts and presents the configured cutoff, graph and 24-row evidence table', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await openEvidence()).toBeInTheDocument();
    expect(screen.getByText('10:15 GMT on the buying day')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Hourly forecast and actual/ })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(25);
    expect(within(metrics()).getByText('How far off was the forecast?')).toBeInTheDocument();
    expect(screen.getByText('24 / 24 hours compared')).toBeInTheDocument();
    expect(dateInput()).toHaveAttribute('min', '2026-01-01');
    expect(dateInput()).toHaveAttribute('max', '2026-01-31');
    expect(screen.getByRole('button', { name: 'Previous decision day' })).toBeDisabled();
    expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/metadata')).toHaveLength(1);
  });

  it('updates delivery date, metrics, chart and evidence together after changing the decision day', async () => {
    const next = decision('2026-01-02', 1000);
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-02': next }));
    render(<App />);
    await openEvidence();
    fireEvent.change(dateInput(), { target: { value: '2026-01-02' } });
    await screen.findByText('03 Jan 2026');
    await openEvidence();
    await waitFor(() => expect(within(metrics()).getAllByText('890')).toHaveLength(2));
    expect(
      screen.getByRole('button', { name: /00:00 UTC: forecast 1,000 MW, actual 110 MW/ }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('1,000')).toHaveLength(24);
    expect(screen.getByRole('button', { name: 'Previous decision day' })).toBeEnabled();
  });

  it('handles the native input event used by calendar and direct date entry', async () => {
    vi.stubGlobal('fetch', api());
    render(<App />);
    await openEvidence();
    fireEvent.input(dateInput(), { target: { value: '2026-01-14' } });
    await openEvidence();
    expect(screen.getByText('15 Jan 2026')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Replay loaded for 14 Jan 2026');
  });

  it('supports previous/next navigation and January 31 delivery on February 1', async () => {
    vi.stubGlobal('fetch', api());
    render(<App />);
    await openEvidence();
    fireEvent.click(screen.getByRole('button', { name: 'Next decision day' }));
    await openEvidence();
    expect(dateInput()).toHaveValue('2026-01-02');
    fireEvent.click(screen.getByRole('button', { name: 'Previous decision day' }));
    await openEvidence();
    expect(dateInput()).toHaveValue('2026-01-01');
    fireEvent.change(dateInput(), { target: { value: '2026-01-31' } });
    await openEvidence();
    expect(screen.getByText('01 Feb 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next decision day' })).toBeDisabled();
  });

  it('rejects dates outside the supported window without making an analytical request', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await openEvidence();
    fireEvent.change(dateInput(), { target: { value: '2026-02-01' } });
    expect(screen.getByText('Choose a buying date from 1 to 31 January 2026.')).toBeInTheDocument();
    expect(dateInput()).toHaveValue('2026-01-01');
    expect(fetch.mock.calls.some(([path]) => path === '/api/v1/decisions/2026-02-01')).toBe(false);
  });

  it('hides old charts while a new date is pending and ignores a late response from an abandoned date', async () => {
    const fetch = api();
    let resolveOld: (value: unknown) => void = () => {};
    fetch.mockImplementation((path: string, options: RequestInit) => {
      if (path.endsWith('/decisions/2026-01-01'))
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return api()(path, options);
    });
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await screen.findByText('Loading replay for 01 Jan 2026…');
    fireEvent.change(dateInput(), { target: { value: '2026-01-02' } });
    await openEvidence();
    expect(
      fetch.mock.calls.find(([path]) => path.endsWith('/decisions/2026-01-01'))?.[1].signal.aborted,
    ).toBe(true);
    await act(async () => resolveOld(response(decision('2026-01-01', 9999))));
    expect(screen.getByText('03 Jan 2026')).toBeInTheDocument();
    expect(screen.queryByText('9,999')).not.toBeInTheDocument();
  });

  it('removes the previous date’s results until the new request completes', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await openEvidence();
    fetch.mockImplementation((path: string) =>
      path.endsWith('/2026-01-02') ? new Promise(() => {}) : api()(path),
    );
    fireEvent.change(dateInput(), { target: { value: '2026-01-02' } });
    expect(screen.getByRole('status')).toHaveTextContent('Loading replay for 02 Jan 2026');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Daily accuracy metrics' }),
    ).not.toBeInTheDocument();
  });

  it('offers a working retry after a structured snapshot error', async () => {
    const fetch = api();
    fetch.mockImplementation((path: string) =>
      path.includes('/decisions/')
        ? Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({
              error: {
                code: 'snapshot_missing',
                message: 'Prepare the historical snapshot before opening analysis.',
              },
            }),
          })
        : api()(path),
    );
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Prepare the historical snapshot');
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await openEvidence()).toBeInTheDocument();
  });

  it.each(['snapshot', 'cutoff'])(
    'refuses to combine results with a different %s policy',
    async (kind) => {
      const value = decision();
      if (kind === 'snapshot') value.meta.snapshot_id = 'b'.repeat(64);
      else {
        value.meta.decision_cutoff_gmt = '09:50';
        value.cutoff = '2026-01-01T09:50:00Z';
      }
      vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': value }));
      render(<App />);
      expect(await screen.findByRole('alert')).toHaveTextContent('snapshot or cutoff changed');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh analysis/ })).toBeInTheDocument();
    },
  );

  it('rejects malformed replay data without showing invented chart values', async () => {
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': { ...decision(), hours: [] } }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected replay data');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps genuine zeros visible in charts, details and metrics', async () => {
    const value = decision('2026-01-01', 0);
    value.hours = value.hours.map((hour) => ({
      ...hour,
      actual_half_hours_mw: [0, 0],
      actual_mw: 0,
      error_mw: 0,
      absolute_error_mw: 0,
    }));
    value.metrics = {
      ...value.metrics,
      mae_mw: 0,
      rmse_mw: 0,
      bias_mw: 0,
      p50_absolute_error_mw: 0,
      p90_absolute_error_mw: 0,
      max_absolute_error_mw: 0,
      overforecast_hours: 0,
      underforecast_hours: 0,
      exact_hours: 24,
      underforecast_percent: 0,
      exact_percent: 100,
    };
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': value }));
    render(<App />);
    await openEvidence();
    expect(within(metrics()).getAllByText('0')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /00:00 UTC: forecast 0 MW, actual 0 MW/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'See how much the forecast missed each hour' }),
    );
    expect(document.querySelectorAll('.error-exact')).toHaveLength(24);
  });

  it('breaks graph lines across missing data and explains partial coverage', async () => {
    const value = decision();
    value.hours[1] = {
      ...value.hours[1],
      actual_half_hours_mw: [100, null],
      actual_mw: null,
      error_mw: null,
      absolute_error_mw: null,
      status: 'missing_data',
      missing_reasons: ['missing_actual_second_half'],
    };
    value.metrics.coverage = {
      ...value.metrics.coverage,
      matched_hours: 23,
      coverage_percent: (100 * 23) / 24,
      incomplete_actual_hours: 1,
    };
    value.metrics.overforecast_hours = 23;
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': value }));
    render(<App />);
    await openEvidence();
    expect(screen.getByText(/Some hours cannot be compared/)).toBeInTheDocument();
    expect(document.querySelector('.actual-line')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'See how much the forecast missed each hour' }),
    );
    expect(document.querySelectorAll('.error-over')).toHaveLength(23);
    expect(screen.getByText('Second actual half-hour missing')).toBeInTheDocument();
  });

  it('shows empty comparison metrics as unavailable while preserving all 24 evidence rows', async () => {
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': emptyDecision() }));
    render(<App />);
    await openEvidence();
    expect(screen.getByText(/No comparable hours/)).toBeInTheDocument();
    expect(within(metrics()).getAllByText('—')).toHaveLength(2);
    expect(document.querySelector('.forecast-line')).toHaveAttribute(
      'd',
      expect.stringMatching(/^\s*$/),
    );
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(25);
  });

  it('lets keyboard and table selection inspect an hour without another network request', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await openEvidence();
    const count = fetch.mock.calls.length;
    const point = screen.getByRole('button', { name: /00:00 UTC: forecast/ });
    point.focus();
    fireEvent.keyDown(point, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /01:00 UTC: forecast/ })).toHaveFocus();
    expect(screen.getByText('01:00–02:00 UTC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect 23:00 UTC' }));
    expect(screen.getByText('23:00–00:00 UTC')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(count);
  });
});

it('reveals the selected hour when an hourly evidence row is inspected', async () => {
  const fetch = api();
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  await openEvidence();
  const details = screen.getByRole('region', { name: 'Selected hour details' });
  const scroll = vi.fn();
  details.scrollIntoView = scroll;
  const count = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Inspect 23:00 UTC' }));
  await waitFor(() => expect(details).toHaveFocus());
  expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  expect(within(details).getByText('23:00–00:00 UTC')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(count);
});

describe('setup and metadata states', () => {
  it.each(['not_ingested', 'snapshot_invalid'])(
    'keeps analytical requests out of the %s setup state',
    async (status) => {
      const fetch = api({ '/api/v1/health': { ...health, data_status: status } });
      vi.stubGlobal('fetch', fetch);
      render(<App />);
      await screen.findByText('API CONNECTED');
      expect(fetch.mock.calls.some(([path]) => path === '/api/v1/metadata')).toBe(false);
      expect(screen.getByText(/Assumed decision cutoff: 10:15 GMT/)).toBeInTheDocument();
    },
  );
  it('allows incomplete but valid snapshots to display explicitly missing replay data', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        '/api/v1/health': { ...health, data_status: 'snapshot_incomplete' },
        '/api/v1/decisions/2026-01-01': emptyDecision(),
      }),
    );
    render(<App />);
    expect(await openEvidence()).toBeInTheDocument();
    expect(screen.getByText('0 / 24 hours compared')).toBeInTheDocument();
  });
  it('shows connection loading without presenting metrics', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking API connection');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('retries a failed setup request', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await screen.findByRole('alert');
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await openEvidence()).toBeInTheDocument();
  });
  it('rejects malformed metadata before rendering a decision', async () => {
    vi.stubGlobal('fetch', api({ '/api/v1/metadata': {} }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected metadata');
    expect(screen.queryByLabelText('Buying decision date')).not.toBeInTheDocument();
  });
  it('rejects a malformed setup response without inventing a configured assumption', async () => {
    vi.stubGlobal('fetch', api({ '/api/v1/config': {} }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('setup response was invalid');
    expect(screen.queryByText(/GMT/)).not.toBeInTheDocument();
  });
});

describe('buyer overview', () => {
  it('answers the forecast and historical-gap questions without opening a separate view', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    const forecast = await screen.findByRole('region', { name: 'Buying-time forecast' });
    const context = screen.getByRole('region', { name: 'Historical reliability' });
    await waitFor(() =>
      expect(within(context).getByText('Insufficient earlier history')).toBeVisible(),
    );
    expect(within(forecast).getByText('120 MW')).toBeVisible();
    expect(screen.getByRole('group', { name: /Hourly wind forecast available/ })).toBeVisible();
    expect(document.querySelector('.actual-line')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Daily accuracy metrics' }),
    ).not.toBeInTheDocument();
    expect(within(context).queryByText('0 MW')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review this day after delivery' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.change(dateInput(), { target: { value: '2026-01-14' } });
    const contextAfterChange = await screen.findByRole('region', {
      name: 'Historical reliability',
    });
    await waitFor(() => expect(contextAfterChange).toHaveTextContent('298 / 298 hours compared'));
    expect(within(contextAfterChange).getByText('10 MW')).toBeVisible();
    expect(contextAfterChange).toHaveTextContent('Evidence available by 14 Jan, 10:15 UTC');
    expect(contextAfterChange).toHaveTextContent('both actual readings published by this deadline');
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/prior-accuracy'))).toHaveLength(2);
    expect(fetch.mock.calls.some(([path]) => path.startsWith('/api/v1/accuracy?'))).toBe(false);
  });

  it('keeps the forecast usable if historical accuracy fails and offers a separate retry', async () => {
    const fetch = api({ '/api/v1/decisions/2026-01-01/prior-accuracy': {} });
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Retry historical accuracy' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Buying-time forecast' })).toHaveTextContent(
      '120 MW',
    );
    const replayCalls = fetch.mock.calls.filter(
      ([path]) => path.startsWith('/api/v1/decisions/') && !path.endsWith('/prior-accuracy'),
    ).length;
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: 'Retry historical accuracy' }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Historical reliability' })).toHaveTextContent(
        'Insufficient earlier history',
      ),
    );
    expect(
      fetch.mock.calls.filter(
        ([path]) => path.startsWith('/api/v1/decisions/') && !path.endsWith('/prior-accuracy'),
      ),
    ).toHaveLength(replayCalls);
  });

  it('blocks reliability from a different snapshot while leaving the eligible forecast visible', async () => {
    const value = priorAccuracy();
    value.meta.snapshot_id = 'b'.repeat(64);
    const fetch = api({ '/api/v1/decisions/2026-01-01/prior-accuracy': value });
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('accuracy reference does not match');
    expect(screen.getByRole('region', { name: 'Buying-time forecast' })).toHaveTextContent(
      '120 MW',
    );
    fetch.mockImplementation(api());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Historical reliability' })).toHaveTextContent(
        'Insufficient earlier history',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides old accuracy while changing buying dates and ignores abandoned responses', async () => {
    let finishOld: (value: unknown) => void = () => {};
    const fetch = api();
    fetch.mockImplementation((path: string, options: RequestInit) =>
      path === '/api/v1/decisions/2026-01-15/prior-accuracy'
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : api()(path, options),
    );
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Buying decision date'), {
      target: { value: '2026-01-14' },
    });
    await screen.findByText('10 MW');
    fireEvent.change(dateInput(), { target: { value: '2026-01-15' } });
    await screen.findByText('Loading historical accuracy…');
    expect(screen.queryByText('10 MW')).not.toBeInTheDocument();
    fireEvent.change(dateInput(), { target: { value: '2026-01-16' } });
    await screen.findByText(/346 \/ 346 hours compared/);
    expect(
      fetch.mock.calls.find(([path]) => path === '/api/v1/decisions/2026-01-15/prior-accuracy')?.[1]
        .signal.aborted,
    ).toBe(true);
    await act(async () => finishOld(response(priorAccuracy('2026-01-15', 10000))));
    expect(screen.queryByText('9,890 MW')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Historical reliability' })).toHaveTextContent(
      'Evidence available by 16 Jan, 10:15 UTC',
    );
  });

  it.each(['cutoff', 'delivery_end'])(
    'rejects a historical summary with a future or incorrect %s',
    async (field) => {
      const value = priorAccuracy('2026-01-14');
      value[field as 'cutoff' | 'delivery_end'] = '2026-01-15T12:00:00Z';
      vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-14/prior-accuracy': value }));
      render(<App />);
      fireEvent.change(await screen.findByLabelText('Buying decision date'), {
        target: { value: '2026-01-14' },
      });
      expect(
        await screen.findByRole('button', { name: 'Retry historical accuracy' }),
      ).toBeVisible();
      expect(screen.queryByText('10 MW')).not.toBeInTheDocument();
    },
  );

  it('selects and reveals a forecast from the chart without exposing retrospective actuals or refetching', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    const chart = await screen.findByRole('group', { name: /Hourly wind forecast available/ });
    const count = fetch.mock.calls.length;
    const point = within(chart).getByRole('button', { name: '03:00 UTC: forecast 120 MW' });
    fireEvent.click(point);
    const forecast = screen.getByRole('region', { name: 'Buying-time forecast' });
    expect(forecast).toHaveTextContent('03:00–04:00 UTC');
    expect(forecast).toHaveFocus();
    expect(document.querySelector('.actual-line')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected hour details' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it.each([
    [110, 'High and low differences balanced on average', '0 MW'],
    [100, 'Forecasts were lower on average', '10 MW'],
  ])(
    'explains the historical direction honestly when forecast is %s MW',
    async (forecast, direction, gap) => {
      vi.stubGlobal(
        'fetch',
        api({
          '/api/v1/decisions/2026-01-14/prior-accuracy': priorAccuracy(
            '2026-01-14',
            forecast as number,
          ),
        }),
      );
      render(<App />);
      fireEvent.change(await screen.findByLabelText('Buying decision date'), {
        target: { value: '2026-01-14' },
      });
      expect(await screen.findByText(direction as string)).toBeVisible();
      const context = screen.getByRole('region', { name: 'Historical reliability' });
      expect(within(context).getByText(gap as string)).toBeVisible();
    },
  );

  it('shows unavailable historical accuracy rather than a zero when comparisons are missing', async () => {
    const value = priorAccuracy('2026-01-14');
    value.metrics = emptyDecision().metrics;
    value.metrics.coverage.expected_hours = 298;
    value.metrics.coverage.missing_forecast_hours = 298;
    value.metrics.coverage.incomplete_actual_hours = 298;
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-14/prior-accuracy': value }));
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Buying decision date'), {
      target: { value: '2026-01-14' },
    });
    expect(
      await screen.findByText(
        'No complete forecast and actual pairs were available by this buying deadline.',
      ),
    ).toBeVisible();
    const context = screen.getByRole('region', { name: 'Historical reliability' });
    expect(context).toHaveTextContent('Insufficient earlier history');
    expect(within(context).queryByText('0 MW')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Buying-time forecast' })).toHaveTextContent(
      '120 MW',
    );
  });

  it('reveals actuals on request and explains units through optional help', async () => {
    vi.stubGlobal('fetch', api());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with actual generation' }));
    expect(document.querySelector('.actual-line')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected hour details' })).toHaveTextContent(
      'Known only after delivery',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'What do forecast, actual, MW and deadline mean?' }),
    );
    expect(
      await screen.findByText(/A measure of power. Higher MW means more electricity/),
    ).toBeVisible();
  });
});

it('fits all 24 hours into the compact chart when the viewport changes without refetching', async () => {
  let compact = false;
  let notify = () => {};
  const media = {
    get matches() {
      return compact;
    },
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      notify = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  const fetch = api();
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  const chart = await screen.findByRole('group', { name: /Hourly wind forecast available/ });
  expect(chart).toHaveAttribute('viewBox', '0 0 1040 360');
  const count = fetch.mock.calls.length;
  act(() => {
    compact = true;
    notify();
  });
  expect(chart).toHaveAttribute('viewBox', '0 0 560 320');
  expect(within(chart).getAllByRole('button')).toHaveLength(24);
  expect(within(chart).getByText('23:00')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(count);
});

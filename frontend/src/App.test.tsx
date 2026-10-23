import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { config, decision, emptyDecision, health, metadata, response } from './test/fixtures';

function api(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((path: string) => {
    const defaults: Record<string, unknown> = {
      '/api/v1/health': health,
      '/api/v1/config': config,
      '/api/v1/metadata': metadata,
    };
    const value = Object.hasOwn(overrides, path)
      ? overrides[path]
      : (defaults[path] ?? decision(path.split('/').at(-1)));
    return Promise.resolve(response(value));
  });
}
const dateInput = () => screen.getByLabelText('Buying decision date');
const metrics = () => screen.getByRole('region', { name: 'Daily accuracy metrics' });
async function openEvidence() {
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
    await waitFor(() => expect(within(metrics()).getAllByText('890')).toHaveLength(2));
    await openEvidence();
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

describe('plain-language guidance', () => {
  it('explains the purpose and units, answers two main questions and keeps technical evidence collapsed', async () => {
    vi.stubGlobal('fetch', api());
    render(<App />);
    await screen.findByText(
      'The forecast was higher than reported generation in every compared hour.',
    );
    expect(screen.getByRole('heading', { name: /Understand wind forecasts/ })).toBeInTheDocument();
    expect(
      screen.getByText(/See the latest wind forecast available at your buying deadline/),
    ).toBeVisible();
    expect(screen.getByText('MW (megawatts) measures power')).toBeVisible();
    expect(within(metrics()).getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Higher on average')).toBeVisible();
    expect(screen.getByRole('button', { name: /More accuracy measures/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: /View all 24 hourly readings/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'See how much the forecast missed each hour' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Root mean square error gives large differences more weight.', {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /More accuracy measures/ }));
    expect(
      screen.getByText('Root mean square error gives large differences more weight.', {
        exact: false,
      }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'See how much the forecast missed each hour' }),
    );
    expect(screen.getByText(/Bars above zero mean the forecast was too high/)).toBeVisible();
  });

  it('explains the selected hour’s difference in words and follows table selection', async () => {
    const value = decision();
    value.hours[1] = { ...value.hours[1], forecast_mw: 90, error_mw: -20, absolute_error_mw: 20 };
    value.metrics = {
      ...value.metrics,
      mae_mw: 250 / 24,
      rmse_mw: Math.sqrt(2700 / 24),
      bias_mw: 210 / 24,
      max_absolute_error_mw: 20,
      overforecast_hours: 23,
      underforecast_hours: 1,
      overforecast_percent: (100 * 23) / 24,
      underforecast_percent: 100 / 24,
    };
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': value }));
    render(<App />);
    await openEvidence();
    expect(
      screen.getByText(/higher than reported generation in 23 hours and lower in 1 hour/),
    ).toBeVisible();
    expect(screen.getByText('10 MW lower than forecast')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect 01:00 UTC' }));
    expect(screen.getByText('20 MW higher than forecast')).toBeVisible();
  });

  it('does not imply an accurate day merely because high and low errors cancel out', async () => {
    const value = decision();
    value.metrics.bias_mw = 0;
    value.metrics.overforecast_hours = 12;
    value.metrics.underforecast_hours = 12;
    value.metrics.overforecast_percent = 50;
    value.metrics.underforecast_percent = 50;
    value.hours = value.hours.map((hour, index) =>
      index < 12 ? { ...hour, forecast_mw: 100, error_mw: -10 } : hour,
    );
    vi.stubGlobal('fetch', api({ '/api/v1/decisions/2026-01-01': value }));
    render(<App />);
    await screen.findByText('No average direction');
    expect(
      screen.getByText(
        'High and low differences balance on average. Individual hours may still differ.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/higher than reported generation in 12 hours and lower in 12 hours/),
    ).toBeVisible();
  });
});

describe('guided shadcn workspace', () => {
  it('explains the product and provides a clear starting action before the API responds', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: /Understand wind forecasts/ })).toBeVisible();
    expect(
      screen.getByText(/See the latest wind forecast available at your buying deadline/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review a buying day' })).toHaveAttribute(
      'href',
      '#replay-workspace',
    );
    expect(screen.getByRole('link', { name: 'How does this help?' })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
    expect(screen.getByText('Explore January 2026 decisions with historical data')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'How does this help with a buying decision?' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('how-it-works')).toBeInTheDocument();
  });

  it('provides expandable business context, source links and term definitions without refetching', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await screen.findByText(
      'The forecast was higher than reported generation in every compared hour.',
    );
    const count = fetch.mock.calls.length;
    expect(
      screen.getByRole('button', { name: 'How does this help with a buying decision?' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByText(
        /Customer demand, existing contracts and the renewable supply available to your utility/,
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Where the numbers come from' }));
    expect(await screen.findByRole('link', { name: 'Elexon WINDFOR' })).toHaveAttribute(
      'href',
      metadata.sources[0].documentation_url,
    );
    expect(screen.getByRole('link', { name: 'Elexon FUELHH WIND' })).toHaveAttribute(
      'href',
      metadata.sources[1].documentation_url,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'What do forecast, actual, MW and deadline mean?' }),
    );
    expect(
      await screen.findByText(/A measure of power. Higher MW means more electricity/),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(count);
  });

  it('offers simple hour navigation with correct boundaries and no extra API request', async () => {
    const fetch = api();
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await openEvidence();
    const count = fetch.mock.calls.length;
    expect(screen.getByRole('button', { name: 'Previous delivery hour' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next delivery hour' }));
    expect(screen.getByText('01:00–02:00 UTC')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous delivery hour' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect 23:00 UTC' }));
    expect(screen.getByRole('button', { name: 'Next delivery hour' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(count);
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
  const chart = await screen.findByRole('group', { name: /Hourly forecast and actual/ });
  expect(chart).toHaveAttribute('viewBox', '0 0 1040 290');
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

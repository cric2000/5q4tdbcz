import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

const health = { status: 'ok', service: 'windsight', phase: 'setup', data_status: 'not_ingested' };
const config = {
  decision_cutoff_gmt: '10:15',
  cutoff_reference_url: 'https://support.nordpoolgroup.com/reference',
  cutoff_is_assumed: true,
  decision_date_from: '2026-01-01', decision_date_to: '2026-01-31',
  delivery_date_from: '2026-01-02', delivery_date_to: '2026-02-01',
};

function successfulFetch() {
  return vi.fn().mockImplementation((path: string) => Promise.resolve({
    ok: true, json: async () => path.endsWith('/health') ? health : config,
  }));
}

describe('setup landing page', () => {
  it('shows the configured assumption and clearly discloses un-ingested data', async () => {
    vi.stubGlobal('fetch', successfulFetch());
    render(<App />);
    expect(await screen.findByText('API connected')).toBeInTheDocument();
    expect(screen.getByText(/Assumed decision cutoff: 10:15 GMT/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Historical data has not been ingested.');
    expect(screen.getAllByText('Planned')).toHaveLength(3);
  });

  it('shows a connection check while the API is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
    expect(screen.queryByText('API connected')).not.toBeInTheDocument();
  });

  it('offers a working retry after HTTP failures', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    fetch.mockImplementation(successfulFetch());
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('API connected')).toBeInTheDocument();
  });

  it('rejects malformed responses rather than displaying an invented assumption', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<App />);
    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Assumed decision cutoff:/)).not.toBeInTheDocument();
  });
});

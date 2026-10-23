import { useEffect, useState } from 'react';
import { loadSetup } from './api';
import type { SetupStatus } from './api';

type Connection =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; value: SetupStatus };

const views = [
  { number: '01', title: 'Decision Replay', copy: 'Revisit the wind forecast available before a buying decision, then compare it with the following day’s outturn.' },
  { number: '02', title: 'Accuracy & Risk', copy: 'Understand the size and direction of historical forecast differences, with clear units and data coverage.' },
  { number: '03', title: 'Forecast Evolution', copy: 'Follow a delivery hour through its publications. See what was known at the cutoff and what changed later.' },
];

export default function App() {
  const [connection, setConnection] = useState<Connection>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    setConnection({ state: 'loading' });
    loadSetup(controller.signal)
      .then((value) => { if (active) setConnection({ state: 'ready', value }); })
      .catch(() => { if (active) setConnection({ state: 'error' }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <a href="/" className="brand" aria-label="WindSight home">
          <span className="brand-mark" aria-hidden="true">w<span>↗</span></span>
          <span>WindSight</span>
        </a>
        <span className="header-caption">DAY-AHEAD WIND INTELLIGENCE</span>
        <span className="pilot-badge"><span aria-hidden="true">●</span> Historical pilot</span>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="title">
          <div className="hero-copy">
            <p className="eyebrow">GREAT BRITAIN / JANUARY 2026</p>
            <h1 id="title">A clearer view of<br />tomorrow’s wind.</h1>
            <p className="intro">Understand what was forecast at decision time.<br className="desktop-break" /> Learn from what actually followed.</p>
            <div className="setup-label"><span className="small-dot" aria-hidden="true" /> Phase 0 · Foundation ready</div>
          </div>
          <aside className="scope-card" aria-label="Pilot scope">
            <p className="eyebrow">THE HISTORICAL WINDOW</p>
            <div className="scope-row"><span>Purchase decisions</span><strong>01–31 Jan 2026</strong></div>
            <div className="scope-arrow" aria-hidden="true">↓ <span>Next-day delivery</span></div>
            <div className="scope-row"><span>Delivery dates</span><strong>02 Jan–01 Feb 2026</strong></div>
            <p className="scope-note">National wind · Elexon WINDFOR + FUELHH</p>
          </aside>
        </section>

        <section className="connection-panel" aria-labelledby="connection-title">
          <div className="connection-heading">
            <span className={`status-light ${connection.state}`} aria-hidden="true" />
            <div>
              <h2 id="connection-title">{connection.state === 'ready' ? 'API connected' : connection.state === 'error' ? 'API unavailable' : 'Checking API connection…'}</h2>
              <p role="status">{connection.state === 'ready' ? 'The application foundation is running. Historical data has not been ingested.' : connection.state === 'error' ? 'The service could not be reached. Check the backend and try again.' : 'Connecting to the WindSight service.'}</p>
            </div>
          </div>
          {connection.state === 'error' && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again <span aria-hidden="true">↗</span></button>}
          {connection.state === 'ready' && <a href="/api/v1/health" target="_blank" rel="noreferrer" className="health-link">Inspect service health <span aria-hidden="true">↗</span></a>}
        </section>

        {connection.state === 'ready' && <div className="assumption">
          <span className="assumption-label">REFERENCE ASSUMPTION</span>
          <a href={connection.value.config.cutoff_reference_url} target="_blank" rel="noreferrer" title="The client has not specified an exchange or deadline. This configurable pilot assumption uses Nord Pool’s published N2EX reference; January GMT equals UTC.">
            Assumed decision cutoff: {connection.value.config.decision_cutoff_gmt} GMT (N2EX reference) <span aria-hidden="true">↗</span>
          </a>
          <span>Client deadline to be confirmed.</span>
        </div>}

        <section className="planned" aria-labelledby="planned-title">
          <div className="section-heading"><h2 id="planned-title">Built around the buying decision</h2><span>PLANNED VIEWS</span></div>
          <div className="view-grid">{views.map((view) => <article className="view-card" key={view.number}>
            <div className="card-top"><span className="view-number">{view.number}</span><span className="planned-tag">Planned</span></div>
            <h3>{view.title}</h3><p>{view.copy}</p>
          </article>)}</div>
        </section>

        <section className="method-note" aria-label="Methodology preview">
          <span className="method-icon" aria-hidden="true">i</span>
          <p><strong>Evidence before insight.</strong> The planned comparison uses the latest eligible forecast and the average of two half-hour outturn readings. Metrics will appear after source data is ingested and validated.</p>
        </section>
      </main>

      <footer><span>WindSight <span aria-hidden="true">/</span> Historical decision support</span><span>Wind only. No demand, prices or purchase recommendations.</span></footer>
    </div>
  );
}

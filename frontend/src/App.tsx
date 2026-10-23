import { ArrowLeft, ArrowRight, Wind } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadSetup } from './api';
import DecisionReplay, { ErrorPanel, LoadingPanel, ProductGuide } from './DecisionReplay';
import { useResource } from './useResource';
import SecondaryAnalysis from './AnalysisViews';
import type { AnalysisView } from './AnalysisViews';

const setupLoader = (_key: string, signal: AbortSignal) => loadSetup(signal);

export default function App() {
  const [view, setView] = useState<AnalysisView>('replay');
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [decisionDate, setDecisionDate] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState(0);
  const openView = (next: AnalysisView, target?: string) => {
    if (target) setHistoryTarget(target);
    setView(next);
    const workspace = document.getElementById('replay-workspace');
    workspace?.scrollIntoView?.({ block: 'start' });
    workspace?.focus({ preventScroll: true });
  };
  const { resource, reload } = useResource('setup', setupLoader);
  const available =
    resource.state === 'ready' &&
    ['snapshot_ready', 'snapshot_incomplete'].includes(resource.value.health.data_status);
  return (
    <TooltipProvider delayDuration={200}>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:p-3"
        href="#main"
      >
        Skip to content
      </a>
      <div className="min-h-screen bg-muted/35">
        <header className="border-b bg-white">
          <div className="mx-auto flex min-h-16 max-w-[1360px] flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8 lg:px-10">
            <a
              href="/"
              className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-primary"
              aria-label="WindSight home"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-white">
                <Wind className="size-5" aria-hidden="true" />
              </span>
              WindSight
            </a>
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 font-normal text-primary"
            >
              January 2026 · Historical pilot
            </Badge>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10">
          <section className="py-6 sm:py-8" aria-labelledby="title">
            <h1
              id="title"
              className="text-[28px] font-semibold leading-tight tracking-[-.035em] sm:text-[34px]"
            >
              Your wind forecast. <span className="text-primary">Its historical reliability.</span>
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Choose a buying day. See the wind forecast available at your deadline and its
              measured historical accuracy together.
            </p>
          </section>
          <section
            id="replay-workspace"
            aria-label={
              view === 'replay'
                ? 'Decision Replay'
                : view === 'accuracy'
                  ? 'Accuracy & risk'
                  : 'Forecast evolution'
            }
            tabIndex={-1}
            className="scroll-mt-5 outline-none"
          >
            {view !== 'replay' && (
              <div className="mb-5 flex flex-wrap items-center gap-4">
                <Button variant="outline" onClick={() => openView('replay')}>
                  <ArrowLeft aria-hidden="true" />
                  Back to buying overview
                </Button>
                <h2 className="text-xl font-semibold">
                  {view === 'accuracy'
                    ? 'Explore historical accuracy'
                    : 'Check a forecast’s publication history'}
                </h2>
              </div>
            )}
            {resource.state === 'loading' && <LoadingPanel message="Checking API connection…" />}
            {resource.state === 'error' && (
              <ErrorPanel
                message={`The service could not be reached or its setup response was invalid. ${resource.error.message}`}
                retry={reload}
              />
            )}
            {resource.state === 'ready' && !available && (
              <section className="rounded-lg border bg-white px-6 py-10 text-center">
                <Badge variant="secondary">API CONNECTED</Badge>
                <h2 className="mt-4 text-xl font-semibold">
                  {resource.value.health.data_status === 'snapshot_invalid'
                    ? 'The historical data needs attention.'
                    : 'The historical data is not ready yet.'}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Prepare a valid historical snapshot before opening the buying overview.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Assumed decision cutoff: {resource.value.config.decision_cutoff_gmt} GMT · Client
                  deadline to be confirmed.
                </p>
                <Button className="mt-5" onClick={reload}>
                  Check again
                  <ArrowRight aria-hidden="true" />
                </Button>
              </section>
            )}
            {available &&
              (view === 'replay' ? (
                <DecisionReplay
                  decisionDate={decisionDate}
                  onDecisionDateChange={(date) => {
                    setDecisionDate(date);
                    setSelectedHour(0);
                  }}
                  selectedHour={selectedHour}
                  onHourChange={setSelectedHour}
                  onReviewAccuracy={() => openView('accuracy')}
                  onInspect={(target) => openView('evolution', target)}
                />
              ) : (
                <SecondaryAnalysis
                  view={view}
                  initialTarget={historyTarget}
                  onInspect={(target) => openView('evolution', target)}
                />
              ))}
          </section>
          {available && view === 'replay' && (
            <details className="mt-6 rounded-lg border bg-white p-5">
              <summary className="cursor-pointer text-sm font-medium">
                Explore more evidence
              </summary>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Optional: filter the accuracy period or investigate another delivery hour.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => openView('accuracy')}>
                  Accuracy & risk
                  <ArrowRight aria-hidden="true" />
                </Button>
                <Button variant="outline" onClick={() => openView('evolution')}>
                  Forecast evolution
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </details>
          )}
          <ProductGuide />
          <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t py-5 text-[11px] text-muted-foreground">
            <span>WindSight · Elexon national wind data</span>
            <span>Purchase quantities also require demand and contracted supply.</span>
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}

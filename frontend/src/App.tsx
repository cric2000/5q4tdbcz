import { ArrowRight, ArrowUpRight, Clock3, Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadSetup } from './api';
import DecisionReplay, { ErrorPanel, LoadingPanel, ProductGuide } from './DecisionReplay';
import { useResource } from './useResource';

const setupLoader = (_key: string, signal: AbortSignal) => loadSetup(signal);

function Brand() {
  return (
    <a
      href="/"
      className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-primary"
      aria-label="WindSight home"
    >
      <span className="flex size-9 items-center justify-center bg-primary text-white">
        <Wind className="size-5" aria-hidden="true" />
      </span>
      WindSight
    </a>
  );
}

function WindIllustration() {
  return (
    <div
      className="relative hidden w-[340px] shrink-0 self-center py-8 lg:block"
      aria-hidden="true"
    >
      <div className="absolute inset-x-5 inset-y-4 bg-primary/8 blur-3xl" />
      <p className="relative px-6 text-[10px] font-semibold tracking-[.2em] text-neutral-500">
        FROM EXPECTATION TO EVIDENCE
      </p>
      <div className="relative mt-6 space-y-1">
        <div className="px-6 py-5">
          <p className="text-xl font-medium tracking-tight text-neutral-500">What was known</p>
          <p className="mt-1 text-xs text-neutral-500">The forecast at your deadline</p>
        </div>
        <div className="border-y border-primary/15 bg-white/75 px-6 py-6">
          <p className="mb-2 text-[10px] font-semibold tracking-[.18em] text-primary">
            LOOK BACK. LEARN. PLAN.
          </p>
          <p className="text-3xl font-bold tracking-[-.04em] text-primary">What actually happened</p>
          <p className="mt-2 text-xs text-neutral-600">Reported wind generation</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xl font-medium tracking-tight text-neutral-500">How far apart they were</p>
          <p className="mt-1 text-xs text-neutral-500">Measured differences in MW</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { resource, reload } = useResource('setup', setupLoader);
  const available =
    resource.state === 'ready' &&
    ['snapshot_ready', 'snapshot_incomplete'].includes(resource.value.health.data_status);
  return (
    <TooltipProvider delayDuration={200}>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-sm focus:bg-white focus:p-3"
        href="#main"
      >
        Skip to content
      </a>
      <div className="min-h-screen">
        <header className="border-b border-neutral-200/70 bg-white/95">
          <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
            <Brand />
            <nav aria-label="Analytical views" className="hidden items-center gap-8 text-sm lg:flex">
              <a
                href="#replay-workspace"
                aria-current="page"
                className="font-medium text-primary underline-offset-8 hover:underline"
              >
                Decision replay
              </a>
              <a href="#data-sources" className="text-neutral-600 hover:text-primary">
                Sources & assumptions
              </a>
              <a href="#how-it-works" className="text-neutral-600 hover:text-primary">
                How WindSight helps
              </a>
            </nav>
            <Badge
              variant="outline"
              className="gap-2 rounded-none border-primary/20 bg-primary/5 px-3 py-2 text-[10px] font-medium text-primary sm:text-xs"
            >
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Historical pilot
            </Badge>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
          <section
            aria-labelledby="title"
            className="relative flex items-center justify-between gap-10 border-b py-12 sm:py-16 lg:min-h-[490px] lg:py-20"
          >
            <div className="relative z-10 min-w-0 max-w-[750px]">
              <p className="mb-5 flex items-center gap-2 text-[10px] font-semibold tracking-[.2em] text-primary">
                <span className="h-px w-5 bg-primary" aria-hidden="true" />
                FOR DAY-AHEAD ELECTRICITY BUYERS
              </p>
              <h1
                id="title"
                className="text-[38px] leading-[1.06] font-bold tracking-[-.055em] text-foreground sm:text-[56px] xl:text-[64px]"
              >
                Understand wind forecasts.
                <br />
                <span className="text-primary">Before you buy.</span>
              </h1>
              <p className="mt-6 max-w-[610px] text-base leading-[1.8] text-neutral-600">
                See the latest wind forecast available at your buying deadline, then measure how it
                compared with actual generation. Clear evidence for your day-ahead team’s wind
                assumptions.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild className="h-12 rounded-none px-5 shadow-[0_5px_14px_-7px_#14893770]">
                  <a href="#replay-workspace">
                    Review a buying day
                    <ArrowRight aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-12 rounded-none bg-white px-5 text-foreground"
                >
                  <a href="#how-it-works">
                    How does this help?
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <p className="mt-5 flex items-center gap-1.5 text-xs text-neutral-500">
                <Clock3 className="size-3" aria-hidden="true" />
                Explore January 2026 decisions with historical data
              </p>
            </div>
            <WindIllustration />
          </section>
          <section
            id="replay-workspace"
            aria-label="Decision Replay"
            tabIndex={-1}
            className="pt-10 scroll-mt-6 outline-none sm:pt-12"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-[.2em] text-primary">
                  YOUR DECISION, RECONSTRUCTED
                </p>
                <h2 className="text-2xl font-bold tracking-[-.035em] sm:text-3xl">
                  Replay a buying day
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Start with a date. We’ll show you what was known and what followed.
                </p>
              </div>
              <Badge variant="secondary" className="rounded-md px-2.5 py-1 font-normal">
                01–31 Jan 2026
              </Badge>
            </div>
            {resource.state === 'loading' && <LoadingPanel message="Checking API connection…" />}
            {resource.state === 'error' && (
              <ErrorPanel
                message={`The service could not be reached or its setup response was invalid. ${resource.error.message}`}
                retry={reload}
              />
            )}
            {resource.state === 'ready' && !available && (
              <section className="rounded-sm border bg-white px-6 py-12 text-center">
                <Badge variant="secondary">API CONNECTED</Badge>
                <h2 className="mt-4 text-xl font-semibold">
                  {resource.value.health.data_status === 'snapshot_invalid'
                    ? 'The historical data needs attention.'
                    : 'The historical data is not ready yet.'}
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  {resource.value.health.data_status === 'snapshot_invalid'
                    ? 'The historical snapshot could not be validated. Prepare a valid snapshot before opening the replay.'
                    : 'Historical data has not been ingested. Prepare the historical snapshot to explore a decision.'}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Assumed decision cutoff: {resource.value.config.decision_cutoff_gmt} GMT · Client
                  deadline to be confirmed.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={reload}>
                    Check again
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="/api/v1/health" target="_blank" rel="noreferrer">
                      Inspect service health
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              </section>
            )}
            {available && <DecisionReplay />}
          </section>
          <ProductGuide />
          <footer className="mt-9 flex flex-col justify-between gap-3 border-t py-6 text-[11px] leading-relaxed text-neutral-500 sm:flex-row">
            <span>WindSight · Built around the buying decision</span>
            <span>
              Forecast assessment · Purchase volumes also require demand and contracted supply
            </span>
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}

import { AnalysisWorkspace } from '@/components/analysis/AnalysisWorkspace';
import { Methodology } from '@/components/analysis/Methodology';
import { AccuracyView } from '@/features/accuracy/AccuracyView';
import { EvolutionView } from '@/features/evolution/EvolutionView';

export default function AnalysisView({
  view,
  initialTarget,
  onInspect,
}: {
  view: 'accuracy' | 'evolution';
  initialTarget: string | null;
  onInspect: (target: string) => void;
}) {
  return (
    <AnalysisWorkspace identity={view}>
      {(metadata, refresh) => (
        <div>
          {view === 'accuracy' ? (
            <AccuracyView metadata={metadata} refresh={refresh} onInspect={onInspect} />
          ) : (
            <EvolutionView
              key={initialTarget ?? 'default'}
              metadata={metadata}
              refresh={refresh}
              initialTarget={initialTarget}
            />
          )}
          <Methodology metadata={metadata} />
        </div>
      )}
    </AnalysisWorkspace>
  );
}

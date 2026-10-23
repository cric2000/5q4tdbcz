import { loadMetadata } from '@/api';
import type { Metadata } from '@/api';
import { ErrorPanel, LoadingPanel } from '@/components/feedback/RequestState';
import { useResource } from '@/hooks/useResource';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

/** Own metadata loading and reset analysis state when its source or cutoff changes. */
export function AnalysisWorkspace({
  identity = '',
  children,
}: {
  identity?: string;
  children: (metadata: Metadata, refresh: () => void) => ReactNode;
}) {
  const { resource, reload } = useResource('metadata', loadMetadata);
  if (resource.state === 'loading') return <LoadingPanel message="Loading historical wind data…" />;
  if (resource.state === 'error')
    return <ErrorPanel message={resource.error.message} retry={reload} />;
  const metadata = resource.value;
  return (
    <Fragment
      key={`${identity}:${metadata.snapshot.content_sha256}:${metadata.decision_cutoff_gmt}`}
    >
      {children(metadata, reload)}
    </Fragment>
  );
}

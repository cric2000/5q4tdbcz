import { getJson } from '@/api/client';
import type { Health, PilotConfig, SetupStatus } from '@/api/types';

export async function loadSetup(signal: AbortSignal): Promise<SetupStatus> {
  const [health, config] = await Promise.all([
    getJson('/api/v1/health', signal),
    getJson('/api/v1/config', signal),
  ]);
  if (
    !health ||
    typeof health !== 'object' ||
    !('status' in health) ||
    health.status !== 'ok' ||
    !('service' in health) ||
    health.service !== 'windsight' ||
    !('phase' in health) ||
    health.phase !== 'ingestion' ||
    !('data_status' in health) ||
    typeof health.data_status !== 'string' ||
    !['not_ingested', 'snapshot_ready', 'snapshot_incomplete', 'snapshot_invalid'].includes(
      health.data_status,
    ) ||
    !config ||
    typeof config !== 'object' ||
    !('decision_cutoff_gmt' in config) ||
    typeof config.decision_cutoff_gmt !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.decision_cutoff_gmt) ||
    !('cutoff_reference_url' in config) ||
    typeof config.cutoff_reference_url !== 'string' ||
    !config.cutoff_reference_url.startsWith('https://') ||
    !('cutoff_is_assumed' in config) ||
    config.cutoff_is_assumed !== true ||
    !('decision_date_from' in config) ||
    typeof config.decision_date_from !== 'string' ||
    !('decision_date_to' in config) ||
    typeof config.decision_date_to !== 'string' ||
    !('delivery_date_from' in config) ||
    typeof config.delivery_date_from !== 'string' ||
    !('delivery_date_to' in config) ||
    typeof config.delivery_date_to !== 'string'
  ) {
    throw new Error('Unexpected setup response');
  }
  return { health: health as Health, config: config as PilotConfig };
}

export interface Health {
  status: 'ok';
  service: 'windsight';
  phase: 'setup';
  data_status: 'not_ingested';
}

export interface PilotConfig {
  decision_cutoff_gmt: string;
  cutoff_reference_url: string;
  cutoff_is_assumed: boolean;
  decision_date_from: string;
  decision_date_to: string;
  delivery_date_from: string;
  delivery_date_to: string;
}

export interface SetupStatus { health: Health; config: PilotConfig }

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
  return response.json();
}

export async function loadSetup(signal: AbortSignal): Promise<SetupStatus> {
  const [health, config] = await Promise.all([
    getJson('/api/v1/health', signal),
    getJson('/api/v1/config', signal),
  ]);
  if (!health || typeof health !== 'object'
    || !('status' in health) || health.status !== 'ok'
    || !('service' in health) || health.service !== 'windsight'
    || !('phase' in health) || health.phase !== 'setup'
    || !('data_status' in health) || health.data_status !== 'not_ingested'
    || !config || typeof config !== 'object'
    || !('decision_cutoff_gmt' in config) || typeof config.decision_cutoff_gmt !== 'string'
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(config.decision_cutoff_gmt)
    || !('cutoff_reference_url' in config) || typeof config.cutoff_reference_url !== 'string'
    || !config.cutoff_reference_url.startsWith('https://')
    || !('cutoff_is_assumed' in config) || config.cutoff_is_assumed !== true
    || !('decision_date_from' in config) || typeof config.decision_date_from !== 'string'
    || !('decision_date_to' in config) || typeof config.decision_date_to !== 'string'
    || !('delivery_date_from' in config) || typeof config.delivery_date_from !== 'string'
    || !('delivery_date_to' in config) || typeof config.delivery_date_to !== 'string') {
    throw new Error('Unexpected setup response');
  }
  return { health: health as Health, config: config as PilotConfig };
}

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';

export interface Config {
  baseUrl: string;
  verbose: boolean;
  output: 'json' | 'text' | 'yaml';
  quiet: boolean;
  wide: boolean;
}

let _config: Config = {
  baseUrl: process.env['ARCHI_BASE_URL'] ?? DEFAULT_BASE_URL,
  verbose: false,
  output: 'json',
  quiet: false,
  wide: false,
};

export function setConfig(overrides: Partial<Config>): void {
  _config = { ..._config, ...overrides };
}

export function getConfig(): Readonly<Config> {
  return _config;
}

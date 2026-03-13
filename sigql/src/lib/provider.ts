import { InjectionToken, Provider } from '@angular/core';

export interface SigqlConfig {
  /** When set, appends the operation name as a query parameter to the URL (e.g. `?op=MyQuery`). */
  operationNameParam?: string;
}

export const SIGQL_ENDPOINT = new InjectionToken<string>('SIGQL_ENDPOINT');
export const SIGQL_CONFIG = new InjectionToken<SigqlConfig>('SIGQL_CONFIG');

export function provideSigql(endpoint: string, config: SigqlConfig = {}): Provider[] {
  return [
    { provide: SIGQL_ENDPOINT, useValue: endpoint },
    { provide: SIGQL_CONFIG, useValue: config },
  ];
}

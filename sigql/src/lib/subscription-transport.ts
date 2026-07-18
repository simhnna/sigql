import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/** Already-stringified request shape passed to a SubscriptionTransport — mirrors what post$ sends over HTTP. */
export interface SubscriptionRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface SubscriptionTransport {
  subscribe<T>(request: SubscriptionRequest): Observable<T>;
}

export const SIGQL_SUBSCRIPTION_TRANSPORT = new InjectionToken<SubscriptionTransport>(
  'SIGQL_SUBSCRIPTION_TRANSPORT',
);

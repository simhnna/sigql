import { Observable } from 'rxjs';
import type { Client } from 'graphql-ws';
import { GraphQLError, SigqlError, SubscriptionRequest, SubscriptionTransport } from 'sigql';

export class GraphqlWsTransport implements SubscriptionTransport {
  constructor(private readonly client: Client) {}

  subscribe<T>(request: SubscriptionRequest): Observable<T> {
    return new Observable<T>((subscriber) =>
      this.client.subscribe<T>(
        {
          query: request.query,
          variables: request.variables,
          operationName: request.operationName,
        },
        {
          next: (msg) => {
            if (msg.errors?.length) {
              subscriber.error(new SigqlError(msg.errors as unknown as GraphQLError[]));
              return;
            }
            subscriber.next(msg.data as T);
          },
          error: (err) => {
            subscriber.error(Array.isArray(err) ? new SigqlError(err as unknown as GraphQLError[]) : new SigqlError([], err as Error | undefined));
          },
          complete: () => subscriber.complete(),
        },
      ),
    );
  }
}

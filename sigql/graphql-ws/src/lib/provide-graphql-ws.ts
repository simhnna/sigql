import { Provider } from '@angular/core';
import { createClient, ClientOptions } from 'graphql-ws';
import { SIGQL_SUBSCRIPTION_TRANSPORT } from 'sigql';
import { GraphqlWsTransport } from './graphql-ws-transport';

export interface GraphqlWsOptions extends Omit<ClientOptions, 'url'> {
  url: string;
}

export function provideGraphqlWs(options: GraphqlWsOptions): Provider[] {
  return [
    {
      provide: SIGQL_SUBSCRIPTION_TRANSPORT,
      useFactory: () => new GraphqlWsTransport(createClient(options)),
    },
  ];
}

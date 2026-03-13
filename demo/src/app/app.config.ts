import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideSigql } from 'sigql';
import { provideGraphqlWs } from 'sigql/graphql-ws';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withXhr()),
    provideSigql('http://localhost:4000/graphql', { operationNameParam: 'op' }),
    provideGraphqlWs({ url: 'ws://localhost:4000/graphql' }),
  ],
};

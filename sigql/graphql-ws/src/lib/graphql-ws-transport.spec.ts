import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SIGQL_SUBSCRIPTION_TRANSPORT, SigqlError } from 'sigql';
import { GraphqlWsTransport } from './graphql-ws-transport';
import { provideGraphqlWs } from './provide-graphql-ws';

const createClientMock = vi.fn((_options: unknown) => ({ subscribe: vi.fn() }));
vi.mock('graphql-ws', () => ({
  createClient: (options: unknown) => createClientMock(options),
}));

type Sink = {
  next: (value: unknown) => void;
  error: (err: unknown) => void;
  complete: () => void;
};

function fakeClient() {
  const disposeSpy = vi.fn();
  let sink: Sink | undefined;
  const subscribe = vi.fn((_payload: unknown, s: Sink) => {
    sink = s;
    return disposeSpy;
  });
  return {
    client: { subscribe } as unknown as import('graphql-ws').Client,
    subscribe,
    disposeSpy,
    emit: (value: unknown) => sink!.next(value),
    fail: (err: unknown) => sink!.error(err),
    complete: () => sink!.complete(),
  };
}

describe('GraphqlWsTransport', () => {
  let fake: ReturnType<typeof fakeClient>;
  let transport: GraphqlWsTransport;

  beforeEach(() => {
    fake = fakeClient();
    transport = new GraphqlWsTransport(fake.client);
  });

  it('calls client.subscribe with the given query/variables/operationName', () => {
    transport
      .subscribe({ query: '{ hello }', variables: { id: '1' }, operationName: 'Hello' })
      .subscribe();

    expect(fake.subscribe).toHaveBeenCalledWith(
      { query: '{ hello }', variables: { id: '1' }, operationName: 'Hello' },
      expect.anything(),
    );
  });

  it('emits data from a next message', () => {
    const values: unknown[] = [];
    transport.subscribe({ query: '{ hello }' }).subscribe((v) => values.push(v));

    fake.emit({ data: { hello: 'world' } });

    expect(values).toEqual([{ hello: 'world' }]);
  });

  it('errors with a SigqlError and does not emit when a next message carries errors', () => {
    const values: unknown[] = [];
    let error: unknown;
    transport
      .subscribe({ query: '{ hello }' })
      .subscribe({ next: (v) => values.push(v), error: (e) => (error = e) });

    fake.emit({ data: null, errors: [{ message: 'nope' }] });

    expect(values).toEqual([]);
    expect(error).toBeInstanceOf(SigqlError);
    expect((error as SigqlError).graphqlErrors).toEqual([{ message: 'nope' }]);
  });

  it('wraps a GraphQLError[] sink error as SigqlError.errors', () => {
    let error: unknown;
    transport.subscribe({ query: '{ hello }' }).subscribe({ error: (e) => (error = e) });

    fake.fail([{ message: 'boom' }]);

    expect(error).toBeInstanceOf(SigqlError);
    expect((error as SigqlError).graphqlErrors).toEqual([{ message: 'boom' }]);
    expect((error as SigqlError).networkError).toBeUndefined();
  });

  it('wraps a non-array sink error as SigqlError.networkError', () => {
    let error: unknown;
    transport.subscribe({ query: '{ hello }' }).subscribe({ error: (e) => (error = e) });

    const closeEvent = new Error('socket closed');
    fake.fail(closeEvent);

    expect(error).toBeInstanceOf(SigqlError);
    expect((error as SigqlError).graphqlErrors).toEqual([]);
    expect((error as SigqlError).networkError).toBe(closeEvent);
  });

  it('completes when the sink completes', () => {
    let completed = false;
    transport.subscribe({ query: '{ hello }' }).subscribe({ complete: () => (completed = true) });

    fake.complete();

    expect(completed).toBe(true);
  });

  it('calls the client dispose function on unsubscribe', () => {
    const sub = transport.subscribe({ query: '{ hello }' }).subscribe();
    sub.unsubscribe();

    expect(fake.disposeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('provideGraphqlWs', () => {
  it('creates a graphql-ws client with the given options and provides it as the SIGQL_SUBSCRIPTION_TRANSPORT', () => {
    createClientMock.mockClear();
    const providers = provideGraphqlWs({ url: 'ws://localhost:4000/graphql' });

    expect(providers).toEqual([expect.objectContaining({ provide: SIGQL_SUBSCRIPTION_TRANSPORT })]);

    const useFactory = (providers[0] as unknown as { useFactory: () => unknown }).useFactory;
    const transport = useFactory();

    expect(createClientMock).toHaveBeenCalledWith({ url: 'ws://localhost:4000/graphql' });
    expect(transport).toBeInstanceOf(GraphqlWsTransport);
  });
});

import { DocumentNode } from './gql';

export type DocumentInput = string | DocumentNode;

export interface GraphQLRequest<V = Record<string, unknown>> {
  query: DocumentInput;
  variables?: V;
  operationName?: string;
  /** Aborts the in-flight request if it fires before the response arrives. Used by `execute()`/`query()`. */
  abortSignal?: AbortSignal;
}

export interface GraphQLMutationRequest<V = Record<string, unknown>> {
  mutation: DocumentInput;
  variables?: V;
  operationName?: string;
  refetchQueries?: string[];
  awaitRefetchQueries?: boolean;
}

export interface GraphQLSubscriptionRequest<V = Record<string, unknown>> {
  subscription: DocumentInput;
  variables?: V;
  operationName?: string;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export type GraphQLResult<T> = GraphQLSuccessResponse<T> | GraphQLErrorResponse<T>;

export interface GraphQLErrorResponse<T> {
  data: T | null;
  graphqlErrors?: GraphQLError[];
  networkError?: Error;
  ok: false;
}

export interface GraphQLSuccessResponse<T> {
  data: T;
  ok: true;
}

export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export class SigqlError<T = unknown> extends Error {
  constructor(
    public readonly graphqlErrors: GraphQLError[] = [],
    public readonly networkError?: Error,
    public readonly data?: T,
  ) {
    super(networkError?.message ?? graphqlErrors.map((e) => e.message).join('\n'));
    this.name = 'SigqlError';
  }
}

export function errorMessage(err: GraphQLErrorResponse<unknown>): string {
  return (
    err.networkError?.message ??
    err.graphqlErrors?.map((e) => e.message).join('\n') ??
    'Unknown error'
  );
}

/** Unwraps a `GraphQLResult<T>`, resolving with `data` on success or throwing a `SigqlError` (carrying `.graphqlErrors`/`.networkError`/`.data`) on failure. */
export async function orThrow<T>(result: Promise<GraphQLResult<T>>): Promise<T> {
  const r = await result;
  if (!r.ok) throw new SigqlError(r.graphqlErrors ?? [], r.networkError, r.data ?? undefined);
  return r.data as T;
}

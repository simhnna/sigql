import { DocumentNode } from './gql';

/**
 * A `DocumentNode` that carries its result/variables types, so `query()`/`queryResource()`/etc.
 * can infer `T` and `V` from the document instead of requiring explicit type arguments.
 *
 * Structurally compatible with `TypedDocumentNode` from `@graphql-typed-document-node/core`,
 * which is what GraphQL Code Generator emits — generated documents work here directly.
 */
export interface TypedDocumentNode<TResult = any, TVariables = any> extends DocumentNode {
  /** Never set at runtime — a type-level brand carrying `TResult`/`TVariables`. */
  __apiType?: (variables: TVariables) => TResult;
}

/**
 * A GraphQL document: a raw string, a plain `DocumentNode` (e.g. from the `gql` tag), or a
 * `TypedDocumentNode` (which additionally drives type inference for results and variables).
 */
export type DocumentInput<TResult = any, TVariables = any> =
  | string
  | TypedDocumentNode<TResult, TVariables>;

export interface GraphQLRequest<T = any, V = Record<string, unknown>> {
  query: DocumentInput<T, V>;
  variables?: V;
  operationName?: string;
  /** Aborts the in-flight request if it fires before the response arrives. Used by `execute()`/`query()`. */
  abortSignal?: AbortSignal;
}

export interface GraphQLMutationRequest<T = any, V = Record<string, unknown>> {
  mutation: DocumentInput<T, V>;
  variables?: V;
  operationName?: string;
  refetchQueries?: string[];
  awaitRefetchQueries?: boolean;
}

export interface GraphQLSubscriptionRequest<T = any, V = Record<string, unknown>> {
  subscription: DocumentInput<T, V>;
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

import { OperationDefinitionNode } from 'graphql';
import { DocumentInput } from './types';

export function getOperationName(doc: DocumentInput): string | undefined {
  if (typeof doc === 'string') return undefined;
  const def = doc.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === 'OperationDefinition',
  );
  return def?.name?.value;
}

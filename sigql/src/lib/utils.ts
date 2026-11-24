import { DocumentInput } from './types';

export function getOperationName(doc: DocumentInput): string | undefined {
  if (typeof doc === 'string') return undefined;
  const operations = doc.definitions.filter((d) => d.kind === 'OperationDefinition');
  return operations.length === 1 ? operations[0].name?.value : undefined;
}

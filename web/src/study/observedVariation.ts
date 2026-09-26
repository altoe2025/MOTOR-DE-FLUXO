import type { ScenarioDocument } from './model';

/** Rótulo de carteiras montadas a partir de casos observados (alavancas ou junção de empresas). */
export function observedVariationLabel(scenario: ScenarioDocument): string | null {
  const source = scenario.sourceSnapshot.source;
  const definition = source.kind === 'AUTHORED' ? source.definition : undefined;
  if (definition?.kind !== 'EXPLICIT_ORDERS') return null;
  if ((definition.sourceCases?.length ?? 0) > 0) return 'Casos de empresas juntos';
  return definition.derivedFromObservedCase === undefined ? null : 'Variação de dados observados';
}

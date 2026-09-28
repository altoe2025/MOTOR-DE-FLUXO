import { interClientSplit, savingsOrigin, scenarioRow, type OriginEntry } from '../levers/savingsOrigin';
import type { StudyDocument } from '../study/model';

/**
 * Parte derivada da apresentação: repartição por empresa calculada a partir das ordens e
 * alocações de cada cenário (a mesma conta de "De onde vem a economia" no diagnóstico).
 * Não é citada por ponteiro no documento, porque não existe publicada no motor.
 */
export type PresentationStory = Readonly<{
  baseName: string;
  presentedIsBase: boolean;
  origin: readonly OriginEntry[];
  split: ReturnType<typeof interClientSplit>;
}>;

export function buildPresentationStory(study: StudyDocument, scenarioId: string): PresentationStory | null {
  const baseScenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
  if (baseScenario === undefined || study.scenarios.length < 2) return null;
  const rows = study.scenarios.map((scenario) => scenarioRow(study, scenario));
  const base = rows.find((row) => row.scenario.id === baseScenario.id)!;
  const origin = savingsOrigin(rows, base);
  return {
    baseName: baseScenario.name,
    presentedIsBase: scenarioId === baseScenario.id,
    origin: origin.length < 2 ? [] : origin,
    split: interClientSplit(origin),
  };
}

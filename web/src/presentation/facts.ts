import type { CommunicationFact } from '../communication/domain';
import { formatBps, formatFraction, formatMoney } from './format';

export type PresentedFact = Readonly<{ label: string; value: string; explanation: string | null }>;

const costNames: Readonly<Record<string, string>> = {
  iof_out: 'IOF de saída', iof_in: 'IOF de entrada', carry_cnr: 'Carry da CNR',
  spread_rail_bps: 'Spread da rota', custo_fixo_remessa: 'Custo fixo por remessa',
  custo_oportunidade_aa: 'Custo de oportunidade anual', ptax: 'PTAX de referência',
  iof_por_finalidade: 'IOF por finalidade',
};

function provenance(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const fields = parsed as Record<string, unknown>;
    const parts = [
      typeof fields.source === 'string' ? `Origem: ${fields.source}` : null,
      typeof fields.kind === 'string' ? `Tipo: ${fields.kind}` : null,
      typeof fields.version === 'string' ? `Versão: ${fields.version}` : null,
      typeof fields.recordedAt === 'string' ? `Registrado em: ${fields.recordedAt}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
  } catch { return null; }
}

/** Presentation only: the published fact and its evidence stay untouched. */
export function presentFact(fact: CommunicationFact): PresentedFact {
  if (fact.code === 'IOF_APPLICATION_MODE') {
    const modes: Readonly<Record<string, string>> = {
      FALLBACK_ONLY: 'IOF padrão por direção',
      SPECIFIC_ONLY: 'IOF específico por finalidade',
      MIXED: 'IOF misto: específico e padrão por direção',
    };
    return { label: fact.label, value: modes[fact.value] ?? fact.value,
      explanation: 'São premissas da simulação; não representam cotação.' };
  }
  if (fact.code === 'SOURCE') {
    try {
      const parsed: unknown = JSON.parse(fact.value);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const source = parsed as Record<string, unknown>;
        if (source.kind === 'OBSERVED_CASE' && typeof source.caseId === 'string'
          && typeof source.caseRevision === 'number') return {
          label: fact.label, value: `Caso observado ${source.caseId} · revisão ${source.caseRevision}`,
          explanation: 'A carteira veio de um Caso observado; o resultado ainda é simulado.',
        };
        if (source.kind === 'SYNTHETIC' && source.recipe !== null
          && typeof source.recipe === 'object' && !Array.isArray(source.recipe)) {
          const recipe = source.recipe as Record<string, unknown>;
          if (typeof recipe.exampleId === 'string' && typeof recipe.generatorVersion === 'string'
            && Array.isArray(recipe.composition) && Array.isArray(recipe.seeds)) {
            const participants = recipe.composition.filter((entry: unknown) => entry !== null
              && typeof entry === 'object' && !Array.isArray(entry)
              && typeof (entry as Record<string, unknown>).participant_id === 'string').length;
            return {
              label: fact.label,
              value: `Receita sintética ${recipe.exampleId} · gerador ${recipe.generatorVersion} · ${participants} participantes · ${recipe.seeds.length} sementes`,
              explanation: 'A receita e suas sementes identificam a geração desta carteira.',
            };
          }
        }
      }
    } catch { /* Keep the published value if its shape is unknown. */ }
  }
  if (fact.code.startsWith('COST.')) {
    const key = fact.code.slice(5);
    const label = costNames[key] ?? fact.label;
    if (['iof_out', 'iof_in', 'carry_cnr', 'custo_oportunidade_aa'].includes(key)) return {
      label, value: formatFraction(fact.value), explanation: 'Alíquota usada na simulação; não é cotação.',
    };
    if (key === 'spread_rail_bps') return { label, value: formatBps(fact.value),
      explanation: 'Pontos-base usados na simulação.' };
    if (key === 'custo_fixo_remessa') return { label, value: formatMoney(fact.value),
      explanation: 'Valor por remessa usado na simulação.' };
    if (key === 'iof_por_finalidade') return { label, value: 'Regras de IOF por finalidade publicadas na receita',
      explanation: 'A lista canônica aparece abaixo para auditoria.' };
    return { label, value: fact.value, explanation: key === 'ptax' ? 'Taxa de referência usada na simulação.' : null };
  }
  if (fact.code.startsWith('SOURCE_PROVENANCE_')) return {
    label: 'Proveniência da fonte', value: provenance(fact.value) ?? fact.value,
    explanation: 'Registro de origem da carteira publicada.',
  };
  if (fact.code === 'SOURCE_FINGERPRINT') return { label: 'Identificador da carteira de origem',
    value: fact.value, explanation: 'Impressão digital da fonte publicada.' };
  if (fact.code === 'INPUT_FINGERPRINT') return { label: 'Identificador das entradas',
    value: fact.value, explanation: 'Impressão digital das entradas da execução.' };
  if (fact.code === 'PERIOD') {
    try {
      const parsed: unknown = JSON.parse(fact.value);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const period = (parsed as Record<string, unknown>).httpPeriod;
        if (period !== null && typeof period === 'object' && !Array.isArray(period)) {
          const fields = period as Record<string, unknown>;
          if (fields.modo === 'NATURAL' && typeof fields.dias_aquecimento === 'number'
            && typeof fields.periodo_medicao_dias === 'number'
            && Number.isSafeInteger(fields.dias_aquecimento) && Number.isSafeInteger(fields.periodo_medicao_dias)) return {
            label: 'Período da execução',
            value: `Período natural · ${fields.dias_aquecimento} dias de aquecimento · ${fields.periodo_medicao_dias} dias de medição`,
            explanation: 'Aquecimento e medição publicados para esta execução.',
          };
        }
      }
    } catch { /* Preserve unrecognized published periods. */ }
    return { label: 'Período da execução', value: fact.value,
      explanation: 'Configuração canônica do período publicada na execução.' };
  }
  return { label: fact.label, value: fact.value, explanation: null };
}

export function presentLimitation(code: string, statement: string): string {
  if (code === 'COSTS_NOT_OBSERVED' && statement === 'COST_PROVENANCE_IS_NOT_OBSERVED') return 'As premissas de custo não foram observadas na fonte; os resultados são simulados sob os valores informados.';
  return statement;
}

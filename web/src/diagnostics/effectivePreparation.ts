import type { PreviaRequest } from '../api/client';
import { canonical } from '../study/fingerprints';
import type { DiagnosticExecutionRecord, EffectiveInput, PeriodDocument, PremisesDocument } from '../study/model';

/** Preserve the participant recipe; replace only the scenario's current assumptions. */
export function effectivePreparation(
  recipe: EffectiveInput,
  premises: PremisesDocument,
  period: PeriodDocument,
  provenance: PreviaRequest['proveniencia'],
): EffectiveInput {
  if (period.httpPeriod.modo !== 'NATURAL') {
    throw new Error('Distribuições geradas exigem período natural. Use uma repetição para o período legado.');
  }
  const sources = Object.fromEntries(Object.entries(recipe.sources)
    .filter(([path]) => path.startsWith('/participants/')));
  const source = (path: string, previewPath: string, value: unknown, original: unknown) => {
    const origin = provenance[previewPath];
    if (origin !== undefined && (origin.tipo === 'PADRAO_SINTETICO' || origin.tipo === 'ESTIMATIVA_USUARIO')) {
      sources[path] = { kind: origin.tipo, source: origin.fonte, recorded_at: origin.registrado_em_utc };
    } else if (origin === undefined && canonical(value) === canonical(original) && recipe.sources[path] !== undefined) {
      sources[path] = structuredClone(recipe.sources[path]);
    } else {
      throw new Error(`Origem atual necessária para ${path}.`);
    }
  };
  const { dias_aquecimento: warmup, periodo_medicao_dias: measurement } = period.httpPeriod;
  source('/warmup_days', '/horizonte_dias', warmup, recipe.warmup_days);
  source('/measurement_days', '/horizonte_dias', measurement, recipe.measurement_days);
  source('/window_days', '/janela_dias', premises.windowDays, recipe.window_days);
  for (const key of ['iof_out', 'iof_in', 'carry_cnr', 'spread_rail_bps', 'custo_fixo_remessa', 'custo_oportunidade_aa', 'ptax'] as const) {
    source(`/costs/${key}`, `/custo/${key}`, premises.costs[key], recipe.costs[key]);
  }
  premises.costs.iof_por_finalidade.forEach((rule, index) => {
    const purpose = rule.finalidade.replaceAll('~', '~0').replaceAll('/', '~1');
    const previous = recipe.costs.iof_por_finalidade.find((item) => item.finalidade === rule.finalidade && item.direcao === rule.direcao);
    source(`/costs/iof_por_finalidade/${purpose}/${rule.direcao}`, `/custo/iof_por_finalidade/${index}/aliquota`, rule, previous);
  });
  return { ...structuredClone(recipe), window_days: premises.windowDays, warmup_days: warmup, measurement_days: measurement, costs: structuredClone(premises.costs), sources };
}


/** Legacy snapshots remain readable, but mismatched assumptions require a new run. */
export function diagnosticUsesSavedPremises(execution: DiagnosticExecutionRecord): boolean {
  const sampling = execution.requestSnapshot.sampling;
  if (sampling.kind !== 'GENERATED_INPUT') return true;
  const period = execution.periodSnapshot.httpPeriod;
  return period.modo === 'NATURAL'
    && sampling.preparation_input.warmup_days === period.dias_aquecimento
    && sampling.preparation_input.measurement_days === period.periodo_medicao_dias
    && sampling.preparation_input.window_days === execution.premisesSnapshot.windowDays
    && canonical(sampling.preparation_input.costs) === canonical(execution.premisesSnapshot.costs);
}

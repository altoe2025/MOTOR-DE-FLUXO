import Decimal from 'decimal.js';

type SavingsMetric = Readonly<{ state: 'AVAILABLE'; value: Readonly<{ p50: string }> } | { state: string }>;

export function describeSelectedRepetition(
  envelope: Readonly<{
    statistics: Readonly<{ selected_repetition_id: string; count: number; kind: 'DISTRIBUTION' | 'SINGLE_EXECUTION' }>;
    selected_execution: Readonly<{ statistics: Readonly<{ repetition_id: string }> }>;
    repetitions?: readonly Readonly<{ repetition_id: string; savings_brl?: string }>[];
    axes?: Readonly<{ economic_robustness: Readonly<{ savings_brl: SavingsMetric }> }>;
  }>,
): Readonly<{ repetitionId: string; total: number; position: number; criterion: string }> {
  const repetitionId = envelope.statistics.selected_repetition_id;
  if (repetitionId !== envelope.selected_execution.statistics.repetition_id) {
    throw new Error('A repetição selecionada não corresponde à execução persistida.');
  }
  const index = envelope.repetitions?.findIndex((item) => item.repetition_id === repetitionId) ?? -1;
  const selected = index < 0 ? undefined : envelope.repetitions![index];
  const savings = envelope.axes?.economic_robustness.savings_brl;
  const isMedian = savings !== undefined && 'value' in savings && selected?.savings_brl !== undefined
    && new Decimal(selected.savings_brl).eq(savings.value.p50);
  return {
    repetitionId,
    total: envelope.statistics.count,
    position: index < 0 ? 1 : index + 1,
    criterion: envelope.statistics.kind === 'SINGLE_EXECUTION'
      ? 'Única execução da entrada fixa.'
      : isMedian
        ? 'Repetição da mediana da economia (P50) entre as carteiras simuladas.'
        : index === 0
          ? 'Primeira repetição do plano, definida antes da execução (diagnóstico anterior à escolha pela mediana).'
          : 'Repetição indicada no plano do diagnóstico antes da execução.',
  };
}

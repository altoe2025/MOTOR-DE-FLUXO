export function describeSelectedRepetition(
  envelope: Readonly<{
    statistics: Readonly<{ selected_repetition_id: string; count: number; kind: 'DISTRIBUTION' | 'SINGLE_EXECUTION' }>;
    selected_execution: Readonly<{ statistics: Readonly<{ repetition_id: string }> }>;
    repetitions?: readonly Readonly<{ repetition_id: string }>[];
  }>,
): Readonly<{ repetitionId: string; total: number; criterion: string }> {
  const repetitionId = envelope.statistics.selected_repetition_id;
  if (repetitionId !== envelope.selected_execution.statistics.repetition_id) {
    throw new Error('A repetição selecionada não corresponde à execução persistida.');
  }
  return {
    repetitionId,
    total: envelope.statistics.count,
    criterion: envelope.statistics.kind === 'SINGLE_EXECUTION'
      ? 'Única execução da entrada fixa.'
      : envelope.repetitions?.[0]?.repetition_id === repetitionId
        ? 'Primeira repetição do plano, definida antes da execução.'
        : 'Repetição indicada no plano do diagnóstico antes da execução.',
  };
}

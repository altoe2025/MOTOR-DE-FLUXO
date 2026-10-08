import Decimal from 'decimal.js';

import { formatMoney } from '../presentation/format';
import type { ReplayDocument } from './domain';

export type ReplayDayPresentation = Readonly<{
  day: number;
  hasOperationalEvent: boolean;
  matchedPositionBrl: string;
  matchedContributionBrl: string;
  remittedOutBrl: string;
  remittedInBrl: string;
  openOutBrl: string;
  openInBrl: string;
  openBrl: string;
  explanation: string;
  journal: readonly string[];
}>;

export type ReplayJournalDay = Readonly<{
  day: number;
  entries: readonly string[];
}>;

const triggerLabels = { WINDOW: 'janela', DEADLINE: 'prazo', HORIZON_END: 'fim do horizonte' } as const;

function amount(value: Decimal): string {
  return value.isZero() ? '0' : value.toFixed().replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function presentReplayDay(document: ReplayDocument, day: number): ReplayDayPresentation {
  const replayDay = document.days[day];
  if (replayDay === undefined) throw new RangeError(`Dia ${day} fora do Replay.`);
  const closing = replayDay.closing;
  const matchedPositionBrl = closing?.matched_position_brl ?? '0';
  const matchedContributionBrl = closing?.matched_contribution_brl ?? '0';
  const remittedOutBrl = closing?.remitted_out_brl ?? '0';
  const remittedInBrl = closing?.remitted_in_brl ?? '0';
  const openBrl = amount(new Decimal(replayDay.end_state.open_out_brl).plus(replayDay.end_state.open_in_brl));
  const journal: string[] = [];
  const arrivals = replayDay.events.filter((event) => event.kind === 'ORDER_ARRIVED');
  for (const arrival of arrivals) journal.push(`Ordem ${arrival.order_id} chegou e entrou na fila aberta.`);
  if (closing !== null) {
    journal.push(`Fechamento acionado por ${closing.triggers.map((trigger) => triggerLabels[trigger]).join(' + ')}.`);
    if (!new Decimal(matchedContributionBrl).isZero()) {
      journal.push(`Casado no dia: ${formatMoney(matchedContributionBrl)} de contribuição das duas pontas; posição de tesouraria ${formatMoney(matchedPositionBrl)}.`);
      for (const segment of closing.flow_segments) {
        const phase = segment.matching_origin === 'INTRA_CLIENTE' ? 'autonetting intracliente' : 'netting multilateral';
        journal.push(`Decomposição ilustrativa agregada (${phase}): ${segment.out_order_id} ↔ ${segment.in_order_id}, ${formatMoney(segment.value_brl)} de posição.`);
      }
    }
    for (const event of replayDay.events) {
      if (event.kind !== 'ALLOCATION' || event.allocation_type !== 'REMETIDO') continue;
      const destination = event.direction === 'OUT' ? 'Exterior' : 'Brasil';
      journal.push(`Ordem ${event.order_id} remetida ${event.direction} — remessa ${event.direction} de ${formatMoney(event.value_brl)} atravessou a fronteira para o ${destination}.`);
    }
  }
  if (journal.length === 0) journal.push('Dia sem chegada, fechamento, casamento ou remessa. Saldos permanecem inalterados.');
  return Object.freeze({
    day,
    hasOperationalEvent: replayDay.events.length > 0 || closing !== null,
    matchedPositionBrl,
    matchedContributionBrl,
    remittedOutBrl,
    remittedInBrl,
    openOutBrl: replayDay.end_state.open_out_brl,
    openInBrl: replayDay.end_state.open_in_brl,
    openBrl,
    explanation: 'Casado é a contribuição medida das duas pontas (OUT + IN); a posição de tesouraria é metade desse volume.',
    journal: Object.freeze(journal),
  });
}

export function presentReplayHistory(document: ReplayDocument, selectedDay: number): readonly ReplayJournalDay[] {
  if (selectedDay < 0 || selectedDay > document.period.settlement_end_day) {
    throw new RangeError(`Dia ${selectedDay} fora do Replay.`);
  }
  const history: ReplayJournalDay[] = [];
  for (let day = 0; day <= selectedDay; day += 1) {
    const view = presentReplayDay(document, day);
    if (!view.hasOperationalEvent) continue;
    history.push(Object.freeze({ day, entries: view.journal }));
  }
  return Object.freeze(history);
}

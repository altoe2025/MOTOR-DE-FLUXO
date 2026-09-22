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
  if (arrivals.length > 0) journal.push(`${arrivals.length} ${arrivals.length === 1 ? 'ordem chegou e entrou' : 'ordens chegaram e entraram'} na fila aberta.`);
  if (closing !== null) {
    journal.push(`Fechamento acionado por ${closing.triggers.map((trigger) => triggerLabels[trigger]).join(' + ')}.`);
    if (!new Decimal(matchedContributionBrl).isZero()) {
      journal.push(`Casado no dia: ${formatMoney(matchedContributionBrl)} de contribuição das duas pontas; posição de tesouraria ${formatMoney(matchedPositionBrl)}.`);
      for (const segment of closing.flow_segments) {
        const phase = segment.matching_origin === 'INTRA_CLIENTE' ? 'autonetting intracliente' : 'netting multilateral';
        journal.push(`Decomposição ilustrativa agregada (${phase}): ${segment.out_order_id} ↔ ${segment.in_order_id}, ${formatMoney(segment.value_brl)} de posição.`);
      }
    }
    if (!new Decimal(remittedOutBrl).isZero()) journal.push(`Remessa OUT no dia: ${formatMoney(remittedOutBrl)} atravessou a fronteira para o Exterior.`);
    if (!new Decimal(remittedInBrl).isZero()) journal.push(`Remessa IN no dia: ${formatMoney(remittedInBrl)} atravessou a fronteira para o Brasil.`);
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

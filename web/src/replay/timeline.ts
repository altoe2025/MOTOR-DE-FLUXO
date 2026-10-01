/** Passos possíveis entre rótulos da régua, em dias. */
export const TIMELINE_LABEL_STEPS = [1, 2, 5, 7, 10, 14, 30, 60, 90] as const;
export const TIMELINE_MIN_LABEL_SPACING_PX = 42;
/** Largura assumida quando a régua ainda não foi medida (antes do layout). */
export const TIMELINE_FALLBACK_WIDTH_PX = 640;

const LABEL_CHAR_PX = 6.8;
const LABEL_PADDING_PX = 16;
const LABEL_CLEARANCE_PX = 16;

/** Menor passo cujo espaçamento entre rótulos chega a 42 px. */
export function timelineLabelStep(dayCount: number, widthPx: number): number {
  const dayWidth = widthPx / Math.max(1, dayCount);
  return TIMELINE_LABEL_STEPS.find((step) => dayWidth * step >= TIMELINE_MIN_LABEL_SPACING_PX) ?? 90;
}

/** Centro do dia na régua, em px. */
export function timelineDayX(day: number, dayCount: number, widthPx: number): number {
  return ((day + 0.5) / Math.max(1, dayCount)) * widthPx;
}

/** Rótulos que cabem e a etiqueta do dia atual, presa às bordas e sem encostar em rótulo nenhum. */
export function timelineLabels({ dayCount, current, widthPx, nowText }: Readonly<{
  dayCount: number;
  current: number;
  widthPx: number;
  nowText: string;
}>): { days: number[]; now: { text: string; leftPx: number } } {
  const width = widthPx > 0 ? widthPx : TIMELINE_FALLBACK_WIDTH_PX;
  const step = timelineLabelStep(dayCount, width);
  const half = (nowText.length * LABEL_CHAR_PX + LABEL_PADDING_PX) / 2;
  const leftPx = Math.min(width - half, Math.max(half, timelineDayX(current, dayCount, width)));
  const lastX = timelineDayX(dayCount - 1, dayCount, width);
  const days: number[] = [];
  for (let day = 0; day < dayCount; day++) {
    const isLast = day === dayCount - 1;
    if (day % step !== 0 && !isLast) continue;
    // O último dia sempre aparece; um rótulo do passo colado nele sai.
    if (!isLast && lastX - timelineDayX(day, dayCount, width) < TIMELINE_MIN_LABEL_SPACING_PX) continue;
    if (Math.abs(timelineDayX(day, dayCount, width) - leftPx) <= half + LABEL_CLEARANCE_PX) continue;
    days.push(day);
  }
  return { days, now: { text: nowText, leftPx } };
}

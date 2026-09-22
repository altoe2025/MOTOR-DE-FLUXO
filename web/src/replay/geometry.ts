export type Box = Readonly<{ left: number; top: number; width: number; height: number }>;
export type Point = Readonly<{ x: number; y: number }>;
export type AnchoredCurve = Readonly<{ start: Point; end: Point; path: string }>;

function relativePoint(stage: Box, x: number, y: number): Point {
  return { x: Math.round(x - stage.left), y: Math.round(y - stage.top) };
}

function horizontalCurve(start: Point, end: Point): string {
  const control = Math.round(Math.abs(end.x - start.x) * 0.4);
  const first = start.x <= end.x ? start.x + control : start.x - control;
  const second = start.x <= end.x ? end.x - control : end.x + control;
  return `M ${start.x} ${start.y} C ${first} ${start.y}, ${second} ${end.y}, ${end.x} ${end.y}`;
}

export function anchoredCurve(stage: Box, outCard: Box, inCard: Box): AnchoredCurve {
  const start = relativePoint(stage, outCard.left + outCard.width, outCard.top + outCard.height / 2);
  const end = relativePoint(stage, inCard.left, inCard.top + inCard.height / 2);
  return { start, end, path: horizontalCurve(start, end) };
}

export function remittanceCurve(stage: Box, card: Box, direction: 'OUT' | 'IN'): AnchoredCurve {
  const start = direction === 'OUT'
    ? relativePoint(stage, card.left + card.width, card.top + card.height / 2)
    : relativePoint(stage, card.left, card.top + card.height / 2);
  const end = { x: direction === 'OUT' ? Math.round(stage.width - 24) : 24, y: start.y };
  return { start, end, path: horizontalCurve(start, end) };
}

import type { Box, Point } from './geometry';

/** Destino das remessas: o portão de câmbio desenhado no pé da CNR. */
export const GATEWAY = 'GATEWAY';

export type RouteFlow = Readonly<{ id: string; from: string; to: string }>;
export type RouteScene = Readonly<{
  stage: Box;
  channel: Box;
  gateway: Box | null;
  cards: ReadonlyMap<string, Box>;
  flows: readonly RouteFlow[];
}>;
export type RouteStyle = 'STRAIGHT' | 'CURVE' | 'ORTHOGONAL';
export type RoutedFlow = Readonly<{
  id: string;
  style: RouteStyle;
  start: Point;
  end: Point;
  toGateway: boolean;
  /** Polilinha do traçado (amostrada nas curvas), usada para detectar choques e ancorar rótulos. */
  points: readonly Point[];
  path: string;
}>;

type Ends = Readonly<{ start: Point; end: Point; toGateway: boolean }>;
type Draft = Readonly<{ style: RouteStyle; points: readonly Point[]; path: string }>;

const round = (value: number) => Math.round(value * 10) / 10;
const PORT_SPREAD = 18;
const TRACK_STEP = 36;
const GATEWAY_STEP = 44;
const CORNER = 7;
/** Afasta as portas de saída e de chegada nos trilhos, para dois trilhos nunca correrem sobre a mesma linha. */
const TRACK_PORT_NUDGE = 5;

export function routeFlows(scene: RouteScene): readonly RoutedFlow[] {
  const { stage, channel, gateway, cards, flows } = scene;
  const rel = (box: Box): Box => ({ left: box.left - stage.left, top: box.top - stage.top, width: box.width, height: box.height });
  const lane = { left: channel.left - stage.left, right: channel.left - stage.left + channel.width };
  const center = (lane.left + lane.right) / 2;
  const relCards = new Map([...cards].map(([id, box]) => [id, rel(box)]));
  const valid = flows.filter((flow) => relCards.has(flow.from) && (flow.to === GATEWAY || relCards.has(flow.to)));

  const gate = gateway === null ? null : rel(gateway);
  const gateY = gate === null ? stage.height - 24 : gate.top;
  const gateCenter = gate === null ? center : gate.left + gate.width / 2;
  const remits = valid.filter((flow) => flow.to === GATEWAY);
  const gateX = (flow: RouteFlow) => {
    const offset = (remits.indexOf(flow) - (remits.length - 1) / 2) * GATEWAY_STEP;
    const x = gateCenter + offset;
    return Math.round(gate === null ? x : Math.min(gate.left + gate.width - 8, Math.max(gate.left + 8, x)));
  };
  const middleY = (id: string) => { const box = relCards.get(id)!; return box.top + box.height / 2; };
  const otherY = (flow: RouteFlow, id: string) => {
    const other = flow.from === id ? flow.to : flow.from;
    return other === GATEWAY ? gateY : middleY(other);
  };

  // Portas: cada seta ganha um ponto próprio na borda, ordenado pela altura da outra ponta.
  const ports = new Map<string, number>();
  const byCard = new Map<string, RouteFlow[]>();
  for (const flow of valid) for (const id of [flow.from, flow.to]) {
    if (id === GATEWAY) continue;
    byCard.set(id, [...(byCard.get(id) ?? []), flow]);
  }
  for (const [id, list] of byCard) {
    const box = relCards.get(id)!;
    const sorted = [...list].sort((a, b) => otherY(a, id) - otherY(b, id));
    const spread = sorted.length < 2 ? 0 : Math.min(PORT_SPREAD, (box.height - 28) / (sorted.length - 1));
    sorted.forEach((flow, index) => ports.set(`${flow.id}|${id}`, Math.round(middleY(id) + (index - (sorted.length - 1) / 2) * spread)));
  }
  const edgeX = (id: string) => { const box = relCards.get(id)!; return box.left + box.width / 2 < center ? box.left + box.width : box.left; };
  const ends: Ends[] = valid.map((flow) => {
    const start = { x: Math.round(edgeX(flow.from)), y: ports.get(`${flow.id}|${flow.from}`)! };
    if (flow.to === GATEWAY) return { start, end: { x: gateX(flow), y: Math.round(gateY) }, toGateway: true };
    return { start, end: { x: Math.round(edgeX(flow.to)), y: ports.get(`${flow.id}|${flow.to}`)! }, toGateway: false };
  });

  // 1º o traçado mais simples; só quem se choca vai para trilhos em ângulo reto dentro da CNR.
  const simple = ends.map(simpleRoute);
  const conflict = new Set<number>();
  for (let a = 0; a < simple.length; a++) for (let b = a + 1; b < simple.length; b++) {
    if (crossings(simple[a]!.points, simple[b]!.points) > 0) { conflict.add(a); conflict.add(b); }
  }
  let routed = new Map<number, Draft>();
  for (let guard = 0; guard <= simple.length && conflict.size > 0; guard++) {
    routed = orthogonal([...conflict], ends, simple, center, lane);
    let grew = false;
    // Percorre uma cópia: quem entra agora só ganha trilho na próxima rodada.
    for (const index of [...conflict]) for (let other = 0; other < simple.length; other++) {
      if (!conflict.has(other) && crossings(routed.get(index)!.points, simple[other]!.points) > 0) { conflict.add(other); grew = true; }
    }
    if (!grew) break;
  }
  return valid.map((flow, index) => {
    const draft = conflict.has(index) ? routed.get(index)! : simple[index]!;
    return {
      id: flow.id, style: draft.style, points: draft.points, path: draft.path, toGateway: ends[index]!.toGateway,
      start: draft.points[0]!, end: draft.points[draft.points.length - 1]!,
    };
  });
}

function simpleRoute({ start, end, toGateway }: Ends): Draft {
  if (toGateway) {
    const bend = { x: end.x, y: start.y };
    return curve([start, bend, bend, end]);
  }
  if (Math.abs(start.y - end.y) < 3) {
    const flat = { x: end.x, y: start.y };
    return { style: 'STRAIGHT', points: [start, flat], path: `M ${start.x} ${start.y} L ${flat.x} ${flat.y}` };
  }
  const pull = (end.x - start.x) * 0.5;
  return curve([start, { x: round(start.x + pull), y: start.y }, { x: round(end.x - pull), y: end.y }, end]);
}

function curve(control: readonly [Point, Point, Point, Point]): Draft {
  const [p0, p1, p2, p3] = control;
  const points: Point[] = [];
  for (let step = 0; step <= 28; step++) {
    const u = step / 28, v = 1 - u;
    const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    points.push({ x: round(a * p0.x + b * p1.x + c * p2.x + d * p3.x), y: round(a * p0.y + b * p1.y + c * p2.y + d * p3.y) });
  }
  points[0] = p0;
  points[points.length - 1] = p3;
  return { style: 'CURVE', points, path: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}` };
}

function orthogonal(
  list: readonly number[], ends: readonly Ends[], simple: readonly Draft[], center: number, lane: Readonly<{ left: number; right: number }>,
): Map<number, Draft> {
  const step = Math.min(TRACK_STEP, Math.max(8, (lane.right - lane.left - 80) / Math.max(1, list.length)));
  const tracks = list.map((_, slot) => Math.round(center + (slot - (list.length - 1) / 2) * step));
  const polyline = (index: number, x: number): Point[] => {
    const { start, end, toGateway } = ends[index]!;
    if (toGateway) return simplify([start, { x, y: start.y }, { x, y: end.y }]);
    const from = { x: start.x, y: start.y - TRACK_PORT_NUDGE };
    const to = { x: end.x, y: end.y + TRACK_PORT_NUDGE };
    return simplify([from, { x, y: from.y }, { x, y: to.y }, to]);
  };
  const others = simple.filter((_, index) => !list.includes(index)).map((draft) => draft.points);
  let best: Point[][] = [];
  let bestScore = Infinity;
  for (const order of list.length <= 6 ? permutations(list.map((_, slot) => slot)) : [list.map((_, slot) => slot)]) {
    const lines = order.map((slot, position) => polyline(list[position]!, tracks[slot]!));
    let score = 0;
    lines.forEach((line, a) => {
      for (let b = a + 1; b < lines.length; b++) score += crossings(line, lines[b]!) * 1000 + overlaps(line, lines[b]!) * 5000;
      for (const other of others) score += crossings(line, other) * 1000;
      score += Math.abs((line[1] ?? line[0]!).x - center) * 0.01;
    });
    if (score < bestScore) { bestScore = score; best = lines; }
  }
  return new Map(list.map((index, position) => [index, { style: 'ORTHOGONAL', points: best[position]!, path: rounded(best[position]!) }]));
}

function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last === undefined || last.x !== point.x || last.y !== point.y) out.push(point);
  }
  for (let index = out.length - 2; index > 0; index--) {
    const a = out[index - 1]!, b = out[index]!, c = out[index + 1]!;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(index, 1);
  }
  return out;
}

function rounded(points: readonly Point[]): string {
  const first = points[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!, corner = points[index]!, next = points[index + 1]!;
    const into = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const out = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(CORNER, into / 2, out / 2);
    const a = { x: round(corner.x - (corner.x - previous.x) / into * radius), y: round(corner.y - (corner.y - previous.y) / into * radius) };
    const b = { x: round(corner.x + (next.x - corner.x) / out * radius), y: round(corner.y + (next.y - corner.y) / out * radius) };
    path += ` L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  return `${path} L ${last.x} ${last.y}`;
}

function crossings(a: readonly Point[], b: readonly Point[]): number {
  const turn = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  let count = 0;
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) {
    const p1 = a[i]!, p2 = a[i + 1]!, q1 = b[j]!, q2 = b[j + 1]!;
    const d1 = turn(p1, p2, q1), d2 = turn(p1, p2, q2), d3 = turn(q1, q2, p1), d4 = turn(q1, q2, p2);
    // Toque num ponto também conta; trechos colineares ficam com overlaps().
    if (d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0)) count++;
  }
  return count;
}

/** Trechos horizontais de duas setas correndo sobre a mesma linha. */
function overlaps(a: readonly Point[], b: readonly Point[]): number {
  let count = 0;
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) {
    const p1 = a[i]!, p2 = a[i + 1]!, q1 = b[j]!, q2 = b[j + 1]!;
    if (p1.y !== p2.y || q1.y !== q2.y || Math.abs(p1.y - q1.y) >= 4) continue;
    const shared = Math.min(Math.max(p1.x, p2.x), Math.max(q1.x, q2.x)) - Math.max(Math.min(p1.x, p2.x), Math.min(q1.x, q2.x));
    if (shared > 0) count++;
  }
  return count;
}

function permutations(items: readonly number[]): number[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

/** Onde o rótulo de valor encosta na seta: no trecho reto mais longo, longe dos cartões. */
export function labelAnchor(flow: RoutedFlow, width: number): Point {
  const half = width / 2 + 6;
  if (flow.toGateway) return { x: flow.end.x, y: flow.end.y - 30 };
  if (flow.style === 'ORTHOGONAL') {
    const flats = flow.points.slice(1).map((point, index) => [flow.points[index]!, point] as const).filter(([a, b]) => a.y === b.y);
    if (flats.length === 0) return { x: flow.start.x, y: Math.round((flow.start.y + flow.end.y) / 2) };
    const [a, b] = flats.reduce((best, item) => Math.abs(item[1].x - item[0].x) > Math.abs(best[1].x - best[0].x) ? item : best);
    const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
    const x = high - low < 2 * half ? (low + high) / 2 : Math.min(high - half, Math.max(low + half, (low + high) / 2));
    return { x: Math.round(x), y: a.y };
  }
  const x = Math.max(flow.start.x + half, flow.end.x - half - 8);
  const nearest = flow.points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best);
  return { x: Math.round(x), y: Math.round(nearest.y) };
}

export type LabelBox = Readonly<{ id: string; x: number; y: number; width: number }>;
const LABEL_GAP = 24;

/** Empurra na vertical os rótulos que se sobreporiam; os livres ficam onde estão. */
export function placeLabels(labels: readonly LabelBox[]): readonly LabelBox[] {
  const placed = labels.map((label) => ({ ...label }));
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      const first = placed[a]!, second = placed[b]!;
      const overlapX = (first.width + second.width) / 2 + 4 - Math.abs(first.x - second.x);
      const overlapY = LABEL_GAP - Math.abs(first.y - second.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const direction = first.y <= second.y ? -1 : 1;
      first.y = round(first.y + direction * overlapY / 2);
      second.y = round(second.y - direction * overlapY / 2);
      moved = true;
    }
    if (!moved) break;
  }
  return placed;
}

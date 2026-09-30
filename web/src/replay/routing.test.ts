import { describe, expect, it } from 'vitest';

import type { Box, Point } from './geometry';
import { GATEWAY, labelAnchor, placeLabels, routeFlows, type RouteScene } from './routing';

const stage: Box = { left: 0, top: 0, width: 1000, height: 600 };
const channel: Box = { left: 400, top: 0, width: 200, height: 600 };
const gateway: Box = { left: 450, top: 540, width: 100, height: 30 };
const outCard = (top: number): Box => ({ left: 100, top, width: 280, height: 90 });
const inCard = (top: number): Box => ({ left: 620, top, width: 280, height: 90 });

function scene(cards: Record<string, Box>, flows: RouteScene['flows']): RouteScene {
  return { stage, channel, gateway, cards: new Map(Object.entries(cards)), flows };
}

function axisAligned(points: readonly Point[]): boolean {
  return points.slice(1).every((point, index) => point.x === points[index]!.x || point.y === points[index]!.y);
}

describe('roteamento das setas do Replay', () => {
  it('liga cartões na mesma altura com uma reta', () => {
    const [flow] = routeFlows(scene({ 'out-a': outCard(100), 'in-a': inCard(100) }, [{ id: 'f1', from: 'out-a', to: 'in-a' }]));

    expect(flow).toMatchObject({ id: 'f1', style: 'STRAIGHT', start: { x: 380, y: 145 }, end: { x: 620, y: 145 }, path: 'M 380 145 L 620 145' });
  });

  it('usa uma única curva suave quando não há choque', () => {
    const [flow] = routeFlows(scene({ 'out-a': outCard(100), 'in-b': inCard(300) }, [{ id: 'f1', from: 'out-a', to: 'in-b' }]));

    expect(flow!.style).toBe('CURVE');
    expect(flow!.path.match(/ C /g)).toHaveLength(1);
    expect(flow!.start).toEqual({ x: 380, y: 145 });
    expect(flow!.end).toEqual({ x: 620, y: 345 });
  });

  it('só manda para trilhos em ângulo reto as setas que se chocariam', () => {
    const flows = routeFlows(scene(
      { 'out-a': outCard(100), 'out-b': outCard(300), 'out-c': outCard(450), 'in-a': inCard(100), 'in-b': inCard(300), 'in-c': inCard(450) },
      [{ id: 'cross-1', from: 'out-a', to: 'in-b' }, { id: 'cross-2', from: 'out-b', to: 'in-a' }, { id: 'calm', from: 'out-c', to: 'in-c' }],
    ));
    const byId = new Map(flows.map((flow) => [flow.id, flow]));

    expect(byId.get('calm')!.style).toBe('STRAIGHT');
    for (const id of ['cross-1', 'cross-2']) {
      const flow = byId.get(id)!;
      expect(flow.style).toBe('ORTHOGONAL');
      expect(axisAligned(flow.points)).toBe(true);
      expect(flow.path).not.toContain(' C ');
    }
    const trackX = (id: string) => byId.get(id)!.points[1]!.x;
    expect(trackX('cross-1')).not.toBe(trackX('cross-2'));
    for (const id of ['cross-1', 'cross-2']) expect(trackX(id)).toBeGreaterThan(400);
    for (const id of ['cross-1', 'cross-2']) expect(trackX(id)).toBeLessThan(600);
  });

  it('dá a cada seta uma porta própria no cartão, ordenada pela altura do destino', () => {
    const flows = routeFlows(scene(
      { 'out-a': outCard(100), 'in-a': inCard(20), 'in-b': inCard(300) },
      [{ id: 'low', from: 'out-a', to: 'in-b' }, { id: 'high', from: 'out-a', to: 'in-a' }],
    ));
    const byId = new Map(flows.map((flow) => [flow.id, flow]));

    expect(byId.get('high')!.start.y).toBeLessThan(byId.get('low')!.start.y);
    expect(flows.every((flow) => flow.style !== 'ORTHOGONAL')).toBe(true);
  });

  it('leva as remessas até o portão de câmbio da CNR, cada uma no seu ponto', () => {
    const flows = routeFlows(scene(
      { 'out-a': outCard(100), 'in-b': inCard(300) },
      [{ id: 'r-out', from: 'out-a', to: GATEWAY }, { id: 'r-in', from: 'in-b', to: GATEWAY }],
    ));

    for (const flow of flows) {
      expect(flow.end.y).toBe(540);
      expect(flow.end.x).toBeGreaterThanOrEqual(450);
      expect(flow.end.x).toBeLessThanOrEqual(550);
    }
    expect(flows[0]!.start).toEqual({ x: 380, y: 145 });
    expect(flows[1]!.start).toEqual({ x: 620, y: 345 });
    expect(flows[0]!.end.x).not.toBe(flows[1]!.end.x);
  });
});

describe('roteamento em cenas aleatórias', () => {
  function random(seed: number) {
    let state = seed;
    return () => { state = (state * 1_103_515_245 + 12_345) % 2_147_483_648; return state / 2_147_483_648; };
  }

  it('nunca quebra e devolve toda seta, inclusive quando o choque se propaga para setas simples', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const next = random(seed);
      const rows = (count: number) => Array.from({ length: count }, (_, row) => 20 + row * 102);
      const outs = rows(1 + Math.floor(next() * 5)), ins = rows(1 + Math.floor(next() * 5));
      const cards: Record<string, Box> = {};
      outs.forEach((top, index) => { cards[`out-${index}`] = outCard(top); });
      ins.forEach((top, index) => { cards[`in-${index}`] = inCard(top); });
      const flows = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, index) => {
        const from = next() < 0.8 ? `out-${Math.floor(next() * outs.length)}` : `in-${Math.floor(next() * ins.length)}`;
        const to = from.startsWith('in') || next() < 0.15 ? GATEWAY : `in-${Math.floor(next() * ins.length)}`;
        return { id: `f${index}`, from, to };
      });
      const routed = routeFlows(scene(cards, flows));
      expect(routed.map((flow) => flow.id), `semente ${seed}`).toEqual(flows.map((flow) => flow.id));
      for (const flow of routed) expect(flow.path, `semente ${seed}`).not.toContain('NaN');
    }
  });

  it('também não quebra quando tudo mede zero (layout ainda não calculado)', () => {
    const zero: Box = { left: 0, top: 0, width: 0, height: 0 };
    const cards = new Map(['o1', 'o2', 'o3', 'i1', 'i2'].map((id) => [id, zero]));
    const flows = [{ id: 'a', from: 'o1', to: 'i1' }, { id: 'b', from: 'o2', to: 'i2' }, { id: 'c', from: 'o3', to: 'i1' }, { id: 'd', from: 'i2', to: GATEWAY }];
    const routed = routeFlows({ stage: zero, channel: zero, gateway: zero, cards, flows });
    expect(routed).toHaveLength(4);
    for (const flow of routed) expect(Number.isFinite(labelAnchor(flow, 80).x)).toBe(true);
  });
});

describe('rótulos das setas', () => {
  it('põe o rótulo no trecho horizontal mais longo do trilho, sem invadir o cartão de destino', () => {
    const flows = routeFlows(scene(
      { 'out-a': outCard(100), 'out-b': outCard(300), 'in-a': inCard(100), 'in-b': inCard(300) },
      [{ id: 'cross-1', from: 'out-a', to: 'in-b' }, { id: 'cross-2', from: 'out-b', to: 'in-a' }],
    ));
    for (const flow of flows) {
      const label = labelAnchor(flow, 90);
      expect(label.x - 45).toBeGreaterThanOrEqual(380);
      expect(label.x + 45).toBeLessThanOrEqual(620);
      const segment = flow.points.slice(1).map((point, index) => [flow.points[index]!, point] as const)
        .find(([a, b]) => a.y === b.y && a.y === label.y && label.x >= Math.min(a.x, b.x) && label.x <= Math.max(a.x, b.x));
      expect(segment).toBeDefined();
    }
  });

  it('ancora o rótulo mesmo num trilho sem trecho horizontal', () => {
    const vertical = { id: 'v', style: 'ORTHOGONAL' as const, toGateway: false, start: { x: 10, y: 0 }, end: { x: 10, y: 90 },
      points: [{ x: 10, y: 0 }, { x: 10, y: 90 }], path: 'M 10 0 L 10 90' };
    expect(labelAnchor(vertical, 80)).toEqual({ x: 10, y: 45 });
  });

  it('põe o rótulo da remessa logo acima do portão de câmbio', () => {
    const [flow] = routeFlows(scene({ 'out-a': outCard(100) }, [{ id: 'r', from: 'out-a', to: GATEWAY }]));
    expect(labelAnchor(flow!, 90)).toEqual({ x: flow!.end.x, y: 510 });
  });

  it('afasta rótulos que colidiriam, sem mexer nos que já estão livres', () => {
    const placed = placeLabels([
      { id: 'a', x: 500, y: 200, width: 80 },
      { id: 'b', x: 510, y: 205, width: 80 },
      { id: 'c', x: 500, y: 400, width: 80 },
    ]);
    const byId = new Map(placed.map((label) => [label.id, label]));

    expect(Math.abs(byId.get('a')!.y - byId.get('b')!.y)).toBeGreaterThanOrEqual(24);
    expect(byId.get('c')!.y).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';

import { anchoredCurve, remittanceCurve, type Box } from './geometry';

const stage: Box = { left: 100, top: 40, width: 900, height: 500 };

describe('geometria ancorada do Replay', () => {
  it('liga as bordas dos cartões no mesmo sistema de coordenadas do palco', () => {
    const out: Box = { left: 150, top: 140, width: 180, height: 80 };
    const incoming: Box = { left: 760, top: 260, width: 180, height: 80 };

    expect(anchoredCurve(stage, out, incoming)).toEqual({
      start: { x: 230, y: 140 }, end: { x: 660, y: 260 },
      path: 'M 230 140 C 402 140, 488 260, 660 260',
    });
  });

  it('orienta remessa OUT ao exterior e IN ao Brasil', () => {
    const out: Box = { left: 150, top: 140, width: 180, height: 80 };
    const incoming: Box = { left: 760, top: 260, width: 180, height: 80 };

    expect(remittanceCurve(stage, out, 'OUT').end.x).toBe(876);
    expect(remittanceCurve(stage, incoming, 'IN').end.x).toBe(24);
  });
});

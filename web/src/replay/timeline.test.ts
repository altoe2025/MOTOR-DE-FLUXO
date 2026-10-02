import { describe, expect, it } from 'vitest';

import { timelineDayX, timelineLabels, timelineLabelStep } from './timeline';

describe('rótulos da linha do tempo do Replay', () => {
  it('escolhe o menor passo que deixa ao menos 42 px entre rótulos', () => {
    expect(timelineLabelStep(7, 640)).toBe(1);
    expect(timelineLabelStep(36, 640)).toBe(5);
    expect(timelineLabelStep(366, 900)).toBe(30);
  });

  it('posiciona cada dia pelo centro do seu trecho', () => {
    expect(timelineDayX(0, 4, 400)).toBe(50);
    expect(timelineDayX(3, 4, 400)).toBe(350);
  });

  it('em 36 dias rotula de 5 em 5 e some com o rótulo que encostaria no dia atual', () => {
    const labels = timelineLabels({ dayCount: 36, current: 14, widthPx: 640, nowText: 'D14 · 09/01' });
    expect(labels.days).toEqual([0, 5, 10, 20, 25, 30, 35]);
    expect(labels.now.text).toBe('D14 · 09/01');
    expect(labels.now.leftPx).toBeCloseTo(257.8, 1);
  });

  it('sempre oferece o último dia como candidato', () => {
    expect(timelineLabels({ dayCount: 38, current: 0, widthPx: 640, nowText: 'D0' }).days.at(-1)).toBe(37);
  });

  it('não deixa o rótulo do passo encostar no do último dia', () => {
    const labels = timelineLabels({ dayCount: 37, current: 0, widthPx: 640, nowText: 'D0' }).days;
    expect(labels.at(-1)).toBe(36);
    expect(labels).not.toContain(35);
  });

  it('prende a etiqueta do dia atual às bordas', () => {
    const half = ('D0 · 26/12'.length * 6.8 + 16) / 2;
    expect(timelineLabels({ dayCount: 36, current: 0, widthPx: 640, nowText: 'D0 · 26/12' }).now.leftPx).toBeCloseTo(half, 5);
    const end = timelineLabels({ dayCount: 36, current: 35, widthPx: 640, nowText: 'D35 · 30/01' });
    expect(end.now.leftPx).toBeCloseTo(640 - ('D35 · 30/01'.length * 6.8 + 16) / 2, 5);
  });

  it('sem largura medida (antes do layout) usa 640 px', () => {
    expect(timelineLabels({ dayCount: 3, current: 1, widthPx: 0, nowText: 'D1' })).toEqual({ days: [0, 2], now: { text: 'D1', leftPx: 320 } });
  });
});

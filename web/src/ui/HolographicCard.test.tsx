// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HolographicCard } from './HolographicCard';

function renderCard() {
  render(<ul><HolographicCard className="company-list__item"><a href="/empresas/a">Empresa A</a></HolographicCard></ul>);
  const card = screen.getByRole('listitem');
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150, x: 100, y: 50, toJSON: () => ({}) });
  return card;
}

describe('HolographicCard', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('mantém o conteúdo acessível e esconde as camadas decorativas', () => {
    const card = renderCard();
    expect(card).toHaveClass('holo-card', 'company-list__item');
    expect(screen.getByRole('link', { name: 'Empresa A' })).toBeInTheDocument();
    card.querySelectorAll('.holo-card__glow, .holo-card__rings').forEach((layer) => expect(layer).toHaveAttribute('aria-hidden', 'true'));
  });

  it('segue o cursor e inclina o cartão na direção dele', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const card = renderCard();
    fireEvent.pointerMove(card, { clientX: 250, clientY: 75 });
    expect(card.style.getPropertyValue('--holo-x')).toBe('75%');
    expect(card.style.getPropertyValue('--holo-y')).toBe('25%');
    expect(card.style.getPropertyValue('--holo-on')).toBe('1');
    expect(card).toHaveClass('holo-card--tilt');
    expect(card.style.getPropertyValue('--holo-ry')).toBe('4deg');
    expect(card.style.getPropertyValue('--holo-rx')).toBe('4deg');
  });

  it('volta ao repouso quando o cursor sai', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const card = renderCard();
    fireEvent.pointerMove(card, { clientX: 250, clientY: 75 });
    fireEvent.pointerLeave(card);
    expect(card.style.getPropertyValue('--holo-on')).toBe('0');
    expect(card.style.getPropertyValue('--holo-rx')).toBe('0deg');
    expect(card.style.getPropertyValue('--holo-ry')).toBe('0deg');
  });

  it('não inclina quem pediu menos movimento, mas mantém os anéis no cursor', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const card = renderCard();
    fireEvent.pointerMove(card, { clientX: 250, clientY: 75 });
    expect(card.style.getPropertyValue('--holo-x')).toBe('75%');
    expect(card).not.toHaveClass('holo-card--tilt');
    expect(card.style.getPropertyValue('--holo-ry')).toBe('');
  });
});

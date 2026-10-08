import type { CSSProperties, PointerEvent, ReactNode, TransitionEvent } from 'react';

// Cartão com uma camada holográfica: anéis de contorno na família turquesa do app, centrados no cursor,
// e uma inclinação leve na direção dele. Só decoração: o conteúdo e a ordem de foco não mudam.
// Em repouso fica plano (sem transform), para capturas, PDF e axe verem um quadro estável.

const TILT_DEG = 16;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HolographicFilter() {
  return <svg className="holo-filter" width="0" height="0" aria-hidden="true" focusable="false">
    <filter id="holo-warp" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves={2} seed={7} />
      <feDisplacementMap in="SourceGraphic" scale={26} />
    </filter>
  </svg>;
}

export function HolographicCard({ children, className, seed = 0 }: Readonly<{ children: ReactNode; className?: string; seed?: number }>) {
  const spin = (seed * 55) % 360;
  const move = (event: PointerEvent<HTMLLIElement>) => {
    const card = event.currentTarget;
    const box = card.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const px = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const py = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    card.style.setProperty('--holo-x', `${Math.round(px * 100)}%`);
    card.style.setProperty('--holo-y', `${Math.round(py * 100)}%`);
    card.style.setProperty('--holo-spin', `${Math.round(spin + (px * 0.7 + py * 0.3) * 300)}deg`);
    card.style.setProperty('--holo-on', '1');
    if (prefersReducedMotion()) return;
    card.classList.add('holo-card--tilt');
    card.style.setProperty('--holo-ry', `${Math.round((px - 0.5) * TILT_DEG * 10) / 10}deg`);
    card.style.setProperty('--holo-rx', `${Math.round((0.5 - py) * TILT_DEG * 10) / 10}deg`);
    card.style.setProperty('--holo-dx', `${Math.round((px - 0.5) * 200) / 100}`);
    card.style.setProperty('--holo-dy', `${Math.round((py - 0.5) * 200) / 100}`);
  };
  const leave = (event: PointerEvent<HTMLLIElement>) => {
    const card = event.currentTarget;
    card.style.setProperty('--holo-on', '0');
    for (const name of ['--holo-rx', '--holo-ry']) card.style.setProperty(name, '0deg');
    for (const name of ['--holo-dx', '--holo-dy']) card.style.setProperty(name, '0');
  };
  // depois que a volta ao repouso termina, o cartão sai do modo 3D e o texto fica nítido de novo
  const settle = (event: TransitionEvent<HTMLLIElement>) => {
    const card = event.currentTarget;
    if (event.target === card && event.propertyName === 'transform' && card.style.getPropertyValue('--holo-on') !== '1') card.classList.remove('holo-card--tilt');
  };
  return <li className={`holo-card${className ? ` ${className}` : ''}`} style={{ '--holo-spin': `${spin}deg` } as CSSProperties}
    onPointerMove={move} onPointerLeave={leave} onTransitionEnd={settle}>
    <span className="holo-card__glow" aria-hidden="true" />
    <span className="holo-card__rings" aria-hidden="true" />
    {children}
  </li>;
}

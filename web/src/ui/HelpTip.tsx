import { useId, useState, type ReactNode } from 'react';

/** "?" com a explicação que antes ficava aberta como parágrafo na tela. */
export function HelpTip({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return <span className="help-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="help-tip__button" aria-label={`Ajuda: ${label}`} aria-expanded={open}
      aria-describedby={open ? tipId : undefined}
      onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>?</button>
    {open ? <span id={tipId} role="tooltip" className="help-tip__content">{children}</span> : null}
  </span>;
}

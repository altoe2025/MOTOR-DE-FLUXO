import { useState, type ReactNode } from 'react';

/** Painel recolhido: o rótulo fica à vista e o conteúdo só existe quando aberto. */
export function Disclosure({ id, label, hint, defaultOpen = false, className = '', children }: Readonly<{
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className={`disclosure ${className}`.trim()}>
    <button type="button" className="disclosure__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}>
      <span className="disclosure__label">{label}</span>
      {hint === undefined ? null : <span className="disclosure__hint">{hint}</span>}
    </button>
    {open ? <div id={id} className="disclosure__body">{children}</div> : null}
  </div>;
}

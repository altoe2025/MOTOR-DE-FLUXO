import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function DefinitionTooltip({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 100);
  }

  useEffect(() => cancelClose, []);

  return (
    <span
      className="definition-tooltip"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="definition-trigger"
        aria-label={`Definição de ${term}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        {term}
      </button>
      {open ? <span id={tooltipId} role="tooltip" className="tooltip-content" onMouseEnter={cancelClose}>{children}</span> : null}
    </span>
  );
}

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type ActionMenuItem = Readonly<{
  label: string;
  onSelect(): void;
  /** Nome acessível quando o texto visível não basta (ex.: "Renomear Carteira A"). */
  ariaLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  helpId?: string;
}> | 'separator';

/** Menu "⋯": ações secundárias de um item, fora da tela até alguém pedir. */
export function ActionMenu({ label, items, className = '' }: Readonly<{
  label: string;
  items: readonly ActionMenuItem[];
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (entries.length === 0) return;
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? entries.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
    entries[next]?.focus();
  };

  return <div ref={root} className={`action-menu ${className}`.trim()}>
    <button ref={trigger} type="button" className="action-menu__trigger" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} aria-label={`Mais ações: ${label}`} onClick={() => setOpen((current) => !current)}>
      <span aria-hidden="true">⋯</span>
    </button>
    {open ? <div ref={menu} id={menuId} role="menu" aria-label={label} className="action-menu__list" onKeyDown={onKeyDown}>
      {items.map((item, index) => item === 'separator'
        ? <hr key={`separator-${index}`} className="action-menu__separator" />
        : <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
          className={`action-menu__item${item.danger ? ' action-menu__item--danger' : ''}`}
          {...(item.ariaLabel === undefined ? {} : { 'aria-label': item.ariaLabel })}
          {...(item.helpId === undefined ? {} : { 'data-chat-help-id': item.helpId })}
          onClick={() => { close(true); item.onSelect(); }}>{item.label}</button>)}
    </div> : null}
  </div>;
}

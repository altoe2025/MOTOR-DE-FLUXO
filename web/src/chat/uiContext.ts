import type { ProductHelpCatalogV1 } from '../help/catalog';

export type UiControlState = Readonly<{ helpId: string; enabledCount: number; disabledCount: number }>;

/** Only catalog IDs and aggregate states leave the DOM, never user-authored text or values. */
export function captureUiControls(document: Document, catalog: ProductHelpCatalogV1): UiControlState[] {
  const items = catalog.items.filter((item) => item.elementKind === 'CONTROL');
  const known = new Set(items.map((item) => item.id));
  const result = new Map<string, UiControlState>();
  const root = document.querySelector('main');
  if (root === null) return [];
  for (const control of Array.from(root.querySelectorAll('button, input, select, textarea, [data-chat-help-id]')).slice(0, 1000)) {
    let visible = true;
    for (let node: Element | null = control; node !== null; node = node.parentElement) {
      const style = document.defaultView?.getComputedStyle(node);
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true'
        || style?.display === 'none' || style?.visibility === 'hidden') { visible = false; break; }
    }
    if (!visible) continue;
    const explicit = control.getAttribute('data-chat-help-id');
    // Accessible labels may contain user data: compare locally, never send them.
    const labels = 'labels' in control ? (control as HTMLInputElement).labels : null;
    const fieldLabel = Array.from(labels ?? []).map((node) => {
      const copy = node.cloneNode(true) as Element;
      copy.querySelectorAll('input, select, textarea, button').forEach((child) => child.remove());
      return copy.textContent ?? '';
    }).join(' ');
    const label = (control.getAttribute('aria-label') ?? (control.tagName === 'BUTTON'
      ? control.textContent : fieldLabel) ?? '').trim().replace(/\s+/g, ' ');
    const matches = items.filter((item) => item.label === label);
    const helpId = explicit !== null ? (known.has(explicit as typeof items[number]['id']) ? explicit : null)
      : matches.length === 1 ? matches[0]!.id : null;
    if (helpId === null) continue;
    const disabled = control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true';
    const old = result.get(helpId) ?? { helpId, enabledCount: 0, disabledCount: 0 };
    result.set(helpId, { helpId, enabledCount: old.enabledCount + Number(!disabled),
      disabledCount: old.disabledCount + Number(disabled) });
  }
  return [...result.values()].sort((a, b) => a.helpId.localeCompare(b.helpId)).slice(0, 200);
}

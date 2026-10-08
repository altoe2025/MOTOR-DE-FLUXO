// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { captureUiControls } from './uiContext';
import type { ProductHelpCatalogV1 } from '../help/catalog';

const catalog = { items: [
  { id: 'page.chat', label: 'Perguntar', elementKind: 'CONTROL' },
  { id: 'page.importacao', label: 'Ler planilha', elementKind: 'CONTROL' },
] } as unknown as ProductHelpCatalogV1;

afterEach(() => { document.body.replaceChildren(); });

it('sends only known control IDs and counts, never field values or arbitrary text', () => {
  document.body.innerHTML = `<main><button>Ler planilha</button><button disabled>Ler planilha</button>
    <input value="segredo"><button>Nome privado</button></main><button>Perguntar</button>`;
  expect(captureUiControls(document, catalog)).toEqual([
    { helpId: 'page.importacao', enabledCount: 1, disabledCount: 1 },
  ]);
});

it('ignores hidden controls and reads disabled fieldsets and explicit IDs with changing labels', () => {
  document.body.innerHTML = `<main><fieldset disabled><button data-chat-help-id="page.importacao">Lendo…</button></fieldset>
    <div style="display:none"><button>Perguntar</button></div><button hidden>Perguntar</button>
    <button data-chat-help-id="unknown">privado</button></main>`;
  expect(captureUiControls(document, catalog)).toEqual([
    { helpId: 'page.importacao', enabledCount: 0, disabledCount: 1 },
  ]);
});

it('does not guess a control when the catalog has ambiguous labels', () => {
  document.body.innerHTML = '<main><button>Perguntar</button></main>';
  expect(captureUiControls(document, { ...catalog, items: [catalog.items[0]!,
    { ...catalog.items[0]!, id: 'page.importacao' }] })).toEqual([]);
});

it('recognizes a field by its label but never publishes its input value', () => {
  document.body.innerHTML = '<main><label for="field">Ler planilha</label><input id="field" value="private"></main>';
  expect(captureUiControls(document, catalog)).toEqual([
    { helpId: 'page.importacao', enabledCount: 1, disabledCount: 0 },
  ]);
});

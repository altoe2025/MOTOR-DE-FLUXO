import { describe, expect, it } from 'vitest';

import productHelp from '../../../../servidor/catalogs/product_help.v1.json';
import { validateProductHelpCatalog } from '../../help/catalog';
import { citationDestination } from './ChatCitation';

const catalog = validateProductHelpCatalog({ ...productHelp, catalogVersion: 'a'.repeat(64) })!;
const route = { routeId: 'studies', helpId: null, studyId: null, scenarioId: null,
  diagnosticExecutionId: null, replayDay: null };

describe('citation navigation', () => {
  it('links only to implemented routes and leaves unresolved placeholders as text', () => {
    expect(citationDestination({ kind: 'HELP', id: 'page.importacao' }, null, catalog, null,
      route, '/estudos').href).toBe('/importar');
    expect(citationDestination({ kind: 'HELP', id: 'concept.replay' }, null, catalog, null,
      route, '/estudos').href).toBeNull();
    expect(citationDestination({ kind: 'HELP', id: 'page.apresentacao' }, null, catalog, null,
      { ...route, studyId: 'study-1' }, '/estudos').href).toBeNull();
    expect(citationDestination({ kind: 'HELP', id: 'missing' }, null, catalog, null,
      route, '/estudos').href).toBeNull();
  });
});

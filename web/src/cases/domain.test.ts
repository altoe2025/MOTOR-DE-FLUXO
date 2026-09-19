import { describe, expect, it } from 'vitest';

import type { ObservedCase, ObservedCaseDraft } from './domain';
import { validateObservedCase, validateObservedCaseDraft } from './validation';

const observedProvenance = {
  kind: 'OBSERVED',
  source: 'fixture.xlsx',
  version: 'layout-1',
  recordedAt: '2026-09-19T12:00:00Z',
} as const;

const validCase: ObservedCase = {
  schemaVersion: '2.0.0',
  id: 'case-1',
  ownerSub: 'user-1',
  companyId: 'company-1',
  status: 'CONFIRMED',
  revision: 1,
  window: {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    closingDate: '2026-08-31',
  },
  orders: [
    {
      id: 'order-out',
      clientId: 'client-1',
      direction: 'OUT',
      knownDate: '2026-08-04',
      deadlineDate: '2026-08-08',
      valueBrl: '1250.50',
      purposeCode: 'SERVICOS',
      efxStatus: 'NOT_COLLECTED',
      provenance: [observedProvenance],
    },
    {
      id: 'order-in',
      clientId: 'client-2',
      direction: 'IN',
      knownDate: '2026-08-05',
      deadlineDate: '2026-08-09',
      valueBrl: '250.50',
      purposeCode: 'SERVICOS',
      efxStatus: 'NOT_COLLECTED',
      provenance: [observedProvenance],
    },
  ],
  controlTotals: [
    {
      code: 'GROSS_OUT_BRL',
      valueBrl: '1250.50',
      provenance: observedProvenance,
    },
    {
      code: 'GROSS_IN_BRL',
      valueBrl: '250.50',
      provenance: observedProvenance,
    },
  ],
  sourceManifest: {
    adapterId: 'xlsx-canonical',
    adapterVersion: '1.0.0',
    sourceKind: 'XLSX',
    files: [
      {
        name: 'fixture.xlsx',
        sizeBytes: 1234,
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
  },
  normalization: {
    rulesetId: 'canonical-xlsx',
    rulesetVersion: '1.0.0',
    normalizedAt: '2026-09-19T12:00:00Z',
  },
  quality: {
    blockers: [],
    warnings: [{ code: 'OBSERVED_OUTCOME_MISSING', message: 'Resultado não informado.' }],
  },
  corrections: [],
  observedOutcome: null,
  confirmedAt: '2026-09-19T12:05:00Z',
};

describe('validateObservedCase', () => {
  it('accepts a structurally complete confirmed case', () => {
    expect(validateObservedCase(validCase)).toEqual({ ok: true, value: validCase });
  });

  it('rejects a draft at the confirmed-case boundary', () => {
    expect(validateObservedCase({ ...validCase, status: 'DRAFT', confirmedAt: null }).ok).toBe(false);
  });

  it('rejects a closing date outside the observed window', () => {
    const invalid = {
      ...validCase,
      window: { ...validCase.window, closingDate: '2026-09-01' },
    };

    expect(validateObservedCase(invalid)).toEqual({
      ok: false,
      issues: [
        {
          path: '/window/closingDate',
          code: 'INVALID_WINDOW',
          message: 'Fechamento deve estar dentro da janela observada.',
        },
      ],
    });
  });

  it('rejects duplicate observed order identifiers', () => {
    const invalid = {
      ...validCase,
      orders: [validCase.orders[0], { ...validCase.orders[1], id: 'order-out' }],
    };

    expect(validateObservedCase(invalid)).toEqual({
      ok: false,
      issues: [
        {
          path: '/orders/1/id',
          code: 'DUPLICATE_ORDER',
          message: 'Identificador de ordem repetido.',
        },
      ],
    });
  });

  it('rejects a control total that diverges from explicit orders', () => {
    const invalid = {
      ...validCase,
      controlTotals: [
        { ...validCase.controlTotals[0], valueBrl: '1250.51' },
        validCase.controlTotals[1],
      ],
    };

    expect(validateObservedCase(invalid)).toEqual({
      ok: false,
      issues: [
        {
          path: '/controlTotals/0/valueBrl',
          code: 'CONTROL_TOTAL_MISMATCH',
          message: 'Total de controle diverge das ordens observadas.',
        },
      ],
    });
  });

  it('rejects a divergent control total at the maximum order cardinality', () => {
    const orders = Array.from({ length: 1_000 }, (_, index) => ({
      ...validCase.orders[0],
      id: `order-${index}`,
      valueBrl: '999999999999.999999',
    }));
    const invalid = {
      ...validCase,
      orders,
      controlTotals: [
        { ...validCase.controlTotals[0], valueBrl: '999999999999999.9999' },
      ],
    };

    expect(validateObservedCase(invalid)).toEqual({
      ok: false,
      issues: [
        {
          path: '/controlTotals/0/valueBrl',
          code: 'CONTROL_TOTAL_MISMATCH',
          message: 'Total de controle diverge das ordens observadas.',
        },
      ],
    });
  });

  it('rejects a confirmed case that omits observedOutcome', () => {
    const invalid: Partial<ObservedCase> = { ...validCase };
    Reflect.deleteProperty(invalid, 'observedOutcome');

    expect(validateObservedCase(invalid).ok).toBe(false);
  });

  it('rejects a confirmed case with active quality blockers', () => {
    const invalid = {
      ...validCase,
      quality: {
        ...validCase.quality,
        blockers: [{ code: 'PURPOSE_MISSING', message: 'Finalidade pendente.' }],
      },
    };

    expect(validateObservedCase(invalid)).toEqual({
      ok: false,
      issues: [
        {
          path: '/quality/blockers',
          code: 'INVALID_STRUCTURE',
          message: 'Caso confirmado não pode conter blockers ativos.',
        },
      ],
    });
  });
});

describe('validateObservedCaseDraft', () => {
  it('accepts a revisable draft without an observed outcome', () => {
    const draft: ObservedCaseDraft = {
      ...validCase,
      status: 'DRAFT',
      confirmedAt: null,
      quality: {
        blockers: [{ code: 'PURPOSE_MISSING', message: 'Finalidade pendente.' }],
        warnings: [],
      },
    };
    Reflect.deleteProperty(draft, 'observedOutcome');

    expect(validateObservedCaseDraft(draft)).toEqual({ ok: true, value: draft });
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { calculateOperationalProfile } from '../calculateOperationalProfile';
import type { EvidenceValue, OperationalProfileVersion } from '../domain';
import { EvidenceValueView } from './ProfileCoverage';
import { ProfileBuilder } from './ProfileBuilder';
import { ProfileVersionList } from './ProfileVersionList';

const company: CompanyRecord = {
  id: 'company-1', ownerSub: 'owner-a', displayName: 'Empresa Exemplo', aliases: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', revision: 1,
};

function observedCase(input: {
  id: string;
  revision?: number;
  companyId?: string;
  start: string;
  end: string;
  sha?: string;
  monthOrderDate?: string;
}): ObservedCase {
  const revision = input.revision ?? 1;
  const value = input.id.endsWith('b') ? '200' : '100';
  return {
    schemaVersion: '2.0.0', id: input.id, ownerSub: 'owner-a',
    companyId: input.companyId ?? company.id, status: 'CONFIRMED', revision,
    window: { startDate: input.start, endDate: input.end, closingDate: input.end },
    orders: [{
      id: `order-${input.id}-${revision}`, clientId: 'client-1', direction: 'OUT',
      knownDate: input.monthOrderDate ?? input.start, deadlineDate: input.monthOrderDate ?? input.start,
      valueBrl: value, purposeCode: null, efxStatus: 'NOT_COLLECTED',
      provenance: [{ kind: 'NOT_COLLECTED', source: 'fixture', version: '1', recordedAt: '2026-09-20T12:00:00Z' }],
    }],
    controlTotals: [{
      code: 'GROSS_OUT_BRL', valueBrl: value,
      provenance: { kind: 'OBSERVED', source: 'fixture', version: '1', recordedAt: '2026-09-20T12:00:00Z' },
    }],
    sourceManifest: {
      adapterId: 'fixture', adapterVersion: '1', sourceKind: 'XLSX',
      files: [{ name: `${input.id}.xlsx`, sizeBytes: 10, sha256: input.sha ?? ({ a: 'b', b: 'c', c: 'd' }[input.id.at(-1) ?? ''] ?? 'e').repeat(64) }],
    },
    normalization: { rulesetId: 'fixture', rulesetVersion: '1', normalizedAt: '2026-09-20T12:00:00Z' },
    quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null,
    confirmedAt: '2026-09-20T12:00:00Z',
  };
}

describe('ProfileBuilder', () => {
  it('expõe seleção vazia e cada caso com ID e revisão', () => {
    render(<ProfileBuilder company={company} cases={[observedCase({ id: 'case-a', revision: 7, start: '2026-01-01', end: '2026-01-31' })]} versions={[]} onConfirm={vi.fn()} idFactory={() => 'profile-1'} now={() => '2026-09-20T12:00:00Z'} />);
    expect(screen.getByText(/Selecione ao menos um Caso Observado/)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /case-a.*revisão 7/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar versão' })).toBeDisabled();
  });

  it('bloqueia empresa misturada e SHA duplicado até confirmação explícita', async () => {
    const user = userEvent.setup();
    const sha = 'a'.repeat(64);
    const cases = [
      observedCase({ id: 'case-a', start: '2026-01-01', end: '2026-01-31', sha }),
      observedCase({ id: 'case-b', start: '2026-02-01', end: '2026-02-28', sha }),
      observedCase({ id: 'case-c', companyId: 'company-2', start: '2026-03-01', end: '2026-03-31' }),
    ];
    render(<ProfileBuilder company={company} cases={cases} versions={[]} onConfirm={vi.fn()} idFactory={() => 'profile-1'} now={() => '2026-09-20T12:00:00Z'} />);
    await user.click(screen.getByRole('checkbox', { name: /case-a/i }));
    await user.click(screen.getByRole('checkbox', { name: /case-b/i }));
    expect(await screen.findByText(/mesmo SHA-256/i)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /operações distintas/i }));
    expect(await screen.findByText('Prévia do Perfil Operacional')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /case-c/i }));
    expect(await screen.findByText(/mistura empresas/i)).toBeVisible();
    expect(screen.queryByText('Prévia do Perfil Operacional')).not.toBeInTheDocument();
  });

  it('mostra overlap, lacunas, ordenação determinística e confirma a próxima versão', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async (profile: OperationalProfileVersion) => profile);
    const prior = await calculateOperationalProfile({
      id: 'profile-old', ownerSub: company.ownerSub, companyId: company.id, version: 2,
      createdAt: '2026-08-01T00:00:00Z', cases: [observedCase({ id: 'case-old', start: '2025-12-01', end: '2025-12-31' })],
    });
    const cases = [
      observedCase({ id: 'case-b', start: '2026-01-20', end: '2026-01-31' }),
      observedCase({ id: 'case-a', start: '2026-01-01', end: '2026-01-25' }),
      observedCase({ id: 'case-c', start: '2026-02-05', end: '2026-02-10' }),
    ];
    render(<ProfileBuilder company={company} cases={cases} versions={[prior]} onConfirm={onConfirm} idFactory={() => 'profile-next'} now={() => '2026-09-20T12:00:00Z'} />);
    for (const item of cases) await user.click(screen.getByRole('checkbox', { name: new RegExp(item.id, 'i') }));
    const preview = await screen.findByRole('region', { name: 'Prévia do Perfil Operacional' });
    expect(preview).toHaveTextContent('Empresa Exemplo');
    expect(preview).toHaveTextContent('3 casos');
    expect(preview).toHaveTextContent('versão 3');
    expect(within(preview).getByText('Sobreposição').closest('div')).toHaveTextContent('6 dias');
    expect(within(preview).getByText('Lacunas').closest('div')).toHaveTextContent('4 dias');
    const selection = within(preview).getByTestId('profile-selection');
    expect(selection.textContent).toMatch(/case-a.*case-b.*case-c/s);
    await user.click(screen.getByRole('button', { name: 'Confirmar versão' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ id: 'profile-next', version: 3, companyId: company.id });
  });
});

describe('EvidenceValueView', () => {
  it.each([
    [{ state: 'AVAILABLE', value: '123', evidence: ['case:a@1'] }, '123'],
    [{ state: 'NOT_COLLECTED', reason: 'campo ausente', evidence: [] }, 'Não coletado: campo ausente'],
    [{ state: 'INSUFFICIENT_COVERAGE', reason: 'só um mês', evidence: [] }, 'Cobertura insuficiente: só um mês'],
    [{ state: 'INCOMPATIBLE', reason: 'fontes incompatíveis', evidence: [] }, 'Incompatível: fontes incompatíveis'],
  ] as const)('renderiza o estado de evidência sem converter ausência em zero', (evidence, expected) => {
    render(<EvidenceValueView evidence={evidence as EvidenceValue<string>} renderAvailable={(value) => value} />);
    expect(screen.getByText(expected)).toBeVisible();
  });
});

describe('ProfileVersionList', () => {
  it('é somente leitura, mostra sazonalidade observada e permite anexar o snapshot', async () => {
    const user = userEvent.setup();
    const profile = await calculateOperationalProfile({
      id: 'profile-1', ownerSub: company.ownerSub, companyId: company.id, version: 1,
      createdAt: '2026-09-20T12:00:00Z', cases: [observedCase({ id: 'case-a', start: '2026-01-15', end: '2026-02-10' })],
    });
    const onAttach = vi.fn(async () => undefined);
    render(<ProfileVersionList profiles={[profile]} onAttach={onAttach} attachDisabled={false} />);
    expect(screen.getByText('2026-01')).toBeVisible();
    expect(screen.getByText('2026-02')).toBeVisible();
    const seasonality = screen.getByRole('region', { name: 'Sazonalidade observada' });
    expect(within(seasonality).getAllByText(/dias cobertos/)).toHaveLength(2);
    expect(within(seasonality).getAllByText(/média por dia coberto/)).toHaveLength(2);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar como evidência em estudo' }));
    expect(onAttach).toHaveBeenCalledWith(profile);
  });

  it('apresenta conflito de vínculo sem tornar a versão editável', async () => {
    const user = userEvent.setup();
    const profile = await calculateOperationalProfile({
      id: 'profile-conflict', ownerSub: company.ownerSub, companyId: company.id, version: 1,
      createdAt: '2026-09-20T12:00:00Z', cases: [observedCase({ id: 'case-a', start: '2026-01-01', end: '2026-01-31' })],
    });
    render(<ProfileVersionList profiles={[profile]} attachDisabled={false} onAttach={async () => { throw new Error('Revisão esperada 1, revisão atual 2.'); }} />);

    await user.click(screen.getByRole('button', { name: 'Usar como evidência em estudo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisão esperada 1, revisão atual 2.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

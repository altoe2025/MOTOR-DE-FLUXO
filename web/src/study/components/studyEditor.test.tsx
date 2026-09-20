// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createStudy } from '../domain';
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  makeAuthoredSnapshot,
  makeObservedCase,
  makeScenarioDraft,
} from '../fixtures';
import { requiredBuildSha } from '../sourceConfiguration';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../../preparation/buildPreviewRequest';
import { resolvePortfolioSource } from '../../preparation/resolvePortfolioSource';
import type { PortfolioSourceDraft } from './PortfolioSourceSelector';
import { StudyEditor } from './StudyEditor';
import { StudyList } from './StudyList';

async function study() {
  return createStudy({
    id: '00000000-0000-4000-8000-000000000099', ownerSub: FIXTURE_OWNER,
    name: 'Estudo teste', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW,
  });
}

async function subject(overrides: Partial<React.ComponentProps<typeof StudyEditor>> = {}) {
  const document = await study();
  const onRename = vi.fn();
  const onSourceChange = vi.fn();
  const onConvertObserved = vi.fn();
  const onScenarioChange = vi.fn();
  const observedCase = makeObservedCase();
  render(<StudyEditor
    study={document}
    observedCases={[observedCase, { ...makeObservedCase(), id: 'archived', status: 'ARCHIVED' }]}
    companies={[{ id: 'company-1', ownerSub: FIXTURE_OWNER, displayName: 'Empresa Alfa', aliases: [], createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW, revision: 1 }]}
    status="SAVED" onRename={onRename} onDuplicate={vi.fn()}
    onSourceChange={onSourceChange} onConvertObserved={onConvertObserved}
    onScenarioChange={onScenarioChange}
    {...overrides}
  />);
  return { onRename, onSourceChange, onConvertObserved, onScenarioChange, observedCase };
}

describe('StudyEditor', () => {
  it('bloqueia preparação sem SHA real e aceita somente configuração hexadecimal válida', () => {
    expect(() => requiredBuildSha(undefined, undefined)).toThrow('VITE_MOTOR_BUILD_SHA');
    expect(() => requiredBuildSha('0'.repeat(39), undefined)).toThrow('SHA de build inválido');
    expect(requiredBuildSha('a'.repeat(40), undefined)).toBe('a'.repeat(40));
    expect(requiredBuildSha(undefined, 'b'.repeat(40))).toBe('b'.repeat(40));
  });

  it('salva nome com teclado', async () => {
    const { onRename } = await subject(); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Nome do estudo'));
    await user.type(screen.getByLabelText('Nome do estudo'), 'Novo estudo{enter}');
    expect(onRename).toHaveBeenCalledWith('Novo estudo');
  });

  it('confirma antes de descartar autoria local e preserva os campos quando cancelado', async () => {
    const user = userEvent.setup(); await subject();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Nome do grupo'));
    await user.type(screen.getByLabelText('Nome do grupo'), 'Tesouraria Sul');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByLabelText('Caso observado'));
    expect(confirm).toHaveBeenCalledWith('Trocar a origem descarta a autoria manual não aplicada. Continuar?');
    expect(screen.getByLabelText('Nome do grupo')).toHaveValue('Tesouraria Sul');
  });

  it('oferece cinco exemplos e envia a receita escolhida para preparação oficial', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.selectOptions(screen.getByLabelText('Escolha do exemplo sintético'), 'psp-inbound');
    let instant = 0;
    const clock = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(
      () => `2026-09-19T12:00:00.${String(instant++).padStart(3, '0')}Z`,
    );
    await user.click(screen.getByRole('button', { name: 'Preparar exemplo' }));
    clock.mockRestore();
    expect(onSourceChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'SYNTHETIC', exampleId: 'psp-inbound',
      preparation: expect.objectContaining({ input: expect.objectContaining({ participants: expect.any(Array) }) }),
    }));
    const applied = onSourceChange.mock.calls[0]![0] as PortfolioSourceDraft;
    if (applied.kind !== 'SYNTHETIC') throw new Error('draft sintético esperado');
    const preparation = applied.preparation;
    expect(new Set(Object.values(preparation.input.sources).map((source) => source.recorded_at)).size).toBe(1);
  });

  it('prepara autoria manual com grupos, participante, herança e overrides como Decimal textual', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Frequência mensal do grupo'));
    await user.type(screen.getByLabelText('Frequência mensal do grupo'), '12');
    await user.clear(screen.getByLabelText('Ticket médio do grupo'));
    await user.type(screen.getByLabelText('Ticket médio do grupo'), '1500.50');
    await user.click(screen.getByLabelText('Sobrescrever parâmetros do participante'));
    await user.clear(screen.getByLabelText('Frequência mensal do participante'));
    await user.type(screen.getByLabelText('Frequência mensal do participante'), '3');
    await user.click(screen.getByRole('button', { name: 'Preparar carteira manual' }));
    expect(onSourceChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'AUTHORED', authoredPortfolioId: expect.any(String),
      preparation: expect.objectContaining({ input: expect.objectContaining({ participants: [expect.objectContaining({
        monthly_volume_brl: '4501.5', ticket_median_brl: '1500.5',
      })] }) }),
    }));
  });

  it('valida Decimal localmente antes da rede', async () => {
    const { onSourceChange } = await subject(); const user = userEvent.setup();
    await user.click(screen.getByLabelText('Autoria manual'));
    await user.clear(screen.getByLabelText('Ticket médio do grupo'));
    await user.type(screen.getByLabelText('Ticket médio do grupo'), '1,5');
    await user.click(screen.getByRole('button', { name: 'Preparar carteira manual' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use ponto como separador decimal');
    expect(onSourceChange).not.toHaveBeenCalled();
  });

  it('reidrata autoria persistida e salva premissas e período sem perder texto decimal', async () => {
    const snapshot = makeAuthoredSnapshot();
    if (snapshot.source.kind !== 'AUTHORED') throw new Error('fixture');
    snapshot.source.definition = {
      kind: 'PARAMETRIC',
      groups: [{
        id: 'group-saved', name: 'Grupo persistido',
        parameters: {
          frequency: '12.00', ticket: '1500.50', direction: 'OUT', deadline: '5',
          purpose: 'ANEXO_V_REMESSA_TERCEIRO', profile: 'tesouraria_corporativa',
        },
        participants: [{
          id: 'participant-saved', name: 'Participante persistido', override: false,
          parameters: {
            frequency: '12.00', ticket: '1500.50', direction: 'OUT', deadline: '5',
            purpose: 'ANEXO_V_REMESSA_TERCEIRO', profile: 'tesouraria_corporativa',
          },
        }],
      }],
    };
    const document = await createStudy({
      id: 'study-authored', ownerSub: FIXTURE_OWNER, name: 'Autoria salva',
      baseScenario: makeScenarioDraft({ sourceSnapshot: snapshot }), now: FIXTURE_NOW,
    });
    const onScenarioChange = vi.fn();
    await subject({ study: document, onScenarioChange });
    const user = userEvent.setup();

    expect(screen.getByLabelText('Nome do grupo')).toHaveValue('Grupo persistido');
    expect(screen.getByLabelText('Ticket médio do grupo')).toHaveValue('1500.50');
    await user.clear(screen.getByLabelText('PTAX'));
    await user.type(screen.getByLabelText('PTAX'), '5.4000');
    await user.clear(screen.getByLabelText('Período de medição em dias'));
    await user.type(screen.getByLabelText('Período de medição em dias'), '45');
    await user.click(screen.getByRole('button', { name: 'Salvar premissas e período' }));

    expect(onScenarioChange).toHaveBeenCalledWith(expect.objectContaining({
      premises: expect.objectContaining({ costs: expect.objectContaining({ ptax: '5.4000' }) }),
      period: { httpPeriod: { modo: 'NATURAL', dias_aquecimento: 0, periodo_medicao_dias: 45 } },
    }));
  });

  it('reidrata e reedita operações explícitas sem passar pelo gerador', async () => {
    const snapshot = makeAuthoredSnapshot();
    if (snapshot.source.kind !== 'AUTHORED') throw new Error('fixture');
    const provenance = snapshot.provenance[0]!;
    snapshot.source.definition = {
      kind: 'EXPLICIT_ORDERS',
      orders: structuredClone(snapshot.orders),
      provenanceByOrder: Object.fromEntries(snapshot.orders.map((order) => [order.id, {
        dia_conhecida: provenance, dia_limite: provenance, valor_brl: provenance,
        finalidade: provenance, eh_efx: provenance,
      }])),
    };
    const document = await createStudy({
      id: 'study-explicit', ownerSub: FIXTURE_OWNER, name: 'Operações explícitas',
      baseScenario: makeScenarioDraft({ sourceSnapshot: snapshot }), now: FIXTURE_NOW,
    });
    const onSourceChange = vi.fn();
    await subject({ study: document, onSourceChange });
    const user = userEvent.setup();

    expect(screen.getByLabelText('ID da operação order-a')).toHaveValue('order-a');
    expect(screen.getByLabelText('Cliente da operação order-a')).toHaveValue('client-a');
    await user.clear(screen.getByLabelText('Valor BRL da operação order-a'));
    await user.type(screen.getByLabelText('Valor BRL da operação order-a'), '125.5000');
    await user.click(screen.getByRole('button', { name: 'Salvar operações explícitas' }));

    expect(onSourceChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'AUTHORED',
      definition: expect.objectContaining({
        kind: 'EXPLICIT_ORDERS',
        orders: expect.arrayContaining([expect.objectContaining({ id: 'order-a', valor_brl: '125.5000' })]),
      }),
    }));
    expect(onSourceChange.mock.calls[0]![0]).not.toHaveProperty('preparation');
  });

  it('converte caso observado em autoria preenchida sem modificar o original', async () => {
    const { onSourceChange, onConvertObserved, observedCase } = await subject(); const user = userEvent.setup();
    const originalJson = JSON.stringify(observedCase);
    await user.click(screen.getByLabelText('Caso observado'));
    const selector = screen.getByLabelText('Caso confirmado');
    expect(within(selector).getAllByRole('option')).toHaveLength(2);
    await user.selectOptions(selector, 'case-1');
    expect(screen.getByText('Empresa Alfa')).toBeVisible();
    expect(screen.getByText('100 BRL')).toBeVisible();
    expect(screen.getByText(/1 ordem/)).toBeVisible();
    expect(screen.getByText(/Sem bloqueios/)).toBeVisible();
    expect(screen.getByText(/arquivo-observado/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Usar caso confirmado' }));
    expect(onSourceChange).toHaveBeenCalledWith({ kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 });
    await user.click(screen.getByRole('button', { name: 'Converter para autoria manual' }));
    expect(onConvertObserved).toHaveBeenCalledWith('case-1');
    expect(screen.getByLabelText('Valor BRL da operação observed-order-1')).toHaveValue('100');
    expect(screen.getByLabelText('Direção da operação observed-order-1')).toHaveValue('OUT');
    expect(screen.getByLabelText('Finalidade da operação observed-order-1')).toHaveValue('ANEXO_V_REMESSA_TERCEIRO');
    expect(onSourceChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'AUTHORED',
      definition: expect.objectContaining({
        kind: 'EXPLICIT_ORDERS',
        orders: [expect.objectContaining({
          id: 'observed-order-1', cliente_id: 'client-1', direcao: 'OUT',
          dia_conhecida: 0, dia_limite: 2, valor_brl: '100',
          finalidade: 'ANEXO_V_REMESSA_TERCEIRO', eh_efx: true,
        })],
      }),
    }));
    expect(JSON.stringify(observedCase)).toBe(originalJson);
  });

  it('marca somente campos explícitos alterados e nunca envia valor corrigido como observado', async () => {
    const { onSourceChange, observedCase } = await subject(); const user = userEvent.setup();
    await user.click(screen.getByLabelText('Caso observado'));
    await user.selectOptions(screen.getByLabelText('Caso confirmado'), observedCase.id);
    await user.click(screen.getByRole('button', { name: 'Converter para autoria manual' }));
    await user.clear(screen.getByLabelText('ID da operação observed-order-1'));
    await user.type(screen.getByLabelText('ID da operação observed-order-1'), 'edited-order');
    await user.clear(screen.getByLabelText('Cliente da operação observed-order-1'));
    await user.type(screen.getByLabelText('Cliente da operação observed-order-1'), 'edited-client');
    await user.selectOptions(screen.getByLabelText('Direção da operação observed-order-1'), 'IN');
    await user.clear(screen.getByLabelText('Dia conhecido da operação observed-order-1'));
    await user.type(screen.getByLabelText('Dia conhecido da operação observed-order-1'), '1');
    await user.clear(screen.getByLabelText('Valor BRL da operação observed-order-1'));
    await user.type(screen.getByLabelText('Valor BRL da operação observed-order-1'), '125.50');
    await user.clear(screen.getByLabelText('Finalidade da operação observed-order-1'));
    await user.type(screen.getByLabelText('Finalidade da operação observed-order-1'), 'FINALIDADE_CORRIGIDA');
    await user.click(screen.getByLabelText('EFX da operação observed-order-1'));
    await user.click(screen.getByRole('button', { name: 'Salvar operações explícitas' }));

    const source = onSourceChange.mock.calls.at(-1)![0];
    const snapshot = await resolvePortfolioSource(source, {
      getObservedCase: async () => null,
      preparePortfolio: async () => { throw new Error('não deve preparar'); },
      now: () => '2026-09-19T13:00:00Z',
    });
    const scenario = (await study()).scenarios[0]!;
    const observed = observedCase.orders[0]!.provenance[0]!;
    const provenance: PreviewRequestProvenance = {
      premises: {
        windowDays: observed,
        costs: {
          iof_out: observed, iof_in: observed, carry_cnr: observed,
          custo_fixo_remessa: observed, custo_oportunidade_aa: observed,
          spread_rail_bps: observed, ptax: observed,
        },
      },
      period: { horizonDays: observed },
    };
    const request = buildPreviewRequest(snapshot, scenario.premises, scenario.period, {
      requestId: '00000000-0000-4000-8000-000000000031',
      studyId: '00000000-0000-4000-8000-000000000032',
      scenarioId: '00000000-0000-4000-8000-000000000033',
      scenarioRevision: 1,
    }, provenance);

    const fields = snapshot.provenanceByOrder?.['edited-order'];
    expect(fields?.valor_brl).toMatchObject({
      kind: 'USER_CORRECTED', actionId: expect.any(String), recordedAt: expect.any(String),
    });
    expect(fields).toMatchObject({
      id: { kind: 'USER_CORRECTED' },
      cliente_id: { kind: 'USER_CORRECTED' },
      direcao: { kind: 'USER_CORRECTED' },
      dia_conhecida: { kind: 'USER_CORRECTED' },
      finalidade: { kind: 'USER_CORRECTED' },
      eh_efx: { kind: 'USER_CORRECTED' },
      dia_limite: observed,
    });
    expect(request.proveniencia['/ordens/0/valor_brl']?.tipo).toBe('ESTIMATIVA_USUARIO');
    expect(request.proveniencia['/ordens/0/dia_limite']?.tipo).toBe('DADO_OBSERVADO');
    expect(request.proveniencia['/ordens/0/id']?.tipo).toBe('ESTIMATIVA_USUARIO');
    expect(request.proveniencia['/ordens/0/cliente_id']?.tipo).toBe('ESTIMATIVA_USUARIO');
    expect(request.proveniencia['/ordens/0/direcao']?.tipo).toBe('ESTIMATIVA_USUARIO');
  });
});

describe('StudyList', () => {
  it('expõe Novo estudo e preserva as ações da lista', async () => {
    const document = await study(); const onCreate = vi.fn();
    render(<StudyList studies={[document]} selectedId={null} onCreate={onCreate} onOpen={vi.fn()} onRename={vi.fn()} onDuplicate={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Novo estudo' }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Abrir Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Renomear Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Duplicar Estudo teste' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir Estudo teste' })).toBeVisible();
  });
});

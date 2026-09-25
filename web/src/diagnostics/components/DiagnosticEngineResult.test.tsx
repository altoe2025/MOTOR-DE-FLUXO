// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../../api/client';
import { DiagnosticEngineResult } from './DiagnosticEngineResult';

const agregado = {
  ids_ordens_medidas: [],
  economia_periodo_brl: '10', volume_bruto_periodo_brl: '140',
  volume_casado_periodo_brl: '60', volume_remetido_periodo_brl: '80',
  taxa_netabilidade_periodo: '0.42857142857142857143',
  taxa_autonetting_periodo: '0', taxa_netting_multilateral_periodo: '0.42857142857142857143',
  baseline_periodo: { total: '22', iof: '10', spread: '4', fixo: '3', carry: '3', espera: '2' },
  netado_periodo: { total: '12', iof: '6', spread: '2', fixo: '2', carry: '1', espera: '1' },
  mecanismos: [
    { destino: 'INTRA_CLIENTE', volume_brl: '0', custo_netado_brl: '0', economia_brl: '0' },
    { destino: 'INTER_CLIENTE', volume_brl: '60', custo_netado_brl: '2', economia_brl: '10' },
    { destino: 'REMETIDO', volume_brl: '80', custo_netado_brl: '10', economia_brl: '0' },
  ],
  execucao_completa: { ciclos: [] },
};

const envelopeWith = (result: unknown) => ({
  selected_execution: { kind: 'PREVIA', result },
} as unknown as DiagnosticEnvelope);

describe('resultado do motor no diagnóstico', () => {
  it('mostra resultado do motor e decomposição de custos da execução selecionada', () => {
    render(<DiagnosticEngineResult envelope={envelopeWith({ agregado })} />);
    expect(screen.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Decomposição de custos' })).toBeVisible();
  });

  it('não renderiza nada quando a execução selecionada não traz resultado canônico', () => {
    const { container } = render(<DiagnosticEngineResult envelope={envelopeWith({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});

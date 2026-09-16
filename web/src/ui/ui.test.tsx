// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PreviewEnvelope } from '../study/types';
import { Button } from './Button';
import { ComparisonSummary } from './ComparisonSummary';
import { CostTable } from './CostTable';
import { DefinitionTooltip } from './DefinitionTooltip';
import { InlineNotice } from './InlineNotice';
import { TextField } from './TextField';

const envelope = {
  result: {
    agregado: {
      economia_periodo_brl: '1000',
      taxa_netabilidade_periodo: '0.5882',
      taxa_autonetting_periodo: '0.1337',
      taxa_netting_multilateral_periodo: '0.2725',
      volume_bruto_periodo_brl: '2400',
      volume_casado_periodo_brl: '1411.68',
      volume_autonetting_periodo_brl: '111',
      volume_netting_multilateral_periodo_brl: '222',
      volume_remetido_periodo_brl: '988.32',
      baseline_periodo: { total: '1800', iof: '800', spread: '400', fixo: '300', carry: '200', espera: '100' },
      netado_periodo: { total: '800', iof: '300', spread: '200', fixo: '150', carry: '100', espera: '50' },
      mecanismos: [
        { destino: 'INTRA_CLIENTE', volume_brl: '321', baseline_atribuido_brl: '500', custo_netado_brl: '100', economia_brl: '400' },
        { destino: 'INTER_CLIENTE', volume_brl: '654', baseline_atribuido_brl: '700', custo_netado_brl: '250', economia_brl: '450' },
        { destino: 'REMETIDO', volume_brl: '777', baseline_atribuido_brl: '600', custo_netado_brl: '450', economia_brl: '150' },
      ],
    },
  },
} as unknown as PreviewEnvelope;

describe('accessible UI primitives', () => {
  it('connects TextField label and actionable error to the input', () => {
    render(<TextField id="study-name" label="Nome do estudo" error="Informe um nome para continuar." />);

    const input = screen.getByRole('textbox', { name: 'Nome do estudo' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Informe um nome para continuar.');
  });

  it('keeps native button behavior and an accessible name', async () => {
    const user = userEvent.setup();
    let presses = 0;
    render(<Button onClick={() => { presses += 1; }}>Atualizar prévia</Button>);

    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Atualizar prévia' })).toHaveFocus();
    expect(presses).toBe(1);
  });

  it('opens DefinitionTooltip on keyboard focus and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<DefinitionTooltip term="CNR">Conta de não residente usada na liquidação.</DefinitionTooltip>);

    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Conta de não residente usada na liquidação.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps DefinitionTooltip visible while the pointer moves to its content', async () => {
    const user = userEvent.setup();
    render(<DefinitionTooltip term="CNR">Conta de não residente usada na liquidação.</DefinitionTooltip>);

    await user.hover(screen.getByRole('button', { name: 'Definição de CNR' }));
    await user.hover(screen.getByRole('tooltip'));

    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  it('announces execution status and reserves alerts for actionable errors', () => {
    const { rerender } = render(<InlineNotice busy>Prévia em execução</InlineNotice>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Prévia em execução');

    rerender(<InlineNotice tone="error">Não foi possível atualizar a prévia.</InlineNotice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar a prévia.');
  });

  it('formats only canonical PreviewEnvelope values in the comparison and cost views', () => {
    render(
      <>
        <ComparisonSummary envelope={envelope} />
        <CostTable envelope={envelope} />
      </>,
    );

    expect(screen.getByText(/R\$\s+1\.000,00/)).toBeVisible();
    expect(screen.getByText('58,82%')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Autonetting — mesmo participante' })).toHaveTextContent(/R\$\s+321,00/);
    expect(screen.getByRole('group', { name: 'Autonetting — mesmo participante' })).toHaveTextContent('13,37%');
    expect(screen.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toHaveTextContent(/R\$\s+654,00/);
    expect(screen.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toHaveTextContent('27,25%');
    expect(screen.getByRole('group', { name: 'Remetido — cruzou a fronteira' })).toHaveTextContent(/R\$\s+777,00/);
    expect(screen.getByText('Atribuição contábil de custo e economia')).toBeVisible();
    expect(screen.getByRole('row', { name: /Total.*R\$\s+1\.800,00.*R\$\s+800,00/ })).toBeVisible();
  });
});

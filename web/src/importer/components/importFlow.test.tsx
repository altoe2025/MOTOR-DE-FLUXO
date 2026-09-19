// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionAssessment } from './domain';
import { ExecutionConfirmation } from './components/ExecutionConfirmation';
import { UploadStep } from './components/UploadStep';

const assessment: ExecutionAssessment = {
  selected: [], blockers: [], issues: [], periodDays: 10,
  omitted: { outsideRecut: 1, invalid: 2, excluded: 0, superseded: 0 },
  requiresPartialConfirmation: true,
};

describe('fluxo visual de importação', () => {
  it('seleciona o XLSX sem iniciar a leitura antes do comando explícito', async () => {
    const parse = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<UploadStep busy={false} onParse={parse} />);
    await user.upload(screen.getByLabelText('Arquivo XLSX'), new File(['xlsx'], 'operacoes.xlsx'));
    expect(parse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ler planilha' }));
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('exige confirmação explícita e informa a execução parcial', async () => {
    const execute = vi.fn();
    const user = userEvent.setup();
    render(<ExecutionConfirmation assessment={{ ...assessment, selected: [{}] as ExecutionAssessment['selected'] }} blockedReason={null} busy={false} error={null} onExecute={execute} />);
    expect(execute).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Executar apenas 1 operações' }));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('bloqueia execução quando o catálogo não está configurado', () => {
    render(<ExecutionConfirmation assessment={assessment} blockedReason="Catálogo não configurado" busy={false} error={null} onExecute={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Executar apenas 0 operações' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Catálogo não configurado');
  });
});

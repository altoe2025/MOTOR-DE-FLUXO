// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMPORT_COLUMNS } from '../layout';
import { UploadStep } from './UploadStep';

function subject(companies: readonly { id: string; displayName: string }[] = []) {
  render(<UploadStep file={null} selectedCompanyId="" companies={companies} positionIdentified={false} busy={false}
    onFile={vi.fn()} onCompany={vi.fn()} onCreateCompany={vi.fn()} onPosition={vi.fn()} onRead={vi.fn()} onCancel={vi.fn()} />);
}

afterEach(() => vi.restoreAllMocks());

describe('UploadStep', () => {
  it('mostra as colunas do modelo, a aba e o limite em "Como montar a planilha"', async () => {
    subject();
    expect(screen.queryByRole('region', { name: 'Como montar a planilha' })).not.toBeInTheDocument();
    expect(screen.getByText(/aba 'operacoes' · até 1\.000 operações/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Como montar a planilha/ }));
    const instructions = screen.getByRole('region', { name: 'Como montar a planilha' });
    for (const column of IMPORT_COLUMNS) expect(instructions).toHaveTextContent(column.name);
    expect(instructions).toHaveTextContent("aba 'operacoes'");
    expect(instructions).toHaveTextContent('1.000 operações');
  });

  it('sem empresas, já pede o nome da nova; com empresas, a nova abre em "+ Nova empresa"', async () => {
    subject([{ id: 'c1', displayName: 'Empresa Alfa' }]);
    const user = userEvent.setup();
    expect(screen.getByLabelText('Empresa')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome da nova empresa')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Nova empresa' }));
    expect(screen.getByLabelText('Nome da nova empresa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escolher da lista' }));
    expect(screen.queryByLabelText('Nome da nova empresa')).not.toBeInTheDocument();
  });

  it('sem empresas cadastradas, mostra direto o nome da nova empresa', () => {
    subject();
    expect(screen.getByLabelText('Nome da nova empresa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escolher da lista' })).not.toBeInTheDocument();
  });

  it('baixa o modelo .xlsx gerado no navegador', async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { created.push(blob as Blob); return 'blob:modelo'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    subject();
    expect(screen.getByRole('button', { name: 'Baixar modelo (.xlsx)' }))
      .toHaveAttribute('data-chat-help-id', 'control.importacao.modelo');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar modelo (.xlsx)' }));
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(created[0]!.size).toBeGreaterThan(0);
    expect(click).toHaveBeenCalledOnce();
  });
});

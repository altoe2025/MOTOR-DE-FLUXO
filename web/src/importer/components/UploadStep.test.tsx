// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMPORT_COLUMNS } from '../layout';
import { UploadStep } from './UploadStep';

function subject() {
  render(<UploadStep file={null} selectedCompanyId="" companies={[]} positionIdentified={false} busy={false}
    onFile={vi.fn()} onCompany={vi.fn()} onCreateCompany={vi.fn()} onPosition={vi.fn()} onRead={vi.fn()} onCancel={vi.fn()} />);
}

afterEach(() => vi.restoreAllMocks());

describe('UploadStep', () => {
  it('mostra as colunas do modelo, a aba e o limite', () => {
    subject();
    const instructions = screen.getByRole('region', { name: 'Como montar a planilha' });
    for (const column of IMPORT_COLUMNS) expect(instructions).toHaveTextContent(column.name);
    expect(instructions).toHaveTextContent("aba 'operacoes'");
    expect(instructions).toHaveTextContent('1.000 operações');
  });

  it('baixa o modelo .xlsx gerado no navegador', async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { created.push(blob as Blob); return 'blob:modelo'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    subject();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar modelo (.xlsx)' }));
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(created[0]!.size).toBeGreaterThan(0);
    expect(click).toHaveBeenCalledOnce();
  });
});

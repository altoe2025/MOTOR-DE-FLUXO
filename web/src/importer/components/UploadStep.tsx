import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Disclosure } from '../../ui/Disclosure';
import { IMPORT_COLUMNS, IMPORT_LIMIT_ROWS, IMPORT_MAX_FILE_MIB, IMPORT_SHEET_NAME } from '../layout';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// O gerador do modelo só é carregado no clique, para não pesar a abertura da tela.
async function downloadTemplate() {
  const { buildImportTemplate, IMPORT_TEMPLATE_FILENAME } = await import('../xlsxTemplate');
  const bytes = buildImportTemplate();
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = IMPORT_TEMPLATE_FILENAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function TemplateInstructions() {
  return <Disclosure id="import-instructions" label="Como montar a planilha" hint={`${IMPORT_COLUMNS.length} colunas, nesta ordem`}>
    <section className="import-instructions" aria-labelledby="import-instructions-title">
      <h3 id="import-instructions-title" className="visually-hidden">Como montar a planilha</h3>
      <p className="field-hint">
        Arquivo .xlsx de até {IMPORT_MAX_FILE_MIB} MiB, com uma única aba '{IMPORT_SHEET_NAME}', cabeçalhos na linha 1 exatamente nesta ordem e
        até {IMPORT_LIMIT_ROWS.toLocaleString('pt-BR')} operações (uma por linha). Sem fórmulas, células mescladas ou macros.
      </p>
      <ol className="import-columns">{IMPORT_COLUMNS.map((column) => <li key={column.name}><code>{column.name}</code>{column.required ? '' : ' (opcional)'} — {column.format}</li>)}</ol>
    </section>
  </Disclosure>;
}

export function UploadStep({ file, selectedCompanyId, companies, lockedCompanyName, positionIdentified, busy, onFile, onCompany, onCreateCompany, onPosition, onRead, onCancel }: {
  file: File | null;
  selectedCompanyId: string;
  companies: readonly { id: string; displayName: string }[];
  lockedCompanyName?: string;
  positionIdentified: boolean;
  busy: boolean;
  onFile(file: File): void;
  onCompany(id: string): void;
  onCreateCompany(name: string): void;
  onPosition(value: boolean): void;
  onRead(): void;
  onCancel(): void;
}) {
  const [newCompanyName, setNewCompanyName] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  // Sem empresas cadastradas, a única saída é criar uma: o campo já aparece.
  const showNewCompany = addingCompany || companies.length === 0;
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0];
    if (selected !== undefined) onFile(selected);
  };
  const createCompany = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newCompanyName.trim() === '') return;
    onCreateCompany(newCompanyName.trim());
    setNewCompanyName('');
    setAddingCompany(false);
  };
  return <section className="import-upload" aria-labelledby="import-upload-title">
    <div className="page-head">
      <h2 id="import-upload-title">Fonte e empresa</h2>
      <button className="button button--secondary" type="button" data-chat-help-id="control.importacao.modelo" onClick={() => void downloadTemplate()}>Baixar modelo (.xlsx)</button>
    </div>
    <div className="import-step">
      <p className="eyebrow">1 · Empresa</p>
      {lockedCompanyName !== undefined ? <p>Empresa: <output aria-label="Empresa">{lockedCompanyName}</output></p> : showNewCompany
        ? <form className="import-step__row" aria-label="Preparar nova empresa" onSubmit={createCompany}>
          <label htmlFor="new-import-company" className="visually-hidden">Nome da nova empresa</label>
          <input id="new-import-company" value={newCompanyName} maxLength={200} placeholder="Nome da nova empresa" autoFocus={addingCompany} onChange={(event) => setNewCompanyName(event.currentTarget.value)} disabled={busy} required />
          <button className="button" type="submit" disabled={busy}>Usar nova empresa neste Caso</button>
          {companies.length === 0 ? null : <button className="button button--secondary" type="button" onClick={() => setAddingCompany(false)}>Escolher da lista</button>}
        </form>
        : <div className="import-step__row">
          <label htmlFor="import-company" className="visually-hidden">Empresa</label>
          <select id="import-company" value={selectedCompanyId} onChange={(event) => onCompany(event.currentTarget.value)} disabled={busy}>
            <option value="">Selecione uma empresa</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
          </select>
          <button className="button button--secondary" type="button" disabled={busy} onClick={() => setAddingCompany(true)}>+ Nova empresa</button>
        </div>}
    </div>
    <div className="import-step">
      <p className="eyebrow">2 · Planilha</p>
      <label htmlFor="import-file">Planilha canônica XLSX</label>
      <input id="import-file" type="file" accept=".xlsx" onChange={handleFile} disabled={busy} />
      <p className="field-hint">aba '{IMPORT_SHEET_NAME}' · até {IMPORT_LIMIT_ROWS.toLocaleString('pt-BR')} operações · até {IMPORT_MAX_FILE_MIB} MiB</p>
      <TemplateInstructions />
      {file === null ? null : <p role="status">Arquivo selecionado: {file.name}</p>}
      <label className="profile-confirmation"><input type="checkbox" checked={positionIdentified} onChange={(event) => onPosition(event.currentTarget.checked)} disabled={busy} />Confirmo que as linhas representam operações explícitas colocadas na pool.</label>
      <div className="import-actions">
        <button className="button button--primary" type="button" disabled={busy || file === null || selectedCompanyId === '' || !positionIdentified} onClick={onRead}>Ler planilha</button>
        {busy ? <button className="button" type="button" onClick={onCancel}>Cancelar leitura</button> : null}
      </div>
    </div>
  </section>;
}

import type { ChangeEvent } from 'react';

export function UploadStep({ file, selectedCompanyId, companies, positionIdentified, busy, onFile, onCompany, onPosition, onRead, onCancel }: {
  file: File | null;
  selectedCompanyId: string;
  companies: readonly { id: string; displayName: string }[];
  positionIdentified: boolean;
  busy: boolean;
  onFile(file: File): void;
  onCompany(id: string): void;
  onPosition(value: boolean): void;
  onRead(): void;
  onCancel(): void;
}) {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0];
    if (selected !== undefined) onFile(selected);
  };
  return <section aria-labelledby="import-upload-title">
    <h2 id="import-upload-title">Fonte e empresa</h2>
    <label htmlFor="import-company">Empresa</label>
    <select id="import-company" value={selectedCompanyId} onChange={(event) => onCompany(event.currentTarget.value)} disabled={busy}>
      <option value="">Selecione uma empresa</option>
      {companies.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
    </select>
    <label htmlFor="import-file">Planilha canônica XLSX</label>
    <input id="import-file" type="file" accept=".xlsx" onChange={handleFile} disabled={busy} />
    {file === null ? null : <p role="status">Arquivo selecionado: {file.name}</p>}
    <label className="profile-confirmation"><input type="checkbox" checked={positionIdentified} onChange={(event) => onPosition(event.currentTarget.checked)} disabled={busy} />Confirmo que as linhas representam operações explícitas colocadas na pool.</label>
    <div className="import-actions">
      <button className="button button--primary" type="button" disabled={busy || file === null || selectedCompanyId === '' || !positionIdentified} onClick={onRead}>Ler planilha</button>
      {busy ? <button className="button" type="button" onClick={onCancel}>Cancelar leitura</button> : null}
    </div>
  </section>;
}

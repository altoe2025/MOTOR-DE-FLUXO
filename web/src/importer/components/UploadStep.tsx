import { useRef, useState } from 'react';
import { Button } from '../../ui/Button';

export function UploadStep({ busy, onParse }: { busy: boolean; onParse(file: File, signal: AbortSignal): Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const parse = async () => {
    if (file === null) return;
    const abort = new AbortController(); abortRef.current = abort; setError(null);
    try { await onParse(file, abort.signal); } catch (caught) {
      if ((caught as Error).name !== 'AbortError') setError(caught instanceof Error ? caught.message : String(caught));
    } finally { abortRef.current = null; }
  };
  return <section className="import-card" aria-labelledby="upload-title">
    <h2 id="upload-title">Selecionar planilha</h2>
    <p>Arquivo XLSX, aba “operacoes”, até 1.000 operações. O arquivo original não sai deste navegador.</p>
    <label className="file-field">Arquivo XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} /></label>
    {file === null ? null : <p role="status">Selecionado: {file.name}</p>}
    <div className="button-row"><Button disabled={file === null || busy} onClick={() => void parse()}>{busy ? 'Lendo planilha…' : 'Ler planilha'}</Button>
    {busy ? <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Cancelar</Button> : null}</div>
    {error === null ? null : <p role="alert" className="field-error">{error}</p>}
  </section>;
}

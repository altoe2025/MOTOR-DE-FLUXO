export function DiagnosticControls({ generated, count, onCountChange, onRun, disabled = false }: Readonly<{
  generated: boolean;
  count: 1 | 10 | 30 | 100;
  onCountChange: (count: 10 | 30 | 100) => void;
  onRun: () => void;
  disabled?: boolean;
}>) {
  return <section className="diagnostic-controls" aria-labelledby="diagnostic-configuration-heading">
    <h2 id="diagnostic-configuration-heading">Configuração</h2>
    {generated ? <label>Repetições<select value={count} disabled={disabled} onChange={(event) => onCountChange(Number(event.target.value) as 10 | 30 | 100)}>
      <option value={10}>10</option><option value={30}>30</option><option value={100}>100</option>
    </select></label> : <p>Esta é uma entrada fixa; por isso o diagnóstico contém uma execução individual e não uma distribuição amostral.</p>}
    <button className="button" type="button" disabled={disabled} onClick={onRun}>{disabled ? 'Diagnóstico em andamento…' : 'Executar diagnóstico'}</button>
  </section>;
}

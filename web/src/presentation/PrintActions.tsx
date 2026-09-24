export function PrintActions() {
  return <div className="print-controls">
    <button type="button" className="button" onClick={() => window.print()}>Salvar PDF</button>
    <p>Na janela de impressão, escolha “Salvar como PDF”. O arquivo permanece no seu dispositivo.</p>
  </div>;
}

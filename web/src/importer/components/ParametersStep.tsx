import type { ImportStudyParameters, ISODate, ParameterField } from '../domain';
import { Button } from '../../ui/Button';

const COST_FIELDS = ['iof_out','iof_in','carry_cnr','spread_rail_bps','custo_fixo_remessa','custo_oportunidade_aa','ptax'] as const;

export function ParametersStep({ start, end, knownMin, knownMax, parameters, onRecut, onParameter, onContinue }: {
  start: string; end: string; knownMin: string; knownMax: string; parameters: ImportStudyParameters;
  onRecut(start: ISODate, end: ISODate): void;
  onParameter(field: ParameterField, value: string): void;
  onContinue(): void;
}) {
  return <section className="import-card" aria-labelledby="parameters-title"><h2 id="parameters-title">Recorte e parâmetros</h2>
    <div className="parameter-grid"><label>Data inicial<input type="date" min={knownMin} max={knownMax} value={start} onChange={(e) => onRecut(e.currentTarget.value as ISODate, end as ISODate)} /></label><label>Data final<input type="date" min={knownMin} max={knownMax} value={end} onChange={(e) => onRecut(start as ISODate, e.currentTarget.value as ISODate)} /></label>
    <label>Janela em dias<input type="number" min="1" max="730" value={parameters.windowDays} onChange={(e) => onParameter('windowDays', e.currentTarget.value)} /></label>
    {COST_FIELDS.map((field) => <label key={field}>{field}<input inputMode="decimal" value={parameters.costs[field] as string} onChange={(e) => onParameter(field, e.currentTarget.value)} /><small>{parameters.fieldOrigins[field].fonte}</small></label>)}</div>
    <p className="inline-notice">Parâmetros importados ainda não foram calibrados. Confira a origem de cada valor.</p>
    <Button onClick={onContinue}>Continuar</Button>
  </section>;
}

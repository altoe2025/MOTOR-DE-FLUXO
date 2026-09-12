import type { components } from '../api/generated';

export type CenarioEntrada = components['schemas']['CenarioEntrada'];
export type PeriodoEntrada = components['schemas']['PeriodoLegado'] | components['schemas']['PeriodoNatural'];
export type ProvenienciaEntrada = components['schemas']['PreviaRequest']['proveniencia'];
export type PreviewEnvelope = components['schemas']['PreviewEnvelope'];

export type ScenarioDocument = {
  id: string;
  revision: number;
  input: CenarioEntrada;
  period: PeriodoEntrada;
  provenance: ProvenienciaEntrada;
};

export type ScenarioVariant = {
  id: string;
  base_id: string;
  base_revision: number;
  name: string;
  changes: Array<
    | { kind: 'add_order'; order: components['schemas']['OrdemEntrada'] }
    | { kind: 'remove_order'; order_id: string }
    | { kind: 'replace_order'; order_id: string; order: components['schemas']['OrdemEntrada'] }
  >;
};

export type StudyDocument = {
  study_schema_version: '1.0.0';
  id: string;
  owner_sub: string;
  name: string;
  created_at: string;
  updated_at: string;
  base: ScenarioDocument;
  variants: ScenarioVariant[];
  results: PreviewEnvelope[];
  selected_replay: { execution_id: string; repetition_id: string } | null;
};

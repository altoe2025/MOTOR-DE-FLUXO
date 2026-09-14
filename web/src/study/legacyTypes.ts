import type { components } from '../api/generated';
import type { CenarioEntrada, PeriodoEntrada, ProvenienciaEntrada, PreviewEnvelope } from './model';

export type LegacyScenarioDocument = {
  id: string;
  revision: number;
  input: CenarioEntrada;
  period: PeriodoEntrada;
  provenance: ProvenienciaEntrada;
};

export type LegacyScenarioVariant = {
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

export type LegacyStudyDocument = {
  study_schema_version: '1.0.0';
  id: string;
  owner_sub: string;
  name: string;
  created_at: string;
  updated_at: string;
  base: LegacyScenarioDocument;
  variants: LegacyScenarioVariant[];
  results: PreviewEnvelope[];
  selected_replay: { execution_id: string; repetition_id: string } | null;
};

export type ScenarioDocument = LegacyScenarioDocument;
export type ScenarioVariant = LegacyScenarioVariant;

import type { components } from '../api/generated';

export type ReplayDocument = components['schemas']['ReplayDocumentV1'];

export function replayDocumentFixture(): ReplayDocument {
  return {
    api_version: '1.0.0',
    currency: 'BRL',
    diagnostic_execution_id: '00000000-0000-4000-8000-000000000701',
    execution_fingerprint: 'a'.repeat(64),
    motor_version: 'b'.repeat(40),
    repetition_id: '00000000-0000-4000-8000-000000000703',
    result_fingerprint: 'c'.repeat(64),
    scenario_id: '00000000-0000-4000-8000-000000000012',
    scenario_revision: 1,
    policy: 'P0',
    participant_seeds: {},
    period: {
      mode: 'LEGADO',
      warmup_days: 0,
      measurement_start_day: 0,
      measurement_end_day: 2,
      settlement_end_day: 2,
    },
    orders: [
      { id: 'out-1', client_id: 'cliente-a', direction: 'OUT', value_brl: '100', known_day: 0, deadline_day: 2, cohort: 'MEASUREMENT' },
      { id: 'in-1', client_id: 'cliente-b', direction: 'IN', value_brl: '40', known_day: 0, deadline_day: 0, cohort: 'MEASUREMENT' },
    ],
    days: [
      {
        day: 0,
        events: [
          { kind: 'ORDER_ARRIVED', order_id: 'out-1', sequence: 0 },
          { kind: 'ORDER_ARRIVED', order_id: 'in-1', sequence: 1 },
          { kind: 'ALLOCATION', order_id: 'out-1', direction: 'OUT', value_brl: '40', allocation_type: 'CASADO', matching_origin: 'INTER_CLIENTE', sequence: 2 },
          { kind: 'ALLOCATION', order_id: 'in-1', direction: 'IN', value_brl: '40', allocation_type: 'CASADO', matching_origin: 'INTER_CLIENTE', sequence: 3 },
        ],
        closing: {
          triggers: ['WINDOW', 'DEADLINE'],
          gross_out_brl: '100', gross_in_brl: '40', matched_position_brl: '40', matched_contribution_brl: '80',
          intra_client_position_brl: '0', inter_client_position_brl: '40', remitted_out_brl: '0', remitted_in_brl: '0',
          flow_segments: [{
            closing_day: 0, out_order_id: 'out-1', in_order_id: 'in-1', value_brl: '40',
            matching_origin: 'INTER_CLIENTE', meaning: 'ILLUSTRATIVE_AGGREGATE_DECOMPOSITION',
          }],
        },
        end_state: {
          open_out_brl: '60', open_in_brl: '0', matched_position_accumulated_brl: '40',
          measured_matched_contribution_accumulated_brl: '80', remitted_out_accumulated_brl: '0', remitted_in_accumulated_brl: '0',
        },
      },
      {
        day: 1, events: [], closing: null,
        end_state: {
          open_out_brl: '60', open_in_brl: '0', matched_position_accumulated_brl: '40',
          measured_matched_contribution_accumulated_brl: '80', remitted_out_accumulated_brl: '0', remitted_in_accumulated_brl: '0',
        },
      },
      {
        day: 2,
        events: [{ kind: 'ALLOCATION', order_id: 'out-1', direction: 'OUT', value_brl: '60', allocation_type: 'REMETIDO', matching_origin: null, sequence: 0 }],
        closing: {
          triggers: ['DEADLINE', 'HORIZON_END'],
          gross_out_brl: '60', gross_in_brl: '0', matched_position_brl: '0', matched_contribution_brl: '0',
          intra_client_position_brl: '0', inter_client_position_brl: '0', remitted_out_brl: '60', remitted_in_brl: '0', flow_segments: [],
        },
        end_state: {
          open_out_brl: '0', open_in_brl: '0', matched_position_accumulated_brl: '40',
          measured_matched_contribution_accumulated_brl: '80', remitted_out_accumulated_brl: '60', remitted_in_accumulated_brl: '0',
        },
      },
    ],
    totals: {
      execution_matched_position_brl: '40', execution_remitted_out_brl: '60', execution_remitted_in_brl: '0',
      measured_gross_brl: '140', measured_matched_contribution_brl: '80', measured_autonetting_contribution_brl: '0',
      measured_multilateral_contribution_brl: '80', measured_remitted_brl: '60', netability_fraction: '0.5714285714285714285714285714',
    },
  };
}

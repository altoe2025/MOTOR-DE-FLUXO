import { periodCovering } from '../levers/leverScenario';
import { createStudy } from '../study/domain';
import { fingerprintPortfolioSource, fingerprintScenarioInput } from '../study/fingerprints';
import type {
  DeepMutable,
  DiagnosticEnvelope,
  DiagnosticExecutionRecord,
  DiagnosticRequest,
  OrderFieldProvenance,
  ScenarioDocument,
  StudyDocument,
} from '../study/model';

export type PortfolioPerformanceOptions = Readonly<{
  currentResultCount?: 0 | 63 | 255;
  ownerSub?: string;
}>;

const RECORDED_AT = '2026-09-23T12:00:00Z';

// Fixed-input synthetic publication kept inside this E2E-only module. The Docker
// context excludes communication/testFixtures.ts and contracts/fixtures/**.
const recordedSource = {
  "request": {
    "api_version": "1.0.0",
    "request_id": "10000000-0000-4000-8000-000000000001",
    "idempotency_key": "20000000-0000-4000-8000-000000000001",
    "study_id": "00000000-0000-4000-8000-000000000002",
    "scenario_id": "00000000-0000-4000-8000-000000000003",
    "scenario_revision": 1,
    "input_fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "sampling": {
      "kind": "FIXED_INPUT",
      "count": 1,
      "preview_request": {
        "api_version": "1.0.0",
        "request_id": "00000000-0000-4000-8000-000000000001",
        "study_id": "00000000-0000-4000-8000-000000000002",
        "scenario_id": "00000000-0000-4000-8000-000000000003",
        "scenario_revision": 1,
        "cenario": {
          "ordens": [
            {
              "id": "out-a",
              "cliente_id": "client-a",
              "direcao": "OUT",
              "valor_brl": "100.01",
              "dia_conhecida": 0,
              "dia_limite": 2,
              "eh_efx": false,
              "finalidade": "ANEXO_V_DISPONIBILIDADE"
            },
            {
              "id": "in-a",
              "cliente_id": "client-a",
              "direcao": "IN",
              "valor_brl": "40.01",
              "dia_conhecida": 0,
              "dia_limite": 2,
              "eh_efx": false,
              "finalidade": "ANEXO_V_DISPONIBILIDADE"
            }
          ],
          "janela_dias": 1,
          "horizonte_dias": 3,
          "custo": {
            "iof_out": "0",
            "iof_in": "0",
            "carry_cnr": "0",
            "spread_rail_bps": "0",
            "custo_fixo_remessa": "0",
            "custo_oportunidade_aa": "0",
            "ptax": "1",
            "iof_por_finalidade": []
          }
        },
        "periodo": {
          "modo": "LEGADO"
        },
        "proveniencia": {
          "/janela_dias": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/horizonte_dias": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/iof_out": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/iof_in": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/carry_cnr": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/spread_rail_bps": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/custo_fixo_remessa": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/custo_oportunidade_aa": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/ptax": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/valor_brl": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/dia_conhecida": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/dia_limite": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/eh_efx": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/finalidade": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/valor_brl": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/dia_conhecida": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/dia_limite": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/eh_efx": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/finalidade": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          }
        }
      }
    },
    "selected_repetition_id": "30000000-0000-4000-8000-000000000001",
    "provenance": {
      "/janela_dias": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/horizonte_dias": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/iof_out": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/iof_in": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/carry_cnr": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/spread_rail_bps": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/custo_fixo_remessa": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/custo_oportunidade_aa": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/custo/ptax": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/0/valor_brl": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/0/dia_conhecida": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/0/dia_limite": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/0/eh_efx": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/0/finalidade": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/1/valor_brl": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/1/dia_conhecida": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/1/dia_limite": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/1/eh_efx": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      },
      "/ordens/1/finalidade": {
        "tipo": "DADO_OBSERVADO",
        "fonte": "fixture manual MOT-71",
        "registrado_em_utc": "2026-09-20T12:00:00Z"
      }
    }
  },
  "envelope": {
    "api_version": "1.0.0",
    "schema_version": "1.0.0",
    "job_id": "20000000-0000-4000-8000-000000000001",
    "request_fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "statistics": {
      "kind": "SINGLE_EXECUTION",
      "count": 1,
      "selected_repetition_id": "30000000-0000-4000-8000-000000000001",
      "percentile_method": null
    },
    "axes": {
      "structural_potential": {
        "gross_out_brl": {
          "state": "AVAILABLE",
          "value": "100.01",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "gross_in_brl": {
          "state": "AVAILABLE",
          "value": "40.01",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "imbalance_brl": {
          "state": "AVAILABLE",
          "value": "60",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "ceiling_brl": {
          "state": "AVAILABLE",
          "value": "80.02",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        }
      },
      "policy_capture": {
        "matched_brl": {
          "state": "AVAILABLE",
          "value": "80.02",
          "evidence": [
            "/selected_execution/result/agregado/volume_casado_periodo_brl"
          ]
        },
        "intra_client_brl": {
          "state": "AVAILABLE",
          "value": "80.02",
          "evidence": [
            "/selected_execution/result/agregado/volume_autonetting_periodo_brl"
          ]
        },
        "inter_client_brl": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/selected_execution/result/agregado/volume_netting_multilateral_periodo_brl"
          ]
        },
        "uncaptured_potential_brl": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/axes/structural_potential/ceiling_brl"
          ]
        },
        "captured_fraction": {
          "state": "AVAILABLE",
          "value": "1",
          "evidence": [
            "/axes/structural_potential/ceiling_brl",
            "/axes/policy_capture/matched_brl"
          ]
        }
      },
      "temporal_compatibility": {
        "deadline_days": {
          "state": "AVAILABLE",
          "value": "2",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "same_day_fraction": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "weighted_wait_days": {
          "state": "AVAILABLE",
          "value": "0.8570204256534780745607770319",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "window_closures": {
          "state": "AVAILABLE",
          "value": "3",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "deadline_closures": {
          "state": "AVAILABLE",
          "value": "1",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "horizon_closures": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        }
      },
      "cross_border_residual": {
        "remitted_brl": {
          "state": "AVAILABLE",
          "value": "60",
          "evidence": [
            "/selected_execution/result/agregado/volume_remetido_periodo_brl"
          ]
        },
        "out_brl": {
          "state": "AVAILABLE",
          "value": "60",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "in_brl": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "by_day": [
          {
            "key": "2",
            "direction": "OUT",
            "value_brl": "60"
          }
        ],
        "by_purpose": [
          {
            "key": "ANEXO_V_DISPONIBILIDADE",
            "direction": "OUT",
            "value_brl": "60"
          }
        ]
      },
      "composition_dependency": {
        "hhi": {
          "state": "AVAILABLE",
          "value": "1",
          "evidence": [
            "/axes/composition_dependency/participants"
          ]
        },
        "largest_share": {
          "state": "AVAILABLE",
          "value": "1",
          "evidence": [
            "/axes/composition_dependency/participants"
          ]
        },
        "participants": [
          {
            "participant_id": "client-a",
            "volume_brl": "140.02",
            "share": "1"
          }
        ]
      },
      "economic_robustness": {
        "baseline_brl": {
          "state": "INSUFFICIENT_COVERAGE",
          "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
          "evidence": [
            "/repetitions"
          ]
        },
        "netted_brl": {
          "state": "INSUFFICIENT_COVERAGE",
          "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
          "evidence": [
            "/repetitions"
          ]
        },
        "savings_brl": {
          "state": "INSUFFICIENT_COVERAGE",
          "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
          "evidence": [
            "/repetitions"
          ]
        },
        "netability_fraction": {
          "state": "INSUFFICIENT_COVERAGE",
          "reason": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
          "evidence": [
            "/repetitions"
          ]
        }
      },
      "operational_profile": {
        "order_count": {
          "state": "AVAILABLE",
          "value": "2",
          "evidence": [
            "/selected_execution/result/agregado/ids_ordens_medidas"
          ]
        },
        "cycle_count": {
          "state": "AVAILABLE",
          "value": "3",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "maximum_open_queue": {
          "state": "AVAILABLE",
          "value": "2",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "due_order_count": {
          "state": "AVAILABLE",
          "value": "1",
          "evidence": [
            "/selected_execution/input_snapshot/cenario/ordens"
          ]
        },
        "weighted_wait_days": {
          "state": "AVAILABLE",
          "value": "0.8570204256534780745607770319",
          "evidence": [
            "/selected_execution/result/agregado/execucao_completa/ciclos"
          ]
        },
        "processing_duration_ms": {
          "state": "AVAILABLE",
          "value": "0",
          "evidence": [
            "/repetitions/selected/duration_ms"
          ]
        }
      }
    },
    "repetitions": [
      {
        "repetition_id": "30000000-0000-4000-8000-000000000001",
        "participant_seeds": {},
        "input_fingerprint": "6a08cd344a9de697093dd6c97cfcc1c81e79c26a5b20e7638d0ae3ae731214e1",
        "execution_fingerprint": "a01a86be8ab898fe982bd66ee256855a3ab93a63099793c4fff795cc6bad4ef8",
        "baseline_brl": "0",
        "netted_brl": "0",
        "savings_brl": "0",
        "netability_fraction": "0.5714897871732609627196114841",
        "duration_ms": 0
      }
    ],
    "selected_execution": {
      "api_version": "1.0.0",
      "presentation_version": "1.0.0",
      "execution_id": "30000000-0000-4000-8000-000000000001",
      "request_id": "00000000-0000-4000-8000-000000000001",
      "study_id": "00000000-0000-4000-8000-000000000002",
      "scenario_id": "00000000-0000-4000-8000-000000000003",
      "scenario_revision": 1,
      "execution_fingerprint": "a01a86be8ab898fe982bd66ee256855a3ab93a63099793c4fff795cc6bad4ef8",
      "provenance_fingerprint": "cc590c58d4daa51469d7326ba68af5933565be6a2fa2e98e7f7f1110c7d513a0",
      "motor_build_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "kind": "PREVIA",
      "statistics": {
        "kind": "SINGLE_EXECUTION",
        "count": 1,
        "seed": null,
        "repetition_id": "30000000-0000-4000-8000-000000000001",
        "percentile_method": null
      },
      "input_snapshot": {
        "cenario": {
          "ordens": [
            {
              "id": "out-a",
              "cliente_id": "client-a",
              "direcao": "OUT",
              "valor_brl": "100.01",
              "dia_conhecida": 0,
              "dia_limite": 2,
              "eh_efx": false,
              "finalidade": "ANEXO_V_DISPONIBILIDADE"
            },
            {
              "id": "in-a",
              "cliente_id": "client-a",
              "direcao": "IN",
              "valor_brl": "40.01",
              "dia_conhecida": 0,
              "dia_limite": 2,
              "eh_efx": false,
              "finalidade": "ANEXO_V_DISPONIBILIDADE"
            }
          ],
          "janela_dias": 1,
          "horizonte_dias": 3,
          "custo": {
            "iof_out": "0",
            "iof_in": "0",
            "carry_cnr": "0",
            "spread_rail_bps": "0",
            "custo_fixo_remessa": "0",
            "custo_oportunidade_aa": "0",
            "ptax": "1",
            "iof_por_finalidade": []
          }
        },
        "periodo": {
          "modo": "LEGADO"
        },
        "proveniencia": {
          "/janela_dias": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/horizonte_dias": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/iof_out": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/iof_in": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/carry_cnr": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/spread_rail_bps": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/custo_fixo_remessa": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/custo_oportunidade_aa": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/custo/ptax": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/valor_brl": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/dia_conhecida": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/dia_limite": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/eh_efx": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/0/finalidade": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/valor_brl": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/dia_conhecida": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/dia_limite": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/eh_efx": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          },
          "/ordens/1/finalidade": {
            "tipo": "DADO_OBSERVADO",
            "fonte": "fixture manual MOT-71",
            "registrado_em_utc": "2026-09-20T12:00:00Z"
          }
        }
      },
      "result": {
        "manifesto": {
          "run_id": "20260923T120000.000000Z-2aa49d1c829c",
          "schema_version": "2.0.0",
          "versao_motor": "desconhecida+bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "criado_em_utc": "2026-09-23T12:00:00.000000Z",
          "hash_configuracao": "2aa49d1c829c8cddca005a95099c688e95e235aa4500affabe83b80f77d35f18",
          "run_ids_origem": [],
          "parametros_custo": {
            "iof_out": "0",
            "iof_in": "0",
            "carry_cnr": "0",
            "spread_rail_bps": "0",
            "custo_fixo_remessa": "0",
            "custo_oportunidade_aa": "0",
            "ptax": "1",
            "iof_por_finalidade": []
          },
          "mixes": [],
          "arquetipos": [],
          "horizonte_dias": 3,
          "periodo_medicao_dias": 4,
          "janela_dias": 1,
          "seeds": [],
          "modo_analise": "AGREGADO",
          "custo_calibrado": false,
          "metodo_percentil": "NAO_APLICAVEL",
          "drenagem": "LEGADO",
          "avisos": []
        },
        "agregado": {
          "execucao_completa": {
            "ciclos": [
              {
                "dia": 0,
                "alocacoes": [
                  {
                    "ordem_id": "out-a",
                    "dia": 0,
                    "valor_brl": "40.01",
                    "tipo": "CASADO",
                    "origem_casamento": "INTRA_CLIENTE"
                  },
                  {
                    "ordem_id": "in-a",
                    "dia": 0,
                    "valor_brl": "40.01",
                    "tipo": "CASADO",
                    "origem_casamento": "INTRA_CLIENTE"
                  }
                ],
                "bruto_out": "100.01",
                "bruto_in": "40.01",
                "casado": "40.01",
                "residuo": "0",
                "direcao_residuo": "OUT"
              },
              {
                "dia": 1,
                "alocacoes": [],
                "bruto_out": "60.00",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "0",
                "direcao_residuo": "OUT"
              },
              {
                "dia": 2,
                "alocacoes": [
                  {
                    "ordem_id": "out-a",
                    "dia": 2,
                    "valor_brl": "60.00",
                    "tipo": "REMETIDO",
                    "origem_casamento": null
                  }
                ],
                "bruto_out": "60.00",
                "bruto_in": "0",
                "casado": "0",
                "residuo": "60.00",
                "direcao_residuo": "OUT"
              }
            ],
            "baseline": {
              "iof": "0.00",
              "carry": "0",
              "spread": "0.00",
              "espera": "0",
              "fixo": "0",
              "total": "0.00"
            },
            "netado": {
              "iof": "0.00",
              "carry": "0.00",
              "spread": "0.00",
              "espera": "0",
              "fixo": "0",
              "total": "0.00"
            },
            "economia": "0.00",
            "volume_casado_brl": "80.02",
            "volume_autonetting_brl": "80.02",
            "volume_netting_multilateral_brl": "0",
            "taxa_netabilidade": "0.5714897871732609627196114841",
            "taxa_autonetting": "0.5714897871732609627196114841",
            "taxa_netting_multilateral": "0.0000000000000000000000000000"
          },
          "ids_ordens_medidas": [
            "in-a",
            "out-a"
          ],
          "volume_bruto_periodo_brl": "140.02",
          "volume_casado_periodo_brl": "80.02",
          "volume_autonetting_periodo_brl": "80.02",
          "volume_netting_multilateral_periodo_brl": "0",
          "volume_remetido_periodo_brl": "60.00",
          "baseline_periodo": {
            "iof": "0.00",
            "carry": "0",
            "spread": "0.00",
            "espera": "0",
            "fixo": "0",
            "total": "0.00"
          },
          "netado_periodo": {
            "iof": "0.00",
            "carry": "0.00",
            "spread": "0.00",
            "espera": "0",
            "fixo": "0",
            "total": "0.00"
          },
          "economia_periodo_brl": "0.00",
          "taxa_netabilidade_periodo": "0.5714897871732609627196114841",
          "taxa_autonetting_periodo": "0.5714897871732609627196114841",
          "taxa_netting_multilateral_periodo": "0.0000000000000000000000000000",
          "mecanismos": [
            {
              "destino": "INTRA_CLIENTE",
              "volume_brl": "80.02",
              "baseline_atribuido_brl": "0",
              "custo_netado_brl": "0.00",
              "economia_brl": "0.00"
            },
            {
              "destino": "INTER_CLIENTE",
              "volume_brl": "0",
              "baseline_atribuido_brl": "0",
              "custo_netado_brl": "0",
              "economia_brl": "0"
            },
            {
              "destino": "REMETIDO",
              "volume_brl": "60.00",
              "baseline_atribuido_brl": "0.00",
              "custo_netado_brl": "0.00",
              "economia_brl": "0.00"
            }
          ]
        },
        "clientes": [],
        "ledger_eventos": [],
        "contribuicoes_marginais": [],
        "diagnosticos_experimentais": {},
        "avisos": []
      },
      "presentation": {
        "currency": "BRL",
        "locale": "pt-BR",
        "rounding": "HALF_UP",
        "money_digits": 2,
        "fraction_percent_digits": 2
      }
    },
    "consequences": [
      {
        "rule_id": "cross-border-residual-positive",
        "rule_version": "1.0.0",
        "axis": "CROSS_BORDER_RESIDUAL",
        "statement_code": "RESIDUO_TRANSFRONTEIRICO",
        "evidence_refs": [
          "/axes/cross_border_residual/remitted_brl"
        ]
      }
    ],
    "limitations": [
      {
        "code": "FIXED_INPUT_NO_DISTRIBUTION",
        "severity": "INFO",
        "condition": "FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION",
        "evidence_refs": [
          "/axes/economic_robustness/baseline_brl"
        ]
      },
      {
        "code": "GENERATOR_RECIPE_ABSENT",
        "severity": "WARNING",
        "condition": "GENERATOR_RECIPE_NOT_AVAILABLE",
        "evidence_refs": [
          "/axes/structural_potential/gross_out_brl"
        ]
      }
    ],
    "provenance": {
      "request_paths": {
        "/janela_dias": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/horizonte_dias": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/iof_out": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/iof_in": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/carry_cnr": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/spread_rail_bps": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/custo_fixo_remessa": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/custo_oportunidade_aa": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/custo/ptax": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/0/valor_brl": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/0/dia_conhecida": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/0/dia_limite": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/0/eh_efx": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/0/finalidade": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/1/valor_brl": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/1/dia_conhecida": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/1/dia_limite": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/1/eh_efx": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        },
        "/ordens/1/finalidade": {
          "tipo": "DADO_OBSERVADO",
          "fonte": "fixture manual MOT-71",
          "registrado_em_utc": "2026-09-20T12:00:00Z"
        }
      },
      "evidence_refs": [
        "/custo/carry_cnr",
        "/custo/custo_fixo_remessa",
        "/custo/custo_oportunidade_aa",
        "/custo/iof_in",
        "/custo/iof_out",
        "/custo/ptax",
        "/custo/spread_rail_bps",
        "/horizonte_dias",
        "/janela_dias",
        "/ordens/0/dia_conhecida",
        "/ordens/0/dia_limite",
        "/ordens/0/eh_efx",
        "/ordens/0/finalidade",
        "/ordens/0/valor_brl",
        "/ordens/1/dia_conhecida",
        "/ordens/1/dia_limite",
        "/ordens/1/eh_efx",
        "/ordens/1/finalidade",
        "/ordens/1/valor_brl"
      ]
    }
  }
} as unknown as Readonly<{ request: DiagnosticRequest; envelope: DiagnosticEnvelope }>;

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

async function observedTemplate(): Promise<Readonly<{ study: StudyDocument; execution: DiagnosticExecutionRecord }>> {
  const request = structuredClone(recordedSource.request) as DeepMutable<DiagnosticRequest>;
  if (request.sampling.kind !== 'FIXED_INPUT') throw new Error('Fixed input fixture expected.');
  const preview = request.sampling.preview_request;
  const study = await createStudy({ id: request.study_id, ownerSub: 'owner-fixture', name: 'Fixture observada', now: RECORDED_AT,
    baseScenario: { id: request.scenario_id, revision: 1, name: 'Caso observado',
      sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-fixture', caseRevision: 1 }, capturedAt: RECORDED_AT,
        orders: preview.cenario.ordens, provenance: [{ kind: 'OBSERVED', source: 'Fixture manual', version: '1', recordedAt: RECORDED_AT }],
        observedOutcome: null, sourceFingerprint: '' },
      premises: { costs: preview.cenario.custo, windowDays: preview.cenario.janela_dias },
      period: { httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: preview.cenario.horizonte_dias },
    } });
  const scenario = study.scenarios[0]!;
  request.input_fingerprint = scenario.inputFingerprint;
  const envelope = structuredClone(recordedSource.envelope) as DeepMutable<DiagnosticEnvelope>;
  envelope.request_fingerprint = scenario.inputFingerprint;
  const execution: DeepMutable<DiagnosticExecutionRecord> = {
    kind: 'DIAGNOSTIC', id: '40000000-0000-4000-8000-000000000001', attemptId: '50000000-0000-4000-8000-000000000001',
    scenarioId: scenario.id, scenarioRevision: 1, inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: request, sourceSnapshot: structuredClone(scenario.sourceSnapshot) as DeepMutable<typeof scenario.sourceSnapshot>,
    premisesSnapshot: structuredClone(scenario.premises) as DeepMutable<typeof scenario.premises>, periodSnapshot: structuredClone(scenario.period),
    status: 'SUCCEEDED', jobId: request.idempotency_key, envelope, error: null, createdAt: RECORDED_AT, finishedAt: RECORDED_AT,
  };
  return { study, execution };
}

function companyId(index: number): string {
  return `company-${String(index + 1).padStart(2, '0')}`;
}

function companyName(index: number): string {
  return `Empresa ${String(index + 1).padStart(2, '0')}`;
}

function masksFor(companyCount: number): number[] {
  return Array.from({ length: (1 << companyCount) - 1 }, (_, index) => index + 1);
}

function companiesForMask(companyCount: number, mask: number): string[] {
  return Array.from({ length: companyCount }, (_, index) => index)
    .filter((index) => (mask & (1 << index)) !== 0)
    .map(companyId);
}

function ordersForMask(
  companyCount: number,
  mask: number,
  allOrders: readonly StudyDocument['scenarios'][number]['sourceSnapshot']['orders'][number][],
) {
  const included = new Set(companiesForMask(companyCount, mask));
  return allOrders.filter((order) => included.has(order.cliente_id));
}

async function scenarioForComposition(
  base: ScenarioDocument,
  companyCount: number,
  mask: number,
): Promise<ScenarioDocument> {
  const orders = ordersForMask(companyCount, mask, base.sourceSnapshot.orders);
  const orderIds = new Set(orders.map((order) => order.id));
  const source = base.sourceSnapshot.source;
  if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') {
    throw new Error('Performance fixture requires an explicit authored portfolio.');
  }
  const sourceSnapshot = structuredClone(base.sourceSnapshot) as DeepMutable<typeof base.sourceSnapshot>;
  sourceSnapshot.orders = structuredClone(orders);
  sourceSnapshot.provenanceByOrder = Object.fromEntries(
    Object.entries(base.sourceSnapshot.provenanceByOrder ?? {}).filter(([id]) => orderIds.has(id))
      .map(([id, value]) => [id, structuredClone(value)]),
  ) as DeepMutable<NonNullable<typeof base.sourceSnapshot.provenanceByOrder>>;
  if (sourceSnapshot.source.kind !== 'AUTHORED' || sourceSnapshot.source.definition?.kind !== 'EXPLICIT_ORDERS') {
    throw new Error('Authored portfolio definition is missing.');
  }
  sourceSnapshot.source.definition.orders = structuredClone(orders);
  sourceSnapshot.source.definition.companyByOrder = Object.fromEntries(
    Object.entries(source.definition.companyByOrder ?? {}).filter(([id]) => orderIds.has(id)),
  );
  sourceSnapshot.source.definition.provenanceByOrder = Object.fromEntries(
    Object.entries(source.definition.provenanceByOrder).filter(([id]) => orderIds.has(id)),
  ) as Record<string, DeepMutable<OrderFieldProvenance>>;
  sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(sourceSnapshot);

  const id = mask === (1 << companyCount) - 1 ? base.id : uuid(100 + mask);
  const draft = {
    ...structuredClone(base),
    id,
    name: mask === (1 << companyCount) - 1
      ? 'Todas as empresas juntas'
      : companiesForMask(companyCount, mask).map((company) => companyName(Number(company.slice(-2)) - 1)).join(' + '),
    sourceSnapshot,
    period: periodCovering(base.period, Math.max(...orders.map((order) => order.dia_limite)) + 1),
  } as DeepMutable<ScenarioDocument>;
  draft.inputFingerprint = await fingerprintScenarioInput(draft);
  return draft;
}

function executionForScenario(
  template: DiagnosticExecutionRecord,
  studyId: string,
  scenario: ScenarioDocument,
  companyCount: number,
  mask: number,
): DiagnosticExecutionRecord {
  const execution = structuredClone(template) as DeepMutable<DiagnosticExecutionRecord>;
  const source = execution.envelope!.selected_execution;
  const orders = ordersForMask(companyCount, mask, scenario.sourceSnapshot.orders);
  const orderIds = orders.map((order) => order.id);
  const volume = String(orders.length * 100);
  const savings = String(mask);
  const baselineTotal = '1000';
  const nettedTotal = String(1000 - mask);
  const baseline = { iof: baselineTotal, carry: '0', spread: '0', espera: '0', fixo: '0', total: baselineTotal };
  const netted = { ...baseline, iof: nettedTotal, total: nettedTotal };

  execution.id = uuid(1000 + mask);
  execution.attemptId = uuid(2000 + mask);
  execution.scenarioId = scenario.id;
  execution.scenarioRevision = scenario.revision;
  execution.inputFingerprint = scenario.inputFingerprint;
  execution.sourceSnapshot = structuredClone(scenario.sourceSnapshot) as DeepMutable<DiagnosticExecutionRecord>['sourceSnapshot'];
  execution.premisesSnapshot = structuredClone(scenario.premises) as DeepMutable<DiagnosticExecutionRecord>['premisesSnapshot'];
  execution.periodSnapshot = structuredClone(scenario.period) as DeepMutable<DiagnosticExecutionRecord>['periodSnapshot'];
  execution.createdAt = RECORDED_AT;
  execution.finishedAt = RECORDED_AT;
  execution.jobId = uuid(3000 + mask);
  execution.requestSnapshot.idempotency_key = execution.jobId;
  execution.requestSnapshot.request_id = uuid(4000 + mask);
  execution.requestSnapshot.study_id = studyId;
  execution.requestSnapshot.scenario_id = scenario.id;
  execution.requestSnapshot.scenario_revision = scenario.revision;
  execution.requestSnapshot.input_fingerprint = scenario.inputFingerprint;
  if (execution.requestSnapshot.sampling.kind !== 'FIXED_INPUT') {
    throw new Error('Performance fixture requires a fixed-input diagnostic.');
  }
  execution.requestSnapshot.sampling.preview_request.study_id = studyId;
  execution.requestSnapshot.sampling.preview_request.scenario_id = scenario.id;
  execution.requestSnapshot.sampling.preview_request.cenario.ordens = structuredClone(orders);

  execution.envelope!.job_id = execution.jobId;
  execution.envelope!.request_fingerprint = scenario.inputFingerprint;
  source.execution_id = execution.id;
  source.request_id = execution.requestSnapshot.request_id;
  source.study_id = studyId;
  source.scenario_id = scenario.id;
  source.scenario_revision = scenario.revision;
  source.input_snapshot.cenario.ordens = structuredClone(orders);
  const aggregate = source.result.agregado;
  aggregate.ids_ordens_medidas = orderIds;
  aggregate.volume_bruto_periodo_brl = volume;
  aggregate.economia_periodo_brl = savings;
  aggregate.baseline_periodo = baseline;
  aggregate.netado_periodo = netted;
  aggregate.volume_casado_periodo_brl = '0';
  aggregate.taxa_netabilidade_periodo = '0';
  aggregate.execucao_completa.ciclos = [{
    ...aggregate.execucao_completa.ciclos[0]!,
    alocacoes: orders.map((order) => ({
      ordem_id: order.id,
      dia: order.dia_conhecida + 1,
      valor_brl: order.valor_brl,
      tipo: 'REMETIDO' as const,
      origem_casamento: null,
    })),
  }];
  execution.status = 'SUCCEEDED';
  return execution;
}

function reservationFor(terminal: DiagnosticExecutionRecord, mask: number): DiagnosticExecutionRecord {
  const reservation = structuredClone(terminal) as DeepMutable<DiagnosticExecutionRecord>;
  reservation.id = uuid(6000 + mask);
  reservation.status = 'QUEUED';
  reservation.envelope = null;
  reservation.finishedAt = null;
  return reservation;
}

/**
 * Builds current, deterministic portfolio diagnostics without network access.
 * Six and eight companies produce the application's 63 and 255 nonempty subsets.
 */
export async function makePortfolioStudy(
  companyCount: 6 | 8,
  options: PortfolioPerformanceOptions = {},
): Promise<StudyDocument> {
  const expectedCount = (1 << companyCount) - 1;
  const currentResultCount = options.currentResultCount ?? expectedCount;
  if (currentResultCount !== 0 && currentResultCount !== expectedCount) {
    throw new Error(`Expected 0 or ${expectedCount} current results for ${companyCount} companies.`);
  }

  const observed = await observedTemplate();
  const original = observed.study.scenarios[0]!;
  const provenance = original.sourceSnapshot.provenance[0]!;
  const orders = Array.from({ length: companyCount }, (_, index) => {
    const template = original.sourceSnapshot.orders[index % original.sourceSnapshot.orders.length]!;
    return {
      ...structuredClone(template),
      id: `order-${companyId(index)}`,
      cliente_id: companyId(index),
      valor_brl: '100',
      dia_conhecida: 0,
      dia_limite: 1,
    };
  });
  const provenanceByOrder = Object.fromEntries(orders.map((order) => [order.id, {
    cliente_id: provenance,
    dia_conhecida: provenance,
    dia_limite: provenance,
    valor_brl: provenance,
    finalidade: provenance,
    eh_efx: provenance,
  }])) as DeepMutable<typeof baseSnapshot.provenanceByOrder>;
  const companyByOrder = Object.fromEntries(orders.map((order, index) => [order.id, {
    companyId: companyId(index),
    companyName: companyName(index),
  }]));
  const baseSnapshot = structuredClone(original.sourceSnapshot) as DeepMutable<typeof original.sourceSnapshot>;
  baseSnapshot.source = {
    kind: 'AUTHORED',
    authoredPortfolioId: uuid(5001),
    definition: { kind: 'EXPLICIT_ORDERS', orders, companyByOrder, provenanceByOrder },
  } as DeepMutable<typeof baseSnapshot.source>;
  baseSnapshot.orders = orders;
  baseSnapshot.provenanceByOrder = provenanceByOrder as NonNullable<DeepMutable<typeof baseSnapshot.provenanceByOrder>>;

  const studyId = uuid(5000);
  const study = await createStudy({
    id: studyId,
    ownerSub: options.ownerSub ?? observed.study.ownerSub,
    name: `${companyCount}-company performance fixture`,
    now: RECORDED_AT,
    studyType: 'PORTFOLIO_COMBINATIONS',
    baseScenario: {
      ...structuredClone(original),
      id: uuid(5002),
      revision: 1,
      name: 'Todas as empresas juntas',
      sourceSnapshot: baseSnapshot,
    },
  });
  const base = study.scenarios[0]!;
  const masks = masksFor(companyCount);
  const compositions = [
    { mask: expectedCount, scenario: base },
    ...await Promise.all(masks.slice(0, -1).map(async (mask) => ({
      mask,
      scenario: await scenarioForComposition(base, companyCount, mask),
    }))),
  ];
  const executions = compositions.slice(0, currentResultCount).flatMap(({ mask, scenario }) => {
    const terminal = executionForScenario(observed.execution, studyId, scenario, companyCount, mask);
    return [reservationFor(terminal, mask), terminal];
  });
  return {
    ...structuredClone(study),
    scenarios: compositions.map(({ scenario }) => scenario),
    executions,
  };
}

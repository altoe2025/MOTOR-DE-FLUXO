export interface paths {
    "/api/v1/catalogos/importacao": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Import Catalog Schema */
        get: operations["import_catalog_schema_api_v1_catalogos_importacao_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/diagnosticos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Diagnostic Schema */
        post: operations["diagnostic_schema_api_v1_diagnosticos_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/diagnosticos/{job_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Diagnostic Job Schema */
        get: operations["diagnostic_job_schema_api_v1_diagnosticos__job_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/diagnosticos/{job_id}/cancelamentos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Diagnostic Cancellation Schema */
        post: operations["diagnostic_cancellation_schema_api_v1_diagnosticos__job_id__cancelamentos_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/diagnosticos/{job_id}/resultado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Diagnostic Result Schema */
        get: operations["diagnostic_result_schema_api_v1_diagnosticos__job_id__resultado_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/diagnosticos/{job_id}/retries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Diagnostic Retry Schema */
        post: operations["diagnostic_retry_schema_api_v1_diagnosticos__job_id__retries_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/examples/reference": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reference Example Schema */
        get: operations["reference_example_schema_api_v1_examples_reference_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health Schema */
        get: operations["health_schema_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/preparacoes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preparation */
        post: operations["preparation_api_v1_preparacoes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/previas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Schema */
        post: operations["preview_schema_api_v1_previas_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/replays": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Replay Schema */
        post: operations["replay_schema_api_v1_replays_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Session Schema */
        get: operations["session_schema_api_v1_session_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AgregadoDTO */
        AgregadoDTO: {
            baseline_periodo: components["schemas"]["CustosDTO"];
            /** Economia Periodo Brl */
            economia_periodo_brl: string;
            execucao_completa: components["schemas"]["ResultadoLegadoDTO"];
            /** Ids Ordens Medidas */
            ids_ordens_medidas: string[];
            /** Mecanismos */
            mecanismos: components["schemas"]["ResultadoMecanismoDTO"][];
            netado_periodo: components["schemas"]["CustosDTO"];
            /** Taxa Autonetting Periodo */
            taxa_autonetting_periodo: string;
            /** Taxa Netabilidade Periodo */
            taxa_netabilidade_periodo: string;
            /** Taxa Netting Multilateral Periodo */
            taxa_netting_multilateral_periodo: string;
            /** Volume Autonetting Periodo Brl */
            volume_autonetting_periodo_brl: string;
            /** Volume Bruto Periodo Brl */
            volume_bruto_periodo_brl: string;
            /** Volume Casado Periodo Brl */
            volume_casado_periodo_brl: string;
            /** Volume Netting Multilateral Periodo Brl */
            volume_netting_multilateral_periodo_brl: string;
            /** Volume Remetido Periodo Brl */
            volume_remetido_periodo_brl: string;
        };
        /** AliquotaFinalidade */
        AliquotaFinalidade: {
            /** Aliquota */
            aliquota: string;
            /**
             * Direcao
             * @enum {string}
             */
            direcao: "OUT" | "IN";
        };
        /** AllocationEventV1 */
        AllocationEventV1: {
            /**
             * Allocation Type
             * @enum {string}
             */
            allocation_type: "CASADO" | "REMETIDO";
            /**
             * Direction
             * @enum {string}
             */
            direction: "OUT" | "IN";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "ALLOCATION";
            /** Matching Origin */
            matching_origin: ("INTRA_CLIENTE" | "INTER_CLIENTE") | null;
            /** Order Id */
            order_id: string;
            /** Sequence */
            sequence: number;
            /** Value Brl */
            value_brl: string;
        };
        /** AlocacaoDTO */
        AlocacaoDTO: {
            /** Dia */
            dia: number;
            /** Ordem Id */
            ordem_id: string;
            /** Origem Casamento */
            origem_casamento: ("INTRA_CLIENTE" | "INTER_CLIENTE") | null;
            /**
             * Tipo
             * @enum {string}
             */
            tipo: "CASADO" | "REMETIDO";
            /** Valor Brl */
            valor_brl: string;
        };
        /** AvailableEvidenceMetric[Annotated[str, FieldInfo(annotation=NoneType, required=True, metadata=[Strict(strict=True), MinLen(min_length=1), MaxLen(max_length=80), _PydanticGeneralMetadata(pattern='^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$')])]] */
        "AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________": {
            /** Evidence */
            evidence: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "AVAILABLE";
            /** Value */
            value: string;
        };
        /** AvailableEvidenceMetric[DistributionSummary] */
        AvailableEvidenceMetric_DistributionSummary_: {
            /** Evidence */
            evidence: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "AVAILABLE";
            value: components["schemas"]["DistributionSummary"];
        };
        /** CatalogoImportacao */
        CatalogoImportacao: {
            /** Catalog Version */
            catalog_version: string;
            /**
             * Custos Calibrados
             * @constant
             */
            custos_calibrados: false;
            custos_origem: components["schemas"]["OrigemCatalogo"];
            custos_padrao: components["schemas"]["CustoPadraoCatalogo"];
            /** Finalidades */
            finalidades: components["schemas"]["FinalidadeCatalogo"][];
            /**
             * Publicado Em Utc
             * Format: date-time
             */
            publicado_em_utc: string;
            /**
             * Schema Version
             * @constant
             */
            schema_version: "1.0.0";
            /**
             * Status
             * @enum {string}
             */
            status: "CONFIGURADO" | "NAO_CONFIGURADO";
        };
        /** CenarioEntrada */
        CenarioEntrada: {
            custo: components["schemas"]["CustoEntrada"];
            /** Horizonte Dias */
            horizonte_dias: number;
            /** Janela Dias */
            janela_dias: number;
            /**
             * Ordens
             * @description Operações explícitas que não devem ser pré-netadas; OUT e IN do mesmo cliente permanecem entradas distintas para a política P0.
             */
            ordens: components["schemas"]["OrdemEntrada"][];
        };
        /** CicloDTO */
        CicloDTO: {
            /** Alocacoes */
            alocacoes: components["schemas"]["AlocacaoDTO"][];
            /** Bruto In */
            bruto_in: string;
            /** Bruto Out */
            bruto_out: string;
            /** Casado */
            casado: string;
            /** Dia */
            dia: number;
            /**
             * Direcao Residuo
             * @enum {string}
             */
            direcao_residuo: "OUT" | "IN";
            /** Residuo */
            residuo: string;
        };
        /** CompositionDependencyAxis */
        CompositionDependencyAxis: {
            /** Hhi */
            hhi: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Largest Share */
            largest_share: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Participants */
            participants: components["schemas"]["ParticipantShare"][];
        };
        /** CrossBorderResidualAxis */
        CrossBorderResidualAxis: {
            /** By Day */
            by_day: components["schemas"]["ResidualBreakdown"][];
            /** By Purpose */
            by_purpose: components["schemas"]["ResidualBreakdown"][];
            /** In Brl */
            in_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Out Brl */
            out_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Remitted Brl */
            remitted_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /** CustoEntrada */
        CustoEntrada: {
            /** Carry Cnr */
            carry_cnr: string;
            /** Custo Fixo Remessa */
            custo_fixo_remessa: string;
            /** Custo Oportunidade Aa */
            custo_oportunidade_aa: string;
            /** Iof In */
            iof_in: string;
            /** Iof Out */
            iof_out: string;
            /** Iof Por Finalidade */
            iof_por_finalidade: components["schemas"]["RegraIOF"][];
            /** Ptax */
            ptax: string;
            /** Spread Rail Bps */
            spread_rail_bps: string;
        };
        /** CustoPadraoCatalogo */
        CustoPadraoCatalogo: {
            /** Carry Cnr */
            carry_cnr: string;
            /** Custo Fixo Remessa */
            custo_fixo_remessa: string;
            /** Custo Oportunidade Aa */
            custo_oportunidade_aa: string;
            /** Iof In */
            iof_in: string;
            /** Iof Out */
            iof_out: string;
            /** Iof Por Finalidade */
            iof_por_finalidade: components["schemas"]["RegraIOFCatalogo"][];
            /** Ptax */
            ptax: string;
            /** Spread Rail Bps */
            spread_rail_bps: string;
        };
        /** CustosDTO */
        CustosDTO: {
            /** Carry */
            carry: string;
            /** Espera */
            espera: string;
            /** Fixo */
            fixo: string;
            /** Iof */
            iof: string;
            /** Spread */
            spread: string;
            /** Total */
            total: string;
        };
        /** DerivedEvidence */
        DerivedEvidence: {
            /** Inputs */
            inputs: string[];
            /**
             * Rule
             * @enum {string}
             */
            rule: "dimensionamento-v1" | "geracao-v1" | "soma-ordens-v1";
        };
        /** DiagnosticAxes */
        DiagnosticAxes: {
            composition_dependency: components["schemas"]["CompositionDependencyAxis"];
            cross_border_residual: components["schemas"]["CrossBorderResidualAxis"];
            economic_robustness: components["schemas"]["EconomicRobustnessAxis"];
            operational_profile: components["schemas"]["OperationalProfileAxis"];
            policy_capture: components["schemas"]["PolicyCaptureAxis"];
            structural_potential: components["schemas"]["StructuralPotentialAxis"];
            temporal_compatibility: components["schemas"]["TemporalCompatibilityAxis"];
        };
        /** DiagnosticConsequence */
        DiagnosticConsequence: {
            /**
             * Axis
             * @enum {string}
             */
            axis: "STRUCTURAL_POTENTIAL" | "POLICY_CAPTURE" | "TEMPORAL_COMPATIBILITY" | "CROSS_BORDER_RESIDUAL" | "COMPOSITION_DEPENDENCY" | "ECONOMIC_ROBUSTNESS" | "OPERATIONAL_PROFILE";
            /** Evidence Refs */
            evidence_refs: string[];
            /** Rule Id */
            rule_id: string;
            /**
             * Rule Version
             * @constant
             */
            rule_version: "1.0.0";
            /** Statement Code */
            statement_code: string;
        };
        /** DiagnosticEnvelope */
        DiagnosticEnvelope: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            axes: components["schemas"]["DiagnosticAxes"];
            /** Consequences */
            consequences: components["schemas"]["DiagnosticConsequence"][];
            /**
             * Job Id
             * Format: uuid
             */
            job_id: string;
            /** Limitations */
            limitations: components["schemas"]["DiagnosticLimitation"][];
            provenance: components["schemas"]["DiagnosticProvenance"];
            /** Repetitions */
            repetitions: components["schemas"]["RepetitionSummary"][];
            /** Request Fingerprint */
            request_fingerprint: string;
            /**
             * Schema Version
             * @constant
             */
            schema_version: "1.0.0";
            selected_execution: components["schemas"]["PreviewEnvelope"];
            /** Statistics */
            statistics: components["schemas"]["SingleExecutionStatistics"] | components["schemas"]["DistributionStatistics"];
        };
        /** DiagnosticLimitation */
        DiagnosticLimitation: {
            /** Code */
            code: string;
            /** Condition */
            condition: string;
            /** Evidence Refs */
            evidence_refs: string[];
            /**
             * Severity
             * @enum {string}
             */
            severity: "INFO" | "WARNING";
        };
        /** DiagnosticProvenance */
        DiagnosticProvenance: {
            /** Evidence Refs */
            evidence_refs: string[];
            /** Request Paths */
            request_paths: {
                [key: string]: components["schemas"]["OrigemValor"];
            };
        };
        /** DiagnosticRequest */
        DiagnosticRequest: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            /**
             * Idempotency Key
             * Format: uuid
             */
            idempotency_key: string;
            /** Input Fingerprint */
            input_fingerprint: string;
            /** Provenance */
            provenance: {
                [key: string]: components["schemas"]["OrigemValor"];
            };
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            /** Sampling */
            sampling: components["schemas"]["FixedInputPlan"] | components["schemas"]["GeneratedInputPlan"];
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            /**
             * Selected Repetition Id
             * Format: uuid
             */
            selected_repetition_id: string;
            /**
             * Study Id
             * Format: uuid
             */
            study_id: string;
        };
        /** DiagnosticRetryRequest */
        DiagnosticRetryRequest: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            /**
             * Idempotency Key
             * Format: uuid
             */
            idempotency_key: string;
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
        };
        /** DiagnosticosExperimentaisDTO */
        DiagnosticosExperimentaisDTO: Record<string, never>;
        /** DistributionStatistics */
        DistributionStatistics: {
            /**
             * Count
             * @enum {integer}
             */
            count: 10 | 30 | 100;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "DISTRIBUTION";
            /**
             * Percentile Method
             * @constant
             */
            percentile_method: "EMPIRICAL_NEAREST_RANK";
            /**
             * Selected Repetition Id
             * Format: uuid
             */
            selected_repetition_id: string;
        };
        /** DistributionSummary */
        DistributionSummary: {
            /** Amplitude */
            amplitude: string;
            /** Maximum */
            maximum: string;
            /** Minimum */
            minimum: string;
            /** P10 */
            p10: string;
            /** P25 */
            p25: string;
            /** P50 */
            p50: string;
            /** P75 */
            p75: string;
            /** P90 */
            p90: string;
        };
        /** EconomicRobustnessAxis */
        EconomicRobustnessAxis: {
            /** Baseline Brl */
            baseline_brl: components["schemas"]["AvailableEvidenceMetric_DistributionSummary_"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Netability Fraction */
            netability_fraction: components["schemas"]["AvailableEvidenceMetric_DistributionSummary_"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Netted Brl */
            netted_brl: components["schemas"]["AvailableEvidenceMetric_DistributionSummary_"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Savings Brl */
            savings_brl: components["schemas"]["AvailableEvidenceMetric_DistributionSummary_"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /** EffectiveInput */
        EffectiveInput: {
            costs: components["schemas"]["CustoEntrada"];
            /** Measurement Days */
            measurement_days: number;
            /** Participants */
            participants: components["schemas"]["EffectiveParticipant"][];
            /** Sources */
            sources: {
                [key: string]: components["schemas"]["EffectiveSource"];
            };
            /** Warmup Days */
            warmup_days: number;
            /** Window Days */
            window_days: number;
        };
        /** EffectiveParticipant */
        EffectiveParticipant: {
            /** Deadline */
            deadline: components["schemas"]["ProfileDeadline"] | components["schemas"]["FixedDeadline"];
            /** Eh Efx */
            eh_efx: boolean;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Monthly Volume Brl */
            monthly_volume_brl: string;
            /** Out Fraction */
            out_fraction: string;
            /**
             * Profile
             * @enum {string}
             */
            profile: "remessa_outbound_massiva" | "psp_inbound" | "cripto_native_sem_fiat" | "payroll_fornecedor" | "exportador" | "tesouraria_corporativa";
            /** Purpose In */
            purpose_in: string;
            /** Purpose Out */
            purpose_out: string;
            /** Seed */
            seed: string;
            /** Ticket Median Brl */
            ticket_median_brl: string;
        };
        /** EffectiveSource */
        EffectiveSource: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "PADRAO_SINTETICO" | "ESTIMATIVA_USUARIO";
            /**
             * Recorded At
             * Format: date-time
             */
            recorded_at: string;
            /** Source */
            source: string;
        };
        /** EstatisticaPrevia */
        EstatisticaPrevia: {
            /**
             * Count
             * @constant
             */
            count: 1;
            /**
             * Kind
             * @constant
             */
            kind: "SINGLE_EXECUTION";
            /** Percentile Method */
            percentile_method: null;
            /**
             * Repetition Id
             * Format: uuid
             */
            repetition_id: string;
            /** Seed */
            seed: null;
        };
        /** FinalidadeCatalogo */
        FinalidadeCatalogo: {
            /** Aliquotas */
            aliquotas: components["schemas"]["AliquotaFinalidade"][];
            /** Codigo */
            codigo: string;
            /** Descricao */
            descricao: string;
        };
        /** FixedDeadline */
        FixedDeadline: {
            /** Days */
            days: number;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "FIXED";
        };
        /** FixedInputPlan */
        FixedInputPlan: {
            /**
             * Count
             * @constant
             */
            count: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "FIXED_INPUT";
            preview_request: components["schemas"]["PreviaRequest"];
        };
        /** GeneratedInputPlan */
        GeneratedInputPlan: {
            /**
             * Count
             * @enum {integer}
             */
            count: 10 | 30 | 100;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "GENERATED_INPUT";
            preparation_input: components["schemas"]["EffectiveInput"];
            /** Repetitions */
            repetitions: components["schemas"]["RepetitionPlan"][];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HealthResponse */
        HealthResponse: {
            /**
             * Status
             * @constant
             */
            status: "ok";
        };
        /** InputSnapshot */
        InputSnapshot: {
            cenario: components["schemas"]["CenarioEntrada"];
            /** Periodo */
            periodo: components["schemas"]["PeriodoLegado"] | components["schemas"]["PeriodoNatural"];
            /** Proveniencia */
            proveniencia: {
                [key: string]: components["schemas"]["OrigemValor"];
            };
        };
        /** JobError */
        JobError: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /** Repetition Id */
            repetition_id: string | null;
        };
        /** JobProgress */
        JobProgress: {
            /** Completed */
            completed: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Current Repetition Id */
            current_repetition_id: string | null;
            /** Failed */
            failed: number;
            /** Finished At */
            finished_at: string | null;
            /**
             * Phase
             * @enum {string}
             */
            phase: "QUEUED" | "EXECUTING" | "AGGREGATING" | "TERMINAL";
            /** Started At */
            started_at: string | null;
            /** Total */
            total: number;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** JobSnapshot */
        JobSnapshot: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            error: components["schemas"]["JobError"] | null;
            /**
             * Job Id
             * Format: uuid
             */
            job_id: string;
            progress: components["schemas"]["JobProgress"];
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            /** Retry Of Job Id */
            retry_of_job_id: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "QUEUED" | "RUNNING" | "AGGREGATING" | "CANCEL_REQUESTED" | "SUCCEEDED" | "FAILED" | "CANCELLED";
        };
        /** ManifestoDTO */
        ManifestoDTO: {
            /** Arquetipos */
            arquetipos: string[];
            /** Avisos */
            avisos: string[];
            /** Criado Em Utc */
            criado_em_utc: string;
            /** Custo Calibrado */
            custo_calibrado: boolean;
            /** Drenagem */
            drenagem: string;
            /** Hash Configuracao */
            hash_configuracao: string;
            /** Horizonte Dias */
            horizonte_dias: number;
            /** Janela Dias */
            janela_dias: number;
            /** Metodo Percentil */
            metodo_percentil: string;
            /** Mixes */
            mixes: string[];
            /**
             * Modo Analise
             * @constant
             */
            modo_analise: "AGREGADO";
            parametros_custo: components["schemas"]["CustoEntrada"];
            /** Periodo Medicao Dias */
            periodo_medicao_dias: number;
            /** Run Id */
            run_id: string;
            /** Run Ids Origem */
            run_ids_origem: string[];
            /**
             * Schema Version
             * @constant
             */
            schema_version: "2.0.0";
            /** Seeds */
            seeds: number[];
            /** Versao Motor */
            versao_motor: string;
        };
        /** OperationalProfileAxis */
        OperationalProfileAxis: {
            /** Cycle Count */
            cycle_count: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Due Order Count */
            due_order_count: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Maximum Open Queue */
            maximum_open_queue: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Order Count */
            order_count: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Processing Duration Ms */
            processing_duration_ms: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Weighted Wait Days */
            weighted_wait_days: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /**
         * OrdemEntrada
         * @description Operação explícita; direção oposta do mesmo cliente continua outra ordem.
         */
        OrdemEntrada: {
            /** Cliente Id */
            cliente_id: string;
            /** Dia Conhecida */
            dia_conhecida: number;
            /** Dia Limite */
            dia_limite: number;
            /**
             * Direcao
             * @enum {string}
             */
            direcao: "OUT" | "IN";
            /** Eh Efx */
            eh_efx: boolean;
            /** Finalidade */
            finalidade: string;
            /** Id */
            id: string;
            /** Valor Brl */
            valor_brl: string;
        };
        /** OrderArrivedEventV1 */
        OrderArrivedEventV1: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "ORDER_ARRIVED";
            /** Order Id */
            order_id: string;
            /** Sequence */
            sequence: number;
        };
        /** OrigemCatalogo */
        OrigemCatalogo: {
            /** Fonte */
            fonte: string;
            /**
             * Registrado Em Utc
             * Format: date-time
             */
            registrado_em_utc: string;
            /**
             * Tipo
             * @enum {string}
             */
            tipo: "PADRAO_SINTETICO" | "ESTIMATIVA_USUARIO" | "DADO_OBSERVADO" | "NAO_COLETADO";
        };
        /** OrigemValor */
        OrigemValor: {
            /** Fonte */
            fonte: string;
            /**
             * Registrado Em Utc
             * Format: date-time
             */
            registrado_em_utc: string;
            /**
             * Tipo
             * @enum {string}
             */
            tipo: "PADRAO_SINTETICO" | "ESTIMATIVA_USUARIO" | "DADO_OBSERVADO" | "NAO_COLETADO";
        };
        /** ParticipantShare */
        ParticipantShare: {
            /** Participant Id */
            participant_id: string;
            /** Share */
            share: string;
            /** Volume Brl */
            volume_brl: string;
        };
        /** PeriodoLegado */
        PeriodoLegado: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            modo: "LEGADO";
        };
        /** PeriodoNatural */
        PeriodoNatural: {
            /** Dias Aquecimento */
            dias_aquecimento: number;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            modo: "NATURAL";
            /** Periodo Medicao Dias */
            periodo_medicao_dias: number;
        };
        /** PolicyCaptureAxis */
        PolicyCaptureAxis: {
            /** Captured Fraction */
            captured_fraction: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Inter Client Brl */
            inter_client_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Intra Client Brl */
            intra_client_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Matched Brl */
            matched_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Uncaptured Potential Brl */
            uncaptured_potential_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /** PreparationParameter */
        PreparationParameter: {
            /** Cadence Monthly */
            cadence_monthly: string;
            /** Deadline Max */
            deadline_max: number;
            /** Deadline Min */
            deadline_min: number;
            /** Expected Period Brl */
            expected_period_brl: string;
            /**
             * Participant Id
             * Format: uuid
             */
            participant_id: string;
            /** Sigma */
            sigma: string;
        };
        /** PreparationRequest */
        PreparationRequest: {
            /** Expected Build Sha */
            expected_build_sha: string;
            input: components["schemas"]["EffectiveInput"];
            /**
             * Preparation Version
             * @constant
             */
            preparation_version: "1.0.0";
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            /**
             * Study Id
             * Format: uuid
             */
            study_id: string;
        };
        /** PreparationResponse */
        PreparationResponse: {
            /** Composition */
            composition: components["schemas"]["RealizedComposition"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Derived Provenance */
            derived_provenance: {
                [key: string]: components["schemas"]["DerivedEvidence"];
            };
            /** Generation Fingerprint */
            generation_fingerprint: string;
            /**
             * Generator Version
             * @constant
             */
            generator_version: "dimensionamento-v1";
            input_snapshot: components["schemas"]["EffectiveInput"];
            /** Motor Build Sha */
            motor_build_sha: string;
            /** Orders */
            orders: components["schemas"]["OrdemEntrada"][];
            /** Parameters */
            parameters: components["schemas"]["PreparationParameter"][];
            /**
             * Preparation Id
             * Format: uuid
             */
            preparation_id: string;
            /**
             * Preparation Version
             * @constant
             */
            preparation_version: "1.0.0";
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            /**
             * Study Id
             * Format: uuid
             */
            study_id: string;
        };
        /** PresentationContract */
        PresentationContract: {
            /**
             * Currency
             * @constant
             */
            currency: "BRL";
            /**
             * Fraction Percent Digits
             * @constant
             */
            fraction_percent_digits: 2;
            /**
             * Locale
             * @constant
             */
            locale: "pt-BR";
            /**
             * Money Digits
             * @constant
             */
            money_digits: 2;
            /**
             * Rounding
             * @constant
             */
            rounding: "HALF_UP";
        };
        /** PreviaRequest */
        PreviaRequest: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            cenario: components["schemas"]["CenarioEntrada"];
            /** Periodo */
            periodo: components["schemas"]["PeriodoLegado"] | components["schemas"]["PeriodoNatural"];
            /** Proveniencia */
            proveniencia: {
                [key: string]: components["schemas"]["OrigemValor"];
            };
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            /**
             * Study Id
             * Format: uuid
             */
            study_id: string;
        };
        /** PreviewEnvelope */
        PreviewEnvelope: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            /** Execution Fingerprint */
            execution_fingerprint: string;
            /**
             * Execution Id
             * Format: uuid
             */
            execution_id: string;
            input_snapshot: components["schemas"]["InputSnapshot"];
            /**
             * Kind
             * @constant
             */
            kind: "PREVIA";
            /** Motor Build Sha */
            motor_build_sha: string;
            presentation: components["schemas"]["PresentationContract"];
            /**
             * Presentation Version
             * @constant
             */
            presentation_version: "1.0.0";
            /** Provenance Fingerprint */
            provenance_fingerprint: string;
            /**
             * Request Id
             * Format: uuid
             */
            request_id: string;
            result: components["schemas"]["ResultadoCanonicoDTO"];
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            statistics: components["schemas"]["EstatisticaPrevia"];
            /**
             * Study Id
             * Format: uuid
             */
            study_id: string;
        };
        /** ProfileDeadline */
        ProfileDeadline: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "PROFILE";
        };
        /** RealizedComposition */
        RealizedComposition: {
            /** In Brl */
            in_brl: string;
            /** Order Count */
            order_count: number;
            /** Out Brl */
            out_brl: string;
            /** Out Fraction */
            out_fraction: string | null;
            /** Participant Id */
            participant_id: string | null;
            /** Total Brl */
            total_brl: string;
        };
        /** ReferenceExample */
        ReferenceExample: {
            cenario: components["schemas"]["CenarioEntrada"];
            /** Periodo */
            periodo: components["schemas"]["PeriodoLegado"] | components["schemas"]["PeriodoNatural"];
            /** Proveniencia */
            proveniencia: {
                [key: string]: components["schemas"]["OrigemValor"];
            };
        };
        /** RegraIOF */
        RegraIOF: {
            /** Aliquota */
            aliquota: string;
            /**
             * Direcao
             * @enum {string}
             */
            direcao: "OUT" | "IN";
            /** Finalidade */
            finalidade: string;
        };
        /** RegraIOFCatalogo */
        RegraIOFCatalogo: {
            /** Aliquota */
            aliquota: string;
            /**
             * Direcao
             * @enum {string}
             */
            direcao: "OUT" | "IN";
            /** Finalidade */
            finalidade: string;
        };
        /** RepetitionPlan */
        RepetitionPlan: {
            /** Participant Seeds */
            participant_seeds: {
                [key: string]: string;
            };
            /**
             * Repetition Id
             * Format: uuid
             */
            repetition_id: string;
        };
        /** RepetitionSummary */
        RepetitionSummary: {
            /** Baseline Brl */
            baseline_brl: string;
            /** Duration Ms */
            duration_ms: number;
            /** Execution Fingerprint */
            execution_fingerprint: string;
            /** Input Fingerprint */
            input_fingerprint: string;
            /** Netability Fraction */
            netability_fraction: string;
            /** Netted Brl */
            netted_brl: string;
            /** Participant Seeds */
            participant_seeds: {
                [key: string]: string;
            };
            /**
             * Repetition Id
             * Format: uuid
             */
            repetition_id: string;
            /** Savings Brl */
            savings_brl: string;
        };
        /** ReplayClosingV1 */
        ReplayClosingV1: {
            /** Flow Segments */
            flow_segments: components["schemas"]["ReplayFlowSegmentV1"][];
            /** Gross In Brl */
            gross_in_brl: string;
            /** Gross Out Brl */
            gross_out_brl: string;
            /** Inter Client Position Brl */
            inter_client_position_brl: string;
            /** Intra Client Position Brl */
            intra_client_position_brl: string;
            /** Matched Contribution Brl */
            matched_contribution_brl: string;
            /** Matched Position Brl */
            matched_position_brl: string;
            /** Remitted In Brl */
            remitted_in_brl: string;
            /** Remitted Out Brl */
            remitted_out_brl: string;
            /** Triggers */
            triggers: ("WINDOW" | "DEADLINE" | "HORIZON_END")[];
        };
        /** ReplayDayV1 */
        ReplayDayV1: {
            closing: components["schemas"]["ReplayClosingV1"] | null;
            /** Day */
            day: number;
            end_state: components["schemas"]["ReplayEndStateV1"];
            /** Events */
            events: (components["schemas"]["OrderArrivedEventV1"] | components["schemas"]["AllocationEventV1"])[];
        };
        /** ReplayDocumentV1 */
        ReplayDocumentV1: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            /**
             * Currency
             * @constant
             */
            currency: "BRL";
            /** Days */
            days: components["schemas"]["ReplayDayV1"][];
            /**
             * Diagnostic Execution Id
             * Format: uuid
             */
            diagnostic_execution_id: string;
            /** Execution Fingerprint */
            execution_fingerprint: string;
            /** Motor Version */
            motor_version: string;
            /** Orders */
            orders: components["schemas"]["ReplayOrderV1"][];
            /** Participant Seeds */
            participant_seeds: {
                [key: string]: string;
            };
            period: components["schemas"]["ReplayPeriodV1"];
            /**
             * Policy
             * @constant
             */
            policy: "P0";
            /**
             * Repetition Id
             * Format: uuid
             */
            repetition_id: string;
            /** Result Fingerprint */
            result_fingerprint: string;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /** Scenario Revision */
            scenario_revision: number;
            totals: components["schemas"]["ReplayTotalsV1"];
        };
        /** ReplayEndStateV1 */
        ReplayEndStateV1: {
            /** Matched Position Accumulated Brl */
            matched_position_accumulated_brl: string;
            /** Measured Matched Contribution Accumulated Brl */
            measured_matched_contribution_accumulated_brl: string;
            /** Open In Brl */
            open_in_brl: string;
            /** Open Out Brl */
            open_out_brl: string;
            /** Remitted In Accumulated Brl */
            remitted_in_accumulated_brl: string;
            /** Remitted Out Accumulated Brl */
            remitted_out_accumulated_brl: string;
        };
        /** ReplayFlowSegmentV1 */
        ReplayFlowSegmentV1: {
            /** Closing Day */
            closing_day: number;
            /** In Order Id */
            in_order_id: string;
            /**
             * Matching Origin
             * @enum {string}
             */
            matching_origin: "INTRA_CLIENTE" | "INTER_CLIENTE";
            /**
             * Meaning
             * @constant
             */
            meaning: "ILLUSTRATIVE_AGGREGATE_DECOMPOSITION";
            /** Out Order Id */
            out_order_id: string;
            /** Value Brl */
            value_brl: string;
        };
        /** ReplayOrderV1 */
        ReplayOrderV1: {
            /** Client Id */
            client_id: string;
            /**
             * Cohort
             * @enum {string}
             */
            cohort: "WARMUP" | "MEASUREMENT";
            /** Deadline Day */
            deadline_day: number;
            /**
             * Direction
             * @enum {string}
             */
            direction: "OUT" | "IN";
            /** Id */
            id: string;
            /** Known Day */
            known_day: number;
            /** Value Brl */
            value_brl: string;
        };
        /** ReplayPeriodV1 */
        ReplayPeriodV1: {
            /** Measurement End Day */
            measurement_end_day: number;
            /** Measurement Start Day */
            measurement_start_day: number;
            /**
             * Mode
             * @enum {string}
             */
            mode: "LEGADO" | "NATURAL";
            /** Settlement End Day */
            settlement_end_day: number;
            /** Warmup Days */
            warmup_days: number;
        };
        /** ReplayRequestV1 */
        ReplayRequestV1: {
            /**
             * Api Version
             * @constant
             */
            api_version: "1.0.0";
            diagnostic_envelope: components["schemas"]["DiagnosticEnvelope"];
            /**
             * Diagnostic Execution Id
             * Format: uuid
             */
            diagnostic_execution_id: string;
        };
        /** ReplayTotalsV1 */
        ReplayTotalsV1: {
            /** Execution Matched Position Brl */
            execution_matched_position_brl: string;
            /** Execution Remitted In Brl */
            execution_remitted_in_brl: string;
            /** Execution Remitted Out Brl */
            execution_remitted_out_brl: string;
            /** Measured Autonetting Contribution Brl */
            measured_autonetting_contribution_brl: string;
            /** Measured Gross Brl */
            measured_gross_brl: string;
            /** Measured Matched Contribution Brl */
            measured_matched_contribution_brl: string;
            /** Measured Multilateral Contribution Brl */
            measured_multilateral_contribution_brl: string;
            /** Measured Remitted Brl */
            measured_remitted_brl: string;
            /** Netability Fraction */
            netability_fraction: string;
        };
        /** ResidualBreakdown */
        ResidualBreakdown: {
            /**
             * Direction
             * @enum {string}
             */
            direction: "OUT" | "IN";
            /** Key */
            key: string;
            /** Value Brl */
            value_brl: string;
        };
        /** ResultadoCanonicoDTO */
        ResultadoCanonicoDTO: {
            agregado: components["schemas"]["AgregadoDTO"];
            /** Avisos */
            avisos: string[];
            /** Clientes */
            clientes: unknown[];
            /** Contribuicoes Marginais */
            contribuicoes_marginais: unknown[];
            diagnosticos_experimentais: components["schemas"]["DiagnosticosExperimentaisDTO"];
            /** Ledger Eventos */
            ledger_eventos: unknown[];
            manifesto: components["schemas"]["ManifestoDTO"];
        };
        /** ResultadoLegadoDTO */
        ResultadoLegadoDTO: {
            baseline: components["schemas"]["CustosDTO"];
            /** Ciclos */
            ciclos: components["schemas"]["CicloDTO"][];
            /** Economia */
            economia: string;
            netado: components["schemas"]["CustosDTO"];
            /** Taxa Autonetting */
            taxa_autonetting: string;
            /** Taxa Netabilidade */
            taxa_netabilidade: string;
            /** Taxa Netting Multilateral */
            taxa_netting_multilateral: string;
            /** Volume Autonetting Brl */
            volume_autonetting_brl: string;
            /** Volume Casado Brl */
            volume_casado_brl: string;
            /** Volume Netting Multilateral Brl */
            volume_netting_multilateral_brl: string;
        };
        /** ResultadoMecanismoDTO */
        ResultadoMecanismoDTO: {
            /** Baseline Atribuido Brl */
            baseline_atribuido_brl: string;
            /** Custo Netado Brl */
            custo_netado_brl: string;
            /**
             * Destino
             * @enum {string}
             */
            destino: "INTRA_CLIENTE" | "INTER_CLIENTE" | "REMETIDO";
            /** Economia Brl */
            economia_brl: string;
            /** Volume Brl */
            volume_brl: string;
        };
        /** SessionResponse */
        SessionResponse: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
        };
        /** SingleExecutionStatistics */
        SingleExecutionStatistics: {
            /**
             * Count
             * @constant
             */
            count: 1;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "SINGLE_EXECUTION";
            /** Percentile Method */
            percentile_method: null;
            /**
             * Selected Repetition Id
             * Format: uuid
             */
            selected_repetition_id: string;
        };
        /** StructuralPotentialAxis */
        StructuralPotentialAxis: {
            /** Ceiling Brl */
            ceiling_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Gross In Brl */
            gross_in_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Gross Out Brl */
            gross_out_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Imbalance Brl */
            imbalance_brl: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /** TemporalCompatibilityAxis */
        TemporalCompatibilityAxis: {
            /** Deadline Closures */
            deadline_closures: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Deadline Days */
            deadline_days: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Horizon Closures */
            horizon_closures: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Same Day Fraction */
            same_day_fraction: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Weighted Wait Days */
            weighted_wait_days: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
            /** Window Closures */
            window_closures: components["schemas"]["AvailableEvidenceMetric_Annotated_str__FieldInfo_annotation_NoneType__required_True__metadata__Strict_strict_True___MinLen_min_length_1___MaxLen_max_length_80____PydanticGeneralMetadata_pattern___-__0__1-9__0-9_________0-9___________"] | components["schemas"]["UnavailableEvidenceMetric"];
        };
        /** UnavailableEvidenceMetric */
        UnavailableEvidenceMetric: {
            /** Evidence */
            evidence: string[];
            /** Reason */
            reason: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "INCOMPATIBLE" | "INSUFFICIENT_COVERAGE" | "NOT_COLLECTED";
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    import_catalog_schema_api_v1_catalogos_importacao_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogoImportacao"];
                };
            };
        };
    };
    diagnostic_schema_api_v1_diagnosticos_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiagnosticRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobSnapshot"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    diagnostic_job_schema_api_v1_diagnosticos__job_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobSnapshot"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    diagnostic_cancellation_schema_api_v1_diagnosticos__job_id__cancelamentos_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobSnapshot"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    diagnostic_result_schema_api_v1_diagnosticos__job_id__resultado_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiagnosticEnvelope"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    diagnostic_retry_schema_api_v1_diagnosticos__job_id__retries_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                job_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DiagnosticRetryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobSnapshot"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reference_example_schema_api_v1_examples_reference_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceExample"];
                };
            };
        };
    };
    health_schema_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    preparation_api_v1_preparacoes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PreparationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreparationResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_schema_api_v1_previas_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PreviaRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreviewEnvelope"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replay_schema_api_v1_replays_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplayRequestV1"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReplayDocumentV1"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    session_schema_api_v1_session_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionResponse"];
                };
            };
        };
    };
}

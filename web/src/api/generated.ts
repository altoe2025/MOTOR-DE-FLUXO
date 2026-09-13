export interface paths {
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
            netado_periodo: components["schemas"]["CustosDTO"];
            /** Taxa Netabilidade Periodo */
            taxa_netabilidade_periodo: string;
            /** Volume Bruto Periodo Brl */
            volume_bruto_periodo_brl: string;
            /** Volume Casado Periodo Brl */
            volume_casado_periodo_brl: string;
            /** Volume Remetido Periodo Brl */
            volume_remetido_periodo_brl: string;
        };
        /** AlocacaoDTO */
        AlocacaoDTO: {
            /** Dia */
            dia: number;
            /** Ordem Id */
            ordem_id: string;
            /**
             * Tipo
             * @enum {string}
             */
            tipo: "CASADO" | "REMETIDO";
            /** Valor Brl */
            valor_brl: string;
        };
        /** CenarioEntrada */
        CenarioEntrada: {
            custo: components["schemas"]["CustoEntrada"];
            /** Horizonte Dias */
            horizonte_dias: number;
            /** Janela Dias */
            janela_dias: number;
            /** Ordens */
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
        /** DiagnosticosExperimentaisDTO */
        DiagnosticosExperimentaisDTO: {
            /** Limite Intra Cliente Brl */
            limite_intra_cliente_brl: null;
            /** Taxa Netabilidade Incremental */
            taxa_netabilidade_incremental: null;
            /** Volume Casado Incremental Brl */
            volume_casado_incremental_brl: null;
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
            /** Schema Version */
            schema_version: string;
            /** Seeds */
            seeds: number[];
            /** Versao Motor */
            versao_motor: string;
        };
        /** OrdemEntrada */
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
            tipo: "PADRAO_SINTETICO" | "ESTIMATIVA_USUARIO" | "DADO_OBSERVADO";
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
            /** Taxa Netabilidade */
            taxa_netabilidade: string;
        };
        /** SessionResponse */
        SessionResponse: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
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

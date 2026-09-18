import type { ApiClient, ImportCatalog } from '../api/client';
import { validateCustoEntrada, validateOrigemValor } from '../api/validators';
import type {
  ImportCosts,
  ImportStudyParameters,
  ParameterField,
  ParameterOrigin,
} from './domain';

const COST_FIELDS = [
  'iof_out',
  'iof_in',
  'carry_cnr',
  'spread_rail_bps',
  'custo_fixo_remessa',
  'custo_oportunidade_aa',
  'ptax',
  'iof_por_finalidade',
] as const satisfies readonly (keyof ImportCosts)[];

type CostUpdate = {
  [Field in keyof ImportCosts]: {
    field: Field;
    value: ImportCosts[Field];
    changedAtUtc: string;
  };
}[keyof ImportCosts];

export type ImportStudyParameterUpdate = CostUpdate | {
  field: 'windowDays';
  value: number;
  changedAtUtc: string;
};

export class InvalidImportStudyParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImportStudyParameterError';
  }
}

function copyOrigin(origin: ParameterOrigin): ParameterOrigin {
  return { ...origin };
}

function copyCosts(costs: ImportCosts): ImportCosts {
  return {
    ...costs,
    iof_por_finalidade: costs.iof_por_finalidade.map((rule) => ({ ...rule })),
  };
}

export function importCatalogQueryOptions(
  api: Pick<ApiClient, 'getImportCatalog'>,
  ownerSub: string,
) {
  if (ownerSub.trim() === '') {
    throw new Error('ownerSub é obrigatório para isolar o catálogo da sessão');
  }
  return {
    queryKey: ['import-catalog', ownerSub] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => api.getImportCatalog(signal),
    staleTime: Infinity,
    gcTime: Infinity,
  };
}

export function createImportStudyParameters(
  catalog: ImportCatalog,
): ImportStudyParameters {
  const origins = Object.fromEntries(
    (['windowDays', ...COST_FIELDS] satisfies readonly ParameterField[])
      .map((field) => [field, copyOrigin(catalog.custos_origem)]),
  ) as Record<ParameterField, ParameterOrigin>;
  return {
    windowDays: 7,
    costs: copyCosts(catalog.custos_padrao),
    fieldOrigins: origins,
    catalogVersion: catalog.catalog_version,
  };
}

function userOrigin(changedAtUtc: string): ParameterOrigin {
  const origin: ParameterOrigin = {
    tipo: 'ESTIMATIVA_USUARIO',
    fonte: 'Valor informado pelo usuário',
    registrado_em_utc: changedAtUtc,
  };
  if (!validateOrigemValor(origin)) {
    throw new InvalidImportStudyParameterError('data da alteração inválida');
  }
  return origin;
}

export function updateImportStudyParameter(
  parameters: ImportStudyParameters,
  update: ImportStudyParameterUpdate,
): ImportStudyParameters {
  const nextOrigins = {
    ...parameters.fieldOrigins,
    [update.field]: userOrigin(update.changedAtUtc),
  };
  if (update.field === 'windowDays') {
    if (!Number.isInteger(update.value) || update.value < 1 || update.value > 730) {
      throw new InvalidImportStudyParameterError(
        'janela deve ser um número inteiro entre 1 e 730',
      );
    }
    return {
      ...parameters,
      windowDays: update.value,
      costs: copyCosts(parameters.costs),
      fieldOrigins: nextOrigins,
    };
  }
  const costs: ImportCosts = {
    ...copyCosts(parameters.costs),
    [update.field]: structuredClone(update.value),
  };
  if (!validateCustoEntrada(costs)) {
    throw new InvalidImportStudyParameterError('custo informado é inválido');
  }
  return { ...parameters, costs, fieldOrigins: nextOrigins };
}

export function catalogVersionState(
  recordedVersion: string | null,
  catalog: ImportCatalog,
): { resultsStale: boolean; revalidatePurposes: boolean } {
  const changed = recordedVersion !== catalog.catalog_version;
  return { resultsStale: changed, revalidatePurposes: changed };
}

/**
 * Contrato da planilha de importação, em um só lugar: o preflight, o parser, o modelo
 * baixável e as instruções da tela leem daqui.
 */
export const IMPORT_SHEET_NAME = 'operacoes';
export const IMPORT_LIMIT_ROWS = 1000;
export const IMPORT_MAX_FILE_MIB = 5;

export type ImportColumn = Readonly<{
  name: 'operacao_id' | 'cliente_nome' | 'classificacao_perfil' | 'direcao' | 'data_conhecida' | 'data_limite' | 'valor_brl' | 'finalidade_codigo';
  required: boolean;
  /** Formato aceito, em linguagem de quem preenche. */
  format: string;
  /** Uma linha OUT e uma IN de exemplo, na ordem. */
  examples: readonly [string | number, string | number];
}>;

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { name: 'operacao_id', required: true, format: 'identificador único da operação, sem espaços nas pontas', examples: ['OP-0001', 'OP-0002'] },
  { name: 'cliente_nome', required: true, format: 'nome do cliente', examples: ['Cliente Alfa', 'Cliente Beta'] },
  { name: 'classificacao_perfil', required: true, format: 'perfil do cliente (texto livre)', examples: ['tesouraria_corporativa', 'exportador'] },
  { name: 'direcao', required: true, format: 'OUT (reais saem do Brasil) ou IN (moeda entra)', examples: ['OUT', 'IN'] },
  { name: 'data_conhecida', required: true, format: 'data em que a operação ficou conhecida: AAAA-MM-DD ou DD/MM/AAAA', examples: ['2026-10-01', '2026-10-02'] },
  { name: 'data_limite', required: true, format: 'último dia para liquidar, igual ou depois da data conhecida', examples: ['2026-10-08', '2026-10-09'] },
  { name: 'valor_brl', required: true, format: 'valor em reais maior que zero, até 6 casas (vírgula ou ponto)', examples: [150000, 120000.5] },
  { name: 'finalidade_codigo', required: false, format: 'código da finalidade (Anexo V); vazio usa IOF padrão por direção', examples: ['ANEXO_V_REMESSA_TERCEIRO', 'ANEXO_V_DISPONIBILIDADE'] },
];

export const REQUIRED_IMPORT_HEADERS = IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.name);
export const IMPORT_HEADERS = IMPORT_COLUMNS.map((column) => column.name);

export function columnLetter(index: number): string {
  let letters = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  }
  return letters;
}

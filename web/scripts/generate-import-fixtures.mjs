import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const output = fileURLToPath(new URL('../e2e/fixtures/', import.meta.url));
const fixtureTimestamp = new Date('2026-09-19T00:00:00.000Z');
const headers = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl', 'finalidade_codigo'];

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function column(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheet(rows) {
  const all = [headers, ...rows];
  const xmlRows = all.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => value === null ? '' : `<c r="${column(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}

async function writeWorkbook(name, rows) {
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="operacoes" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(worksheet(rows)),
  };
  await writeFile(`${output}${name}`, zipSync(files, { level: 6, mtime: fixtureTimestamp }));
}

const balanced = [
  ['TESTE-OUT', 'Cliente Fictício Balanceado', 'TESTE_FICTICIO', 'OUT', '2026-09-19', '2026-09-19', '100.00', 'TESTE_OUT'],
  ['TESTE-IN', 'Cliente Fictício Balanceado', 'TESTE_FICTICIO', 'IN', '2026-09-19', '2026-09-19', '100.00', 'TESTE_IN'],
];
const partial = [...balanced, ['INVALIDA', '', 'TESTE_FICTICIO', 'OUT', 'data-invalida', '2026-09-19', '-1', 'TESTE_OUT']];
const conflict = [['TESTE-OUT', 'Cliente Fictício Balanceado', 'TESTE_FICTICIO', 'OUT', '2026-09-19', '2026-09-20', '250.00', 'TESTE_OUT']];
const thousand = Array.from({ length: 1000 }, (_, index) => [
  `TESTE-${String(index + 1).padStart(4, '0')}`,
  `Cliente Fictício ${index % 20}`,
  'TESTE_FICTICIO',
  index % 2 === 0 ? 'OUT' : 'IN',
  '2026-09-19',
  '2026-09-19',
  '100.00',
  index % 2 === 0 ? 'TESTE_OUT' : 'TESTE_IN',
]);

await mkdir(output, { recursive: true });
await Promise.all([
  writeWorkbook('valid-balanced.xlsx', balanced),
  writeWorkbook('partial-invalid.xlsx', partial),
  writeWorkbook('conflicting-batch.xlsx', conflict),
  writeWorkbook('valid-1000-rows.xlsx', thousand),
]);

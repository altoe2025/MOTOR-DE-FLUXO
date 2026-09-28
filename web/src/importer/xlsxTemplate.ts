import { strToU8, zipSync } from 'fflate';

import { columnLetter, IMPORT_COLUMNS, IMPORT_SHEET_NAME } from './layout';

export const IMPORT_TEMPLATE_FILENAME = 'modelo-importacao-operacoes.xlsx';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function cell(reference: string, value: string | number): string {
  return typeof value === 'number'
    ? `<c r="${reference}"><v>${value}</v></c>`
    : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

/**
 * Planilha modelo gerada no navegador a partir de IMPORT_COLUMNS: aba única, cabeçalhos na
 * ordem canônica e uma linha OUT e uma IN de exemplo. Passa no próprio preflight.
 */
export function buildImportTemplate(): Uint8Array {
  const rows = [
    IMPORT_COLUMNS.map((column) => column.name),
    IMPORT_COLUMNS.map((column) => column.examples[0]),
    IMPORT_COLUMNS.map((column) => column.examples[1]),
  ];
  const sheetData = rows.map((values, rowIndex) => `<row r="${rowIndex + 1}">${values
    .map((value, columnIndex) => cell(`${columnLetter(columnIndex)}${rowIndex + 1}`, value)).join('')}</row>`).join('');
  const widths = IMPORT_COLUMNS.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(14, column.name.length + 4)}" customWidth="1"/>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${IMPORT_SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetData}</sheetData></worksheet>`),
  });
}

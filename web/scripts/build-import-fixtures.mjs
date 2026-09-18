import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { strToU8, zipSync } from 'fflate';

const OUTPUT_DIRECTORY = fileURLToPath(
  new URL('../src/importer/__fixtures__/', import.meta.url),
);
const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0);
const HEADERS = [
  'operacao_id',
  'cliente_nome',
  'classificacao_perfil',
  'direcao',
  'data_conhecida',
  'data_limite',
  'valor_brl',
  'finalidade_codigo',
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  let result = '';
  let current = index + 1;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function inlineCell(reference, value) {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numberCell(reference, value, style = null) {
  const styleAttribute = style === null ? '' : ` s="${style}"`;
  return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
}

function rowXml(rowNumber, values, options = {}) {
  const cells = values.map((value, index) => {
    if (value === null) {
      return '';
    }
    const reference = `${columnName(index)}${rowNumber}`;
    if (options.formulaAt === index) {
      return `<c r="${reference}"><f>1+1</f><v>2</v></c>`;
    }
    if (options.numberAt?.has(index)) {
      return numberCell(
        reference,
        value,
        options.dateAt?.has(index) ? 1 : null,
      );
    }
    return inlineCell(reference, value);
  });
  return `<row r="${rowNumber}">${cells.join('')}</row>`;
}

function excelSerial(year, month, day) {
  return Math.floor(
    (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30))
      / 86_400_000,
  );
}

function operationRow(index) {
  return [
    `OP-${String(index).padStart(4, '0')}`,
    'Cliente Exemplo',
    null,
    'OUT',
    String(excelSerial(2026, 10, 17)),
    '19/10/2026',
    '1500000.00',
    'SERVICO',
  ];
}

function sheetXml({
  headers = HEADERS,
  operationCount = 1,
  formula = false,
  merged = false,
} = {}) {
  const rows = [
    rowXml(1, headers),
    ...Array.from(
      { length: operationCount },
      (_, index) => rowXml(index + 2, operationRow(index + 1), {
        formulaAt: formula && index === 0 ? 6 : null,
        numberAt: new Set([4, 6]),
        dateAt: new Set([4]),
      }),
    ),
  ];
  const merge = merged
    ? '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows.join('')}</sheetData>
  ${merge}
</worksheet>`;
}

function workbookXml(sheets, external = false) {
  const sheetNodes = sheets.map((sheet, index) => {
    const state = sheet.hidden ? ' state="hidden"' : '';
    return `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}"${state} r:id="rId${index + 1}"/>`;
  });
  const externalReferences = external
    ? '<externalReferences><externalReference r:id="rIdExternal"/></externalReferences>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetNodes.join('')}</sheets>
  ${externalReferences}
</workbook>`;
}

function workbookRelationships(sheetCount, external = false) {
  const relationships = Array.from(
    { length: sheetCount },
    (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  );
  relationships.push(
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  );
  if (external) {
    relationships.push(
      '<Relationship Id="rIdExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/>',
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships.join('')}
</Relationships>`;
}

function contentTypes(sheetCount, macro = false, external = false) {
  const sheetOverrides = Array.from(
    { length: sheetCount },
    (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  );
  const macroOverride = macro
    ? '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>'
    : '';
  const externalOverride = external
    ? '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides.join('')}
  ${macroOverride}
  ${externalOverride}
</Types>`;
}

const ROOT_RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

function workbookEntries(options = {}) {
  const sheets = options.sheets ?? [{ name: 'operacoes' }];
  const entries = {
    '[Content_Types].xml': strToU8(
      contentTypes(sheets.length, options.macro, options.external),
    ),
    '_rels/.rels': strToU8(ROOT_RELATIONSHIPS),
    'xl/workbook.xml': strToU8(
      workbookXml(sheets, options.external),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      workbookRelationships(sheets.length, options.external),
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  for (const [index, sheet] of sheets.entries()) {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      sheet.xml ?? sheetXml(options),
    );
  }
  if (options.macro) {
    entries['xl/vbaProject.bin'] = new Uint8Array([1, 2, 3]);
  }
  if (options.external) {
    entries['xl/externalLinks/externalLink1.xml'] = strToU8(
      '<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
    );
  }
  if (options.extraEntries) {
    for (let index = 0; index < options.extraEntries; index += 1) {
      entries[`dummy/entry-${String(index).padStart(3, '0')}.txt`] = strToU8('x');
    }
  }
  if (options.largeEntry) {
    entries['oversized/uncompressed.bin'] = new Uint8Array(
      25 * 1024 * 1024 + 1,
    );
  }
  return entries;
}

function buildWorkbook(options = {}) {
  return zipSync(workbookEntries(options), {
    level: 9,
    mtime: FIXED_MTIME,
  });
}

const fixtures = {
  'valid-minimal.xlsx': buildWorkbook(),
  'valid-1000-rows.xlsx': buildWorkbook({ operationCount: 1000 }),
  'row-limit-1001.xlsx': buildWorkbook({ operationCount: 1001 }),
  'formula.xlsx': buildWorkbook({ formula: true }),
  'merged-cell.xlsx': buildWorkbook({ merged: true }),
  'extra-sheet.xlsx': buildWorkbook({
    sheets: [
      { name: 'operacoes' },
      { name: 'outra' },
    ],
  }),
  'hidden-only-sheet.xlsx': buildWorkbook({
    sheets: [{ name: 'operacoes', hidden: true }],
  }),
  'wrong-sheet-name.xlsx': buildWorkbook({
    sheets: [{ name: 'dados' }],
  }),
  'wrong-headers.xlsx': buildWorkbook({
    headers: ['id_errado', ...HEADERS.slice(1)],
  }),
  'macro-marker.xlsx': buildWorkbook({ macro: true }),
  'external-link.xlsx': buildWorkbook({ external: true }),
  'zip-too-many-entries.xlsx': buildWorkbook({ extraEntries: 129 }),
  'zip-too-large-uncompressed.xlsx': buildWorkbook({
    largeEntry: true,
  }),
  'encrypted-marker.xlsx': new Uint8Array([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]),
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
for (const [name, bytes] of Object.entries(fixtures)) {
  await writeFile(`${OUTPUT_DIRECTORY}/${name}`, bytes);
}

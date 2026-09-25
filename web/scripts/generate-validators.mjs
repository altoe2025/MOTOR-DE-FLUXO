// Ajv code generation runs here, never in the browser under script-src 'self'.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import addFormats from 'ajv-formats';

const src = new URL('../src/', import.meta.url);
const output = new URL('generated/validators/', src);
const check = process.argv.includes('--check');
const load = async (path) => JSON.parse(await readFile(new URL(path, src), 'utf8'));
const http = await load('api/schemas.json');
const cases = await load('cases/observedCase.schema.json');
const profiles = await load('profiles/operationalProfile.schema.json');
const study = await load('study/study.schema.json');
const demo = await load('demo/demoStudyPackage.schema.json');
const communication = await load('communication/communicationDocument.schema.json');
const chat = await load('chat/chat.schema.json');
const ref = (schema, name) => `${schema.$id}#/$defs/${name}`;
const apiNames = {
  validatePreviaRequest: 'PreviaRequest', validatePreviewEnvelope: 'PreviewEnvelope',
  validateReferenceExample: 'ReferenceExample', validatePreparationRequest: 'PreparationRequest',
  validatePreparationResponse: 'PreparationResponse', validateDiagnosticRequestShape: 'DiagnosticRequest',
  validateJobSnapshot: 'JobSnapshot', validateDiagnosticEnvelope: 'DiagnosticEnvelope',
  validateReplayRequest: 'ReplayRequestV1', validateReplayDocument: 'ReplayDocumentV1',
  validateCatalogoImportacao: 'CatalogoImportacao', validateProductHelpCatalogV1: 'ProductHelpCatalogV1',
  validateChatRequestV1: 'ChatRequestV1', validateChatResponseV1: 'ChatResponseV1',
};
const typed = (path, type) => `import('${path}').${type}`;
const jobs = [
  { name: 'api', schemas: [http], api: true,
    exports: Object.fromEntries(Object.entries(apiNames).map(([name, def]) => [name, ref(http, def)])) },
  { name: 'cases', schemas: [cases], exports: {
    validateSchema: cases.$id, validateDraftSchema: ref(cases, 'ObservedCaseDraft'),
  }, types: { validateSchema: typed('../../cases/domain', 'ObservedCase'),
    validateDraftSchema: typed('../../cases/domain', 'ObservedCaseDraft') } },
  { name: 'profiles', schemas: [cases, profiles], exports: { validateSchema: profiles.$id },
    types: { validateSchema: typed('../../profiles/domain', 'OperationalProfileVersion') } },
  { name: 'study', schemas: [http, cases, profiles, study], exports: {
    validateStudyV2Schema: study.$id,
    validateExecutionSchema: ref(study, 'ExecutionRecord'),
    validatePreviewExecutionSchema: ref(study, 'PreviewExecutionRecord'),
    validateDiagnosticExecutionSchema: ref(study, 'DiagnosticExecutionRecord'),
    validateStudyV3Schema: ref(study, 'StudyDocumentV3'),
  }, types: {
    validateStudyV2Schema: typed('../../study/model', 'StudyDocumentV2'),
    validateExecutionSchema: typed('../../study/model', 'ExecutionRecord'),
    validateStudyV3Schema: typed('../../study/model', 'StudyDocumentV3'),
  } },
  { name: 'demo', schemas: [http, cases, profiles, study, demo], exports: { validateSchema: demo.$id },
    types: { validateSchema: typed('../../demo/domain', 'DemoStudyPackageV1') } },
  { name: 'communication', schemas: [communication], formats: false, exports: { validateShape: communication.$id },
    types: { validateShape: typed('../../communication/domain', 'CommunicationDocumentV1') } },
  { name: 'chat', schemas: [chat], exports: { validateSchema: chat.$id },
    types: { validateSchema: typed('../../chat/domain', 'ChatConversation') } },
];

// Ajv's standalone ESM still references CJS runtime helpers through require().
// Convert those static dependencies to imports understood by Node and Vite.
function esmRuntimeImports(code) {
  const imports = new Map();
  const body = code.replace(/require\("([^"]+)"\)(\.default)?/g, (_, specifier, defaultAccess) => {
    if (!specifier.startsWith('ajv/dist/runtime/') && specifier !== 'ajv-formats/dist/formats') {
      throw new Error(`Unexpected standalone runtime dependency: ${specifier}`);
    }
    if (!imports.has(specifier)) imports.set(specifier, `runtime${imports.size}`);
    const name = imports.get(specifier);
    // Node exposes CJS exports.default as an object; Vite unwraps __esModule.
    return defaultAccess ? `(${name}.default ?? ${name})` : name;
  });
  return [...imports].map(([specifier, name]) => `import ${name} from '${specifier}.js';`).join('\n')
    + '\n' + body;
}

async function save(name, content) {
  const target = new URL(name, output);
  if (check) {
    const current = await readFile(target, 'utf8').catch(() => null);
    if (current !== content) throw new Error(`Generated validator is stale: ${name}`);
  } else {
    await writeFile(target, content, 'utf8');
  }
}

await mkdir(output, { recursive: true });
for (const job of jobs) {
  const ajv = new Ajv2020({
    ...(job.api ? { coerceTypes: false, removeAdditional: false, useDefaults: false }
      : { allErrors: true, strict: true }),
    // API errors expose schemaPath: retain the original inlining policy there.
    // Document wrappers expose only instance paths and messages, so share refs.
    inlineRefs: job.api ? true : false,
    code: { source: true, esm: true },
  });
  if (job.formats !== false) addFormats(ajv);
  for (const schema of job.schemas) ajv.addSchema(schema);
  const code = esmRuntimeImports(standaloneCode(ajv, job.exports));
  await save(`${job.name}.js`, `/* eslint-disable */\n/* Generated by scripts/generate-validators.mjs. Do not edit. */\n${code}\n`);
  const declarations = Object.keys(job.exports).map((name) =>
    `export declare const ${name}: ValidateFunction${job.types?.[name] ? `<${job.types[name]}>` : ''};`);
  await save(`${job.name}.d.ts`, `/* Generated by scripts/generate-validators.mjs. Do not edit. */\nimport type { ValidateFunction } from 'ajv';\n${declarations.join('\n')}\n`);
}
console.log(check ? 'Standalone validators are current.' : 'Standalone validators generated.');

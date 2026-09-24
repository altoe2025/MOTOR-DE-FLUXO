import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiDirectory = fileURLToPath(new URL('../src/api/', import.meta.url));
const openapiPath = `${repositoryRoot}/contracts/openapi.json`;

const document = JSON.parse(await readFile(openapiPath, 'utf8'));
const ast = await openapiTS(structuredClone(document));
const generated = `${astToString(ast).trimEnd()}\n`;

function rewriteRefs(value) {
  if (Array.isArray(value)) return value.map(rewriteRefs);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        // Ajv validates the oneOf branches; OpenAPI discriminator mappings are annotations it cannot compile.
        .filter(([key]) => key !== 'discriminator')
        .map(([key, child]) => [
          key,
          key === '$ref' && typeof child === 'string'
            ? child.replace('#/components/schemas/', '#/$defs/')
            : rewriteRefs(child),
        ]),
    );
  }
  return value;
}

const runtimeSchemas = {
  $id: 'https://motor-de-fluxo.local/contracts/schemas.json',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: rewriteRefs(document.components.schemas),
};
await mkdir(apiDirectory, { recursive: true });
await writeFile(`${apiDirectory}/generated.ts`, generated, 'utf8');
await writeFile(`${apiDirectory}/schemas.json`, `${JSON.stringify(runtimeSchemas, null, 2)}\n`, 'utf8');
await import('./generate-validators.mjs');

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoPackage = JSON.parse(readFileSync(resolve(webRoot, 'src/demo/generated/demo-study.v1.json'), 'utf8'));
const buildSha = process.env.MOT_E2E_BUILD_SHA ?? demoPackage.motorBuildSha;
if (typeof buildSha !== 'string' || !/^[0-9a-f]{40}$/.test(buildSha)) {
  throw new Error('SHA de motor inválido no pacote demo E2E');
}
const vite = resolve(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const result = spawnSync(process.execPath, [vite, 'build', '--mode', 'e2e'], {
  cwd: webRoot,
  env: { ...process.env, VITE_MOTOR_BUILD_SHA: buildSha },
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

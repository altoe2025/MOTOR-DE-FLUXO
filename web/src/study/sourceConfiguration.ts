const BUILD_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function requiredBuildSha(
  configuredSha: string | undefined,
  recipeSha: string | undefined,
): string {
  const candidate = recipeSha ?? configuredSha;
  if (candidate === undefined || candidate.length === 0) {
    throw new Error('Configure VITE_MOTOR_BUILD_SHA com o SHA real do motor antes de preparar uma carteira.');
  }
  if (!BUILD_SHA_PATTERN.test(candidate)) {
    throw new Error('SHA de build inválido: informe exatamente 40 caracteres hexadecimais minúsculos.');
  }
  return candidate;
}

export type RouteChatContext = Readonly<{
  routeId: string;
  helpId: string | null;
  studyId: string | null;
  scenarioId: string | null;
  diagnosticExecutionId: string | null;
  replayDay: number | null;
}>;

export function routeChatContext(pathAndSearch: string): RouteChatContext | null {
  const url = new URL(pathAndSearch, 'https://local.invalid');
  const path = url.pathname;
  if (/^\/(?:login|auth\/|imprimir|print)(?:\/|$)/.test(path) || /\/(?:imprimir|print)(?:\/|$)/.test(path)) return null;
  const parts = path.split('/').filter(Boolean);
  const [root, second, third] = parts;
  let routeId: string | null = null;
  let studyId: string | null = null;
  if (root === 'empresas') {
    routeId = third === 'perfis' ? 'profiles' : third === 'importar' ? 'import'
      : third === 'estudos' ? 'studies' : 'companies';
  } else if (root === 'importar') routeId = 'import';
  else if (root === 'carteira') { routeId = 'portfolio'; studyId = second ?? null; }
  else if (root === 'estudos') {
    studyId = second && third ? second : null;
    routeId = third === 'diagnostico' ? 'diagnostic' : third === 'replay' ? 'replay'
      : third === 'apresentacao' ? 'presentation' : 'studies';
  } else if (root === 'diagnostico') routeId = 'diagnostic';
  else if (root === 'comparar') { routeId = 'comparison'; studyId = url.searchParams.get('studyId'); }
  else if (root === 'replay') routeId = 'replay';
  else if (root === 'premissas') routeId = 'premises';
  if (routeId === null) return null;
  const dayText = routeId === 'replay' ? url.searchParams.get('day') : null;
  const day = dayText !== null && /^(0|[1-9]\d*)$/.test(dayText) ? Number(dayText) : null;
  return { routeId, helpId: null, studyId,
    scenarioId: routeId === 'diagnostic' ? url.searchParams.get('scenarioId') : null,
    diagnosticExecutionId: routeId === 'replay' ? url.searchParams.get('executionId') : null,
    replayDay: day !== null && Number.isSafeInteger(day) ? day : null };
}

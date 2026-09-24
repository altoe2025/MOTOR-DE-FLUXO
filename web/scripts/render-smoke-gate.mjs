/** Shared, side-effect-free gate: no browser or network access in this module. */
export function requireRenderSmokeConfig(env) {
  if (env.MOT_STAGE6_RENDER_APPROVED !== '1') throw new Error('Smoke Render sem autorização explícita.');
  const rawUrl = env.MOT_STAGE6_RENDER_BASE_URL;
  const email = env.MOT_STAGE6_RENDER_EMAIL;
  const password = env.MOT_STAGE6_RENDER_PASSWORD;
  if (typeof rawUrl !== 'string' || !/^https:\/\/[a-z0-9][a-z0-9-]*\.onrender\.com\/?$/.test(rawUrl)) {
    throw new Error('Smoke Render requer origem HTTPS onrender.com sem path, porta, query ou credenciais.');
  }
  if (typeof email !== 'string' || email.trim().length === 0
    || typeof password !== 'string' || password.trim().length === 0) {
    throw new Error('Smoke Render requer e-mail e senha efêmeros não vazios.');
  }
  return { baseUrl: rawUrl.replace(/\/$/, ''), email, password };
}

function required(condition, message) { if (!condition) throw new Error(message); }

export function assertCompletedChatExchange({ status, request, response, assistant, knownHelpIds = [] }) {
  required(status === 200, 'O provider não concluiu o POST do chat com HTTP 200.');
  const document = request?.communication;
  required(document !== null && typeof document === 'object', 'O chat não enviou documento de comunicação.');
  required(typeof document.contextFingerprint === 'string' && /^[0-9a-f]{64}$/.test(document.contextFingerprint),
    'Fingerprint do documento inválido.');
  required(response !== null && typeof response === 'object' && response.apiVersion === '1.0.0',
    'Provider ausente ou resposta sem contrato.');
  required(response.messageId === request.messageId && response.contextFingerprint === document.contextFingerprint,
    'Resposta pertence a outra pergunta ou contexto.');
  required(response.classification === 'IN_SCOPE', 'Pergunta em escopo não recebeu classificação IN_SCOPE.');
  required(typeof response.answer === 'string' && response.answer.trim().length > 0,
    'Resposta do chat vazia.');
  required(Array.isArray(response.citations) && response.citations.length > 0,
    'Resposta sem citações verificáveis.');
  const sections = [document.composition, document.mechanism, document.economics,
    document.robustness, document.comparison, document.replaySnapshot].filter(Boolean);
  const metrics = [...document.executiveMetrics, ...sections.flatMap((section) => section.metrics)];
  const known = {
    HELP: new Set(knownHelpIds),
    METRIC: new Set(metrics.map((metric) => metric.code)),
    EVIDENCE: new Set(Object.keys(document.evidenceIndex)),
    LIMITATION: new Set(document.limitations.map((limitation) => limitation.code)),
  };
  required(response.citations.every((citation) => citation !== null && typeof citation === 'object'
    && Object.hasOwn(known, citation.kind) && known[citation.kind].has(citation.id)),
  'Resposta contém citação fora do documento enviado.');
  required(Array.isArray(response.limitationCodes) && response.limitationCodes.every((code) =>
    code === 'INSUFFICIENT_EVIDENCE' || known.LIMITATION.has(code)), 'Limitação do chat inválida.');
  required(assistant?.role === 'ASSISTANT' && assistant.status === 'SUCCEEDED'
    && assistant.text === response.answer && assistant.citationCount === response.citations.length,
  'Resposta não chegou a ASSISTANT SUCCEEDED com conteúdo e fontes renderizados.');
}

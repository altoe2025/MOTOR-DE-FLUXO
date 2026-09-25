export const HELP_IDS = {
  IMPORT_PAGE: 'page.importacao',
  COMPANY: 'concept.empresa',
  CASE: 'concept.caso',
  PROFILE: 'concept.perfil',
  PARTICIPANT: 'concept.participante',
  ARCHETYPE: 'concept.arquetipo',
  COMPOSITION: 'concept.composicao',
  DEMO_MIX: 'concept.mix-demonstrativo',
  SEED: 'concept.seed',
  REPETITION: 'concept.repeticao',
  SELECTED_REPETITION: 'concept.repeticao-representativa',
  REPLAY: 'concept.replay',
  DIAGNOSTIC_PAGE: 'page.diagnostico',
  COMPARISON_PAGE: 'page.comparacao',
  PRESENTATION_PAGE: 'page.apresentacao',
  REPORT_PAGE: 'page.relatorio',
  CHAT: 'page.chat',
} as const;

export type HelpId = typeof HELP_IDS[keyof typeof HELP_IDS];

export const allHelpIds = Object.freeze(Object.values(HELP_IDS)) as readonly HelpId[];

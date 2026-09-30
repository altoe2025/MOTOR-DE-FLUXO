# Integração da versão Live na main

## Goal
Integrar na main a versão Live `29d955c38ee265d013119c02bde9d3f5efd6f488`, conforme autorização explícita de Gabriel em 2026-09-30.

## Architecture
Preservar o código publicado, integrar seu histórico por PR e verificar ancestralidade e paridade dos arquivos de produção. Render permanece no deploy atual.

## Tech Stack
Git/GitHub, Render Docker, Python/pytest, React/TypeScript/Vitest/Playwright.

## Spec
Referência Live conferida no dashboard; main inicial `3342059edddf1daaa881943a645a26dadd614139`, 52 commits atrás e nenhum exclusivo. Não incorporar branches posteriores ou alheias ao Live.

## Global Constraints
- Não alterar comportamento de produção, motor, credenciais ou configurações do Render.
- Preservar o checkout original e o commit Live; trabalhar em `codex/main-render-sync`.
- Ajustes de testes precisam refletir o comportamento já publicado, sem esconder falhas.
- Respeitar checks e proteção da main; não usar force push ou bypass.
- Registrar riscos e evidências; não declarar testes não executados como aprovados.

## Tasks
- [x] Conferir referência Live, estado remoto e divergência.
- [x] Auditar escopo e registrar inventário funcional e riscos.
- [ ] Investigar testes incompatíveis com o Live e validar sem mudanças de runtime.
- [ ] Atualizar diário e mapa; publicar PR para main e revisar.
- [ ] Aguardar checks, integrar e verificar ancestralidade/paridade final.

## Evidência inicial
Render: `motor-de-fluxo-piloto`, deploy `dep-dauml9942hec73f2cpf0`, Live `29d955c`, branch configurada main, Auto-Deploy Off. Nenhuma ação de deploy nesta tarefa.

## Verificação e bloqueio (2026-09-30)
- PR #59 draft: https://github.com/altoe2025/MOTOR-DE-FLUXO/pull/59.
- Front unitário: 144 arquivos / 1.236 testes aprovados após os ajustes de setup e sessão; typecheck e lint aprovados nesse candidato.
- CI 36779719966: 1.264 testes Python aprovados / 1 skip em modo normal e otimizado. Ruff apontou somente o alias `re.M` no teste de catálogo, corrigido para `re.MULTILINE`.
- E2E local confirmou expectativas de páginas retiradas (Premissas, Destaques do Replay, navegação antiga). Adaptações parciais permanecem locais, ainda sem validação; não foram publicadas como aprovadas.
- **Bloqueio real de runtime:** o teste `stage6-acceptance.spec.ts`, cenário "IndexedDB indisponível", permanece em "Preparando dados locais…". `providers.tsx:100` aguarda `switchSession` sem tratar rejeição; o reset em `studyController.ts:219` pode rejeitar. Não é apenas seletor desatualizado.
- Preservar exatamente o runtime Live e corrigir essa falha são objetivos incompatíveis. Nenhuma correção de produção, bypass da proteção, merge ou deploy foi feito. É necessária decisão do usuário sobre a correção mínima antes de prosseguir.

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
- [ ] Auditar escopo e registrar inventário funcional e riscos.
- [ ] Investigar testes incompatíveis com o Live e validar sem mudanças de runtime.
- [ ] Atualizar diário e mapa; publicar PR para main e revisar.
- [ ] Aguardar checks, integrar e verificar ancestralidade/paridade final.

## Evidência inicial
Render: `motor-de-fluxo-piloto`, deploy `dep-dauml9942hec73f2cpf0`, Live `29d955c`, branch configurada main, Auto-Deploy Off. Nenhuma ação de deploy nesta tarefa.

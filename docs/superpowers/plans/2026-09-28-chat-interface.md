# Chat orientado à interface — execução aprovada

Objetivo: explicar controles reais do frontend sem exigir simulação, manter o histórico e pedir esclarecimento específico em vez de recusa genérica. Complementa o plano de 2026-09-26 e preserva seu trabalho não commitado.

## Restrições

- Não alterar motor, autenticação, dados do usuário ou deploy.
- Catálogo baseado exclusivamente no código; não copiar contexto do vault.
- Contexto visual limitado a IDs conhecidos e estado habilitado/desabilitado; nunca valores de formulário ou texto arbitrário da página.
- Histórico não é evidência. Citações continuam validadas e fontes atuais obrigatórias para afirmações.
- MOT-92/94/95 consultadas no Linear; nenhuma issue será criada ou alterada. Sem commit/push nesta execução.

## Tarefas

1. Expandir catálogo de telas/controles/campos e IDs frontend com origem verificável. Testar consulta sem documento financeiro.
2. Transportar snapshot limitado dos controles renderizados, capturado no envio; consulta de interface retorna observações separadas das regras gerais. Testar privacidade, ocultos e ambiguidades.
3. Preservar resposta parcial com citações válidas quando faltam dados; fallback específico de contexto para resposta sem fontes. Orientar clarificação e impedir inferir qual botão está sendo referido.
4. Validar contratos, regressões chat, frontend e build. Registrar limites e evidências no diário.

## Progresso

- Base isolada existente: 1bd7654; mudanças de 2026-09-26 preservadas.
- Pré-voo: tarefas 1 e 2 compartilham IDs do catálogo; snapshot transmite somente IDs publicados. Tarefas 2 e 3 compartilham contexto HTTP; campos novos opcionais preservam requests antigos. Tarefa 4 verifica geração contra contrato final.
- Testes iniciais: ambiente Python básico não contém dependências web; usando .venv do checkout frontend-etapa-6-integracao.
- Tarefa 1 concluída: 200 IDs, fontes por família no relatório de cobertura.
- Tarefas 2/3 concluídas: snapshot restrito, captura no envio, respostas parciais preservadas. RED reproduziu descarte de resposta citada e rejeição do novo contrato antes das correções.
- Revisão final encontrou dois P2: fingerprint antigo após alterar seleção BOARD e links de apresentação sem rota/seleção. Corrigidos com regressões RED/GREEN; re-review confirmou ambos resolvidos, sem novo defeito material.
- Verificação: Python completo 1237 passed/3 skipped; frontend completo 1075 passed; E2E chat 17 passed; Python -O específico 131 passed. Smoke do modelo real permanece opt-in, não executado.
- Lint, typecheck, validadores gerados, build produção com sourcemaps e scanner de credenciais passaram. Worktree preservado, sem commit/push/deploy.

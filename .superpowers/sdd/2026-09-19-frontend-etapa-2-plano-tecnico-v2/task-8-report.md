# T8 / MOT-30 — editor de estudos

## Entrega

- Lista de estudos com abertura, restauração e exclusão para lixeira confirmando o alvo.
- Rotas de estudos, editor com nome, duplicação, status de autosave, erro de storage e conflito entre abas.
- Seletor acessível das origens sintética, manual e observada; somente Casos confirmados aparecem e a interface explicita que a fonte observada é somente leitura.
- O controlador expõe somente consultas/ações de repositório ligadas à sessão; não há acesso direto ao IndexedDB pelos componentes.
- Layout fluido, foco no título, mensagens `role=status`/`role=alert`, e controles nativos de teclado.

## Testes e gates

- `npm --prefix web run test:unit -- src/study/components/studyEditor.test.tsx src/app/router.test.tsx` — PASS, 17 testes.
- `npm --prefix web run typecheck` — PASS.
- `npm --prefix web run lint` — PASS.
- `npm --prefix web run build` — PASS (permanece aviso preexistente de chunk acima de 500 kB).

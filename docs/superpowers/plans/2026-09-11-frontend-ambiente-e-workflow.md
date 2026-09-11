# Front-end — ambiente e workflow de desenvolvimento

**Data da auditoria:** 2026-09-11

**Status:** preparação local aprovada como MOT-20; nenhuma funcionalidade de front-end iniciada

Este documento define como executar o trabalho descrito na
[`especificação aprovada`](../specs/2026-09-11-frontend-motor-de-fluxo-design.md) e
no [`plano geral de execução e distribuição de modelos`](2026-09-11-frontend-plano-geral-execucao-modelos.md).
Ele não substitui nem repete esses documentos. Cada etapa terá seu próprio plano
técnico antes de qualquer implementação.

## 1. Repositório e fronteiras

- Raiz local: `C:\Users\gabriel Altoe\Documents\dados sobre cambio\motor-de-fluxo`.
- Remote esperado e confirmado: `https://github.com/altoe2025/MOTOR-DE-FLUXO.git`.
- A pasta-pai `dados sobre cambio` não é a raiz Git.
- Código e testes são executados localmente. O GitHub recebe somente versões
  revisadas, organizadas em commits e pull requests.
- O pacote Python `motor` continua sendo a fonte de verdade. O front-end e o servidor
  devem consumir suas interfaces públicas; não podem copiar regras do motor.
- Permanecem obrigatórias a pureza de `geracao`, `netting`, `custo` e `simulacao` e a
  regra de importação registrada em `AGENTS.md` e `docs/architecture.md`.
- Contexto de negócio, regulatório ou proveniente do Obsidian não deve ser copiado
  para o repositório sem autorização explícita.

## 2. Checkout Local, worktrees e GitHub

O checkout **Local** é a cópia principal do repositório usada para ambientação,
inspeção e integração consciente. Uma **branch** é uma linha de commits; um
**worktree** é outro checkout ligado ao mesmo repositório e dedicado a uma branch ou
unidade isolada. Um **commit** preserva uma versão revisável. Um **pull request**
propõe integrar uma branch a outra e, depois das revisões e verificações, à `main`.
A `main` é a linha integrada, não um local para iniciar implementação sem decisão.

Fluxo obrigatório:

1. Fazer esta ambientação inicial no checkout Local.
2. Definir explicitamente a base Git e versionar estes documentos.
3. Abrir uma sessão de planejamento técnico somente para a próxima etapa e salvar o
   plano em `docs/superpowers/plans`.
4. Criar uma branch e um worktree por PR ou unidade realmente isolada, partindo da
   base confirmada.
5. Executar e testar no worktree; compartilhar trabalho apenas por commits e
   branches, nunca por cópia manual de arquivos entre worktrees.
6. Abrir PR pequeno e coerente, revisar e verificar antes de integrar.
7. Remover o worktree somente após confirmar que o trabalho foi integrado ou está
   preservado numa branch.

Não se deve iniciar trabalho novo sobre uma branch de análise empilhada sem decisão
explícita. Também se deve evitar duas tarefas editando os mesmos arquivos ao mesmo
tempo. Os seis worktrees das etapas não são criados antecipadamente: cada um nasce
quando sua tarefa efetivamente começa e com uma base novamente confirmada.

A documentação oficial do Codex descreve que worktrees compartilham os metadados Git,
mas têm checkouts independentes, e que uma mesma branch não pode ficar ativa em dois
worktrees: [Worktrees — OpenAI Docs](https://learn.chatgpt.com/docs/environments/git-worktrees).

## 3. Estado Git auditado

No momento desta auditoria:

- checkout atual: Local principal, branch `analise/sensibilidade-custo`;
- upstream: `origin/analise/sensibilidade-custo`;
- `HEAD` após a preparação: `38f4ae3`, cinco commits à frente do upstream;
- `origin/main` e `main`: `c465985`;
- não havia arquivo rastreado modificado antes desta preparação;
- já existia o worktree `.worktrees/fechamento-funcional-motor`, na branch
  `implementacao/fechamento-funcional-motor`, `HEAD` `3bc2839`;
- foram preservados os não rastreados e não relacionados
  `motor/cenarios/fluxo_gabriel.yaml` e `tests/test_exportar_player.py`.

A pilha descrita no MAPA continua aberta no GitHub e deve ser integrada nesta ordem:

`main` → PR #21 `gabriel/metrica-tempo` → PR #22
`gabriel/varredura-completa` → PR #23 `gabriel/mix-outbound` →
`analise/sensibilidade-custo`.

Os PRs #21, #22 e #23 estão abertos; o PR #17 continua aberto e separado. A branch
`analise/sensibilidade-custo` tem 19 commits sobre `main`, dos quais cinco ainda são
somente locais. A branch `implementacao/fechamento-funcional-motor` tem 32 commits
sobre `main`, foi publicada, ainda não tem PR e diverge da branch de análise após o
commit comum `2fc62a2`: ela contém o fechamento funcional, enquanto a branch de
análise contém, isoladamente, o commit da especificação do front-end `e44151c`.
O worktree de fechamento também contém trabalho local não commitado iniciado depois
dessa publicação; ele pertence ao seu próprio fluxo e não é tocado por esta ambientação.

### Base candidata e recomendação

| Base | Consequência |
|---|---|
| `main` atual | É estável e integrada, mas não contém a pilha #21–#23, as análises, os quatro commits locais nem o fechamento funcional necessário ao contrato analítico do front-end. Iniciar aqui exigiria reaplicar ou aguardar esse trabalho. |
| `analise/sensibilidade-custo` atual | Contém a pilha analítica e a especificação aprovada, mas é uma branch empilhada, quatro commits à frente do remoto e não contém os 15 commits posteriores de fechamento funcional. Aumenta o risco de integração e retrabalho. |
| base integrada após fechamento | Reúne a especificação e os contratos canônicos do motor após revisão dos PRs e da branch `implementacao/fechamento-funcional-motor`. Evita desenvolver contra APIs transitórias. |

**Regra operacional:** esta ambientação não aguarda nem interfere no worktree de
fechamento e não escolhe antecipadamente a base das etapas técnicas. Cada nova sessão
de planejamento ou implementação deve confirmar explicitamente sua branch e seu SHA
antes de criar o próprio worktree, registrar quais contratos estão disponíveis nessa
base e aceitar conscientemente as consequências da tabela acima. As integrações
pendentes continuam sendo manutenção necessária do repositório, mas não bloqueiam a
conclusão desta ambientação nem obrigam sessões independentes a esperar.

## 4. Planejamento, PRs e modelos

- Uma sessão de planejamento técnico é obrigatória antes de cada etapa.
- O plano técnico registra arquivos, contratos, testes, critérios de aceitação,
  fronteiras e a base Git exata, e fica em `docs/superpowers/plans`.
- A execução é dividida em PRs pequenos e coerentes; uma etapa pode exigir vários
  PRs. Cada PR deve entregar um incremento verificável.
- Os modelos seguem o plano geral: Terra é o executor padrão, Sol assume integração
  e análise complexas, Astra concentra contratos e decisões com alto custo de
  retrabalho, e Luna fica restrito a mudanças mecânicas claramente especificadas.
- Escalar de Luna/Terra para Sol quando houver integração transversal, autenticação,
  concorrência, estado distribuído, visualização analítica difícil ou falhas que
  atravessam camadas.
- Escalar para Astra quando houver decisão contratual ou arquitetural difícil de
  reverter, mudança em invariantes analíticas, coerência temporal do replay,
  segurança sistêmica ou tentativas repetidas que revelem problema de desenho.
- Erro local de compilação, ajuste mecânico ou implementação já determinada não
  justificam escalada por si sós.

Toda mudança enviada ao GitHub atualiza `docs/DIARIO-DE-MUDANCAS.md` no mesmo commit.
Cada commit usa `tipo: descrição (MOT-N)` e exige uma issue correspondente no Linear,
conforme `AGENTS.md`. O agente não cria issues no Linear nem reescreve suas
descrições; se o identificador não existir, deixa a mudança sem commit e solicita a
decisão humana.

## 5. Ferramentas e dependências auditadas

| Item | Estado em 2026-09-11 |
|---|---|
| Git | disponível, `2.51.0.windows.1` |
| Python | `3.14.4`; launcher `py` disponível; comando `python` não está no `PATH` |
| Ambiente virtual | `.venv` presente e válido, Python `3.14.4`; não estava ativado |
| pytest | `9.1.1` na `.venv` |
| Dependências Python | `PyYAML 6.0.3` e `numpy 2.5.2` instalados na `.venv` |
| `pyproject.toml` | requer Python `>=3.11`, `pyyaml` e `numpy`; extra `dev`: `pytest` |
| Node.js | disponível, `v24.19.0` |
| npm | disponível, `11.17.0` |
| pnpm | disponível como fallback do runtime do Codex, `11.19.0`; não adotado pelo projeto |
| yarn | ausente |
| Docker | ausente |
| GitHub CLI | disponível e autenticado como `altoe2025`; inspeção de leitura confirmada |
| GNU Make | ausente; usar os comandos equivalentes no Windows |
| `.codex` no projeto | configurado para o ambiente local `motor-de-fluxo` no Windows |
| manifesto web | não há `package.json` nem lockfile; front-end não iniciado |

Comandos atuais:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m motor motor/cenarios/exemplo_amanda.yaml
.\.venv\Scripts\python.exe -m motor varredura --saida varredura.csv
```

O `Makefile` oferece `make test`, `make exemplo` e `make varredura` quando GNU Make
está disponível.

### Gerenciador JavaScript para a Etapa 1

Nenhum gerenciador foi escolhido, porque não existe decisão registrada nem lockfile.
A decisão para o plano técnico da Etapa 1 é **npm**: já acompanha o Node
instalado, reduz uma dependência de bootstrap e é suficiente para o escopo inicial.
O `pnpm` detectado pertence ao runtime do Codex e não deve ser tratado como ferramenta
garantida da equipe. O lockfile do npm será criado somente na Etapa 1.

## 6. Ambiente local do Codex

O ambiente local `motor-de-fluxo` foi criado pela interface **Configurações →
Ambientes** do aplicativo e ficou salvo em
`.codex/environments/environment.toml`. Esse é um arquivo gerado pelo Codex: deve ser
alterado pela interface, não manualmente. Referência:
[Ambientes locais — OpenAI Docs](https://learn.chatgpt.com/pt-BR/docs/environments/local-environment).

O script abaixo é específico do Windows e roda automaticamente ao criar um worktree
novo:

Script Windows recomendado para futuros worktrees:

```powershell
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    py -3 -m venv .venv
}
.\.venv\Scripts\python.exe -m pip install -e '.[dev]'
```

As ações disponíveis no terminal integrado são:

- **Testar motor**:

  ```powershell
  .\.venv\Scripts\python.exe -m pytest -q
  ```

- **Executar exemplo amanda**:

  ```powershell
  .\.venv\Scripts\python.exe -m motor motor/cenarios/exemplo_amanda.yaml
  ```

Ações futuras, ainda pendentes:

- **Front-end:** instalar pelo gerenciador decidido e iniciar o servidor somente
  depois de existirem `package.json`, lockfile e scripts de projeto.
- **Servidor:** iniciar a aplicação somente depois de FastAPI, seu módulo de entrada
  e o comando oficial estarem definidos.

Não se copia `.venv`, `node_modules` ou caches entre worktrees; o setup os recria.
Arquivos ignorados potencialmente necessários — por exemplo `.env.local` ou uma
configuração local não secreta — devem ser identificados na Etapa 1. Se um worktree
gerenciado pelo Codex precisar recebê-los, usar `.worktreeinclude`, após revisão,
conforme a documentação oficial; não copiar manualmente. Credenciais reais não entram
automaticamente nessa lista sem uma decisão explícita de segurança.

## 7. Segredos e ambiente

- Nenhum segredo é commitado.
- `.env` e variantes locais são ignorados; um futuro `.env.example` pode conter
  somente nomes e descrições, nunca valores reais.
- A chave da OpenAI permanece somente no servidor.
- Segredos e chaves `service-role` do Supabase nunca entram no navegador.
- Credenciais reais são fornecidas manualmente em cada ambiente quando a integração
  correspondente existir.
- O plano técnico da Etapa 1 deve fixar os nomes finais. Categorias previstas, sem
  valores: configuração pública do cliente Supabase, URL/emissor/audiência de
  autenticação para validação no servidor, `OPENAI_API_KEY` somente no servidor e
  nome do modelo do chat configurável por ambiente.

O navegador pode receber apenas configuração explicitamente pública. A ausência de
segredo no Git não autoriza expor uma variável do servidor por prefixo de build do
front-end.

## 8. Checklist de uma tarefa

### Abrir

- [ ] Ler `AGENTS.md`, o topo do Diário, o MAPA e ADRs relevantes.
- [ ] Confirmar issue e identificador `MOT-N` no Linear, sem criá-los ou reescrevê-los.
- [ ] Confirmar a base Git por SHA e o estado dos PRs dos quais ela depende.
- [ ] Confirmar que a tarefa tem plano técnico aprovado e escopo delimitado.
- [ ] Criar branch e worktree exclusivos; verificar colisão de arquivos com outras tarefas.
- [ ] Rodar os testes relacionados antes da mudança.

### Verificar e concluir

- [ ] Executar testes unitários, integração, tipos, lint, build e inspeção visual na
  proporção do que foi alterado.
- [ ] Revalidar invariantes do motor quando o servidor consumir ou serializar seus resultados.
- [ ] Conferir diff, arquivos não rastreados e ausência de segredos.
- [ ] Atualizar o Diário no mesmo commit de qualquer mudança que irá ao GitHub.
- [ ] Criar commits pequenos no formato `tipo: descrição (MOT-N)`.
- [ ] Revisar o PR, confirmar CI e registrar limitações ou decisões pendentes.
- [ ] Integrar somente com autorização e na ordem compatível com PRs empilhados.
- [ ] Remover o worktree somente após confirmar integração ou preservação em branch.

## 9. Checklist de passagem entre etapas

- [ ] O critério de avanço da etapa anterior, definido na especificação e no plano
  técnico, foi demonstrado por testes e revisão.
- [ ] Entradas, resultados, contratos, versão e proveniência continuam coerentes.
- [ ] Dívidas ou limitações que afetam a próxima etapa estão registradas, sem
  transformar lacuna de negócio ou regulatória em regra inventada.
- [ ] O Diário reflete tudo que foi enviado ao GitHub.
- [ ] A base da próxima etapa foi confirmada por branch e SHA no início da sessão.
- [ ] Foi aberta uma nova sessão de planejamento e salvo um plano técnico próprio.
- [ ] Arquivos e responsabilidades foram divididos para evitar edição concorrente.
- [ ] O modelo executor e os critérios de escalada foram escolhidos conforme o plano geral.
- [ ] Segredos, variáveis e arquivos locais necessários ao novo worktree foram
  provisionados manualmente ou por configuração previamente revisada.

## 10. Decisões tomadas e ações ainda necessárias

Decisões confirmadas em 2026-09-11:

- esta preparação usa `MOT-20`, mantendo o padrão `MOT-N` do repositório;
- o SHA-base não será escolhido nesta ambientação: cada sessão técnica o confirmará
  explicitamente antes de criar seu worktree;
- npm será o gerenciador JavaScript da Etapa 1;
- o ambiente local `motor-de-fluxo` foi configurado no Codex para Windows, com setup
  Python e as ações **Testar motor** e **Executar exemplo amanda**;
- React, Vite, FastAPI e as demais dependências novas só serão instalados durante a
  Etapa 1, depois da aprovação do plano técnico correspondente.

As únicas ações manuais que permanecem fora da parte versionável desta ambientação são:

1. remover manualmente no Linear, se essa decisão organizacional for mantida, as
   issues `MOT-1` a `MOT-14`; esta ação destrutiva não é executada por este workflow;
2. provisionar as credenciais reais por ambiente somente quando cada integração for
   implementada.

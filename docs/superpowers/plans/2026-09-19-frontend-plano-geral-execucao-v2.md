# Front-end do Motor de Fluxo v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a versão completa do front-end em seis etapas, incorporando dados observados, perfis de empresa e conciliação sem remover diagnóstico, comparação, Replay, comunicação, segurança ou acabamento do plano original.

**Architecture:** Importador, geradores e edição manual convergem para ordens canônicas consumidas pelo mesmo motor. Empresas, Casos Observados, Perfis Operacionais, Estudos, Cenários e Execuções vivem atrás de um repositório versionado; cada execução preserva um snapshot imutável. Este é o plano mestre, e cada etapa recebe uma especificação e um plano técnico próprios antes da implementação.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, React Router 7, TanStack Query 5, IndexedDB, Vitest 5, Playwright 1.63, FastAPI, Pydantic, Supabase Auth e pacote Python `motor`.

**Spec:** `docs/superpowers/specs/2026-09-19-frontend-motor-de-fluxo-design-v2.md`

## Global Constraints

- As seis etapas pertencem à mesma versão completa e nenhuma é opcional.
- O pacote Python `motor` é a única fonte de verdade para geração, netting, custos e simulação.
- Cada operação ou fechamento real é um Caso Observado próprio; casos do mesmo mês não são agregados automaticamente.
- Observado × Motor usa resultado observado independente e nunca o reconstrói com o próprio motor.
- Perfil Operacional descreve observações; ordens geradas a partir dele continuam marcadas como sintéticas.
- Toda execução usa snapshot imutável de entrada, premissas, versões e proveniência.
- As telas não acessam IndexedDB diretamente.
- Persistência local possui schema, migrations, recuperação e controle de concorrência.
- Replay é uma capacidade central, implementada na Etapa 5 com contrato temporal próprio.
- Segurança analítica, autenticação, testes e coerência entre representações não podem ser removidas para acelerar uma etapa.
- Arquivos reais não entram no repositório sem autorização explícita e tratamento adequado.
- O plano não autoriza copiar contexto sensível para o repositório. Issues no Linear
  só podem ser criadas ou reescritas com aprovação explícita; a reorganização da
  Etapa 2 aprovada em 2026-09-19 está registrada no plano técnico v2.

---

## 1. Natureza do plano mestre

A especificação abrange subsistemas independentes. Cada etapa terá um plano técnico
separado com arquivos exatos, interfaces, passos TDD, verificações e commits. Este
documento fixa a ordem, as fronteiras, as dependências e os gates do produto completo.

Uma etapa posterior pode começar seu desenho antes da implementação da anterior
terminar, mas nenhum contrato compartilhado é implementado por duas etapas de formas
diferentes.

## 2. Estado de partida

### 2.1 Etapa 1 concluída

A `main` contém:

- aplicação React/FastAPI;
- autenticação e sessão;
- shell e rotas iniciais;
- cliente OpenAPI tipado;
- adaptador do motor;
- apresentação canônica básica;
- testes unitários, integrados e e2e;
- schema atual com autonetting preferencial.

Esses recursos são base das etapas seguintes e não serão reconstruídos.

### 2.2 Etapa 2 parcialmente produzida

A branch `codex/mot23-preparation-contracts` possui:

- `50fc384` — contratos de preparação de carteira;
- `1270458` — contrato local de estudos.

A branch está atrás da `main` e altera contratos gerados. Ela será auditada contra a
nova especificação da Etapa 2 antes de qualquer integração. Não será mergeada por
inteiro nem terá conflitos resolvidos automaticamente.

### 2.3 Importador em desenvolvimento

Os documentos de 2026-09-17 descrevem leitura, aliases, validação, lotes e revisão.
Eles precisam evoluir para publicar `ObservedCaseDraft` e `ObservedCase` no domínio
compartilhado, em vez de manter uma base isolada ou executar o motor diretamente.

## 3. Dependências do produto

```text
Etapa 1 — fundação concluída
        │
        ├── Importador ───────────────┐
        │                             ▼
        └── Etapa 2 — fluxo completo e persistência
                                      │
                                      ▼
        Etapa 3 — empresas, casos, perfis e diagnóstico
                                      │
                                      ▼
        Etapa 4 — hipóteses, comparação e marginal
                                      │
                                      ▼
        Etapa 5 — Replay temporal completo
                                      │
                                      ▼
        Etapa 6 — comunicação, acabamento e publicação
```

O importador pode avançar em paralelo à Etapa 2 depois que o contrato de saída for
aprovado. O Replay depende de execuções e resultados temporais estáveis, mas seu
contrato e critérios de aceitação são preservados desde o plano global.

## 4. Gate documental inicial

Antes de retomar código:

- [x] Aprovar a especificação global v2.
- [x] Aprovar este plano geral v2.
- [x] Criar e aprovar a especificação v2 do importador.
- [x] Criar e aprovar o plano técnico v2 do importador.
- [x] Criar e aprovar a especificação v2 da Etapa 2.
- [x] Criar e aprovar o plano técnico v2 da Etapa 2.
- [x] Marcar documentos anteriores como substituídos, preservando o histórico.
- [x] Atualizar o índice documental e o diário.

Gate aprovado por Gabriel em 2026-09-19. A rastreabilidade executável ficou em
MOT-62–MOT-64 e MOT-23–MOT-33; isso não equivale a autorizar merge ou iniciar código
sobre uma base ainda não integrada.

**Critério de saída:** importador, domínio local e API concordam sobre identidade,
ordens, período, proveniência, totais, resultado observado e versões.

## 5. Etapa 1 — fundação e contrato com o motor

**Situação:** entregue.

**Capacidades preservadas:**

- autenticação por convite;
- validação de token no servidor;
- mesma origem de publicação;
- OpenAPI e cliente gerado;
- adaptador único do motor;
- regras de apresentação;
- componentes básicos e identidade visual inicial;
- gates Python e web.

**Gate de regressão:** toda etapa seguinte mantém os testes da fundação verdes e
regenera contratos apenas pelas ferramentas oficiais.

## 6. Etapa 2 — primeiro fluxo completo

### 6.1 Entrega

```text
Criar ou abrir estudo
→ escolher origem da carteira
→ preparar e validar entrada
→ definir premissas
→ salvar snapshot
→ executar prévia
→ apresentar resultado básico
→ conciliar Observado × Motor quando aplicável
→ salvar, reabrir e continuar o estudo
```

### 6.2 Domínio e contratos

- Empresa leve e estável para vínculo de origem;
- `ObservedCaseDraft` e `ObservedCase`;
- origem discriminada da carteira;
- Estudo, Cenário, Execução e Snapshot;
- resultado observado independente;
- estados de resultado atual, desatualizado, em execução e falho;
- contratos HTTP e TypeScript gerados.

### 6.3 Preparação da carteira

- dados sintéticos existentes;
- carteira manual ou estimada;
- Caso Observado confirmado;
- premissas e proveniência;
- resumo, edição permitida e validação;
- transformação única para a entrada canônica do motor.

### 6.4 Persistência local

- repositório desacoplado das telas;
- IndexedDB com schema versionado;
- migrations explícitas e fixtures de versões anteriores;
- escrita atômica e controle de revisão;
- recuperação de rascunho;
- detecção de conflito entre abas;
- listagem, abertura, edição e remoção segura;
- preservação de execuções anteriores.

### 6.5 Execução e resultado

- integração real com o adaptador existente;
- idempotência por configuração;
- invalidação estrutural;
- reprecificação quando suportada;
- carregamento, falha e servidor indisponível;
- resultado básico canônico;
- Observado × Motor para métricas compatíveis.

### 6.6 Testes

- contratos Python e TypeScript;
- domínio, fingerprints e snapshots;
- migrations e concorrência;
- carteiras sintética, manual e observada;
- resultado ausente, incompatível e disponível;
- fluxo e2e completo;
- regressão da Etapa 1.

**Critério para avançar:** um estudo de cada origem percorre criar, executar, salvar,
reabrir, editar e executar novamente sem perder histórico ou apresentar resultado
antigo como atual.

## 7. Etapa 3 — empresas, casos, perfis e diagnóstico robusto

### 7.1 Empresas e casos

- navegação global Empresas/Estudos;
- resumo da empresa;
- histórico de Casos Observados;
- filtros por período, tipo e qualidade;
- vínculos com estudos;
- cobertura e lacunas.

### 7.2 Perfil Operacional

- seleção explícita de casos;
- validação de compatibilidade;
- cálculo de volume, frequência, tickets, direção, prazo, finalidade, janelas e
  sazonalidade;
- versão, método e cobertura;
- preservação das versões usadas em estudos.

### 7.3 Diagnóstico robusto

- executor com fila, progresso, cancelamento e concorrência limitada;
- múltiplas repetições;
- sete eixos;
- consequências determinísticas;
- limitações sustentadas por evidência;
- gráficos, tabelas e proveniência;
- comparação temporal de casos e perfis.

### 7.4 Testes

- perfil determinístico para conjunto de casos;
- cobertura incompleta e casos incompatíveis;
- progresso, cancelamento e duplicidade;
- separação entre distribuição e repetição;
- sete eixos e regras de consequência;
- regressão integrada das etapas anteriores.

**Critério para avançar:** o usuário entende uma empresa por seus casos, produz um
perfil versionado e executa diagnóstico robusto sem transformar ausência em conclusão.

## 8. Etapa 4 — hipóteses, comparação e análise marginal

### 8.1 Geração por perfil

- selecionar versão de perfil;
- informar composição, horizonte, escala e seed;
- gerar ordens explícitas e reproduzíveis;
- distinguir geração sintética de observação.

### 8.2 Variantes

- adicionar, retirar ou alterar participante;
- alterar janela, prazo, composição e premissas suportadas;
- preservar cenário-base;
- produzir nova execução e fingerprint.

### 8.3 Comparação

- validar versão, período, premissas e configuração estatística;
- explicar incompatibilidades;
- mostrar diferença de entrada antes da diferença de resultado;
- aplicar os sete eixos relevantes;
- calcular e apresentar análise marginal agregada.

### 8.4 Testes

- determinismo por seed;
- variantes sem mutação da base;
- matriz de compatibilidade;
- comparação de resultados canônicos;
- proibição de benefício individual não calculado;
- regressão integrada.

**Critério para avançar:** o usuário testa uma hipótese baseada em perfil real,
compara-a com a base e entende quais mudanças explicam o resultado.

## 9. Etapa 5 — Replay temporal

### 9.1 Contrato temporal

- todos os dias do horizonte;
- eventos, filas, ciclos, posições e fechamentos;
- ligação inequívoca com execução e repetição;
- snapshots necessários para navegação determinística;
- comparação sincronizada com e sem agrupamento.

### 9.2 Núcleo de reprodução

- estado inicial e transições puras;
- play, pause, velocidade e seleção de dia;
- avanço diário e próximo fechamento;
- troca de repetição;
- fim do horizonte e dias sem evento.

### 9.3 Cena e modos

- React/SVG próprio;
- novas ordens, filas, ciclo, casado, remetido e posições abertas;
- resumo factual do dia;
- modo Apresentação;
- modo Inspeção;
- faixa sincronizada com/sem agrupamento;
- nenhuma seta ou linguagem de pareamento físico.

### 9.4 Testes

- reducer temporal e transições;
- todos os dias, inclusive vazios;
- saltos, velocidades e fim;
- coerência com resultado canônico;
- acessibilidade de controles;
- regressão visual e desempenho;
- teste explícito de ausência de pareamento físico.

**Critério para avançar:** qualquer dia e repetição podem ser reproduzidos de maneira
determinística, sincronizada e fiel à execução.

## 10. Etapa 6 — comunicação, acabamento e publicação

### 10.1 Chat analítico

- contexto estruturado do resultado;
- ferramentas somente leitura;
- explicação de métricas, diferenças, proveniência e limitações;
- avaliação de perguntas sustentadas e não sustentadas;
- chave e modelo apenas no servidor.

### 10.2 Relatório e apresentação

- modelo de visualização compartilhado;
- relatório sem recálculo;
- CSS de impressão e paginação;
- modo de apresentação;
- igualdade com tela, comparação e Replay.

### 10.3 Endurecimento

- acessibilidade completa;
- desempenho;
- estados extremos;
- proteção de dados e política aprovada;
- observabilidade e diagnóstico operacional;
- contêiner, mesma origem e configuração de publicação;
- aceitação final integrada.

### 10.4 Testes

- chat sustentado, inconclusivo e resistente a tentativa de alteração;
- PDF e modo de apresentação;
- igualdade de valores em todas as representações;
- teclado, foco, contraste e leitores de tela;
- configuração de produção e credenciais;
- regressão completa Python e web.

**Critério de conclusão:** as seis etapas estão integradas, e um estudo reproduzível
mantém valores, versões, proveniência e limitações em todas as representações.

## 11. Estratégia de planos técnicos

Cada etapa seguirá esta sequência:

1. inventário do código e dos contratos vigentes;
2. especificação da etapa;
3. revisão e aprovação;
4. plano técnico com arquivos e interfaces;
5. execução TDD em branch ou worktree isolado;
6. revisão de conformidade com a especificação;
7. testes proporcionais e aceitação integrada;
8. atualização documental no mesmo conjunto de mudanças.

O plano da etapa seguinte é escrito contra a `main` atualizada, não contra uma
projeção antiga do repositório.

## 12. Auditoria do trabalho existente da Etapa 2

Depois da aprovação dos novos documentos:

- [x] Comparar `50fc384` com os contratos de importação e preparação v2.
- [x] Comparar `1270458` com o domínio, snapshots e repositório v2.
- [x] Separar código autoral de arquivos gerados.
- [ ] Reaplicar partes compatíveis sobre a `main` atual.
- [ ] Regenerar OpenAPI, TypeScript e schemas pelas ferramentas oficiais.
- [ ] Rodar testes Python, unitários web, typecheck, build, lint e e2e.

A matriz `REUSE` / `ADAPT` / `REGENERATE` / `DROP/SUBSTITUTE` e os IDs aprovados
estão em `2026-09-19-frontend-etapa-2-plano-tecnico-v2.md`. Nenhum arquivo dos dois
commits antigos será reaplicado por cherry-pick integral.

Aceitar automaticamente um lado do conflito é proibido para contratos gerados.

## 13. Gates entre etapas

| Gate | Evidência exigida |
|---|---|
| Etapa 1 → 2 | Fundação e API atuais verdes |
| Etapa 2 → 3 | Todas as origens criam estudos persistentes e executáveis |
| Etapa 3 → 4 | Perfis versionados e diagnóstico robusto estável |
| Etapa 4 → 5 | Execuções comparáveis e contrato temporal estável |
| Etapa 5 → 6 | Replay determinístico, fiel e acessível |
| Conclusão | Aceitação integrada em tela, comparação, Replay, chat e relatório |

## 14. Política documental

Novos documentos são criados em paralelo e revisados antes de substituir os
anteriores. Depois da aprovação de toda a nova cadeia:

- documentos antigos recebem aviso de substituição e link para a versão vigente;
- `MAPA.md` aponta para as fontes de verdade novas;
- `DIARIO-DE-MUDANCAS.md` registra o motivo, os arquivos e o que ficou superado;
- nenhum documento histórico é apagado.

## 15. Ordem imediata de trabalho

- [ ] Finalizar e revisar o plano geral v2.
- [ ] Criar especificação v2 do importador.
- [ ] Criar plano técnico v2 do importador.
- [ ] Criar especificação v2 da Etapa 2.
- [ ] Criar plano técnico v2 da Etapa 2.
- [ ] Executar revisão cruzada de tipos, responsabilidades e ordem.
- [ ] Atualizar documentos antigos e índices.
- [ ] Solicitar aprovação antes de retomar implementação.

O próximo passo de código só começa depois dessa cadeia documental.

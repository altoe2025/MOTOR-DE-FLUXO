# Etapa 4 — auditoria de partida da Evolução B

**Data:** 2026-09-21  
**Escopo:** composição de carteira sobre o MVP da Etapa 4  
**Base funcional auditada:** `codex/etapa-4-mvp` em `7ac9536`  
**Base remota vigente:** `origin/main` em `d612767`

## Resultado

O MVP contém as fronteiras necessárias para implementar a Evolução B sem alterar o
motor e sem antecipar o `StudyDocument` V4. A implementação deve começar integrando
a correção decimal de `origin/main`; a branch do MVP ainda é local, não foi publicada
nem mergeada e está baseada em `a9a633c`.

## Capacidades já presentes

- um Estudo sintético pode nascer de 1–100 Perfis ativos e imutáveis;
- cada Perfil materializa um participante distinto com snapshot integral de evidência;
- `EffectiveInput` já contém volume, mix, ticket, prazo, arquétipo, seed, eFX e
  finalidade por participante;
- `/api/v1/preparacoes` já materializa a lista completa de participantes;
- hipóteses são novos `ScenarioDocument` V3, com base preservada;
- cenários e execuções são persistidos pelo `ApplicationRepository` via
  `StudyController` e CAS;
- diagnóstico por cenário e comparação nos sete eixos já existem;
- nomes de cenários já permitem múltiplas hipóteses no mesmo Estudo.

## Bloqueios atuais confirmados

1. `applyProfileHypothesis` aplica volume, ticket, mix e prazo igualmente a todos os
   participantes; não existe delta individual.
2. A seleção de Perfis só ocorre ao criar o Estudo sintético; a hipótese não pode
   adicionar ou remover participantes.
3. Arquétipo, seed, eFX, finalidades e regras de IOF por finalidade são congelados.
4. `compareMvpDiagnostics` exige exatamente a mesma linhagem e os mesmos campos
   congelados; uma composição diferente é hoje incompatível por construção.
5. `MvpInputChange` não representa adição, remoção nem mudança por participante.
6. O V3 guarda snapshots completos, mas não persiste uma entidade de delta nem a
   relação formal base→hipótese. Após reload, os cenários permanecem, mas o par de
   comparação precisa ser selecionado novamente.

## Autoridades preservadas

- Perfil continua sendo evidência histórica agregada, não previsão;
- ordens derivadas de Perfil continuam `SYNTHETIC`;
- cenário-base permanece imutável;
- mudanças de composição regeneram ordens por `/api/v1/preparacoes`;
- janela e custos não reimplementam o motor nem o gerador;
- `ApplicationRepository` permanece a única porta de persistência;
- CAS decide conflitos entre abas; `BroadcastChannel` apenas notifica;
- comparação continua agregada, sem causalidade ou benefício individual.

## Riscos para a futura Evolução A

- sem V4, a linhagem base→hipótese não será uma entidade persistida;
- os snapshots da Evolução B precisam ser autocontidos e preservar Perfil,
  participante, seed, versões e proveniência para que A possa formalizar relações
  futuras sem recalcular carteiras antigas;
- cenários B antigos continuarão legíveis após A, mas não terão ancestralidade
  inventada retroativamente;
- não se deve introduzir um store paralelo de hipóteses nem acesso direto ao
  IndexedDB para compensar essa limitação.

## Conclusão

**READY, com preflight obrigatório.** A Evolução B pode ser implementada sobre o V3
em quatro blocos: domínio/materialização, UI, comparação e aceite integrado. Antes
do primeiro RED, a branch precisa conter tanto o MVP quanto `d612767`.

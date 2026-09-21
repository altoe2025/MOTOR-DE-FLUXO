# Front-end — Etapa 4, Evolução B: composição de carteira

**Data:** 2026-09-21  
**Status:** especificação para revisão; não autoriza implementação  
**Deriva de:** `2026-09-20-frontend-etapa-4-mvp-design.md`  
**Auditoria:** `docs/frontend/etapa-4-evolucao-b-auditoria.md`

## 1. Objetivo

Permitir que o usuário crie múltiplas hipóteses sintéticas a partir de uma base por
Perfil, alterando a composição e participantes individualmente, execute cada cenário
no diagnóstico existente e compare diferenças agregadas sem apresentar causalidade,
forecast ou benefício individual.

O critério funcional de saída é responder perguntas como “o que muda se este Perfil
entrar ou sair da pool?” e “o que muda se somente este participante tiver outro
volume, mix, ticket, prazo, arquétipo, eFX ou finalidade?”.

## 2. Escopo aprovado

Uma hipótese B pode:

- adicionar um Perfil disponível do mesmo owner como novo participante;
- remover um participante, mantendo pelo menos um;
- alterar por participante: volume mensal, fração OUT, ticket mediano, prazo,
  arquétipo do gerador, eFX, finalidade OUT e finalidade IN;
- alterar janela, os sete custos escalares e regras de IOF por finalidade;
- receber nome explícito e coexistir com outras hipóteses no mesmo Estudo;
- comparar composições distintas, identificando participantes mantidos, adicionados,
  removidos e modificados.

O caminho observado permanece com o contrato do MVP: somente janela e custos
escalares. Evolução B não transforma ordens observadas nem permite editar sua
composição.

## 3. Fora de escopo

- Receita formal, endpoint de compilação, origem `OPERATIONAL_PROFILE`, V4 e
  migrations da Evolução A;
- entidade persistida de delta, ancestralidade formal ou comparação selecionada;
- comparação pareada, incerteza e efeito marginal da Evolução C;
- mudança em `motor/`, P0, EDF, custos ou regras regulatórias;
- inferência causal, previsão, recomendação comercial ou benefício individual;
- fila durável, Replay, PDF, chat, publicação ou compartilhamento.

## 4. Modelo de hipótese B

O delta é tipado no domínio durante a criação, mas o artefato persistido continua
sendo um `ScenarioDocument` V3 com snapshot integral. Isso mantém o V3 executável e
evita um store paralelo. A relação base→hipótese existe durante a operação e nos
testes, mas não é inventada como história persistida; a formalização é responsabilidade
da Evolução A.

```ts
type CompositionParticipantChange =
  | Readonly<{
      kind: 'ADD_PROFILE';
      profile: OperationalProfileVersion;
      explicit: ProfileMvpExplicitFields;
    }>
  | Readonly<{
      kind: 'REMOVE_PARTICIPANT';
      participantId: string;
    }>
  | Readonly<{
      kind: 'UPDATE_PARTICIPANT';
      participantId: string;
      patch: Readonly<Partial<{
        monthlyVolumeBrl: string;
        ticketMedianBrl: string;
        outFraction: string;
        generatorProfile: EffectiveParticipant['profile'];
        deadline: EffectiveParticipant['deadline'];
        efx: boolean;
        purposeOut: string;
        purposeIn: string;
      }>>;
    }>;

type CompositionHypothesisDraft = Readonly<{
  kind: 'PROFILE_COMPOSITION';
  name: string;
  participantChanges: readonly CompositionParticipantChange[];
  windowDays: number;
  costs: CostPremises;
}>;
```

O draft é fechado: campos desconhecidos, patches vazios, operações duplicadas ou
contraditórias e nomes vazios falham antes de qualquer request HTTP.

## 5. Identidade e invariantes

- participante mantido preserva `participantId`, Perfil, fingerprint e seed;
- seed de participante mantido não é editável em B, para reduzir variação acidental;
- participante adicionado recebe UUID e seed explícitos e congelados;
- um Perfil/fingerprint e uma empresa aparecem no máximo uma vez na composição;
- IDs de participante são únicos;
- a composição final possui 1–100 participantes;
- Perfil adicionado precisa estar ativo, válido, compatível, pertencer ao owner e
  ter as três métricas exigidas pelo MVP;
- Perfil removido não apaga sua evidência histórica do Estudo nem modifica a base;
- atualização não pode trocar a identidade do Perfil ou do participante;
- cenário-base, seus snapshots, fingerprints e execuções permanecem byte a byte
  inalterados;
- toda hipótese recebe novo ID, revisão 1, nome e fingerprint calculado do snapshot
  materializado.

## 6. Materialização e proveniência

Uma função pura aplica o delta à entrada efetiva da base e produz a composição-alvo:

```ts
async function materializeCompositionDraft(input: Readonly<{
  base: ScenarioDocument;
  evidenceProfiles: readonly OperationalProfileVersion[];
  draft: CompositionHypothesisDraft;
  recordedAt: string;
}>): Promise<CompositionMaterialization>;
```

`CompositionMaterialization` contém participantes canônicos, Perfis adicionados,
diff tipado e um `EffectiveInput` validado. Adição, remoção, volume, mix, ticket,
prazo, arquétipo, eFX ou finalidade regeneram ordens em uma única chamada a
`/api/v1/preparacoes`. Alterações apenas de janela ou custos, incluindo
`iof_por_finalidade`, reutilizam as ordens existentes. Mesmo quando as ordens são
reutilizadas, o `generationInputSnapshot` da hipótese é reconstruído com janela,
custos e sources novos; isso impede que diagnósticos com múltiplas repetições usem
premissas econômicas antigas. O `sourceFingerprint` continua representando a
carteira de ordens, enquanto o `inputFingerprint` cobre também as premissas.

Campos preservados mantêm suas `EffectiveSource`. Cada campo alterado recebe
`ESTIMATIVA_USUARIO` com caminho, instante e identificação de hipótese. Um Perfil
adicionado usa a derivação já existente e preserva `profileId`, `companyId` e
`documentFingerprint`. Sources ausentes, excedentes ou obsoletas falham por
`assertExactEffectiveSources`.

Regras de IOF por finalidade são tratadas como conjunto canônico ordenado por
`(finalidade, direção)`, sem duplicatas. Alterá-las não muda prioridade operacional
nem regeneração de ordens; muda somente a premissa econômica do cenário. Como o V3
não possui campo de proveniência por regra em `ScenarioInputProvenance`, a
proveniência exata dessas regras permanece nos paths de `EffectiveInput.sources`;
os sete custos escalares continuam também em `ScenarioInputProvenance`.

## 7. Evidência e persistência V3

Perfis disponíveis para adição são lidos pela fachada do `StudyController`, que já
filtra o repositório pelo owner corrente; o componente não acessa IndexedDB. A
operação de domínio valida estado ativo, owner, fingerprint e duplicidade e produz
uma única próxima revisão do Estudo contendo, ao mesmo tempo, os novos snapshots de
evidência e o novo cenário. `StudyController.edit()` enfileira essa revisão e um
único `flush()` a persiste sob CAS. Assim, não existe estado parcial com evidência
sem cenário ou cenário sem evidência. Falha ou conflito preserva o draft e oferece
retry explícito.

O Estudo pode conter várias hipóteses nomeadas. Reload preserva cenários e execuções,
mas o usuário ainda seleciona novamente base e hipótese para comparar. Nenhuma
ancestralidade é reconstruída por nome, posição ou semelhança de snapshot.

Quando A for implementada, cenários B permanecem legíveis como snapshots V3. A não
deve inferir uma Receita ou ancestralidade inexistente; novas relações passam a ser
formais somente a partir do novo contrato.

## 8. Compatibilidade estrutural e comparação

A comparação deixa de exigir composição idêntica e passa a emitir relatório tipado:

```ts
type CompositionCompatibilityReport = Readonly<{
  status: 'COMPARABLE' | 'INCOMPATIBLE';
  maintained: readonly ParticipantPair[];
  added: readonly ParticipantSnapshot[];
  removed: readonly ParticipantSnapshot[];
  modified: readonly ParticipantDifference[];
  blockers: readonly CompositionCompatibilityBlocker[];
}>;
```

Participantes comuns são pareados por identidade estável e vínculo de Perfil. Uma
troca de Perfil com reutilização de `participantId` é incompatível. Adição e remoção
são diferenças válidas, não erro. Permanecem incompatíveis:

- famílias de origem diferentes;
- owner, horizonte, versão do motor, preparação ou gerador diferentes;
- Perfil comum com fingerprint divergente;
- seed divergente para participante mantido;
- snapshot ausente ou mudança fora do draft declarado;
- execução não terminal, stale ou sem envelope válido.

`MvpInputChange` evolui para incluir `PARTICIPANT_ADDED`, `PARTICIPANT_REMOVED`,
`PARTICIPANT_UPDATED` e `IOF_RULE`. A interface mostra primeiro o diff de entrada,
por participante, e depois os sete eixos agregados. O delta continua sendo
`hipótese − base`; indisponível nunca vira zero.

Composições diferentes recebem a limitação `COMPOSITION_CHANGED`. Resultados com
repetições independentes continuam recebendo `UNPAIRED_DIAGNOSTICS`. A interface não
usa “efeito marginal” porque B pode combinar várias mudanças.

## 9. Interface

O construtor da hipótese por Perfil passa a ter três áreas:

1. **Composição:** participantes da base, adicionar Perfil e remover participante;
2. **Participantes:** edição individual dos campos suportados com antes/depois;
3. **Premissas comuns:** janela, sete custos escalares e IOF por finalidade.

Cada operação mostra se regenerará ordens. Antes de criar, a UI exibe um resumo com
participantes adicionados, removidos e modificados. O botão de criação fica bloqueado
enquanto houver erro, Perfil indisponível ou nenhuma mudança.

A comparação apresenta tabela completa, agrupada por participante, seguida dos sete
eixos. Gráfico continua complementar. Fluxo funciona por teclado, possui foco visível,
não depende exclusivamente de cor e permanece legível a 200%.

## 10. Erros públicos e recuperação

Erros mínimos e estáveis no domínio da UI:

- `EMPTY_COMPOSITION`;
- `DUPLICATE_PROFILE`;
- `DUPLICATE_COMPANY`;
- `DUPLICATE_PARTICIPANT`;
- `UNKNOWN_PARTICIPANT`;
- `CONTRADICTORY_CHANGE`;
- `INVALID_PARTICIPANT_PATCH`;
- `PROFILE_UNAVAILABLE`;
- `OWNER_MISMATCH`;
- `IOF_RULE_DUPLICATE`;
- `UNDECLARED_CHANGE`;
- `INCOMPATIBLE_COMPOSITION`.

Falha de preparação, CAS ou navegação não descarta o draft. Não há retry automático.
Resposta tardia só pode concluir a intenção e revisão que a originaram.

## 11. Testes e critérios de aceite

1. adicionar Perfil válido produz novo participante e regenera uma vez;
2. remover participante preserva a base e bloqueia composição vazia;
3. cada campo individual altera somente o participante declarado;
4. participante mantido preserva Perfil, ID e seed;
5. Perfil duplicado, empresa duplicada, owner divergente e métrica ausente bloqueiam;
6. finalidade e regra de IOF preservam escaping e proveniência exatos;
7. janela/custos reutilizam ordens; mudanças de geração regeneram;
8. várias hipóteses nomeadas coexistem e sobrevivem ao reload;
9. compatibilidade classifica mantidos, adicionados, removidos e modificados;
10. mudança não declarada ou identidade reutilizada com outro Perfil bloqueia;
11. comparação mostra diff por participante antes dos sete eixos;
12. avisos `COMPOSITION_CHANGED` e `UNPAIRED_DIAGNOSTICS` ficam visíveis;
13. cenário-base permanece imutável;
14. duas abas preservam um único vencedor CAS e o draft perdedor;
15. E2E cria base com dois Perfis, remove um, adiciona outro, altera um participante,
    executa, compara e reencontra cenários após reload;
16. regressão do MVP e das Etapas 1–3 permanece verde.

## 12. Decomposição executável aprovada

- **MOT-82 / B1 — domínio e materialização:** delta tipado, validação, sources, preparação e
  evidência de Perfil;
- **MOT-83 / B2 — construtor de composição:** UI de adicionar/remover/editar, resumo e retry;
- **MOT-84 / B3 — compatibilidade e comparação:** relatório estrutural, diff individual e
  apresentação acessível;
- **MOT-85 / B4 — integração e aceite:** concorrência, reload, E2E, regressão e documentação.

Esses quatro blocos foram criados no Linear em 2026-09-21, no projeto
`Motor de fluxo de CNR`, com dependências MOT-81 → MOT-82 → MOT-83 → MOT-84 → MOT-85.

## 13. Riscos e decisões

| Risco | Resposta |
|---|---|
| B começar sobre branch anterior à correção decimal | preflight integra `origin/main` antes do primeiro RED |
| UI virar segunda engine | UI produz draft; domínio puro materializa; backend continua preparando e executando |
| adição de Perfil perder evidência | evidência e cenário entram na mesma revisão do Estudo e no mesmo CAS |
| diferença estrutural ser chamada de marginal | proibição de linguagem e limitação `COMPOSITION_CHANGED` |
| A precisar reconstruir passado | snapshots integrais ficam legíveis; A não inventa ancestralidade retroativa |
| IOF influenciar prioridade operacional | IOF permanece premissa econômica, nunca critério EDF |

## 14. Recomendação técnica

Implementar B integralmente sobre o V3, sem antecipar V4, mas mantendo delta tipado
como entrada de domínio e snapshot integral como saída persistida. Essa é a menor
mudança que amplia materialmente o espaço de análise, preserva o MVP e mantém uma
transição segura para A.

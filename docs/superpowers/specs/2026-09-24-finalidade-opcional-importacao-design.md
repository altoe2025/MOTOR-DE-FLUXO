# Finalidade opcional na importação observada

**Data:** 2026-09-24  
**Estado:** design aprovado em conversa; implementação ainda não iniciada  
**Issue de reconciliação:** MOT-90

## 1. Problema

A importação aceita revisar e persistir um XLSX sem finalidade, mas a execução de
qualquer Estudo descendente de XLSX exige hoje um catálogo com estado
`CONFIGURADO` e um par `(finalidade, direção)` para cada ordem. O catálogo de
produção nasceu deliberadamente `NAO_CONFIGURADO`, pois o projeto não possuía uma
decisão regulatória para preencher suas finalidades. Na prática, essa cautela
impede o percurso observado inteiro, embora o motor já possua alíquotas fallback
por direção (`iof_out` e `iof_in`).

O produto deve aceitar finalidade quando ela existir, mas não exigir finalidade
para importar, criar ou executar um Estudo.

## 2. Decisão

`finalidade_codigo` passa a ser dado opcional e não bloqueante.

- O XLSX aceita o layout com ou sem a coluna `finalidade_codigo`.
- Célula ausente ou vazia produz `finalidade = null` em todas as camadas até o
  motor.
- Uma finalidade informada é normalizada, preservada e registrada na
  proveniência da ordem.
- Uma finalidade sem regra específica também não bloqueia a execução.
- A execução usa regra específica somente quando existe uma entrada exata para
  `(finalidade, direção)`; nos demais casos usa `iof_out` ou `iof_in`.
- Nenhuma finalidade genérica, código regulatório ou alíquota específica será
  inventado.

O comportamento coincide com a semântica já existente em
`motor.custo.aliquota_iof`: regra específica quando disponível, fallback por
direção quando não disponível.

## 3. Catálogo e contratos

O endpoint do catálogo permanece compatível durante esta mudança. Os campos
`status`, `finalidades`, `custos_padrao` e a versão/hashes continuam disponíveis;
`status` deixa de ser uma autorização para executar e passa a descrever somente
se há uma tabela de finalidades publicada.

Manter o formato evita uma quebra desnecessária do contrato `1.0.0` e permite
publicar regras específicas futuramente. O catálogo `NAO_CONFIGURADO` com lista
vazia passa a ser um estado operacional válido: custos padrão por direção podem
ser usados sem regras específicas.

O catálogo indisponível também não bloqueia a execução de um Estudo já criado. O
Estudo executa exclusivamente com o snapshot de premissas e custos persistido no
próprio cenário. A consulta ao catálogo pode orientar a criação/revisão, mas não
pode alterar retroativamente nem impedir um cenário reproduzível.

O contrato canônico `OrdemEntrada` e `motor.dominio.Ordem` mudam de
`finalidade: str` para `finalidade: str | None`. A chave continua obrigatória nos
payloads e snapshots, mas aceita `null`; isso torna a ausência explícita e evita
um código sentinela que poderia parecer uma classificação regulatória real. Os
validators validam espaços e tamanho somente quando o valor for texto. Regras de
`iof_por_finalidade` continuam exigindo uma finalidade textual não vazia.

Essa ampliação é retrocompatível com payloads e Estudos existentes, que continuam
usando strings. Schemas, tipos TypeScript, serialização canônica, identidade,
fingerprints e adaptadores são regenerados ou ajustados juntos para que `null`
seja estável e reproduzível. Não haverá migração de registros persistidos.

O campo de finalidade não será removido do motor, do Estudo, dos snapshots ou da
proveniência. A proveniência continua registrando `NOT_COLLECTED` quando o valor
for `null`.

## 4. Fluxo da importação

1. O preflight exige apenas as colunas operacionais: identificação, cliente,
   direção, datas e valor.
2. Se `finalidade_codigo` existir, o parser mantém a coluna e valida somente seu
   formato e limite de tamanho.
3. Ausência de finalidade deixa de emitir `PURPOSE_MISSING` como erro. A interface
   pode apresentar uma limitação informativa agregada, sem afetar elegibilidade.
4. Caso, Perfil, Estudo e cenário guardam a ausência de forma explícita.
5. Antes de executar, o serviço valida o snapshot e as premissas persistidas, mas
   não consulta um catálogo como gate de autorização.
6. O servidor aplica a tabela opcional de `iof_por_finalidade` e, sem combinação
   exata, usa o fallback da direção.

Arquivos XLSX antigos com a coluna continuam válidos. Estudos já persistidos não
precisam de migração de dados.

## 5. Interface e proveniência

A importação deixa de mostrar que a execução está bloqueada por catálogo. Quando
o catálogo estiver ausente ou sem finalidades, a interface informa de modo não
bloqueante que o cálculo usará os parâmetros padrão por direção.

Resultados e documentos devem distinguir:

- `IOF específico por finalidade`, quando houve combinação exata; e
- `IOF padrão por direção`, quando foi usado `iof_out` ou `iof_in`.

A ausência de finalidade não pode ser apresentada como dado regulatório inferido.
O snapshot mantém custos, origem, versão e indicação de parâmetros sintéticos ou
não calibrados já existentes.

## 6. Compatibilidade e falhas

- Finalidade válida e regra específica: comportamento numérico preservado.
- Finalidade válida sem regra específica: fallback por direção.
- Finalidade ausente: fallback por direção.
- Catálogo vazio, `NAO_CONFIGURADO` ou temporariamente indisponível: não bloqueia
  cenário que já contém suas premissas.
- Premissas inválidas ou ausentes continuam bloqueando a execução.
- Falhas de autenticação, contratos inválidos e isolamento entre owners continuam
  com a política atual; esta decisão remove apenas o gate de finalidade.

## 7. Testes e aceite

A implementação deve ser guiada por testes que cubram:

- XLSX sem a coluna de finalidade;
- XLSX com coluna vazia;
- XLSX com finalidade preservada;
- finalidade com e sem regra específica;
- fallback distinto para `OUT` e `IN`;
- catálogo vazio, não configurado e indisponível;
- cenário reproduzível sem consulta ao catálogo durante execução;
- ausência de alteração numérica quando há regra específica;
- proveniência e rótulo da origem da alíquota;
- regressão integral Python normal e `-O`, TypeScript e Playwright.

O aceite local da Etapa 6 deixa de exigir um catálogo regulatório preenchido. Ele
exige que um XLSX canônico sem finalidade chegue a Diagnóstico, Replay,
apresentação e PDF usando custos padrão por direção, com a limitação explícita.
Docker/Linux e o smoke publicado continuam gates separados e não são dispensados
por esta decisão.

## 8. Fora de escopo

- definir ou validar conteúdo regulatório de finalidades;
- remover finalidade do domínio do motor;
- alterar as alíquotas padrão atuais;
- recalibrar PTAX, spread, carry ou custos fixos;
- mudar EDF, netting, conservação ou qualquer regra de simulação;
- publicar, fazer deploy ou criar recursos externos.

## 9. Migração documental

A implementação atualizará a especificação de importação, arquitetura, ajuda,
roteiros e matriz de aceite que ainda descrevem o catálogo como gate. Afirmações
anteriores de que `NAO_CONFIGURADO` deve impedir toda execução importada deixam de
ser válidas após a mudança de código; até lá, descrevem corretamente o
comportamento corrente.

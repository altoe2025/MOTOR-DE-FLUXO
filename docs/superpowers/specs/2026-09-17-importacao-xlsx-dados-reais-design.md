# Importação XLSX de operações reais — especificação técnica

> **Anexo técnico preservado.** A arquitetura de produto e a fronteira com estudos
> foram substituídas em 2026-09-19 por
> [`2026-09-19-importacao-dados-reais-design-v2.md`](2026-09-19-importacao-dados-reais-design-v2.md).
> Limites, inspeção OOXML, códigos de erro, parsing, aliases, auditoria, segurança e
> desempenho do XLSX canônico continuam normativos onde a v2 os referencia.
>
> **Revisão de 2026-09-24:** finalidade obrigatória e catálogo como gate, decisões
> originais deste anexo, foram superados por
> [`finalidade opcional`](2026-09-24-finalidade-opcional-importacao-design.md).
> Os trechos normativos abaixo refletem a revisão; a data original é preservada.

Data: 2026-09-17. Estado: decisões funcionais aprovadas pelo Gabriel; documento de
handoff para implementação pelo Felipe. Esta especificação não autoriza regenerar a
grade histórica e não altera a política P0 do motor.

## 1. Objetivo

Construir uma camada local-first que receba uma planilha `.xlsx` resumida, preserve
cada operação OUT/IN separadamente, permita revisar e corrigir os dados e produza o
`PreviaRequest` canônico que a API atual já entrega ao Motor de Fluxo.

O fluxo final é:

```text
.xlsx local
  -> inspeção estrutural segura no Web Worker
  -> parsing, normalização e validação por linha
  -> estudo local em IndexedDB
  -> revisão, aliases, conflitos, recorte e premissas
  -> confirmação explícita do conjunto executável
  -> PreviaRequest 1.0.0
  -> POST /api/v1/previas
  -> resultado canônico 2.0.0
  -> diagnóstico existente
```

O importador é um subsistema do `web/`, não uma aplicação separada. Seu domínio é
independente de React, IndexedDB e HTTP. A integração visual pode evoluir sem
reescrever parser, validação, composição da carteira ou adaptador.

## 2. Base obrigatória e precedência

Felipe deve começar pela `origin/main` mais recente, depois de ler `AGENTS.md`, o
topo de `docs/DIARIO-DE-MUDANCAS.md`, `docs/MAPA.md`, esta especificação e o plano
associado. O estado inspecionado ao escrever este documento foi `main` em
`c2ad1755899ddeafdf30f70350b5025ca55ddbaa`, com autonetting preferencial integrado.
Esse SHA é referência histórica, não instrução para trabalhar sobre uma base antiga.

Esta especificação complementa a Etapa 2 descrita em
`docs/superpowers/specs/2026-09-13-frontend-etapa-2-design.md`. Ela substitui apenas
a exclusão antiga de importação de arquivo. Não pressupõe que a Etapa 2 completa já
esteja implementada e não autoriza implementar geração sintética, variantes ou
comparação.

Decisões expressas neste documento prevalecem sobre propostas antigas de importação.
Contratos públicos presentes no código continuam prevalecendo onde este documento
não os modifica explicitamente.

## 3. Fronteiras e responsabilidade

### 3.1 Navegador

O navegador:

- lê o `.xlsx` e calcula seu SHA-256;
- inspeciona a estrutura interna do arquivo;
- converte células em valores canônicos;
- preserva erros, valores originais e correções;
- resolve identidade de clientes e conflitos entre lotes;
- persiste o estudo na conta autenticada;
- monta e valida o `PreviaRequest`;
- envia somente JSON canônico para a API.

### 3.2 Servidor

O servidor:

- autentica o usuário como já faz;
- publica catálogo e defaults comuns, versionados e somente leitura;
- revalida o `PreviaRequest` inteiro;
- executa o adaptador e o motor existentes;
- nunca recebe o arquivo, seu nome, o nome do cliente ou as células originais.

### 3.3 Motor

Nenhum arquivo em `motor/` deve mudar nesta etapa. Cada linha válida continua uma
`Ordem` explícita. O importador não pré-neta, não agrega e não elimina OUT/IN do
mesmo cliente. A P0 faz autonetting intracliente no fechamento e depois netting
multilateral dos saldos, conforme `docs/adr-autonetting-preferencial.md`.

## 4. Contrato da planilha

### 4.1 Arquivo e aba

- Extensão aceita: somente `.xlsx`.
- Tamanho compactado máximo: 5 MiB.
- Conteúdo descompactado máximo: 25 MiB.
- Máximo de 128 entradas no ZIP.
- Exatamente uma planilha, visível, chamada `operacoes`.
- Exatamente uma linha de cabeçalho e até 1.000 linhas de dados não vazias.
- Linhas totalmente vazias no final são ignoradas; linha vazia entre operações é
  preservada como erro de linha.
- Fórmulas, células mescladas, macros/VBA, links externos, objetos OLE e planilhas
  adicionais são recusados antes do parsing dos valores.
- Imagens, comentários, validações de célula e formatação visual não têm semântica e
  não são carregados.
- O arquivo não pode estar criptografado ou protegido por senha.

### 4.2 Cabeçalho canônico

A ordem e a grafia devem ser exatas:

```text
operacao_id | cliente_nome | classificacao_perfil | direcao |
data_conhecida | data_limite | valor_brl
```

Uma oitava coluna opcional pode ser acrescentada com o header exato
`finalidade_codigo`; não se interpreta texto em H2 como finalidade sem esse header.

Não há colunas extras, aliases de cabeçalho ou inferência por posição. A versão
interna deste layout é `xlsx-operacoes/1.0.0` e é inferida pelo cabeçalho; não existe
uma célula de versão obrigatória.

### 4.3 Campos

| Campo | Obrigatório | Regra |
|---|---:|---|
| `operacao_id` | sim | texto estável, único, 1–128 caracteres, sem espaços externos |
| `cliente_nome` | sim | texto de 1–200 caracteres após trim |
| `classificacao_perfil` | não | texto informativo de até 120 caracteres; nunca afeta o motor |
| `direcao` | sim | exatamente `OUT` ou `IN` após trim e uppercase |
| `data_conhecida` | sim | data Excel válida ou texto `DD/MM/AAAA` |
| `data_limite` | sim | mesma forma; maior ou igual à data conhecida |
| `valor_brl` | sim | célula numérica ou texto decimal positivo, máximo `10^12`, até 6 casas |
| `finalidade_codigo` | não | oitava coluna opcional; texto normalizado de 1–128 caracteres; ausência/vazio vira `null` com proveniência `NOT_COLLECTED` |

`valor_brl` representa BRL. Não há moeda, corredor nem conversão cambial nesta etapa.
Texto monetário aceita dígitos com vírgula decimal, sem separador de milhar, por
exemplo `1500000,00`. Célula numérica é lida pela representação decimal do XML, não
por `Number`, e normalizada para ponto decimal ASCII sem expoente.

Datas são dias civis, sem calendário de feriados. Internamente são strings ISO
`AAAA-MM-DD`; timestamps e fuso horário não participam do cálculo.

## 5. Inspeção e parsing seguro

O trabalho pesado ocorre em `xlsx.worker.ts`. O arquivo é transferido como
`ArrayBuffer`; o thread principal não recebe XML descompactado. Dependências diretas
fixadas:

- `read-excel-file@9.3.10`, usando o export `universal` dentro do worker;
- `fflate@0.8.3`, para inspeção ZIP com limites explícitos;
- `saxen@11.1.1`, para ler OOXML sem depender de `DOMParser` no worker;
- `fake-indexeddb@6.2.5`, apenas em desenvolvimento/testes.

A inspeção reconhece a assinatura OLE Compound File usada por XLSX criptografado e
retorna `ENCRYPTED_FILE_NOT_ALLOWED`; nos demais casos, valida assinatura ZIP,
`[Content_Types].xml`, workbook, relacionamentos e worksheet antes de entregar o
buffer ao leitor de células. A descompactação é
incremental: aborta ao ultrapassar quantidade de entradas ou bytes descompactados.
Não basta procurar texto com regex nem confiar no MIME informado pelo navegador.

O resultado do worker contém apenas metadados do lote, células serializadas, hash e
erros estruturais. O `ArrayBuffer` e as entradas ZIP são liberados depois da
resposta e nunca são entregues ao repositório.

## 6. Validação, erros e estado das linhas

Cada linha recebe um `row_id` UUID e conserva:

- número original da linha;
- valores originais serializáveis;
- valores normalizados quando válidos;
- lista de erros estruturados `{code, field, message}`;
- lote de origem;
- histórico de edições.

Erros de arquivo impedem incorporar o lote. Erros de linha não impedem carregar as
demais linhas. Códigos de arquivo obrigatórios:

```text
FILE_TOO_LARGE
FILE_NOT_XLSX
WORKBOOK_INVALID
SHEET_COUNT_INVALID
SHEET_NAME_INVALID
HEADERS_INVALID
FORMULA_NOT_ALLOWED
MERGED_CELL_NOT_ALLOWED
MACRO_NOT_ALLOWED
EXTERNAL_LINK_NOT_ALLOWED
ENCRYPTED_FILE_NOT_ALLOWED
ROW_LIMIT_EXCEEDED
ZIP_LIMIT_EXCEEDED
```

Códigos de campo/portfólio obrigatórios:

```text
REQUIRED
INVALID_FORMAT
VALUE_OUT_OF_RANGE
DATE_ORDER_INVALID
DIRECTION_INVALID
DUPLICATE_ID_IN_BATCH
CONFLICTING_ID_ACROSS_BATCHES
RECUT_TOO_LONG
DEADLINE_OUT_OF_RANGE
EXECUTION_LIMIT_EXCEEDED
UNRESOLVED_CONFLICT
```

Mensagens podem ser amigáveis, mas regras e testes usam os códigos.

## 7. Identidade de cliente e aliases

O nome original nunca é enviado ao servidor. O navegador cria um UUID estável para
cada cliente canônico e usa esse UUID como `cliente_id`.

Chave mecânica de nome:

1. Unicode NFKC;
2. trim;
3. colapso de espaços internos;
4. lowercase `pt-BR`;
5. remoção de diacríticos para comparação.

Somente igualdade dessa chave é automática. Pontuação, sufixo societário, abreviação
ou semelhança textual não produzem merge silencioso. Um nome novo cria um cliente
canônico novo. O usuário pode associá-lo explicitamente a um cliente existente; a
associação vira alias persistente da conta, pode ser revista e desfeita e invalida
resultados afetados.

## 8. Estudos, lotes, duplicidade e auditoria

Um estudo acumula vários imports. Cada arquivo aceito vira um lote imutável com:

- UUID, sequência monotônica e status ativo/revertido;
- nome, tamanho, SHA-256, instante UTC e versão do layout;
- contagens por estado;
- linhas normalizadas e erros;
- nenhuma cópia do binário.

Reimportar o mesmo SHA-256 no mesmo estudo não cria lote sem confirmação. IDs
repetidos dentro do mesmo arquivo tornam todas as ocorrências conflitantes; não há
vencedor arbitrário. Entre lotes:

- versões canonicamente idênticas podem ser ignoradas, mantendo a proveniência dos
  dois lotes;
- versões diferentes exigem decisão explícita entre manter a vigente e substituir
  pela nova;
- conflito não resolvido bloqueia qualquer execução que depender desse ID.

Desfazer um lote marca-o como revertido e recompõe o portfólio por replay
determinístico dos lotes ativos e decisões restantes. Operações exclusivas daquele
lote desaparecem; uma operação substituída volta à versão anterior. O lote e a ação
continuam auditáveis até a exclusão do estudo.

Edições são eventos append-only com campo, valor originalmente importado, valor
anterior, valor novo, instante UTC e ID da ação. Excluir/restaurar operação também é
evento, sem justificativa obrigatória. Toda alteração semântica aumenta a revisão do
estudo e torna resultados anteriores desatualizados.

## 9. Recorte temporal

O usuário escolhe início e fim inclusivos pela `data_conhecida`. O default cobre o
menor e o maior dia conhecido do estudo. Se esse default exceder os limites do
contrato, o estudo continua carregado, mas a execução fica bloqueada até o usuário
reduzir o recorte.

Para um recorte `[inicio, fim]`:

- entram operações válidas com `data_conhecida` dentro do intervalo;
- `periodo_medicao_dias = diferença_em_dias(inicio, fim) + 1`;
- o máximo executável é 730 dias;
- `dia_conhecida` e `dia_limite` são offsets civis desde `inicio`;
- `horizonte_dias = periodo_medicao_dias` para cumprir o contrato atual;
- `periodo = {modo: "NATURAL", dias_aquecimento: 0,
  periodo_medicao_dias}`;
- prazo pode terminar depois do fim do recorte, até offset 1.095; a execução temporal
  do servidor acompanha a liquidação;
- nenhuma linha é repartida ou truncada para caber no período.

## 10. Finalidades e parâmetros globais

O servidor publica `GET /api/v1/catalogos/importacao`, autenticado e `no-store`, com:

```text
schema_version: 1.0.0
catalog_version: SHA-256 do JSON canônico
status: CONFIGURADO | NAO_CONFIGURADO
finalidades: código, descrição, direções permitidas e alíquota por direção
custos_padrao: CustoEntrada, rótulo de origem e calibrado=false
```

O catálogo é comum a todos os usuários, versionado no repositório e somente leitura.
Não existe editor regulatório nesta etapa. O arquivo de produção nasce
intencionalmente sem finalidades e com `status=NAO_CONFIGURADO`; nenhuma finalidade
ou alíquota é inventada. Testes usam catálogo injetado e explicitamente fictício.

Importar, revisar e executar não dependem de catálogo configurado. O cenário usa
somente suas premissas persistidas: regra específica quando existir combinação
exata de finalidade e direção; sem ela, IOF padrão por direção (`iof_out`/`iof_in`).
Catálogo vazio, `NAO_CONFIGURADO` ou indisponível não bloqueia esse cenário.
A execução registra versão e snapshot das entradas usadas, sem inferir finalidade.

Parâmetros fora da planilha: janela P0, PTAX, IOF fallback, carry CNR, spread, custo
fixo e custo de oportunidade. Defaults são visíveis, versionados, editáveis no
estudo por qualquer usuário já autorizado à aplicação e marcados como não
calibrados. Janela default: 7 dias corridos, intervalo 1–730. Alterar qualquer
parâmetro invalida o resultado atual.

## 11. Proveniência e compatibilidade eFX

O contrato `OrigemValor.tipo` passa a aceitar:

```text
PADRAO_SINTETICO | ESTIMATIVA_USUARIO | DADO_OBSERVADO | NAO_COLETADO
```

`DADO_OBSERVADO` é usado para valores não editados vindos do XLSX e para regras do
catálogo. Uma edição manual passa a `ESTIMATIVA_USUARIO`. Defaults técnicos usam
`PADRAO_SINTETICO`.

A planilha não contém eFX. O domínio local guarda `efx_status=NAO_COLETADO`. Na
fronteira HTTP, `eh_efx=false` é enviado apenas porque o DTO e o motor atuais exigem
booleano, com proveniência `NAO_COLETADO`. A validação do servidor permite esse tipo
somente em `/ordens/{n}/eh_efx` e somente quando o valor é `false`. A UI mostra a
limitação; nunca apresenta “não eFX” como dado fornecido pelo usuário.

`operacao_id` continua sendo `OrdemEntrada.id`. `classificacao_perfil` e nome do
cliente ficam locais. Nenhuma operação é agregada no adaptador.

## 12. Persistência local

Banco por projeto Supabase e `owner_sub`:

```text
motor-fluxo:imports:v1:<project-ref>:<owner-sub>
```

Stores da versão estrutural 1:

| Store | Chave | Conteúdo |
|---|---|---|
| `studies` | `study_id` | cabeçalho, revisão, recorte, parâmetros e estado |
| `batches` | `[study_id, batch_sequence]` | metadados imutáveis do lote |
| `versions` | `[study_id, operation_id, batch_sequence, row_number]` | valores e erros da linha |
| `events` | `[study_id, event_sequence]` | decisões, edições, exclusões e reversões |
| `aliases` | `normalized_name` | cliente canônico e histórico da associação |
| `executions` | `[study_id, execution_id]` | request, catálogo e envelope imutáveis |
| `operations` | `operation_id` | IDs de mutação já confirmados para idempotência |

Toda mutação é transacional e usa CAS por `revision`. `BroadcastChannel` avisa outras
abas sem transportar dados financeiros; CAS continua sendo a proteção real. O
repositório fecha no logout e em `versionchange`. Logout não apaga dados.

O estudo e seus lotes permanecem até exclusão explícita. Há ações separadas para
excluir um estudo e apagar todos os dados locais da conta. Ambas exigem confirmação;
a segunda fecha o banco antes de `deleteDatabase`. Não há upload, backup remoto nem
exportação nesta etapa.

## 13. Fluxo de interface

1. **Upload:** selecionar um `.xlsx`, mostrar limites, progresso e erros de arquivo.
2. **Revisão:** tabela pesquisável com todas as linhas, erros, conflitos, aliases,
   correção inline, exclusão/restauração e desfazer lote.
3. **Recorte e parâmetros:** escolher datas, janela e custos; mostrar origem,
   calibração, versão do catálogo, IOF padrão por direção e bloqueios operacionais.
4. **Confirmação:** resumir total importado, fora do recorte, inválido, excluído,
   substituído e executável. Se qualquer linha não for enviada, exigir confirmação
   explícita “Executar apenas N operações”.
5. **Execução:** salvar antes do POST, construir o request, executar uma vez e ir ao
   diagnóstico existente. Falha não apaga nem altera o estudo.

Zero operações, conflitos entre lotes não resolvidos, mais de 1.000 operações
selecionadas, recorte acima de 730 dias ou premissas inválidas bloqueiam o POST.
Ausência de finalidade não bloqueia. Linhas inválidas, excluídas ou fora do recorte não
bloqueiam as válidas depois da confirmação parcial.

Interface deve funcionar por teclado, usar tabela semântica, foco previsível,
mensagens em `role=status`/`alert`, nomes renderizados como texto e zoom de 200% sem
perda de ações.

## 14. Segurança, privacidade e desempenho

- Nenhum request contém bytes do XLSX, nome do arquivo, nome do cliente ou perfil.
- Logs do navegador e servidor não registram linhas, nomes ou payloads.
- Conteúdo de célula nunca vira HTML.
- SHA-256 é calculado com `crypto.subtle` e não serve como segredo.
- Parser roda no worker; cancelar encerra o worker e não grava lote parcial.
- Arquivo de 1.000 linhas deve completar parsing e validação em até 5 s no Chromium
  da CI, sem tarefa de parsing no thread principal acima de 100 ms.
- O request máximo de 1.000 operações deve serializar abaixo do limite HTTP de 1 MiB.
  Se a medição falhar, o limite não pode ser aumentado silenciosamente: a correção
  deve reduzir proveniência repetitiva preservando o contrato ou passar por decisão
  explícita em PR próprio.

## 15. Critérios de aceite

1. Um XLSX válido de 1.000 linhas é importado localmente, revisado e executado.
2. OUT e IN do mesmo cliente chegam ao request como duas ordens com o mesmo UUID de
   cliente; teste de integração comprova autonetting intracliente no resultado.
3. Arquivos com fórmula, merge, macro, aba extra, cabeçalho alterado, ZIP excessivo
   ou senha são rejeitados sem persistência parcial.
4. Linhas inválidas coexistem com válidas; execução parcial exige confirmação.
5. Aliases, edição, exclusão, conflito, substituição e reversão de lote sobrevivem a
   recarga e produzem replay determinístico.
6. Duas abas não sobrescrevem revisões; conflito CAS é visível e recuperável.
7. Troca de conta não expõe estudos ou aliases da conta anterior.
8. O arquivo original não aparece em IndexedDB, requests, logs ou artefatos.
9. XLSX sem header/células de finalidade percorre Diagnóstico, Replay, Painel A e
   PDF; o resultado/documento informa “IOF padrão por direção”.
10. eFX aparece como não coletado; `NAO_COLETADO` também é aceito em finalidade
    somente com valor `null`, e continua incompatível com `eh_efx=true`.
11. Request e response passam os validators gerados, o gate de publicação e as
    suítes normal e `python -O`.
12. Typecheck, lint, unitários, build, E2E local e verificação de credenciais passam.

## 16. Fora de escopo

- Definir conteúdo regulatório do catálogo de finalidades.
- Inventar ou calibrar alíquotas, PTAX, spread, tarifa ou carry reais.
- Suportar `.xls`, `.csv`, Google Sheets, PDF ou múltiplas abas.
- Moeda estrangeira, corredor, conversão ou calendário de feriados.
- Pré-netting no importador, divisão ou agregação de operações.
- Template para download.
- Armazenamento do arquivo ou dados no servidor.
- Compartilhamento entre dispositivos, backup, exportação ou colaboração multiusuário.
- Regeneração da grade histórica.
- Alteração do motor, da P0 ou do algoritmo de autonetting.

## 17. Decisão arquitetural

**Recomendação:** implementar como subsistema local-first dentro de `web/src/importer`
e publicar apenas catálogo técnico no servidor.

**Por quê:** preserva privacidade, reaproveita autenticação/API/diagnóstico, mantém a
planilha fora da superfície de ataque do backend e separa regras testáveis da UI.

**Trade-offs:** IndexedDB, workers, OOXML e concorrência entre abas aumentam o volume
de código; dados locais não acompanham outro dispositivo; sem regra específica,
o resultado usa premissas padrão por direção, sem representar cotação calibrada.

**Premissas:** navegador Chromium moderno; no máximo 1.000 linhas por arquivo e por
execução; BRL único; usuário autenticado; backend e motor canônicos já publicados.

**Alternativa relevante:** upload efêmero ao servidor simplificaria o cliente e
centralizaria parsing. Só vence se compartilhamento, auditoria central ou ingestão em
lote passarem a ser requisitos e houver autorização formal para transmitir e tratar
os arquivos. Não é a decisão atual.

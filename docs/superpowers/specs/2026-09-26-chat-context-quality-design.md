# Qualidade contextual do chat — design

## Objetivo

Corrigir respostas desconexas e recusas prematuras no ORKE AI sem afrouxar a
restrição temática, a leitura somente de fontes publicadas ou a validação de
citações. O chat deve compreender continuações curtas da conversa e responder
sobre a seleção visível no Quadro comparativo quando houver evidência publicada.

## Problemas confirmados

1. O classificador de escopo recebe apenas a pergunta atual e a rota. Uma
   continuação como “e por quê?” perde o assunto da conversa.
2. `INSUFFICIENT_EVIDENCE` pode ser emitido pelo classificador, antes de a etapa
   de resposta consultar qualquer ferramenta. Uma pergunta pertinente é, assim,
   recusada sem que as fontes sejam lidas.
3. `/quadro` é identificado como uma tela genérica de Estudos. Os estudos e
   cenários selecionados no Quadro não entram no request do chat.
4. Os gates atuais cobrem segurança e contratos com provider controlado; o único
   smoke real usa uma pergunta simples e não constitui avaliação semântica.

## Decisões

### 1. Separar escopo de suficiência

`ScopeDecision` aceitará somente `IN_SCOPE`, `OUT_OF_SCOPE` e `MIXED`.
`INSUFFICIENT_EVIDENCE` continuará sendo uma classificação pública válida, mas
somente a etapa de resposta poderá produzi-la depois de consultar o inventário e,
quando necessário, as ferramentas de leitura.

O classificador receberá a pergunta, a rota e o histórico validado já presente no
request. O histórico continuará sendo dado não confiável e não terá autoridade de
sistema. A instrução do classificador dirá explicitamente que uma continuação
dependente de um tópico anterior pertinente é `IN_SCOPE`; ele não decide se há
dados bastantes para responder.

### 2. Preservar a resposta fundamentada

A etapa de resposta continuará exigindo ao menos uma citação resolvida para uma
resposta `IN_SCOPE`. Ausência de fonte, ferramenta sem dado ou limitação explícita
continuará produzindo o texto fixo de evidência insuficiente. Perguntas externas
continuarão encerradas antes da etapa de resposta.

Nenhum texto do histórico será tratado como evidência. Fingerprints antigos não
descreverão a seleção atual. O limite de chamadas, o provider stateless e a lista
fechada de ferramentas permanecem.

### 3. Contexto discriminado para o Quadro

O request de chat passará a transportar um contexto discriminado:

- `STUDY`: o `CommunicationDocumentV1` atual, sem alteração semântica;
- `BOARD`: uma fotografia imutável somente das linhas selecionadas no Quadro.

O contexto `BOARD` terá versão, instante de geração, linhas ordenadas, índice de
evidências e fingerprint canônico. Cada linha identificará Estudo, cenário e
execução publicada e conterá apenas valores já exibidos pelo Quadro: origem,
janela, quantidade de ordens, IN, OUT, netabilidade, custo baseline, custo netado e
economia. Não incluirá planilha bruta, ordens, nomes privados fora da seleção,
estado de outros estudos nem dados de empresas não exibidos.

O servidor validará limites, identidade, unicidade, decimais e fingerprint. Uma
nova ferramenta `consultar_quadro` devolverá as linhas selecionadas e suas
evidências. Citações do Quadro usarão o tipo existente `EVIDENCE`; a interface
resolverá essas referências para `/quadro`, sem inventar um vínculo com um Estudo
individual.

O Quadro publicará nova fotografia quando seleção, ordenação ou nomes visíveis
mudarem. Uma pergunta já enviada conservará o fingerprint da fotografia usada.
Se nenhuma linha estiver selecionada, o chat poderá explicar o uso da tela pelo
catálogo, mas perguntas sobre resultados serão insuficientes.

### 4. Catálogo e rota

O catálogo ganhará `page.quadro`, descrevendo o propósito, o que a tela altera e
o que não altera. `/quadro` terá `routeId = "board"` e `helpId = "page.quadro"`.
Rotas desconhecidas não serão silenciosamente rotuladas como Estudos; usarão um
identificador geral sem contexto financeiro.

### 5. Avaliação semântica reproduzível

A suíte controlada cobrirá:

- continuação curta que depende do histórico e chega à etapa de resposta;
- classificador incapaz de encerrar uma pergunta pertinente por falta de evidência;
- resposta insuficiente somente depois de a etapa fundamentada não encontrar dado;
- Quadro com uma e várias linhas, sem linhas e com fingerprint divergente;
- pergunta sobre maior economia usando a fotografia do Quadro e citação servida;
- pergunta externa continuando bloqueada mesmo quando o histórico é pertinente;
- histórico contendo prompt injection permanecendo dado sem autoridade.

O smoke real opt-in ganhará casos sem dados privados: uma continuação de pergunta
de interface e uma pergunta sobre duas linhas sintéticas do Quadro. Ele continuará
fora da CI e não será requisito automático para merge sem credencial dedicada.

## Fluxo

1. O cliente cria uma fotografia `STUDY`, `BOARD` ou nenhum contexto.
2. O servidor valida request, fingerprint e coerência com a rota.
3. O classificador decide apenas pertinência temática usando pergunta, rota e
   histórico.
4. Para `IN_SCOPE`/`MIXED`, a etapa de resposta recebe o inventário do contexto e
   consulta somente ferramentas locais permitidas.
5. O servidor valida que toda citação foi servida pela ferramenta correspondente.
6. Sem fonte suficiente, publica a resposta fixa de insuficiência; com fonte,
   publica a resposta citada; para `MIXED`, acrescenta a restrição temática.

## Compatibilidade e migração

O endpoint permanece `/api/v1/chat` e `apiVersion = "1.0.0"`. O campo atual
`communication` será substituído no cliente e no contrato por `context`, união
discriminada. Como não há consumidores externos publicados nem persistência de
requests HTTP, não haverá leitura dupla indefinida. Conversas locais permanecem
compatíveis porque armazenam apenas mensagens, classificações, citações e
fingerprints.

OpenAPI, tipos/validadores gerados, fixtures e scanner serão regenerados pelo fluxo
existente; blocos gerados não serão editados manualmente.

## Falhas e limites

- Contexto inválido ou divergente é rejeitado antes do provider.
- Mais de 100 linhas do Quadro, códigos duplicados, decimal inválido ou payload
  acima de 1 MiB são recusados.
- Resposta com citação não servida continua falhando fechado.
- Falha do provider continua retornando `CHAT_INDISPONIVEL` sem texto privado.
- Nenhuma etapa executa simulação, edita Estudos ou consulta rede além da chamada
  configurada ao provider.

## Arquivos esperados

- Servidor: `servidor/contracts/chat.py`, `servidor/chat/scope.py`,
  `servidor/chat/prompts.py`, `servidor/chat/service.py`,
  `servidor/chat/openai_provider.py`, `servidor/chat/tools.py`.
- Cliente: `web/src/chat/`, `web/src/pages/ComparisonBoardPage.tsx`, catálogo e
  contratos gerados.
- Testes: `tests/web_api/test_chat_*.py`, `web/src/chat/*.test.*`, teste do Quadro e
  E2E do chat.
- Registro: `docs/DIARIO-DE-MUDANCAS.md` no mesmo commit da futura publicação.

## Fora de escopo

- Memória remota, RAG, busca na internet ou no filesystem.
- Responder sobre dados não selecionados no Quadro.
- Cálculos financeiros novos ou ranking recalculado pelo modelo.
- Alterar regras do motor, métricas, rateio, simulação ou dados de negócio.
- Escolher ou trocar o modelo configurado no ambiente.

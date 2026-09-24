# Etapa 6C / C4 — provider e restrição temática (MOT-94)

Entrega local sobre `21541ae` (C3), na branch `codex/mot94-c4-responses`.
Implementa apenas C4. Não integra o painel web (C5), não realiza aceite browser
(C6), não usa chave real e não autoriza publicação ou deploy.

## Protocolo e configuração

`create_app` cria `OpenAIChatProvider` no lifespan somente quando `CHAT_ENABLED`
está habilitado e nenhum provider foi injetado. Inicialização não faz requisição.
O cliente HTTP criado pela aplicação é fechado no shutdown; provider injetado
continua sob responsabilidade de quem o injetou. Chat desabilitado não cria cliente.
Os Settings e o contrato HTTP C3 permanecem iguais.

O adaptador usa somente `POST https://api.openai.com/v1/responses`, com chave
server-side, modelo explícito dos Settings, `store: false` em todas as chamadas,
`text.format` estrito e nenhuma conversa remota/`previous_response_id`. Não usa
Chat Completions, SDK adicional, ferramentas hospedadas ou credencial do usuário.
Redirecionamentos e proxies implícitos do ambiente estão desabilitados.

As referências oficiais consultadas antes da implementação foram
[Function calling](https://developers.openai.com/api/docs/guides/function-calling) e
[Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses).
Os outputs das funções usam o `call_id` recebido, não o ID do item. Itens de
reasoning retornados são preservados no contexto da próxima rodada; o request
solicita `reasoning.encrypted_content` para esse uso stateless.

O timeout dos Settings vale por operação HTTP e, no serviço, pelo percurso inteiro
classificação → ferramentas → resposta. O orçamento de output tokens vale para
cada chamada ao provider. Uma pergunta admite uma chamada de classificação e no
máximo três chamadas analíticas, com quatro funções no total e duas rodadas de
outputs. IDs repetidos, excesso de chamadas, chamada misturada com resposta final,
ferramenta desconhecida e argumento inválido encerram a resposta com erro controlado.

Respostas HTTP do provider têm teto de 1 MiB durante a leitura. Status incompleto,
refusal, erro HTTP, redirecionamento, JSON inválido/duplicado/não finito, schema
inválido e citação não resolvida viram `CHAT_INDISPONIVEL` sanitizado. Não há retry
automático. Exceções e conteúdo livre de refusal/classificação não são publicados.

## Duas fases e política do servidor

O classificador recebe somente pergunta e contexto tipado; não recebe chave,
bearer da sessão, documento inteiro ou histórico. Texto recebido nunca é inserido
nas instruções privilegiadas. Não há classificador determinístico por palavras-chave.

| Classificação | Comportamento |
|---|---|
| `OUT_OF_SCOPE` | Não chama `answer`; publica exatamente a frase fixa abaixo |
| `IN_SCOPE` | Chama `answer`, valida estrutura, citações e limitações |
| `MIXED` | Instrui resposta apenas da parte pertinente e anexa a frase fixa server-side |
| `INSUFFICIENT_EVIDENCE` | Não chama `answer`; publica mensagem de insuficiência explícita e código homônimo |

Frase fixa:

> Posso ajudar apenas com o Motor de Fluxo, o funcionamento da aplicação e os dados deste projeto.

A fase analítica também pode detectar insuficiência. Texto livre sem citações,
classification analítica `INSUFFICIENT_EVIDENCE` ou código de insuficiência é
substituído por mensagem fixa de evidência insuficiente, sem inventar dados.
Quando isso ocorre numa pergunta `MIXED`, a resposta fica classificada como
`INSUFFICIENT_EVIDENCE` e preserva o sufixo de restrição temática. O limite público
de 12.000 caracteres é revalidado depois do sufixo; excesso falha fechado.

## Allowlist local

Todas as funções têm `strict: true`, `additionalProperties: false` e todos os
campos obrigatórios. Funções sem argumentos exigem objeto vazio. Argumentos não
aceitam coerção, chaves extras, JSON duplicado ou mais de 4.096 caracteres.

| Função | Argumentos | Fonte |
|---|---|---|
| `consultar_interface` | `helpId: string` | Um item do catálogo versionado carregado no servidor |
| `consultar_metrica` | `metricCode: string` | Métrica publicada no documento atual; código ambíguo falha fechado |
| `consultar_comparacao` | `{}` | Seção de comparação atual |
| `consultar_replay` | `day: integer >= 0` | Somente snapshot do dia selecionado |
| `consultar_premissas` | `{}` | Premissas, proveniência, versões e fatos de composição, mecanismo, economia e robustez |
| `consultar_limitacoes` | `{}` | Limitações explícitas do documento atual |

O provider começa com inventário de IDs/rótulos, pergunta, contexto tipado e
histórico como dados citados. Lê conteúdo por ferramenta. Valores e unidades são
preservados, sem float, recálculo ou simulação. Outputs trazem evidências, natureza
da fonte e fingerprint; ausências são explícitas. Nenhuma função acessa IndexedDB,
busca outro Estudo pelo ID, toca disco/rede ou modifica dados. Não há ferramenta de
escrita, execução, web, código, file search ou MCP.

Citações finais do adaptador precisam ter sido retornadas por ferramenta nesta
pergunta, inclusive códigos de limitação. O serviço revalida a existência contra
catálogo/documento atual, mesmo para providers injetados. Histórico de contextos
anteriores não habilita citações. O único código reservado sem evidência é
`INSUFFICIENT_EVIDENCE`, que força a mensagem fixa correspondente.

## Evidência e limites do aceite

Os testes usam apenas `httpx.MockTransport` ou `FakeProvider`. Bloqueiam conexões
externas e resolução DNS externa; loopback do event loop Windows é permitido.
Há testes de pergunta legítima, questão mista, clima, política, prompt injection,
base64, idioma diferente, pedido de web e edição, ausência de dados, referências,
argumentos, limites do loop, reasoning, timeout/cancelamento, recusas, erros e
privacidade da rota. A matriz e os gates estão em `docs/testing.md`.

As classificações nesses testes são respostas fake pré-definidas. Eles comprovam
o protocolo, a allowlist e as políticas determinísticas, **não** a precisão semântica
de um modelo real. A separação da parte pertinente de `MIXED` e a fidelidade do
texto às evidências ainda dependem do modelo e das instruções; não constituem
garantia formal contra prompt injection. A superfície de ferramentas e a frase
fixa de `OUT_OF_SCOPE` são impostas pelo servidor.

O fingerprint confirma consistência do snapshot recebido, não sua autenticidade.
Não há leitura server-side de uma fonte canônica do Estudo nem reexecução do Motor.
Não foram alterados contratos HTTP/OpenAPI, regras financeiras ou dados de negócio.
Nenhuma chamada real, recurso pago, push, PR, merge ou deploy ocorreu nesta entrega.

# Etapa 6C / C3 — contratos e configuração do chat (MOT-94)

**Registro histórico da C3.** A implementação C4 posterior mantém estes contratos
HTTP e substitui as limitações de provider/política descritas abaixo. Estado vigente
em [`etapa-6c-c4-provider.md`](etapa-6c-c4-provider.md).

Entrega local sobre `f22b70a`, limitada à C3. A MOT-94 permanece In Progress:
provider OpenAI, políticas temáticas, ferramentas e validação das referências das
citações são C4; envio pelo painel é C5. Não há chamada real, recurso pago ou
autorização de publicação nesta entrega.

## Transporte e configuração

`POST /api/v1/chat` usa o mesmo bearer das demais APIs. Autenticação acontece antes
da leitura do corpo. Toda resposta tem `Cache-Control: no-store` e request ID.

| Variável | Contrato |
|---|---|
| `CHAT_ENABLED` | `false` por padrão; desligado não exige chave/modelo |
| `OPENAI_API_KEY` | `SecretStr`, omitido de repr e serialização de Settings; só runtime servidor |
| `OPENAI_CHAT_MODEL` | Texto não vazio obrigatório quando habilitado; nenhum modelo do produto escolhido implicitamente |
| `OPENAI_CHAT_TIMEOUT_SECONDS` | Número finito positivo; padrão 30; orçamento total da chamada injetada |
| `OPENAI_CHAT_MAX_OUTPUT_TOKENS` | Inteiro de 1 a 4.096; padrão 2.048; orçamento conservador para o futuro adaptador C4 |

Os erros de configuração não imprimem os inputs. Limites inválidos falham na
inicialização mesmo com chat desligado. Chave/modelo vazios só são contraditórios
quando `CHAT_ENABLED=true`. O limite de tokens fica configurado para C4; C3 não
converte caracteres em tokens nem implementa requisição OpenAI.

`create_app(..., chat_provider=...)` aceita a porta `ChatProvider`, com `classify`
e `answer`. Nenhum provider real é construído pela factory. Sem implementação
injetada, mesmo habilitado, o endpoint retorna 503 `CHAT_INDISPONIVEL`. Desligado
ignora o provider injetado. Health, sessão e demais APIs continuam independentes.

O adaptador mínimo valida classificação e resposta de implementações injetadas,
correlaciona `messageId` e deriva o fingerprint do documento recebido. Somente
`IN_SCOPE` pode seguir para `answer` nesta etapa. As demais classificações falham
fechado com 503 até C4 implementar suas políticas; isto não é o aceite da recusa
temática do produto. Timeout, falha e saída inválida também são 503 sanitizado.
O fake existe somente nos testes. A porta não recebe chave, bearer ou Settings.

## Limites e histórico

- Corpo de no máximo **1.048.576 bytes**, verificado durante a leitura e também
  contra `Content-Length`. Header ausente ou subdeclarado não contorna o limite.
  Excesso retorna 413 `LIMITE_EXCEDIDO` antes de decodificar o JSON.
- Pergunta não vazia de até **4.000 caracteres**; resposta não vazia de até **12.000**.
- `history` contém só mensagens anteriores à pergunta atual, no formato
  `{role: 'USER' | 'ASSISTANT', text, contextFingerprint: string | null}`.
  Até **98 itens** reservam dois lugares para pergunta e resposta na quota de 100.
  USER tem limite 4.000; ASSISTANT, 12.000. Fingerprints antigos são preservados,
  sem reinterpretar o histórico com o documento novo. C5 selecionará os itens
  concluídos que cabem neste contrato; não deve enviar o atual `PENDING` outra vez.
- A quota de **20 conversas por Estudo** continua no repositório IndexedDB da C1.
  O endpoint stateless não conhece outras conversas nem atesta essa quota global.
- Citações têm `{kind: EVIDENCE | METRIC | LIMITATION | HELP, id}`. A forma e o
  identificador não vazio são validados; resolução do ID contra as fontes é C4.

`communication` é `CommunicationDocumentV1 | null`, revalidado pelo contrato B1,
incluindo fingerprint, evidências e valores. Se presente, Estudo, cenário,
execução e dia precisam coincidir com `routeContext`. Sem documento, o contexto
pode ter seleção incompleta. JSON inválido retorna 400 `JSON_INVALIDO`; contrato
inválido retorna 422 `ENTRADA_INVALIDA`, sem valores ou nomes de campos recebidos.

## Contratos publicados e evidência

`contracts/openapi.json` publica request, response, bearer e erros do chat. O
gerador web produz tipos e validadores estruturais `validateChatRequestV1` e
`validateChatResponseV1`. A validação semântica do Documento de Comunicação segue
obrigatória no servidor; os validadores gerados não autenticam dados ou fingerprints.

Os testes HTTP injetam fake e bloqueiam conexões externas (o socket local de
despertar do event loop Windows é permitido). Cobrem erros, limites, correlação,
configuração opcional e privacidade de logs/respostas. Comandos e resultados dos
gates estão na seção C3 de `docs/testing.md`. Não há aceite C4–C6 ou browser novo.

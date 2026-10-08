# Aceite local do chat contextual — C6 / MOT-95

Base: `ab32cc4` da `codex/frontend-etapa-6-planejamento`. Trabalho isolado em
2026-09-24, sem push, PR, merge ou deploy. O provider usado nos gates é fake;
nenhuma chave real, chamada externa de modelo ou despesa foi utilizada.

## Escopo e limites de conclusão

O aceite cobre C1–C5 nas rotas presentes nesta base. **Apresentação e impressão
não estão implementadas aqui** (`web/src/app/router.tsx`); sua presença/ausência de
chat no browser precisa ser verificada quando as rotas D forem integradas. Não
foi usado o fallback de rota como evidência dessas telas. Por isso a MOT-95
permanece **In Progress**, mesmo com os gates locais verdes. Isso não declara a
Etapa 6 completa nem autoriza publicação.

O teste real opt-in existe em `tests/web_api/test_chat_real_opt_in.py`, exige
`MOTOR_CHAT_REAL_OPT_IN=1`, credencial/modelo próprios (`MOTOR_CHAT_REAL_API_KEY`,
`MOTOR_CHAT_REAL_MODEL`) e não executa quando `CI` está definido. Não foi
executado nesta entrega. O opt-in é validação operacional futura; não mede a
qualidade semântica de um modelo real nesta aceitação fake.

## Percursos reproduzíveis

`web/e2e/stage6-chat.spec.ts` usa o build E2E, IndexedDB real, a API FastAPI e
`tests/web_api/chat_e2e_provider.py`. Não substitui o endpoint do chat no browser.
As rotas de controle do fake existem apenas em `tests/web_api/run_e2e.py`.
O browser bloqueia requests fora de loopback e a matriz Python bloqueia
socket/DNS externos, usando `httpx.MockTransport` na serialização do provider.

| Requisito | Evidência |
|---|---|
| Presença global | 16 rotas autenticadas existentes, incluindo Empresas, Perfis, Importação, Estudos, Carteira, Diagnóstico, Comparação, Replay e Premissas; login/callback/senha sem painel |
| Classes | IN_SCOPE, INSUFFICIENT_EVIDENCE, OUT_OF_SCOPE e MIXED; frase fixa aplicada pelo serviço real |
| Histórico | 8 mensagens preservadas após reload, isolamento A/B, PENDING recuperado como FAILED |
| Contexto mínimo | UI sem CommunicationDocument; métrica com referências exatas e sem outras execuções; Replay por dia; comparação por par base/hipótese |
| Citações | Métrica, dia e comparação reabrem seleção; fragmento/fingerprint sobrevivem ao reload; citação inexistente falha fechado |
| Contexto anterior | Mudança local de dia mantém fingerprint da resposta e sinaliza contexto anterior |
| Retry e concorrência | Reutiliza USER e troca ID da resposta; conflito CAS entre abas relê vencedora sem HTTP automático |
| Falhas | Provider ausente, erro, timeout controlado, citação inválida e cancelamento preservam navegação |
| Quotas | 100 mensagens oferecem nova conversa; 20 conversas exigem exclusão explícita com confirmação; histórico e fonte permanecem roláveis e acessíveis por teclado |
| Acessibilidade | Enter/Tab, foco inicial e retorno, aria-live incremental sem reler histórico, composer/Enviar utilizáveis a 200%, captura com painel aberto |
| Privacidade local | XLSX sintético selecionado e processado; nome/bytes/células brutas/identidade/token/dados não selecionados ausentes do corpo HTTP e console |
| Deep links | Abertura direta e reload das seleções citadas; nenhuma seleção financeira recalculada em JS |

## Correções descobertas pelo aceite

1. O limite de mensagens/conversas existia no repositório, mas a UI deixava enviar
   até erro genérico e não oferecia exclusão. Quatro regressões RED→GREEN adicionam
   mensagens explícitas, bloqueio de novo envio, nova conversa e exclusão por CAS;
   conflitos preservam o histórico e permitem nova ação manual.
2. Após scrubbing, uma citação para a URL já aberta não restaurava o dia do Replay.
   A navegação agora remonta a apresentação do Replay pela chave de localização.
3. O mesmo problema ocorria ao mudar o par da comparação sem mudar a URL. O efeito
   de restauração observa a chave da navegação, com regressão RED→GREEN própria.
4. Com zoom CSS de 200%, `height:100vh` deixava o composer do painel fixo fora da
   viewport. O painel passa a usar as bordas superior/inferior e altura automática.
   A captura de aceitação mantém o painel aberto e o foco no Enviar.
5. Com 20 conversas, a lista ocupava a altura do painel e o histórico flexível
   encolhia a zero. A altura mínima de `8rem` preserva a rolagem das mensagens.
   O teste de quota reproduziu `clientHeight = 0` antes da correção e agora percorre
   oito mensagens e uma fonte por Tab, também sob zoom de 200% e viewport estreita.

Nenhuma fórmula, regra financeira, taxa, contrato HTTP, schema persistido ou
comportamento do motor Python foi alterado.

## Matriz de privacidade

`test_chat_privacy.py` exercita rota autenticada e serializador real do provider
com transporte fake. Testa as etapas classificação, resposta e saída de ferramenta
contra erro HTTP, refusal, JSON inválido e timeout. Inclui campos extras maliciosos,
nomes de campos contendo segredo, token de autenticação, owner, XLSX/raw, nome do
Estudo e valores financeiros canários. As ferramentas entregam apenas o valor
solicitado, mantendo outro valor privado fora das chamadas ao provider.

`test_chat_scanner.py` prova falha do scanner em bundle/source map, logs Python/JS,
erros públicos e artefatos canários, sem imprimir o valor encontrado. O scanner
normal percorre arquivos versionados e `web/dist`; logs/artefatos observados exigem
`--runtime-artifact` e `--canary-manifest`. O manifesto define valores sintéticos
proibidos por fronteira: uma resposta bem-sucedida pode conter a resposta e a
métrica solicitadas. Não se proíbem valores financeiros sintéticos públicos.
Source maps são decodificados por fonte: avisos genéricos de dependências não
são classificados como logs de chat, mas referências privadas concretas continuam
proibidas. Chaves e canários são procurados em todos os bytes, inclusive nas
dependências; mapas inválidos falham fechado. Padrões e canários são testes de
regressão, não garantia geral de DLP.

## Comandos e resultado final

Resultados consolidados estão em `docs/testing.md`: browser 15 PASS; suíte web
964 PASS; gate Python chat/provider/runner 178 PASS + 1 SKIP. Após esse gate,
os 18 casos adicionais do scanner completaram 46 PASS normais e sob `-O`.
Build com source maps e scanner de 15 artefatos observados passaram.

```powershell
$env:MOTOR_CHAT_REAL_OPT_IN = '0'
python -m pytest tests/web_api/test_chat_contracts.py tests/web_api/test_chat_http.py tests/web_api/test_chat_scope.py tests/web_api/test_chat_tools.py tests/web_api/test_chat_privacy.py tests/web_api/test_chat_scanner.py tests/web_api/test_chat_real_opt_in.py tests/web_api/test_openai_provider.py tests/web_api/test_e2e_server.py -q
npm --prefix web run test:unit -- --maxWorkers=1 --testTimeout=15000
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build -- --sourcemap
npm --prefix web run test:e2e -- stage6-chat.spec.ts
python -m tests.web_api.scan_credentials
```

No Windows local, `MOT_E2E_PYTHON` aponta para o `.venv-t5` já instalado;
`MOT_E2E_PORT=8037` evita outro servidor. O timeout de startup Playwright foi
ampliado para 120 s após a inicialização local exceder 30 s. Os testes não usam
retry global; somente o controle idempotente do fake aceita um retry de conexão
resetada. Houve uma ocorrência `socket hang up` nesse controle durante o gate
inicial, sem falha no endpoint de produto.

# Aceite local da importação — Etapa 6A / MOT-61

## Percurso e evidência

`npm --prefix web run test:e2e -- import-observed-case` usa o build E2E isolado,
autenticação sintética, FastAPI real, Web Worker real e IndexedDB do Chromium. Não
há upload a serviço externo. As fixtures de OOXML são as mesmas do parser; o teste
constrói as duas operações sintéticas em memória a partir da fixture mínima.

O percurso principal confirma Caso, recarrega, confirma Perfil manualmente,
recarrega, cria Estudo manualmente, usa o Caso como origem, anexa Perfil como
evidência e comprova o bloqueio da prévia e do diagnóstico enquanto o catálogo está
`NAO_CONFIGURADO`. Duas operações de 100 BRL, OUT/IN do mesmo cliente, permanecem
separadas. Antes das ações manuais não surgem Perfis, Estudos ou requests de
execução atribuíveis à importação.

A primeira rodada revelou um defeito transversal: o aviso da importação dizia que
a execução estava bloqueada, mas o Estudo podia executar essas operações e abrir
Replay. Esse resultado não foi aceito como percurso válido. O gate compartilhado
`executionGate.ts` consulta `ApiClient.getImportCatalog` antes de reservar prévia,
diagnóstico ou retry, e antes de reconstruir Replay antigo. A proveniência
`xlsx-operacoes` identifica importações inclusive após conversão para autoria.
Na revisão A6, a edição de todos os campos demonstrou que a proveniência corrente
podia ser completamente substituída. A derivação agora carrega o marcador imutável
`derivedFromObservedCase.importedFromXlsx`, incluído no fingerprint e aceito pelo
schema persistido. O E2E altera todos os oito campos, recarrega e confirma que o
bloqueio permanece sem reserva/POST. A compatibilidade não exige reescrever
documentos legados; nenhuma migração retroativa de autoria já salva foi executada.
Além do status configurado, o gate valida todos os pares finalidade/direção com
catálogo fictício nos testes: código ausente, direção ausente e par permitido.
Catálogo indisponível ou não configurado bloqueia; revisão, confirmação do Caso,
Perfil e Estudo continuam disponíveis. Sintético/demo permanece executável.
Polling/cancelamento de job já iniciado não é nova execução e permanece disponível.
O percurso importado até Replay só poderá ser aceito com catálogo configurado;
nenhum catálogo regulatório foi inventado para produzir um teste verde.

Outros cenários cobrem linha inválida, conflito divergente, escolha explícita,
correção, descarte da revisão, OOXML com fórmula, cancelamento do worker, corrida
CAS em duas abas e isolamento A/B. B pode receber a demonstração própria; suas
importações permanecem vazias. A volta para A preserva seus Casos. A auditoria
inspeciona as stores completas, incluindo os resultados idempotentes, e todos os
requests da página. Correções inválidas persistem como valor anterior `null` e
novo valor canônico, sem a célula bruta.

## Medição de 1.000 linhas

Fixture: `web/src/importer/__fixtures__/valid-1000-rows.xlsx`, 28.027 bytes,
SHA-256 `1ac0213611d2d6708d96b23d92fa054d1d60c6afcc5e42ef14620ea141119538`.
O teste gera um attachment `import-1000-measurement` com navegador, processadores
lógicos, tempo do worker (inicialização + parsing + transferência), tempo até a
revisão visível, long tasks da janela de leitura, heap aproximado e bytes do Caso.
Não é benchmark do parsing puro nem heap isolado do worker; `performance.memory`
é aproximado e inclui o aplicativo inteiro.

Medição da rodada integral em Windows/Chromium 153.0.8010.12, 8 processadores lógicos:
351,7 ms no worker, 1.370 ms até revisão, aproximadamente 50,4 MB de heap do app e
1.069.281 bytes de JSON do Caso. Long tasks após início da leitura: 265, 352 e
98 ms. Uma coleta preliminar incluía bootstrap anterior ao clique; o teste final
filtra essa fase. A UI ainda renderiza 1.000 linhas, portanto
long tasks de validação/projeção/renderização não são confundidas com parser no
thread principal. O gate de revisão é 5.000 ms e não foi ampliado.

A verificação focada dos dois reports em disco passou 2/2 em 37 s; mediu 130,5 ms
no worker, 640,5 ms até revisão e long tasks 110/143/55 ms, com o mesmo heap e
tamanho de Caso. Essa variação entre rodadas é registrada, não um novo SLA.
Os JSONs são gravados em `testInfo.outputPath` e anexados por path; assim o artifact
CI preserva conteúdo mesmo com reporter `list`. O report de privacidade contém
somente caminhos de request, content type, tamanho do corpo e IDs sintéticos.

Não se envia um request de 1.000 ordens para simular: importar não executa.
O Caso local acima de 1 MiB não é payload HTTP. O limite efetivo de Replay da
Etapa 5 continua independente: 98 ordens × 365 dias na fixture medida, limitado
pelas 500 entradas de proveniência do diagnóstico. Nenhum limite foi relaxado.

## Auditoria de fronteiras

| Fronteira | Evidência |
|---|---|
| Arquivo → worker | extensão/tamanho antes da leitura; preflight ZIP, estruturas proibidas e cancelamento; E2E usa worker do build |
| Worker → revisão | linhas serializáveis; normalização preserva texto para validar; erros/conflitos bloqueiam confirmação |
| Revisão → transação | publisher remove dados brutos e revalida Caso; unitários injetam falha em cada store e erro assíncrono |
| Transação → Caso | Caso/lote/evento/Empresa/operação atômicos; CAS real em duas abas deixa um vencedor |
| Caso → Perfil | seleção e confirmação manuais, recarga e versão imutável |
| Perfil/Caso → Estudo | Perfil é evidência; origem observada explícita; recarga preserva snapshot e proveniência |
| Estudo importado → execução | catálogo não configurado bloqueia antes da reserva/POST; sintético/demo conserva os aceites reais de diagnóstico/Replay existentes |

O catálogo de produção continua `NAO_CONFIGURADO`; as operações do aceite são
fictícias, mas seguem o mesmo bloqueio de execução do produto. A grade histórica
não foi regenerada. Resultado local não é aceite publicado
nem valida sessão Supabase real, Render, Docker, chat ou apresentação.

Os comandos e contagens de gate ficam em `docs/testing.md`; evidência de execução
e revisão desta tarefa fica também no relatório SDD local da A6. A CI preserva
`web/test-results/` como artifact por sete dias, inclusive attachments e traces de
falha, com dados exclusivamente sintéticos.

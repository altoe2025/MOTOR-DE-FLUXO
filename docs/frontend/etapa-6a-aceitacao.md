# Aceite local da importação — Etapa 6A / MOT-61

## Percurso e evidência

`npm --prefix web run test:e2e -- import-observed-case` usa o build E2E isolado,
autenticação sintética, FastAPI real, Web Worker real e IndexedDB do Chromium. Não
há upload a serviço externo. As fixtures de OOXML são as mesmas do parser; o teste
constrói as duas operações sintéticas em memória a partir da fixture mínima.

O percurso principal confirma Caso, recarrega, confirma Perfil manualmente,
recarrega, cria Estudo manualmente, usa o Caso como origem, anexa Perfil como
evidência e executa prévia e diagnóstico com catálogo `NAO_CONFIGURADO`, sem o
header nem células de finalidade. Duas operações de 100 BRL, OUT/IN do mesmo cliente, permanecem
separadas. Antes das ações manuais não surgem Perfis, Estudos ou requests de
execução atribuíveis à importação.

**Decisão vigente de 2026-09-24:** finalidade é opcional e o catálogo deixou de ser
gate. A ausência persiste como `purposeCode: null` e proveniência `NOT_COLLECTED`,
até o snapshot enviado ao motor. Regra específica só se aplica à combinação exata
de finalidade e direção; nos demais casos valem `iof_out`/`iof_in`. O cenário
executa com as premissas salvas mesmo com catálogo vazio ou indisponível.
`stage6-acceptance.spec.ts` percorre a fonte observada até Diagnóstico, Replay,
Painel A e PDF renderizado, conferindo “IOF padrão por direção”, repetição,
métricas e fingerprint. Não há inferência regulatória nem cotação.

O antigo gate descrito no histórico A6 foi superado. A ancestralidade
`derivedFromObservedCase.importedFromXlsx` continua no fingerprint e no schema;
após editar todos os campos e recarregar, a autoria também executa. O E2E preserva
o código de finalidade editado sem regra específica e o motor usa fallback.
Nenhum catálogo regulatório foi inventado e nenhuma migração foi necessária.

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
| Estudo importado → execução | snapshot persistido com finalidade `null`; prévia e diagnóstico executam com fallback por direção e privacidade inspecionada |
| Execução → Replay → Painel A → PDF | mesma repetição e métricas; “IOF padrão por direção” e fingerprint conferidos no documento impresso |

O catálogo de produção continua `NAO_CONFIGURADO`; as operações do aceite são
fictícias e executam pelo mesmo fluxo observado do produto, com custos padrão.
A grade histórica não foi regenerada. Resultado local não é aceite publicado
nem valida sessão Supabase real, Render, Docker ou provider de chat real.

Os comandos e contagens de gate ficam em `docs/testing.md`; evidência de execução
e revisão desta tarefa fica também no relatório SDD local da A6. A CI preserva
`web/test-results/` como artifact por sete dias, inclusive attachments e traces de
falha, com dados exclusivamente sintéticos.

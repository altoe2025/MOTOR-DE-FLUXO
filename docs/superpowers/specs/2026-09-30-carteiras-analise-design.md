# Análise de combinações de carteiras — design local

Data: 2026-09-30. Escopo aprovado na conversa: objetivos, restrições, alternativas,
tabela completa, gráfico, Pareto e contribuição marginal. As definições abaixo
concretizam esse escopo para implementação; não representam métricas já entregues.

## S1. Autoridade e base

Gabriel quer experimentar e ajustar a aplicação local antes de integração ou
publicação. Sem push, PR, merge na main ou deploy nesta etapa. Não alterar Render,
Supabase, autenticação de produção, motor, contratos HTTP ou documentos persistidos.

Base local inspecionada: `829d2248d3a6d28ee643af460dbedc27f9b4265d`, branch
`codex/render-release-2026-09-29`. Contém `143421c` de `codex/carteira-criterios`
mais atalhos, replay e backup. A main local em `3342059` é ancestral e ainda não
contém a recomendação. Não houve consulta ao estado publicado para esta escolha.

Worktree dedicado: `C:/Users/gabriel Altoe/.codex/worktrees/carteiras-analise/motor-de-fluxo`.
Branch de trabalho: `codex/carteiras-analise`. Preservar os demais checkouts.

As buscas iniciais no Linear por carteira/combinação não localizaram tarefa
específica. Com autorização explícita de Gabriel, esta evolução recebeu a MOT-100;
MOT-99 continua restrita ao aceite publicado e handoff anterior. Não ampliar outra
issue ou criar novas tarefas sem autorização. O desenvolvimento permanece local.

## S2. Arquitetura e elegibilidade

Uma projeção pura lê execuções existentes e produz métricas compactas; ranking,
filtros, destaques, tabela, gráfico e contribuição usam essa mesma projeção.
Trocar objetivo/filtros/seleção não dispara diagnóstico nem altera o estudo.
Extrair uma vez por mudança dos resultados; não percorrer alocações a cada tecla.

Preservar `compositionComparisonReason`: diagnóstico atual bem-sucedido, fingerprint
e revisão correspondentes, entrada fixa, mesmo motor, custos, janela, horizonte,
período e ordens sem alterações; subconjunto contém empresas inteiras.
Não comparar execuções regeneradas como se isolassem composição.

Identidade de empresa usa `companyByOrder.companyId`; nome serve para apresentação.
Para fontes legadas, conservar fallback existente e mostrar essa origem; não unir
duas empresas com IDs distintos porque os nomes são iguais. Uma empresa sem volume
medido continua contando na composição se possui ordens no snapshot executado.

Exibir total preparado, total atual comparável, total que atende e exclusões com
motivos. Resultados faltantes, inválidos ou desatualizados nunca valem zero.
Rotular recomendações como melhores entre as avaliadas. Só declarar busca completa
após conferir todas as chaves únicas de subconjuntos da carteira atual, não apenas
contar cenários. Não ampliar limites de geração de combinações nesta entrega.

## S3. Métricas e objetivos

Todos os valores financeiros vêm de `selected_execution.result.agregado`, no
período medido. Não usar totais de `execucao_completa` para economia/custos/volume.

| Objetivo | Valor e sentido |
|---|---|
| Economia total (R$) | `economia_periodo_brl`, maximizar |
| Economia sobre o volume | economia / `volume_bruto_periodo_brl`, maximizar |
| Redução do custo (%) | economia / `baseline_periodo.total`, maximizar |
| Espera média (dias) | soma(valor da alocação × espera) / volume medido, minimizar |
| Quantidade de empresas | quantidade de IDs únicos da composição, minimizar |
| Netabilidade (%) | `taxa_netabilidade_periodo`, maximizar; indicador operacional |

Economia sobre volume aparece como % e bps: razão × 100 e razão × 10.000.
Baseline zero torna redução percentual indisponível; não excluir a carteira dos
outros objetivos nem exibir infinito. Volume zero impede ratios/espera e deixa a
carteira fora da recomendação, com motivo. Não chamar economia absoluta de bruta.

Exibir também baseline, custo com pool e decomposição das diferenças de iof, carry,
spread, espera e fixo dos DTOs de período. Os totais e a economia publicados são
campos autoritativos e devem ser preservados: a soma dos componentes pode diferir
por um resíduo decimal legítimo de precisão/reconciliação. Nesse caso, mostrar a
diferença exata como nota neutra, sem recalcular o total ou tratá-la como corrupção.
Não recalcular tarifas/alíquotas no browser. Economia negativa permanece visível e
nunca ganha linguagem de benefício positivo.

Espera considera apenas alocações de `ids_ordens_medidas`, com
`dia - dia_conhecida`; conferir conservação por ordem. P95 é o menor número de dias
em que o acumulado por volume alcança 95%, sem interpolação. É percentil da espera
do volume, não confiança estatística nem prazo da conclusão integral de cada ordem.
Usar todas as alocações dessas ordens, inclusive resolução posterior ao período.

Ordenação usa decimais completos, não strings formatadas nem `Number`. Razões devem
ser comparadas por produtos cruzados dos numeradores/denominadores, usando aritmética
exata ou precisão dimensionada aos operandos; não confiar na precisão default de
Decimal para valores de até 80 caracteres. Converter a Number só na projeção visual.
Empates: objetivo primário, maior economia, menor espera, menos empresas, chave
ordenada de IDs e scenarioId. Eliminar critérios repetidos nessa sequência.
Explicar na interface que a ordenação por coluna não muda o objetivo da recomendação.

## S4. Restrições

Filtros opcionais: espera média máxima, volume mínimo, economia mínima em R$,
máximo de empresas, empresas obrigatórias e percentual da melhor economia.
Limites são inclusivos. Campos vazios não limitam; entradas inválidas impedem
recomendação e mostram erro junto ao campo, sem aplicar silenciosamente outro valor.
Aceitar vírgula decimal brasileira; rejeitar NaN/infinito/valores negativos nos
limites. Máximo de empresas exige inteiro positivo; percentual fica em [0,100].

Primeiro aplicar restrições absolutas. Calcular maior economia positiva nesse
universo. Depois aplicar economia >= percentual/100 × essa referência. Exibir
referência em R$ e universo usado. Não recalcular a referência a partir dos
resultados já filtrados por ela. Se melhor economia <= 0, meta relativa é
indisponível com explicação; objetivos absolutos continuam funcionando.

Para menor espera/menos empresas, oferecer atalho explícito “preservar 95% da melhor
economia”, sem ativar filtro oculto. Sem meta, informar que a escolha pode produzir
pouca economia. Nenhum resultado elegível: mostrar razões e ação limpar filtros.

## S5. Interface

Ordem visual: cobertura dos cálculos; objetivo; restrições; recomendação explicada;
alternativas; gráfico; tabela completa; contribuição da composição selecionada.
Objetivo padrão continua economia total, sem filtros. Estado de exploração é
local ao componente/estudo; mudar critérios não grava revisão nem invalida cálculos.

Tabela paginada de 25 linhas, opções 25/50/100; todas as carteiras acessíveis.
Colunas: composição, empresas, economia R$, economia %/bps, redução do custo,
volume, espera média, espera P95, netabilidade e atendimento aos filtros.
Custos/decomposição em detalhes da seleção, para não alargar a tabela principal.
Permitir ver também não elegíveis com motivos; exclusões técnicas têm seção própria.
Separar seleção para análise, ordenação da tabela e objetivo. Paginação volta à
primeira página ao filtrar; manter seleção se visível, senão avisar e limpar.

Alternativas: maior economia, maior eficiência sobre volume, menor espera e menor
composição no universo elegível. Agrupar badges quando a mesma carteira ganha
mais de um critério. Explicação usa diferenças contra alternativa identificada,
com sinal correto para R$, pontos percentuais, bps, dias e empresas.

Gráfico: x=espera média, y=economia total R$, área do ponto proporcional ao volume,
com limites visuais explícitos. Pareto considera somente economia e espera entre
carteiras elegíveis: domina se não piora nenhum eixo e melhora pelo menos um.
Pontos iguais não dominam um ao outro. Não rotular como superior em todas as métricas.
Mostrar coordenadas exatas em detalhes, distinguir selecionada/recomendada/fronteira
sem depender só de cor; sobreposições devem permitir listar/selecionar cada carteira.
Tabela e gráfico selecionam o mesmo scenarioId; tooltip não pode injetar HTML de nomes.
Teclado, foco visível, zoom 200%, movimento reduzido e alternativa tabular obrigatórios.

## S6. Contribuição marginal

Para carteira S, localizar resultados atuais de S sem cada empresa e S com cada
empresa disponível fora dela, por conjunto de IDs, no mesmo universo comparável.
Remoção: Δeconomia = economia(S sem i) - economia(S).
Adição: Δeconomia = economia(S com i) - economia(S).
Demais deltas seguem alvo menos selecionada. Assim “remover X reduz economia em
R$ Y” equivale a delta negativo, sem inverter sinais na tabela/gráfico.

Mostrar antes/depois, diferenças em R$, bps, volume, espera e número de empresas.
Pode consultar contraparte que não atende filtros, mas deve identificá-la como tal;
filtros não tornam o resultado ausente. Contraparte ausente/desatualizada/incompatível
é indisponível, nunca estimada. Remover a única empresa não produz carteira simulada:
mostrar “carteira vazia não avaliada”, sem inventar economia ou espera zero.

Gráfico de barras divergentes para Δeconomia de adicionar/remover, com tabela
equivalente. Não somar marginais como se fossem aditivos. Não chamar marginal de
rateio, lucro atribuível ou benefício próprio da empresa. O efeito depende de S.
Empresas fora da composição continuam fora de seus custos; não inferir custo total
de atendimento de todo o universo.

## S7. Aceitação local em três entregas

1. Objetivos, filtros, destaques, explicação e tabela completa.
2. Gráfico, Pareto, P95 e detalhes de custo.
3. Marginais, regressão conjunta e experimentação final.

Cada entrega tem testes focados, execução real local e espaço para ajustes de Gabriel.
Teste sintético pequeno com 3 empresas e 7 subconjuntos; teste de interface com
255 resultados compactos; não regenerar grade histórica. Alteração de filtros após
conclusão deve gerar zero novos POSTs de diagnóstico/preparação.

## S8. Ambiente para experimentar

Build E2E local usa identidade fictícia e motor real; não reutilizar login/token de
produção. O runner atual `tests.web_api.run_e2e` segura jobs até release explícito.
Adicionar launcher exclusivo de desenvolvimento em `scripts/preview_carteiras.py`,
reusando `build_e2e_app` e um pool imediato com `ThreadPoolExecutor(max_workers=1)`
e `submit(execute_repetition, task)`. Servir apenas 127.0.0.1, porta 8031; desligar
executor no shutdown. Não alterar o comportamento do runner E2E nem o app publicado.
Não carregar chaves reais, não expor listener na rede. Dados na origem local têm
armazenamento separado do site publicado; backup/importação existentes podem ser
usados manualmente por Gabriel. Nunca limpar o armazenamento do navegador pessoal.

## S9. Fora desta entrega

Varrer novas janelas, score ponderado opaco, Shapley, rateio comercial, novas regras
de simulação, alterações no chat/relatório impresso e migrações de armazenamento.
Não confundir roadmap com funcionalidade implementada.

# Aceite local — análise de combinações de carteiras (MOT-100)

Este roteiro acompanha a branch local `codex/carteiras-analise`. Gabriel pode abrir,
experimentar e pedir ajustes antes de qualquer publicação. A execução local usa a
identidade fictícia do build E2E e o motor real neste computador; não pede credenciais
nem acessa os dados da instalação publicada.

## Iniciar a prévia

Na raiz deste worktree, com as dependências do repositório instaladas:

```powershell
node web/scripts/build-e2e.mjs
python -m scripts.preview_carteiras
```

Abra `http://127.0.0.1:8031` no mesmo computador. O servidor aceita conexões somente
em `127.0.0.1`; encerre-o com Ctrl+C no terminal. O navegador que abrir esse endereço
guardará estudos locais para essa origem. Use o recurso **Exportar estudo** antes de
limpar dados do navegador. A prévia não deve ser usada como ambiente de produção.

Se o comando `python` não apontar para o ambiente com as dependências do projeto,
ative primeiro o ambiente virtual do repositório e repita os dois comandos.

## Dados para experimentar

Um estudo salvo no site publicado não aparece automaticamente em `127.0.0.1:8031`.
Para examinar um estudo existente, exporte seu JSON em **Estudos > Exportar** na
origem em que ele está salvo; depois use **Estudos > Importar estudo** nesta prévia.
Se o estudo importado trouxer diagnósticos atuais e comparáveis, a análise já abre
com os resultados. Uma cópia sem resultados precisa de novo diagnóstico local.

Para experimentar o showcase, use o teste E2E focado, que semeia seis empresas e
14 ordens sintéticas reproduzíveis. Ele prepara e diagnostica todas as 63
combinações não vazias dessas empresas (6 individuais, 15 pares, 20 trios, 15
quartetos, 6 quintetos e a carteira completa). Os nomes também são rótulos
sintéticos; AstroPay não faz parte deste showcase e é apenas uma referência de
escala já existente no repositório. Não há dados de fluxo real de empresas.

## Roteiro de aceite manual

### Aceite e preparação de publicação — 2026-10-02

Gabriel aprovou esta versão e autorizou inspeção, commit, merge e deploy quando
seguros. A integração reutiliza o shell, fontes e tema completos da `main`.
Na recomendação, netabilidade e redução de custo agora exibem seu valor absoluto;
**Analisar recomendação atual** permite sair da alternativa selecionada sem
limpar objetivo ou filtros. Combinações antigas não entram nas contagens atuais.
Esses três caminhos têm testes de regressão. O aceite visual não substitui os
gates automatizados nem comprova publicação, registrada separadamente.

### Revisão visual do console — 2026-10-01

- Alternar **Tema claro / Tema escuro** no menu lateral; a preferência é retida no navegador.
- Buscar empresas por nome ou ID, inclusive nomes sem acento, e fixar a participação pelo cartão ou pela tecla Espaço. Limpar filtros deve liberar todas novamente.
- Conferir os cards da recomendação e das alternativas. A alternativa selecionada altera os detalhes e a contribuição marginal, sem mudar o objetivo.
- Nos cartões marginais, o valor é a diferença da economia da contraparte menos a composição em análise; a espera também é uma diferença. Ganho/perda é informado por texto e sinal, além da cor. As barras compartilham a mesma escala.
- Abrir **Ver todos os valores: antes, depois e diferença** para consultar a tabela marginal. Gráfico economia × espera e tabela de todas as composições continuam fora da tela principal.
- Verificação desta revisão: 99 testes focados/de navegação passando; interação manual com os 63 resultados existentes, claro/escuro e sem overflow horizontal na largura de celular testada. O E2E completo com recálculo não foi repetido.

1. Confirme **Objetivo: Maior economia total**, sem restrições, e compare a economia
   da recomendação com a alternativa de maior economia. A tela deve informar quantas
   carteiras foram preparadas, comparáveis, elegíveis e excluídas. Busca completa só
   deve aparecer quando todos os subconjuntos únicos foram avaliados.
2. Troque **Objetivo** para economia sobre volume, redução de custo, menor espera,
   menos empresas e netabilidade. Compare a recomendação com a coluna correspondente;
   o objetivo muda sem executar novos diagnósticos.
3. Preencha espera máxima, volume mínimo, economia mínima, máximo de empresas e uma
   empresa obrigatória. Teste vírgula decimal, limite inclusivo, entrada inválida e
   **Limpar filtros**. Para menor espera ou menos empresas, experimente o atalho
   **Preservar 95% da melhor economia**. Uma restrição impossível deve mostrar
   nenhuma elegível, com as demais linhas ainda consultáveis.
4. Confira **Alternativas em destaque** e selecione carteiras por seus botões. O
   gráfico de economia × espera e a tabela completa de composições foram retirados
   desta tela após o aceite visual; os detalhes e a contribuição marginal devem
   acompanhar a alternativa selecionada.
5. Nos detalhes, confira economia, volume, espera média/P95, custos base/com pool e
   componentes de custo. Em **Contribuição marginal**, compare a composição antes e
   depois de remover ou adicionar uma empresa. Uma contraparte não avaliada deve
   aparecer como indisponível; uma fora dos filtros pode continuar consultável.
6. Faça as mesmas interações com teclado e zoom de 200%. Recarregue a página: o
   estudo e os diagnósticos devem permanecer. Objetivo e filtros são controles de
   exploração local da tela e podem voltar ao padrão após recarga.

As comparações usam somente as composições e os custos simulados para cada uma.
Contribuições marginais dependem da carteira selecionada, não são aditivas nem
constituem rateio por empresa. Números sintéticos e premissas não calibradas não
representam cotação ou projeção comercial.

## Automação e evidências

### Triagem de dependências — 2026-10-02

O lock herdado de `main` permanece inalterado. `npm audit` reporta alertas em
`brace-expansion` (ferramentas de lint/geração) e `fast-uri` (via Ajv).
O caminho de validação publicado usa validadores pré-compilados e não carrega
`fast-uri`; Node e seus pacotes não são copiados para a imagem final Python.
Não foi identificado caminho explorável desses alertas na entrega examinada.
A atualização de dependências permanece pendente; não se declara auditoria limpa.

As capturas de Estudos/chat ocultam somente o botão `data-local-preview-only`,
que carrega o showcase sintético no build E2E e não existe na interface publicada.
As referências de produção não foram regeneradas para acomodar esse controle.

O teste `web/e2e/study-portfolio-analysis.spec.ts` semeia seis casos sintéticos de
empresa (14 ordens no total), prepara os 63 subconjuntos não vazios pela interface,
libera o runner controlado de diagnósticos e deixa o motor processar cada um.
confirma os 63 envelopes persistidos e a maior economia apresentada na recomendação.
Também verifica que gráfico e tabela completa não são renderizados. Depois de todos
terminarem, conta chamadas POST a `/api/v1/diagnosticos` e
`/api/v1/preparacoes` durante objetivos, filtros, alternativas e análise marginal;
o esperado é zero. Também compara o snapshot salvo antes e depois da exploração.

Comando focado, usando o ambiente Python configurado para Playwright:

```powershell
npm --prefix web run test:e2e -- study-portfolio-analysis.spec.ts
```

| Verificação | Resultado nesta branch |
|---|---|
| E2E focado (6 empresas sintéticas, 14 ordens, 63 carteiras, motor real) | Aprovado antes do ajuste visual: 1 teste e 63 diagnósticos concluídos. O percurso foi atualizado para a interface compacta e precisa ser reexecutado; ele valida os envelopes persistidos, a recomendação, a ausência do gráfico/tabela, zero novos POSTs durante a exploração e snapshot idêntico antes/depois |
| Suíte unitária web, typecheck, lint, build | Aprovado: 1.287/1.287 testes unitários com `--maxWorkers=1`; após os ajustes finais, 40/40 testes focados, typecheck, lint e build também passaram. A execução padrão muito concorrente é instável por pressão local de recursos, sem falha funcional reproduzida no modo serial |
| Launcher local | 5/5 testes aprovados; listener restrito a `127.0.0.1` e encerramento do executor cobertos |
| Prévia aberta em `127.0.0.1:8031` | Aprovada em inspeção visual a 1280×800 e em reflow equivalente a zoom de 200%; controles, tabela, gráfico e detalhes permaneceram utilizáveis sem corte horizontal |
| Aceite de Gabriel | Pendente |

Os totais financeiros publicados são preservados mesmo quando a soma dos componentes
de custo deixa um resíduo decimal legítimo; a tela mostra a diferença exata como
nota neutra. A regressão usa um singleton que atravessou o adapter e a publicação
real, preservando um resíduo de R$ `0.000000000000000000000000000411`. Nenhuma
mudança no motor ou tolerância inventada foi necessária.

## Modelos e trabalho paralelo

A matriz abaixo documenta a divisão adotada no plano
`docs/superpowers/plans/2026-09-30-carteiras-analise.md`. Arquivos exclusivos
permitiram implementar partes independentes ao mesmo tempo; a composição do painel,
o teste E2E e a revisão transversal exigem o resultado das partes anteriores.

| Etapa | Modelo / raciocínio planejado | Dependência e paralelismo |
|---|---|---|
| T0 ambiente e baseline | gpt-6-luna / medium | Pode acompanhar a leitura inicial |
| T1 projeção de métricas | gpt-6-astra / high | Onda A, junto de T2 e T6a |
| T2 objetivos e filtros | gpt-6-sol / high | Onda A, contrato definido antes de T1 terminar |
| T6a launcher local | gpt-6-luna / high | Onda A, arquivos Python isolados |
| T3 interface e tabela | gpt-6-sol / high | Onda B, após T1 e T2 |
| T4 gráfico e Pareto | gpt-6-sol / high | Onda B, em paralelo com T3 e T5 |
| T5 contribuição marginal | gpt-6-astra / high | Onda B, em paralelo com T3 e T4 |
| T6b E2E e aceite | gpt-6-luna / high | Após integração do painel; pode preparar harness antes |
| Revisões por etapa | gpt-6-sol / high | Após implementação de cada parte |
| Revisão final transversal | gpt-6-astra / xhigh | Após gates e integração |

Na execução, T3 foi feito por gpt-6-sol / medium, seguido de revisão por
gpt-6-sol / high. A matriz acima conserva o modelo inicialmente planejado para
deixar explícita a alocação por etapa e as dependências das ondas.

Execução efetiva: projeção e marginais usaram gpt-6-astra / high; seleção, Pareto,
E2E e diagnóstico da suíte usaram gpt-6-sol / high; interface usou gpt-6-sol /
medium com revisão high; launcher e documentação usaram gpt-6-luna / high;
integração usou gpt-6-astra / high e a auditoria transversal, gpt-6-astra / xhigh.
As ondas A e B foram executadas com agentes simultâneos nos arquivos exclusivos.
No aceite visual de 2026-10-01, o gráfico/Pareto e a tabela completa foram removidos
da tela principal; os módulos permanecem isolados no código, mas não são carregados
por `PortfolioRecommendationPanel`.

Na fase inicial, os resultados técnicos não autorizavam publicação. Gabriel
experimentou e aprovou a prévia em 2026-10-02, autorizando commit, merge e deploy
quando seguros. O CI do candidato e a confirmação do deploy continuam obrigatórios.

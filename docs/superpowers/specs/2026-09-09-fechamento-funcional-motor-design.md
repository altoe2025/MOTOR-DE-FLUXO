# Especificação de fechamento funcional do Motor de Fluxo

**Data:** 2026-09-09

**Status:** pronta para revisão do Gabriel

**Escopo:** exclusivamente os problemas confirmados na auditoria dos relatórios finais e a inteligência por cliente já aprovada

## 1. Objetivo

Concluir o Motor de Fluxo como um motor analítico coerente, correto e auditável antes de qualquer trabalho de front-end. O trabalho preserva a política P0, o baseline e as fórmulas de custo atuais; corrige falhas de contrato e de saída; cria um resultado canônico; e acrescenta histórico técnico e inteligência por cliente.

Ao final, uma execução válida deve responder, com reconciliação exata:

- o que aconteceu com a pool;
- quanto foi casado e remetido;
- qual foi o custo baseline, o custo netado e a economia;
- o que aconteceu com cada cliente e cada ordem;
- quanto cada cliente ganhou ou perdeu;
- quanto um cliente contribuiu marginalmente para a economia da pool, quando essa análise for solicitada;
- quais premissas e parâmetros produziram o resultado.

## 2. Fora do escopo

Esta entrega não implementa:

- front-end;
- dados reais ou calibração dos parâmetros;
- preços, cobrança ou faturamento;
- calendário civil, meses civis ou anos civis;
- autonetting temporal anterior à pool;
- nova política de netting além de P0;
- mudança de moeda, corredor ou conversão cambial;
- regras jurídicas ou regulatórias novas;
- certificação estatística da quantidade ideal de seeds;
- expansão funcional de `visibilidade_dias_min/max`.

## 3. Semântica preservada

### 3.1 Ordens e autonetting

Cada `Ordem` continua representando uma necessidade independente enviada ao orquestrador. Ordens OUT e IN do mesmo cliente podem coexistir e podem ser casadas pela própria orquestração. Não haverá compensação automática antes da entrada na pool.

Essa decisão foi confirmada após esclarecimento operacional fornecido ao Gabriel em 2026-09-09: empresas podem gerar novas operações durante uma janela aberta e podem desejar que a orquestração viabilize inclusive casamentos entre posições da mesma empresa.

Consequências:

- o baseline atual permanece inalterado;
- `economia_brl` continua incluindo o benefício de casamentos orquestrados entre ordens do mesmo cliente;
- não existe autonetting retroativo ou etapa de pré-compensação;
- `limite_intra_cliente_brl`, `volume_casado_incremental_brl` e `taxa_netabilidade_incremental` permanecem apenas em `diagnosticos_experimentais`;
- esses diagnósticos não reduzem a economia oficial e não sustentam a frase de que parte da economia “não pertence ao produto”;
- a CLI principal não os apresenta como conclusão.

### 3.2 P0 e custos

P0 permanece com janela fixa, fechamento por janela, vencimento ou fim aplicável da execução, prioridade EDF e desempate por ID. O excedente com folga permanece aberto; somente a parcela vencida é remetida.

As fórmulas atuais permanecem:

- baseline: IOF, spread e tarifa fixa por ordem;
- netado: IOF sobre alocações remetidas;
- carry sobre alocações casadas;
- espera por valor e dias até a resolução;
- spread sobre o resíduo remetido do ciclo;
- tarifa fixa por ciclo com remessa.

Os valores dos parâmetros são provisórios. O resultado deve carregar a marca `custos_calibrados=false`. Nenhum valor absoluto é apresentado como previsão real enquanto essa marca for falsa.

## 4. Arquitetura escolhida

### 4.1 Fonte única de verdade

O pacote `motor` produz um `ResultadoCanonico`. JSON, CSV, CLI, relatórios e comandos analíticos derivam desse objeto. Nenhum consumidor redefine custos, percentis, rateios ou significados.

O fluxo será:

```text
Cenario validado
    -> simulação P0 existente
    -> custos agregados existentes
    -> análise canônica
       -> agregado
       -> ledger e resumos por cliente, conforme o modo
       -> contribuição marginal, conforme o modo
       -> diagnósticos experimentais
       -> manifesto
    -> exportadores/CLI/relatórios
```

As dependências continuam apontando para dentro: a camada analítica consome domínio, simulação e custos; `dominio.py`, `netting.py` e `custo.py` não passam a depender da camada analítica.

### 4.2 Componentes

As responsabilidades ficam distribuídas assim:

- `motor/dominio.py`: entidades e validação comum de `Ordem`, `ParametrosCusto` e `Cenario`;
- `motor/netting.py`, `motor/custo.py` e `motor/simulacao.py`: P0 e resultado agregado existentes;
- `motor/analise/modelo.py`: tipos de `ResultadoCanonico`, manifesto, clientes e eventos;
- `motor/analise/clientes.py`: ledger, rateio e resumos por cliente;
- `motor/analise/marginal.py`: execuções leave-one-client-out;
- `motor/analise/estatistica.py`: percentis e agregações compartilhados;
- `motor/analise/serializacao.py`: JSON, CSV, compatibilidade e publicação atômica;
- `motor/analise/pipeline.py`: composição do resultado canônico conforme o modo;
- `motor/__main__.py`: comandos oficiais, sem fórmulas analíticas próprias.

Os scripts existentes tornam-se adaptadores temporários dos comandos oficiais e deixam de possuir implementações concorrentes.

## 5. Validação obrigatória

Entradas inválidas falham antes da simulação. Não há deduplicação, preenchimento ou correção silenciosa.

Regras mínimas:

- IDs de ordem únicos e não vazios;
- IDs de cliente não vazios;
- valores de ordem positivos e finitos;
- `dia_conhecida >= 0`;
- `dia_limite >= dia_conhecida`;
- horizonte não negativo;
- ordens conhecidas dentro do horizonte de entrada;
- `janela_dias >= 1`;
- PTAX positiva e finita;
- custos e taxas-base finitos e não negativos;
- seeds únicas;
- pesos de mix finitos, não negativos e com soma positiva;
- chaves analíticas únicas;
- arquivos encadeados completos e reconciliados com sua origem.

Ordens cujo vencimento ultrapasse o horizonte de entrada continuam válidas.

Além da conservação por ID, o motor verifica a conservação global:

```text
soma do valor das ordens
== soma de todas as alocações casadas e remetidas
```

## 6. Resultado canônico

### 6.1 Estrutura

`ResultadoCanonico` contém:

- `manifesto`;
- `agregado`;
- `clientes`, quando solicitado;
- `ledger_eventos`, quando solicitado;
- `contribuicoes_marginais`, quando solicitado;
- `diagnosticos_experimentais`;
- `avisos` válidos da execução.

O agregado preserva ciclos, custos, economia e netabilidade existentes e acrescenta as métricas oficiais que hoje vivem apenas nos scripts.

### 6.2 Modos de análise

O operador escolhe um modo explícito:

- `AGREGADO`: somente resultado geral;
- `POR_CLIENTE`: agregado, ledger e histórico técnico de todos os clientes;
- `MARGINAL_SELECIONADOS`: `POR_CLIENTE` mais contribuição marginal dos IDs solicitados;
- `COMPLETO`: `POR_CLIENTE` mais contribuição marginal de todos os clientes.

No modo `COMPLETO`, a configuração deve informar `max_clientes_marginal_completo`. Se a carteira ultrapassar esse valor, a execução falha antes do cálculo, a menos que o operador forneça confirmação explícita de alto custo. As grandes varreduras usam `AGREGADO`.

## 7. Ledger e histórico por cliente

### 7.1 Fonte canônica

O histórico oficial é um ledger esparso de eventos, não uma linha vazia para cada cliente em cada dia. Os tipos são `ORDEM_CONHECIDA`, `CASADO` e `REMETIDO`. O evento de entrada registra a ordem sem reconhecer ganho. Cada evento registra, conforme seu tipo:

- identificador do evento;
- cliente e ordem;
- dia de conhecimento e, quando houver, dia de resolução;
- tipo do evento;
- valor conhecido ou resolvido em BRL;
- parcelas de custo baseline atribuídas à resolução;
- parcelas de custo netado atribuídas à resolução;
- ganho realizado na resolução;
- classificação `eh_efx` apenas como metadado.

Visões por dia relativo, acumulado e total do horizonte são derivadas do ledger. Calendário, mês civil e ano civil não fazem parte desta entrega.

### 7.2 Reconhecimento do ganho

O ganho é reconhecido quando a parcela é resolvida. Para uma ordem dividida em alocações, seu baseline é distribuído proporcionalmente ao valor de cada alocação. Isso evita publicar ganho antes de o custo final existir.

Para cada cliente:

```text
ganho_proprio_brl = baseline_atribuido_brl - custo_netado_atribuido_brl
ganho_proprio_bps = ganho_proprio_brl / volume_bruto_cliente_brl * 10.000
```

Ganhos negativos são preservados. O motor não redistribui benefício para fazer todos os clientes parecerem ganhadores.

### 7.3 Rateio técnico

O rateio explica o resultado; não define preço ou faturamento.

- baseline: custo direto da ordem, distribuído entre suas alocações pelo valor;
- IOF netado: direto para a alocação remetida;
- carry: direto para a alocação casada;
- espera: direto para cada alocação e seus dias de espera;
- spread do ciclo: proporcional ao volume remetido de cada cliente no ciclo;
- tarifa fixa do ciclo: proporcional ao volume remetido de cada cliente no ciclo.

Invariantes:

```text
soma dos custos baseline dos clientes == baseline agregado
soma dos custos netados dos clientes == custo netado agregado
soma dos ganhos próprios dos clientes == economia agregada
soma dos volumes dos clientes == volumes agregados correspondentes
```

## 8. Contribuição marginal

Quando solicitada para o cliente `i`, a análise executa a mesma carteira sem esse cliente:

```text
contribuicao_marginal_total_brl
    = economia(pool completa) - economia(pool sem i)

efeito_sobre_demais_brl
    = contribuicao_marginal_total_brl - ganho_proprio_brl(i)
```

Serão publicados:

- ganho próprio do cliente em BRL e bps sobre seu volume;
- contribuição marginal total em BRL e bps sobre o volume da pool completa;
- efeito sobre os demais em BRL e bps sobre o volume da pool completa.

Valores negativos são válidos. As ordens e seeds dos outros clientes não mudam na execução sem `i`.

## 9. Manifesto e compatibilidade

Cada execução possui `run_id` e manifesto autocontido com:

- versão do schema;
- versão/commit do motor;
- instante de criação da execução em UTC;
- parâmetros completos de custo;
- configuração de mixes e arquétipos usada;
- horizonte, janela e seeds;
- modo de análise;
- custo calibrado ou não;
- método estatístico;
- hash canônico da configuração.

Arquivos derivados carregam `run_id`, versão do schema e hash. Combinações com origem, parâmetros ou schema incompatíveis são rejeitadas.

Todos os cálculos financeiros usam `Decimal`. JSON serializa dinheiro e taxas como textos decimais exatos. Campos trazem a unidade no nome, como `_brl`, `_bps`, `_dias` e `_fracao`. Arredondamento ocorre apenas nos exportadores e segue uma regra única por unidade.

## 10. Publicação das saídas

Uma execução é publicada atomicamente:

1. validar todos os argumentos e insumos;
2. calcular numa área temporária;
3. verificar invariantes e reconciliações;
4. finalizar o manifesto;
5. publicar o diretório identificado por `run_id`;
6. não sobrescrever uma execução existente silenciosamente.

Falha antes da publicação não produz conjunto oficial parcial.

Varredura, análise de custos, estresse, projeção e análise por cliente passam a ser funcionalidades do pacote `motor`. Scripts antigos podem atuar como adaptadores durante a migração, mas não contêm lógica concorrente.

## 11. Metodologia estatística e temporal

### 11.1 Percentis

Existe uma única definição empírica, sem interpolação. Para `n` observações ordenadas e quantil `q`, usa-se o posto de base 1:

```text
posto = max(1, ceil(q * n))
percentil = observação que ocupa esse posto na lista ordenada
```

Assim, com 300 seeds, p10 aponta para a 30ª observação, p50 para a 150ª e p90 para a 270ª. O relatório descreve p10 como o ponto que separa aproximadamente os 10% menores resultados dos restantes, nunca como “décima pior”.

Seeds precisam ser únicas. O padrão provisório é 300 seeds configuráveis. Toda saída declara que a suficiência estatística desse número ainda não foi validada; não usa a expressão “intervalo de confiança” sem cálculo correspondente.

### 11.2 Janelas

A análise oficial principal usa W=1, W=2 e W=3, refletindo a informação operacional recebida em 2026-09-09. W=7 é cenário de estresse. O motor continua aceitando qualquer W inteiro válido.

Comparações de W usam a mesma pool e as mesmas seeds. O motor apresenta economia, espera e custo de oportunidade; só recomenda uma janela quando o operador fornece limite máximo de espera. Sem esse limite, apresenta o trade-off e opções não dominadas.

### 11.3 Períodos

Resultados recebem rótulo anual somente quando o período medido possui 365 dias. Outros horizontes usam `volume_do_periodo` e `economia_do_periodo`; não há anualização automática.

Cadência é definida como quantidade esperada por período de 30 dias. Em 365 dias, a expectativa usa `cadencia * 365 / 30`, igual ao gerador atual.

Análises oficiais separam:

- aquecimento, para formar o estado inicial da pool;
- período medido, cuja coorte entra nos indicadores oficiais;
- liquidação, sem entrada de novas ordens, até a resolução natural da coorte medida.

Para isso, `periodo_medicao_dias` deixa de ser confundido com o último dia de execução. Depois do fim do período medido, o pipeline não admite ordens novas e estende a execução até o maior `dia_limite` das ordens ainda pendentes. A coorte oficial contém as ordens conhecidas durante o período medido; ordens do aquecimento formam o estado inicial e são identificadas separadamente. O resultado preserva também invariantes sobre o conjunto completo simulado.

A drenagem forçada no fim permanece apenas em execução legada/rápida e deve ser identificada no manifesto. Métricas oficiais de espera não misturam drenagem forçada com liquidação natural.

## 12. Legado e relatórios

Os CSVs e relatórios sintéticos atuais permanecem preservados como `LEGADO`. Eles não são combinados com novas execuções nem usados como resultado oficial depois da migração.

Após a implementação:

- regenerar as análises pelo resultado canônico;
- usar W=1, 2 e 3 na grade principal e W=7 no estresse;
- corrigir texto da CLI, p10, p50, precisão e truncamento;
- remover das conclusões a dedução de que o casamento do mesmo cliente não pertence ao produto;
- publicar claramente que custos e dados continuam não calibrados.

## 13. Tratamento de erros

Erros de entrada são específicos e identificam campo, valor e regra violada. Erros de compatibilidade identificam os `run_id`, hashes ou versões em conflito. Falhas de invariantes impedem qualquer publicação oficial.

Avisos são reservados a execuções válidas, como:

- custos não calibrados;
- 300 seeds ainda sem estudo de suficiência;
- diagnóstico incremental experimental;
- modo marginal completo de alto custo;
- drenagem forçada em modo legado.

## 14. Estratégia de testes

A implementação será guiada por testes de regressão antes das correções.

Cobertura obrigatória:

- reprodução da perda silenciosa por IDs duplicados;
- validação comum para YAML e API direta;
- conservação global e por ordem;
- parâmetros e mixes inválidos/não finitos;
- seeds e chaves analíticas duplicadas;
- precisão de todas as unidades nos exportadores;
- percentis idênticos em todos os consumidores;
- rejeição de datasets incompatíveis, incompletos ou duplicados;
- ausência de publicação parcial após falha;
- reconciliação dos custos e volumes por cliente;
- ganhos positivos e negativos;
- quatro modos de análise;
- contribuição marginal, efeito sobre os demais e preservação das ordens restantes;
- período anual somente com 365 dias;
- W=1, 2 e 3 sobre pools pareadas;
- aquecimento, coorte medida e liquidação natural;
- cenário de aceitação da Amanda sem regressão;
- suíte completa no modo normal e com `python -O`.

## 15. Critérios de conclusão

O motor estará funcionalmente concluído quando:

1. nenhuma entrada inválida conhecida puder produzir resultado aparentemente válido;
2. toda ordem e todo volume forem conservados globalmente;
3. houver um único resultado canônico consumido por todas as saídas;
4. custos, volumes e ganhos por cliente reconciliarem exatamente com o agregado;
5. os quatro modos de análise funcionarem e o modo marginal respeitar sua proteção de custo;
6. percentis, unidades, precisão e rótulos temporais forem únicos e documentados;
7. datasets incompatíveis não puderem ser combinados;
8. falhas não publicarem conjuntos parciais;
9. a grade oficial cobrir W=1, 2 e 3 e o estresse cobrir W=7;
10. relatórios oficiais forem regenerados e os anteriores estiverem identificados como legado;
11. o cenário de aceitação permanecer reproduzível;
12. a suíte completa passar no modo normal e com `python -O`;
13. toda a entrega estiver integrada à linha principal do projeto.

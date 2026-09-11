# Plano de ação do front-end — distribuição de modelos

**Eu manteria as seis etapas do documento, com Terra como executor padrão, Sol responsável pelas partes analíticas e pelo acabamento visual, e Astra concentrado nas decisões que podem gerar retrabalho no projeto inteiro.** Luna fica como opção para tarefas mecânicas bem delimitadas.

Li a conversa completa e a [especificação do front-end](../specs/2026-09-11-frontend-motor-de-fluxo-design.md). A organização abaixo preserva a arquitetura proposta; é um plano de distribuição do trabalho, sem iniciar a implementação.

Essa divisão acompanha a orientação atual da OpenAI sobre os modelos. **A atribuição específica de cada trabalho abaixo é minha recomendação para o seu projeto**, não uma garantia de desempenho ou economia. [Orientação oficial de modelos](https://learn.chatgpt.com/docs/models)

## O principal ajuste em relação ao chat

Eu evitaria pedir ao Astra para “criar toda a fundação”. Esse pedido mistura decisões difíceis com muito código rotineiro.

Usaria Astra para definir contratos, fronteiras e invariantes; Sol e Terra implementariam sobre essas decisões. Também não deixaria todos os testes para modelos baratos: testes de conservação, compatibilidade, autenticação e coerência entre resultados exigem julgamento e devem acompanhar quem implementa essas partes.

Há outra distinção: seu documento contém **front-end e serviços de servidor necessários para sustentá-lo**. O planejamento precisa incluir essas dependências, mas primeiro verificar o que já existe. Não inspecionei o código nesta tarefa, portanto não estou presumindo que tudo precisará ser construído.

| Modelo | Responsabilidade principal | Esforço inicial sugerido |
|---|---|---|
| **Astra** | Contratos compartilhados, invariantes analíticas, núcleo temporal do replay e revisões críticas | Medium; Low para revisão delimitada |
| **Sol** | Integração complexa, diagnóstico, gráficos, comparação, segurança e qualidade visual | Medium |
| **Terra** | Formulários, componentes, navegação, persistência e estados sobre contratos definidos | Low ou Medium |
| **Luna — opcional** | Ajustes repetitivos com exemplo e resultado esperado claros | Low |

São pontos de partida. Não colocaria High, Max ou Ultra como padrão.

## Etapa 1 — Fundação e contrato com o motor

Base: seções 4, 8, 11, 12 e 14.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Inventariar API, motor e testes existentes | **Sol** | Mapa do que pode ser reutilizado e das lacunas reais |
| Consolidar contratos de estudo, cenário, execução e resultado | **Astra** | Fronteiras de responsabilidade, versões, proveniência e identidade da configuração |
| Definir regras compartilhadas de apresentação | **Astra**, junto dos contratos | Unidades, arredondamento e distinção entre prévia, distribuição e repetição do replay |
| Definir composição visual e exemplos representativos | **Sol** | Direção concreta de layout, tipografia, densidade e gráficos conforme a especificação |
| Implementar Vite, Router, tokens, navegação e componentes básicos | **Terra** | Estrutura navegável e componentes acessíveis |
| Implementar login e estados de sessão no navegador | **Terra** | Entrada, saída e expiração preservando alterações locais |
| Implementar/verificar autenticação no servidor e adaptador do motor | **Sol** | Token validado no servidor e consumo das interfaces públicas do motor |
| Criar cliente tipado e infraestrutura básica de testes | **Terra** | Integração aderente aos contratos e verificações executáveis |

**Critério para avançar:** login funcional, estrutura navegável e um caminho validado entre navegador e motor. Dados simulados podem ajudar no desenvolvimento visual, mas não substituem essa integração.

Astra resolve a estrutura compartilhada uma vez. Não precisa voltar para cada componente.

## Etapa 2 — Primeiro fluxo completo

Base: seções 6.1, 6.5, 7.1, 8 e 13.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Criar e editar estudo, carteira, grupos e participantes | **Terra** | Modelagem progressiva, campos e proveniência |
| Implementar os cinco exemplos sintéticos | **Terra** | Exemplos com nomes legíveis e composição efetivamente realizada |
| Implementar Dados e premissas | **Terra** | Campos tipados, validações e origem dos valores |
| Persistir estudos em IndexedDB por repositório | **Terra** | Salvar e reabrir sem acoplar telas ao armazenamento |
| Integrar prévia e resultado básico | **Sol** | Execução reproduzível e resultado canônico |
| Definir e implementar invalidação/reprecificação | **Sol** | Mudanças estruturais desatualizam resultados; reprecificação depende do contrato do motor |
| Completar erros, carregamento e servidor indisponível | **Terra** | Entradas preservadas e estudos salvos consultáveis |
| Testar o percurso completo | **Terra**, com critérios definidos na integração | Criar → executar → salvar → recarregar → editar → detectar desatualização |

**Critério para avançar:** um estudo real percorre esse fluxo sem perda de dados nem resultado antigo apresentado como atual.

Não reservaria Astra para essa etapa, salvo descoberta que invalide os contratos iniciais.

## Etapa 3 — Diagnóstico robusto

Base: seções 5, 6.2, 7.2, 12.3–12.4 e 14.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Executor, progresso, cancelamento e concorrência limitada no servidor | **Sol** | Ciclo de execução controlado e comportamento após reinicialização |
| Acompanhamento com TanStack Query e prevenção de disparos duplicados | **Sol** | Navegação durante execução e resultado vinculado à configuração correta |
| Implementar/integrar os sete eixos e regras determinísticas | **Sol** | Métricas, consequências e limitações com evidência e versão |
| Construir hierarquia do diagnóstico e gráficos ECharts | **Sol** | Gráficos organizados por pergunta analítica |
| Completar tabelas, proveniência, tooltips e estados | **Terra** | Componentes consistentes com o padrão estabelecido |
| Revisar invariantes e semântica do diagnóstico | **Astra** | Revisão concentrada das relações entre servidor, resultado e visualização |

**Critério para avançar:** distribuição e exemplo individual estão claramente separados; consequências têm suporte; ausência de evidência não vira conclusão.

Aqui os sete eixos **organizam o conteúdo**, conforme o documento. Não se tornam automaticamente sete cartões iguais.

## Etapa 4 — Comparação e análise marginal

Base: seções 6.3, 8, 14 e 15.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Implementar variantes como diferenças da carteira base | **Terra** | Inclusão, retirada e alteração preservando a base |
| Implementar/verificar compatibilidade e análise marginal | **Sol** | Validação de versão, período, premissas e configuração estatística |
| Construir comparação visual | **Sol** | Mudanças na entrada aparecem antes das mudanças no resultado |
| Completar seletores, explicações e estados bloqueados | **Terra** | Incompatibilidades identificadas objetivamente |
| Testar comparações e atribuição agregada | **Sol** | Efeito marginal não apresentado como benefício individual |

**Critério para avançar:** cenários incompatíveis são bloqueados e a comparação usa os mesmos resultados e convenções do diagnóstico.

Não faria uma nova revisão Astra obrigatória se os contratos permanecerem estáveis e as verificações passarem.

## Etapa 5 — Replay

Base: seções 5.4, 6.4, 14 e 15.2.

Esta é a maior concentração justificada de Astra.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Definir contrato temporal e implementar núcleo de reprodução | **Astra** | Todos os dias, transições, seleção da repetição e sincronização |
| Preparar dados de replay no servidor | **Sol** | Posições e eventos derivados das saídas canônicas |
| Implementar cena React/SVG | **Sol** | Filas, ciclo, novas ordens, fechamentos, compensação e resíduos agregados |
| Implementar controles sobre o núcleo definido | **Terra** | Play, pause, velocidade, dia, avanço diário e próximo fechamento |
| Construir Apresentação e Inspeção | **Sol** | Densidades diferentes sobre a mesma informação |
| Verificar tempo, limites e desempenho | **Sol** | Dias sem evento, saltos, fim do horizonte e troca de repetição |
| Revisar coerência temporal e representação | **Astra** | Sincronização correta e ausência de pareamentos físicos sugeridos |

**Critério para avançar:** qualquer dia pode ser inspecionado corretamente, a faixa com/sem agrupamento permanece sincronizada e a representação respeita posições agregadas.

Astra fica com o mecanismo difícil; Sol e Terra produzem boa parte do código visual.

## Etapa 6 — Comunicação e acabamento

Base: seções 9, 10, 12.5, 13 e 15.

| Trabalho | Responsável | Entrega e verificação |
|---|---|---|
| Contexto estruturado, ferramentas de leitura e integração do chat | **Sol** | Acesso restrito ao resultado e chave somente no servidor |
| Painel lateral e estados da conversa | **Terra** | Histórico da conversa aberta, carregamento e falhas |
| Avaliar respostas sustentadas, ausências e tentativas de alteração | **Sol** | Chat respeita os limites definidos |
| Relatório e apresentação usando o modelo compartilhado | **Sol** | Mesmos valores, rótulos, proveniência e limitações |
| CSS de impressão, paginação e controles de apresentação | **Terra** | PDF legível e apresentação funcional |
| Acabamento visual integrado | **Sol** | Consistência entre telas e gráficos |
| Acessibilidade e ajustes locais | **Terra** | Teclado, foco, contraste e estados acessíveis |
| Ajustes repetitivos já especificados | **Luna**, opcional | Correções locais verificadas |
| Contêiner, mesma origem e preparação de publicação | **Sol** | React servido pelo FastAPI e configuração validada |
| Aceitação integrada final | **Astra** | Revisão dos riscos materiais e coerência entre diagnóstico, comparação, chat, replay e PDF |

**Critério para concluir:** um estudo reproduzível conserva os dados correspondentes em todas as representações, com testes e inspeção visual. O replay continua representando uma repetição, sem ser confundido com os agregados do diagnóstico.

O modelo que desenvolverá o chat e o modelo usado pelo chat em produção são decisões diferentes. Este plano distribui **trabalho de desenvolvimento**; não fixa o modelo de produção.

## Como operar esse workflow gastando menos

1. **Planejar detalhadamente apenas a próxima etapa.** O mapa inteiro fica estável; arquivos e passos de implementação são definidos após verificar o código existente.
2. **Agrupar tarefas por entrega coerente.** Um formulário com validação e testes pode ser uma tarefa. Separar cada botão em outra conversa aumenta transferências de contexto.
3. **Manter um contexto curto de continuidade:** decisões vigentes, contratos relevantes, arquivos alterados, verificações realizadas e pendências.
4. **Cada executor verifica o próprio trabalho.** Não criar uma revisão Astra após toda alteração Terra.
5. **Escalar por evidência.** Ambiguidade contratual, falha transversal ou repetição de tentativa sem nova hipótese justificam subir de modelo. Um erro simples de compilação não.
6. **Usar testes durante cada etapa.** Terra pode ampliar casos conhecidos; Sol/Astra definem os critérios dos mecanismos que exigem mais julgamento.
7. **Evitar paralelismo como padrão de economia.** Primeiro estabilizar contratos; depois considerar trabalhos independentes quando houver benefício concreto.

Na sua configuração, manteria **FAST para ajustes mecânicos, BALANCED para trabalho comum e SUPERPOWERS para contratos, autenticação, concorrência e replay**, conforme seu AGENTS.md. Esse perfil FAST é diferente do **Fast de velocidade do modelo**, que aumenta consumo; no Astra, a documentação informa multiplicador de 2,5×. [Consumo e preços](https://learn.chatgpt.com/docs/pricing)

## Sobre o orçamento

Não adotaria os “500–1.000 créditos” da conversa como orçamento validado. Ainda faltam o inventário do código e uma medição de tarefas representativas.

Começaria com as entregas delimitadas de Astra acima — contratos, revisão do diagnóstico, núcleo e revisão do replay, aceitação final — e reservaria chamadas adicionais para problemas demonstrados. **Não tentaria cumprir uma porcentagem artificial por modelo.**

Depois do primeiro fluxo completo, mediríamos consumo e retrabalho para ajustar a distribuição. A economia deve vir de **menos redescoberta, menos mudanças de contrato e menos tentativas malsucedidas**, mantendo os mesmos critérios de qualidade.

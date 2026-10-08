# Front-end do Motor de Fluxo — especificação de produto e arquitetura

**Data:** 2026-09-11  
**Status:** desenho aprovado; implementação ainda não iniciada  
**Escopo:** primeira versão desktop da aplicação web

## 1. Objetivo

Construir uma aplicação analítica para investigar carteiras candidatas ao Motor de
Fluxo. A aplicação deve transformar entradas hipotéticas ou estimadas em evidência
técnica compreensível, permitir comparar composições e mostrar como o mecanismo se
comporta ao longo do tempo.

O produto serve principalmente para Amanda examinar uma carteira. Ele não deve agir
como consultor, emitir pareceres ou tentar substituir seu julgamento. Deve apresentar
dados, relações mensuradas, consequências técnicas curtas, limitações e pontos que
podem alterar a leitura.

O motor Python existente é a fonte de verdade para geração, netting, custos e
simulação. A interface não reproduz nem simplifica essas regras em JavaScript.

## 2. Critérios de sucesso

A primeira versão será bem-sucedida quando seus quatro usuários puderem:

1. entrar de forma simples e segura;
2. criar uma carteira sintética ou estimada;
3. executar uma prévia reproduzível e um diagnóstico robusto;
4. compreender estrutura, comportamento, consequências econômicas e limitações;
5. comparar cenários compatíveis e investigar mudanças marginais;
6. reproduzir visualmente um cenário dia a dia sem inferir pareamentos físicos;
7. consultar resultados em um chat estritamente analítico e somente leitura;
8. produzir um relatório fiel aos mesmos dados exibidos na aplicação.

O produto deve conservar entradas, resultados e explicações coerentes entre tela,
chat, comparação, replay e relatório.

## 3. Fora do escopo da primeira versão

- decidir questões jurídicas ou regulatórias;
- recomendar decisões comerciais ou declarar uma carteira “boa” ou “ruim”;
- cotações e atualização automática de câmbio, IOF, spread ou outros custos;
- colaboração simultânea, permissões diferentes ou compartilhamento de estudos;
- banco de dados de estudos e dados reais;
- uso em celular ou desenho responsivo completo;
- exportação de arquivos brutos extensos ou de um formato próprio de estudo;
- alterar dados ou executar análises por meio do chat;
- atribuir benefício econômico individual a uma empresa sem cálculo específico e
  validado pelo motor;
- reconstruir o front-end a partir do protótipo técnico `fluxo-cambio.html`.

## 4. Usuários e acesso

A aplicação terá login por convite para Gabriel, Amanda, Felipe e Sávio. Todos terão
as mesmas permissões. O login será implementado com Supabase Auth e começará com um
fluxo simples de e-mail e senha.

Estudos serão armazenados localmente no navegador. Portanto, entrar com a mesma conta
em outro computador não fará os estudos aparecerem automaticamente. O relatório em
PDF será o mecanismo de compartilhamento da primeira versão. A interface comunicará
essa característica sem transformar o armazenamento local em assunto central.

## 5. Princípios de produto

### 5.1 Evidência antes de interpretação

Todo conteúdo analítico pertence internamente a uma das classes:

- **dado calculado:** número produzido ou derivado de um resultado validado;
- **consequência técnica:** descrição determinística de uma relação observada;
- **limitação:** condição que restringe a interpretação.

Consequências não são texto livre produzido por modelo de linguagem. Cada uma nasce
de uma regra versionada e guarda as métricas, o cenário e a evidência que a ativaram.

### 5.2 Sem vereditos

Não usar classificações como “promissora”, “frágil”, “ideal” ou “inviável”. Cores
também não devem converter automaticamente aumento em verde e redução em vermelho.
O usuário recebe grandezas, distribuições, dependências e limites.

### 5.3 Linguagem autoexplicativa

A interface não expõe palavras que só fazem sentido dentro do código. Termos
financeiros legítimos, como IOF, CNR, spread e pontos-base, podem permanecer, sempre
com explicação acessível. Termos internos são traduzidos:

| Interno | Interface |
|---|---|
| OUT | pagamentos que precisam de moeda no exterior |
| IN | recebimentos que geram moeda disponível no exterior |
| P0 | política de fechamento por janela e prazo |
| EDF | prioridade pelas operações com prazo mais próximo |
| seed | repetição reproduzível da simulação |
| mix | composição da carteira |
| arquétipo | perfil sintético de empresa |
| baseline | execução sem agrupamento |
| netado | execução com agrupamento |

Textos são curtos. Quando um rótulo, uma comparação visual ou um valor resolve a
comunicação, não se acrescenta um parágrafo.

### 5.4 Separação entre distribuição e exemplo

O diagnóstico robusto resume várias repetições. O replay representa uma repetição
específica e reproduzível. A interface nunca apresenta um dia ou uma trajetória como
se fossem a distribuição inteira.

## 6. Estrutura da aplicação

A navegação principal terá cinco destinos:

1. **Carteira**
2. **Diagnóstico**
3. **Comparar cenários**
4. **Replay**
5. **Dados e premissas**

O chat aparece como painel lateral opcional nas telas de resultado. O modo de
apresentação é outra forma de renderizar o mesmo estudo, não uma área de análise
duplicada.

### 6.1 Carteira

É o ponto de entrada do estudo. A modelagem é progressiva:

`carteira → grupos ou perfis → empresas candidatas identificadas`

Cada participante possui um conjunto básico sempre visível:

- nome;
- perfil sintético de origem, quando houver;
- volume;
- divisão entre pagamentos e recebimentos internacionais;
- valor típico das operações;
- frequência;
- prazo disponível;
- finalidade;
- detalhes avançados opcionais.

Cada valor carrega proveniência: **padrão sintético**, **estimativa do usuário** ou,
no futuro, **dado observado**. Um campo recebe um valor por vez, e não intervalos de
mínimo e máximo.

Os cinco exemplos sintéticos existentes serão oferecidos com nomes legíveis:

- Composição diversificada;
- Muitas operações frequentes de menor valor;
- Empresas de maior volume;
- Recebimentos concentrados em plataformas;
- Pagamentos ao exterior predominantes.

A composição efetivamente realizada pela simulação será mostrada; o nome do exemplo
não substitui a medição.

### 6.2 Diagnóstico

O diagnóstico segue uma hierarquia fixa:

1. estrutura e composição;
2. comportamento do agrupamento;
3. consequência econômica;
4. robustez;
5. limitações e pontos em aberto.

Os sete eixos abaixo são contratos semânticos internos. Eles organizam métricas,
gráficos, consequências, chat e relatório, mas não viram sete telas ou sete cartões
obrigatórios.

#### Eixo 1 — Potencial estrutural de compensação

Mede se a carteira produz volumes em sentidos opostos e em magnitude comparável.
Separa possibilidade estrutural de resultado efetivamente capturado pela política.

#### Eixo 2 — Captura do potencial pela política

Mostra quanto do potencial disponível foi aproveitado pelas regras de janela,
fechamento e prioridade, sem atribuir pareamento a ordens específicas.

#### Eixo 3 — Compatibilidade temporal

Examina se pagamentos e recebimentos compatíveis coexistem dentro dos prazos e como
janela, cadência e vencimentos afetam essa coexistência.

#### Eixo 4 — Exposição residual transfronteiriça

Mostra o volume que ainda precisa atravessar a fronteira, sua direção e sua evolução.

#### Eixo 5 — Dependência da composição

Mede concentração e sensibilidade a empresas ou perfis. A análise marginal pode
mostrar a mudança no resultado agregado ao adicionar, remover ou alterar um
participante. Ela não é apresentada como benefício individual.

#### Eixo 6 — Robustez econômica

Apresenta distribuição de custos e economia sob várias repetições e premissas,
incluindo mediana, dispersão e cenários de estresse pertinentes.

#### Eixo 7 — Perfil operacional

Resume volume de ordens, fechamentos, filas, vencimentos, tempo de espera e carga de
processamento produzida pela carteira.

Proveniência e cobertura de dados atravessam todos os eixos. Ao final, aparecem no
máximo dois a quatro **pontos que alteram ou limitam a leitura**, recalculados quando
o cenário muda. Não há lista de tarefas, responsáveis, status ou anotações.

### 6.3 Comparar cenários

O usuário escolhe variantes de um mesmo estudo. A comparação só ocorre quando versão
do motor, período, premissas econômicas e configuração estatística forem compatíveis.
Diferenças incompatíveis são explicadas antes da comparação.

A tela evidencia primeiro o que mudou na entrada e depois o que mudou no resultado.
Ela usa os mesmos sete eixos, exibindo apenas os que ajudam a explicar a diferença.
É possível comparar a carteira base com a inclusão, retirada ou alteração de uma
empresa ou perfil.

### 6.4 Replay

O replay mostra todos os dias do horizonte, inclusive aqueles sem evento. Seus
controles são: reproduzir, pausar, velocidade, dia, avançar um dia e ir ao próximo
fechamento.

A cena possui:

- fila de pagamentos que precisam de moeda no exterior;
- fila de recebimentos que geram moeda disponível no exterior;
- ciclo em processamento;
- novas ordens do dia;
- fechamentos disparados;
- volume compensado no agregado;
- resíduo vencido que precisou ser remetido;
- posições ainda abertas;
- resumo factual curto do dia.

Dois níveis de densidade atendem usos diferentes: **Apresentação** e **Inspeção**.
Uma faixa sincronizada compara o mesmo dia com e sem agrupamento.

Nunca haverá seta ligando empresas ou ordens específicas, nem linguagem de custódia
ou pareamento físico. O replay representa posições agregadas de tesouraria. A repetição
exibida pode ser escolhida entre uma próxima da mediana, uma região inferior, uma
região superior ou qualquer repetição reproduzível informada pelo usuário.

### 6.5 Dados e premissas

Centraliza período, política, valores de custo e proveniência. Na primeira versão,
serão editáveis manualmente:

- spread;
- tarifa fixa;
- custo de carregamento;
- taxa de câmbio de referência;
- alíquotas aplicáveis.

Alterações puramente econômicas podem reprecificar o resultado quando o contrato do
motor permitir. Alterações estruturais marcam o diagnóstico como desatualizado e
exigem **Atualizar diagnóstico**.

## 7. Execução das análises

### 7.1 Prévia

A prévia usa uma repetição reproduzível. Deve responder rápido e servir para validar
se a carteira foi descrita como o usuário esperava. Ela não recebe linguagem de
robustez nem substitui o diagnóstico.

### 7.2 Diagnóstico robusto

O diagnóstico executa múltiplas repetições e pode levar alguns segundos. A interface
mostra progresso, permite navegar durante a execução e impede disparos duplicados da
mesma configuração. A quantidade de repetições e a estratégia estatística ficam
registradas no resultado.

O servidor devolve um identificador de execução; o navegador consulta seu estado e
recebe o resultado canônico somente depois das validações de conservação e
consistência.

## 8. Estudo e fluxo de dados

Um **Estudo** local contém:

- nome;
- carteira base;
- variantes descritas como diferenças em relação à base;
- premissas;
- período;
- resultados de prévia e diagnóstico;
- repetição selecionada para replay;
- versão do motor e do contrato analítico.

O navegador faz validações de usabilidade, mas o servidor revalida tudo e constrói o
cenário aceito pelo motor. O resultado do servidor é a única fonte para números,
consequências, comparação, chat, replay e relatório.

Estudos são persistidos em IndexedDB por meio de uma interface de repositório. Essa
fronteira permitirá trocar o armazenamento local por PostgreSQL sem alterar as telas
ou o formato central do estudo.

## 9. Chat analítico

O chat permanece na primeira versão, mas é opcional e secundário. Ele abre em um
painel lateral sobre um resultado já calculado.

Pode:

- localizar e explicar métricas existentes;
- resumir diferenças entre cenários compatíveis;
- relacionar resultados aos sete eixos;
- explicar proveniência e limitações registradas;
- elaborar os pontos que alteram ou limitam a leitura.

Não pode:

- editar carteira, premissas ou estudo;
- iniciar cálculos ou simulações;
- navegar na internet;
- executar código ou fazer contas livres não verificadas;
- criar recomendações ou completar dados ausentes;
- afirmar benefício individual que o resultado agregado não sustenta.

O modelo recebe contexto estruturado do estudo atual e histórico apenas da conversa
aberta. Seu acesso ocorre por ferramentas de leitura permitidas explicitamente. Se a
resposta não estiver sustentada, informa isso de maneira direta.

## 10. Relatório e modo de apresentação

O relatório é produzido a partir do mesmo modelo de resultado usado pela tela. Ele
não recalcula valores nem pede ao modelo de linguagem que reescreva conclusões.

Sua estrutura acompanha o diagnóstico: identificação do estudo, composição,
comportamento, consequências econômicas, robustez, premissas, proveniência,
limitações e versão do motor. A saída usa estilos de impressão e o diálogo de PDF do
navegador.

O modo de apresentação reduz controles e detalhes de inspeção, amplia os elementos
essenciais e preserva valores, rótulos e limitações. Não existe uma segunda base de
conteúdo para apresentação.

## 11. Direção visual

A identidade será criada do zero e manterá o nome **Motor de Fluxo**. A personalidade
é editorial, analítica, madura e calma, com acabamento premium contido. A referência
visual de produtos financeiros inspira atmosfera e qualidade, não uma cópia de
layout.

### 11.1 Cor e superfícies

- fundo geral mineral ou cinza quente, evitando branco contínuo;
- superfícies analíticas levemente variadas para criar profundidade;
- navegação em carvão escuro;
- replay em ambiente escuro;
- branco usado com parcimônia;
- cores semânticas contidas e nunca equivalentes automáticas de bom ou ruim.

### 11.2 Tipografia e densidade

- densidade intermediária para desktop;
- hierarquia tipográfica editorial e precisa;
- números tabulares nas áreas comparativas;
- monoespaçada apenas quando tiver função técnica real;
- pouco texto e nenhuma descrição redundante.

### 11.3 Componentes e gráficos

A interface não usa o padrão genérico de painel administrativo composto por uma
grade de cartões idênticos. Cada gráfico deve responder a uma pergunta específica.
Movimento é funcional: progresso, transição de estado e replay. Não haverá animação
decorativa, estética de terminal ou aparência de plataforma de trading.

Será criado um sistema visual próprio com tokens de cor, tipografia, espaçamento,
raio, sombra e movimento. Primitivos acessíveis sem estilo podem ser utilizados, mas
nenhuma biblioteca pronta definirá a aparência final.

## 12. Arquitetura técnica

### 12.1 Forma de implantação

A primeira versão será uma aplicação modular em uma implantação:

- React + TypeScript + Vite no navegador;
- FastAPI + Pydantic no servidor;
- pacote `motor` importado diretamente no servidor;
- arquivos compilados do React servidos pelo FastAPI na mesma origem;
- contêiner único para publicação.

Isso elimina uma cópia das regras do motor, reduz configuração de rede e mantém
fronteiras internas preparadas para separação futura.

### 12.2 Front-end

- React Router para navegação;
- TanStack Query para estado de servidor e acompanhamento de execuções;
- IndexedDB atrás de um repositório local;
- validação de formulários tipada;
- Apache ECharts para gráficos diagnósticos e comparativos;
- React e SVG próprios para o replay;
- tokens CSS e componentes próprios para identidade visual;
- cliente Supabase para autenticação.

### 12.3 Servidor

O servidor será dividido por responsabilidade:

- autenticação e verificação de sessão;
- contratos de entrada e saída;
- adaptação entre API e domínio do motor;
- execução de prévia e diagnóstico;
- cálculo dos sete eixos;
- regras de consequências e limitações;
- comparação e análise marginal;
- preparação do replay;
- contexto e ferramentas permitidas do chat;
- modelo de visualização compartilhado por tela e relatório.

As camadas de análise não alteram a pureza ou as regras de importação do pacote
existente. Elas consomem suas saídas públicas.

### 12.4 Trabalhos demorados

Cálculo robusto não usará `BackgroundTasks` como mecanismo de computação pesada. Uma
interface de executor controlará fila, progresso, cancelamento e resultado. Na
primeira versão, um executor de processos com concorrência limitada e um único
processo web atende os quatro usuários. A interface poderá ser substituída por fila e
workers independentes quando volume e banco de dados justificarem.

Registros temporários de execução podem ser mantidos em memória nessa fase, portanto
uma reinicialização invalida apenas diagnósticos em andamento, nunca estudos locais
ou resultados já recebidos.

### 12.5 Autenticação e API externa

O servidor valida tokens Supabase e não confia apenas no estado do navegador. A chave
da OpenAI permanece exclusivamente no servidor. O modelo usado pelo chat é
configurável por ambiente, não gravado na lógica da aplicação.

## 13. Estados e falhas

A regra geral é não preencher lacunas com aparência de certeza.

- entradas incompletas são marcadas no próprio campo;
- a análise só começa depois da validação mínima;
- execução ativa permanece visível durante a navegação;
- alteração de entrada marca resultados anteriores como **desatualizados**;
- falha preserva entradas e informa a etapa em que ocorreu;
- evidência insuficiente aparece como tal, com a limitação objetiva;
- comparação incompatível é bloqueada com a divergência identificada;
- chat sem base declara que o resultado não sustenta a resposta;
- sessão expirada preserva alterações locais e solicita novo login;
- com o servidor indisponível, estudos já salvos permanecem visíveis, mas novas
  análises ficam bloqueadas.

Mensagens são curtas e locais. Detalhes técnicos ficam recolhidos e disponíveis para
diagnóstico interno.

## 14. Segurança analítica

Antes de publicar um resultado, o servidor verifica:

- conservação por ordem e conservação global;
- finitude e domínio dos valores;
- identidade entre configuração solicitada e configuração executada;
- versão do motor e contrato analítico;
- coerência entre percentis, repetições e cenário de replay;
- compatibilidade de comparações;
- ausência de pareamentos físicos inventados no replay.

Consequências são regras determinísticas testadas. Chat e relatório somente leem o
resultado canônico. Quando uma afirmação não puder ser sustentada, o comportamento
correto é omiti-la ou marcá-la como inconclusiva, nunca aproximá-la silenciosamente.

## 15. Estratégia de testes

### 15.1 Servidor

- testes unitários dos contratos e regras dos sete eixos;
- conservação reaplicada depois da serialização da API;
- cenários conhecidos e número de aceitação preservados;
- testes de consequência, limitação, compatibilidade e reprecificação;
- igualdade dos dados usados por API, chat, replay e relatório;
- autenticação, expiração e isolamento de chaves;
- avaliação do chat para perguntas sustentadas, não sustentadas e tentativas de
  alteração.

### 15.2 Interface

- Vitest e React Testing Library para componentes e estados;
- Playwright para os fluxos principais;
- regressão visual das telas de maior risco;
- teste explícito de resultado desatualizado e preservação de entradas;
- teste de todos os dias do replay, inclusive dias sem evento;
- teste de que nenhuma representação sugere pareamento entre empresas.

### 15.3 Aceitação integrada

Um mesmo estudo reproduzível deve apresentar os mesmos números na tela de
diagnóstico, comparação, chat, replay e PDF. Diferenças de arredondamento são
definidas no contrato de apresentação, não corrigidas separadamente em cada tela.

## 16. Ordem de construção

### Etapa 1 — Fundação e contrato com o motor

Login, estrutura visual, contratos de dados, validações e adaptador único do motor.

### Etapa 2 — Primeiro fluxo completo

Criar estudo, montar carteira, definir premissas, executar prévia, ver resultado
básico e salvar localmente.

### Etapa 3 — Diagnóstico robusto

Múltiplas repetições, sete eixos, proveniência, consequências e limitações.

### Etapa 4 — Comparação e análise marginal

Variantes, verificação de compatibilidade e efeito agregado de mudanças na carteira.

### Etapa 5 — Replay

Reprodução diária completa, faixa sincronizada sem agrupamento e modos de
apresentação e inspeção.

### Etapa 6 — Comunicação e acabamento

Chat analítico, relatório, modo de apresentação, endurecimento, acessibilidade,
desempenho e publicação.

Cada etapa termina em um incremento funcional e testado. A especificação geral
preserva a coerência do produto, mas cada etapa recebe um plano de implementação
próprio antes de ser executada.

## 17. Evolução futura

Quando dados reais começarem a surgir, o repositório local de estudos será substituído
por PostgreSQL no Supabase. O mesmo contrato de proveniência passará a distinguir
estimativa e observação, preservando histórico, origem e versão. Execuções pesadas
migram para uma fila persistente com workers. Essas mudanças não alteram as telas nem
o contrato canônico de resultado; apenas substituem implementações atrás das
interfaces já definidas.

Não serão construídos banco, sincronização ou workers persistentes antes de existirem
dados e carga que os justifiquem.

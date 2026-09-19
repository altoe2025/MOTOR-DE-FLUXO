# Front-end do Motor de Fluxo v2 — especificação de produto e arquitetura

**Data:** 2026-09-19
**Status:** aprovada; execução permanece condicionada aos gates de cada etapa
**Evolui:** `2026-09-11-frontend-motor-de-fluxo-design.md`
**Escopo:** versão completa desktop da aplicação web, distribuída em seis etapas

## 1. Contexto da revisão

A especificação anterior partia principalmente de carteiras sintéticas ou estimadas.
Os arquivos reais recebidos mostram que o produto também precisa compreender casos
observados, preservar sua origem, associá-los a empresas e usá-los tanto em análise
histórica quanto na construção de novas hipóteses.

Esta revisão amplia o produto sem reduzir o desenho anterior. Diagnóstico robusto,
comparação, Replay, chat, relatório, segurança analítica e acabamento continuam no
escopo da versão completa.

As seis etapas são uma ordem de construção. Elas não classificam as etapas finais
como opcionais nem redefinem a Etapa 2 como produto final.

## 2. Objetivo

Construir uma aplicação analítica para compreender operações observadas e investigar
carteiras candidatas ao Motor de Fluxo. A aplicação transforma dados reais,
hipóteses e perfis em evidência técnica compreensível, reproduzível e comparável.

O produto permite que o usuário:

1. importe e revise operações reais;
2. entenda como o motor trata um Caso Observado;
3. compare resultado observado e resultado calculado quando houver equivalência;
4. forme um perfil operacional a partir de casos selecionados;
5. use casos, perfis e carteiras sintéticas para construir hipóteses;
6. execute prévias e diagnósticos robustos;
7. compare cenários compatíveis e mudanças marginais;
8. acompanhe uma execução completa ao longo do tempo no Replay;
9. consulte explicações analíticas e produza relatórios consistentes.

O motor Python existente é a fonte de verdade para geração, netting, custos e
simulação. A interface não reproduz nem simplifica essas regras em JavaScript.

## 3. Critérios de sucesso

A versão completa será bem-sucedida quando seus usuários puderem:

1. entrar de forma simples e segura;
2. cadastrar ou identificar uma empresa;
3. importar, revisar e preservar um Caso Observado;
4. reabrir casos, perfis, estudos e resultados sem perda de proveniência;
5. criar uma carteira sintética, estimada, manual ou derivada de dados reais;
6. executar uma prévia reproduzível e um diagnóstico robusto;
7. compreender estrutura, comportamento, consequência econômica e limitações;
8. confrontar Observado × Motor sem fabricar dados ausentes;
9. construir e versionar um Perfil Operacional;
10. testar uma empresa com comportamento semelhante ao perfil observado;
11. comparar cenários compatíveis e investigar mudanças marginais;
12. reproduzir visualmente uma execução dia a dia sem sugerir pareamentos físicos;
13. consultar resultados em um chat analítico somente leitura;
14. produzir um relatório fiel aos mesmos dados exibidos na aplicação.

O produto conserva entradas, versões, resultados e explicações coerentes entre
tela, conciliação, diagnóstico, comparação, Replay, chat e relatório.

## 4. Fora do escopo

- decidir questões jurídicas ou regulatórias;
- recomendar decisões comerciais ou declarar uma carteira boa ou ruim;
- cotações e atualização automática de câmbio, IOF, spread ou outros custos;
- atribuir benefício econômico individual sem cálculo específico do motor;
- alterar dados ou executar análises por meio do chat;
- reconstruir o front-end a partir do protótipo técnico `fluxo-cambio.html`;
- desenho responsivo completo para celular;
- colaboração simultânea em tempo real na primeira versão;
- substituir a decisão humana sobre a qualidade dos dados importados.

Um backend persistente, compartilhamento avançado e permissões diferentes podem
evoluir depois sem mudar o modelo conceitual nem os contratos centrais.

## 5. Modelo conceitual

```text
Empresa
├── Casos Observados por período
├── Perfis Operacionais versionados
└── Estudos relacionados

Estudo
├── Cenário-base
├── Cenários variantes
└── Execuções imutáveis
    └── Resultado canônico
```

### 5.1 Empresa

Identidade estável à qual casos, perfis e estudos são associados. Contém nome,
aliases, casos, versões de perfil e referências a estudos.

### 5.2 Caso Observado

Representa uma operação real dentro de uma janela específica de fechamento. Contém:

- empresa;
- janela operacional;
- data de fechamento;
- arquivos de origem e seus identificadores;
- regras e versão da normalização;
- ordens explícitas canônicas;
- totais de controle;
- qualidade e proveniência;
- correções confirmadas;
- resultado observado opcional.

Cada operação ou fechamento é tratado como um Caso Observado próprio. Casos do mesmo
mês não são somados automaticamente. Uma pasta de compensação pode conter mais de um
arquivo pertencente ao mesmo caso. Arquivos original e corrigido da mesma operação
não podem ser contados em duplicidade.

### 5.3 Perfil Operacional

Resumo versionado derivado de casos selecionados explicitamente. Registra:

- casos e período de cobertura;
- volume e quantidade de operações;
- frequência e tickets;
- distribuição IN/OUT;
- prazos, finalidades e janelas;
- sazonalidade;
- campos ausentes e qualidade;
- método e versão de cálculo.

Uma nova versão de perfil nunca altera estudos antigos.

### 5.4 Estudo

Espaço de trabalho que representa uma pergunta analítica. Guarda a carteira-base,
cenários, premissas, execuções, resultados e referências às suas origens.

### 5.5 Cenário

Configuração executável dentro de um estudo. Define carteira, período, janela,
premissas, parâmetros estatísticos e política suportada. Pode ser base ou variante.

### 5.6 Execução

Registro imutável de uma chamada ao motor. Guarda snapshot da entrada, configuração,
versão do motor e dos contratos, estado, resultado e repetição selecionada.

Alterar um cenário ou uma premissa cria nova execução. A anterior permanece íntegra.

## 6. Origens da carteira

Todo cenário declara uma origem:

1. **Caso Observado:** ordens reais normalizadas;
2. **Perfil de empresa:** versão de perfil usada por uma receita de geração;
3. **Carteira sintética:** exemplos e geradores do produto;
4. **Carteira manual ou estimada:** parâmetros e ordens informados pelo usuário.

Independentemente da origem, o motor recebe ordens explícitas no contrato canônico.

### 6.1 Caso Observado

```text
Ordens reais normalizadas
→ snapshot do cenário
→ motor
→ resultado canônico
```

### 6.2 Perfil de empresa

O perfil não entra diretamente no motor. Ele alimenta uma geração reproduzível:

```text
Perfil versionado
+ composição da hipótese
+ período, escala e seed
→ ordens explícitas geradas
→ snapshot do cenário
→ motor
```

As ordens geradas a partir do perfil permanecem identificadas como sintéticas. Elas
não se transformam em observações históricas.

## 7. Proveniência

Todo campo analiticamente relevante distingue:

- observado na fonte;
- inferido por regra;
- derivado por cálculo;
- corrigido pelo usuário;
- estimado;
- sintético;
- não coletado.

Quando um campo é corrigido, o sistema conserva valor anterior, valor confirmado,
momento e regra ou ação responsável. Inferências e estimativas nunca aparecem como
observações.

## 8. Princípios de produto

### 8.1 Evidência antes de interpretação

Todo conteúdo analítico pertence a uma destas classes:

- dado observado;
- dado calculado;
- consequência técnica determinística;
- limitação;
- informação não coletada.

Consequências guardam métricas, cenário e evidência que as ativaram.

### 8.2 Sem vereditos

Não classificar carteiras como promissoras, frágeis, ideais ou inviáveis. Cores não
transformam automaticamente aumento em verde e redução em vermelho.

### 8.3 Linguagem autoexplicativa

Termos financeiros legítimos podem permanecer com explicação acessível. Termos
internos são traduzidos:

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

### 8.4 Distribuição não é exemplo

O diagnóstico robusto resume várias repetições. O Replay representa uma repetição
específica e reproduzível. Nenhuma trajetória individual é apresentada como se fosse
a distribuição inteira.

### 8.5 Operação específica não é mês agregado

O mês organiza a consulta histórica, mas não redefine a unidade do caso. Cada
arquivo ou conjunto de arquivos pertencente a uma operação de fechamento mantém sua
janela, identidade e resultado próprios.

## 9. Usuários, acesso e persistência

A aplicação preserva o login por convite e as verificações de sessão já entregues.
O servidor continua validando tokens e não confia apenas no navegador.

Na versão inicial, empresas, casos normalizados, perfis, estudos e resultados podem
ser persistidos localmente por uma interface de repositório. Eles não desaparecem
depois de uma execução nem ficam presos ao estado de uma tela.

A arquitetura prevê troca posterior por um repositório remoto sem redefinir as
entidades. A retenção de arquivos brutos e a política definitiva para dados sensíveis
exigem decisão explícita antes de produção; não serão inferidas silenciosamente.

## 10. Estrutura da aplicação

### 10.1 Navegação global

- **Empresas**
- **Estudos**

A importação é iniciada no contexto de uma empresa ou da criação de um estudo. Ela
não forma um produto ou catálogo isolado.

### 10.2 Dentro de uma empresa

- **Resumo:** cobertura, volumes, casos, qualidade e perfil vigente;
- **Casos observados:** operações reais e suas janelas;
- **Perfil operacional:** versões, cobertura e casos utilizados;
- **Estudos relacionados:** estudos que consumiram casos ou perfis da empresa.

### 10.3 Dentro de um estudo

Mantêm-se os cinco destinos:

1. **Carteira**
2. **Diagnóstico**
3. **Comparar cenários**
4. **Replay**
5. **Dados e premissas**

O chat aparece como painel lateral opcional nas telas de resultado. O modo de
apresentação renderiza o mesmo estudo e não cria uma base paralela de conteúdo.

## 11. Importação e revisão

### 11.1 Fronteira do importador

```text
Arquivo de origem
→ leitura
→ validação
→ normalização
→ rascunho de Caso Observado
→ revisão
→ Caso Observado confirmado
```

O importador é responsável por compreender formatos de origem e publicar um pacote
canônico. Ele não cria um domínio paralelo de estudos nem executa o motor por conta
própria.

### 11.2 Resumo revisável

Antes da confirmação, a interface mostra:

- empresa identificada;
- arquivos incluídos;
- janela e data de fechamento;
- volumes IN e OUT;
- montante total;
- quantidade de lançamentos;
- regras usadas para interpretar os dados;
- alertas e campos não identificados;
- amostra das operações;
- conciliação dos totais com a fonte.

Campos corrigíveis podem ser alterados antes da confirmação. O Caso Observado guarda
origem, valores anteriores e correções.

### 11.3 Arquivos grandes

Planilhas extensas não ficam inteiras no estado global do React nem são renderizadas
de uma vez. O processamento ocorre na camada de importação; a interface usa totais,
alertas, amostras, paginação e virtualização quando necessário.

## 12. Perfil Operacional

O usuário escolhe os casos que formam cada versão. O sistema mostra cobertura,
compatibilidade, ausências e método antes da confirmação.

O perfil serve a dois objetivos diferentes:

1. descrever o comportamento observado da empresa nos casos escolhidos;
2. parametrizar uma geração sintética reproduzível para testar hipóteses.

Esses objetivos compartilham a mesma versão de origem, mas não misturam observação e
simulação.

## 13. Carteira

A Carteira é o ponto de entrada do estudo e informa claramente sua origem. Cada
participante contém:

- identidade ou rótulo;
- empresa ou perfil de origem, quando houver;
- volume;
- divisão entre pagamentos e recebimentos internacionais;
- valor típico das operações;
- frequência;
- prazo disponível;
- finalidade;
- proveniência;
- detalhes avançados opcionais.

Os exemplos sintéticos existentes permanecem disponíveis com nomes legíveis. A
composição efetivamente produzida pela simulação é exibida; o nome do exemplo não
substitui a medição.

## 14. Diagnóstico

O diagnóstico segue esta hierarquia:

1. estrutura e composição;
2. comportamento do agrupamento;
3. consequência econômica;
4. robustez;
5. limitações e pontos em aberto.

Seus sete eixos são contratos semânticos compartilhados por métricas, gráficos,
consequências, chat e relatório.

### 14.1 Potencial estrutural de compensação

Mede volumes em sentidos opostos e magnitudes comparáveis, separando possibilidade
estrutural de resultado capturado.

### 14.2 Captura do potencial pela política

Mostra quanto do potencial foi aproveitado por janela, fechamento e prioridade, sem
atribuir pareamento a ordens específicas.

### 14.3 Compatibilidade temporal

Examina coexistência de pagamentos e recebimentos dentro dos prazos e os efeitos de
janela, cadência e vencimentos.

### 14.4 Exposição residual transfronteiriça

Mostra volume que atravessa a fronteira, sua direção e evolução.

### 14.5 Dependência da composição

Mede concentração e sensibilidade a empresas ou perfis. Mudanças marginais são
efeitos agregados e não benefícios individuais presumidos.

### 14.6 Robustez econômica

Apresenta distribuição de custos e economia em várias repetições e premissas,
incluindo dispersão e estresses pertinentes.

### 14.7 Perfil operacional da carteira

Resume ordens, fechamentos, filas, vencimentos, espera e carga de processamento.

Proveniência e cobertura atravessam os sete eixos. Limitações são recalculadas quando
o cenário muda.

## 15. Conciliação Observado × Motor

É uma seção do resultado de uma execução originada em Caso Observado. Não substitui
a comparação entre cenários.

Pode mostrar:

- valor observado;
- valor calculado;
- diferença absoluta e percentual;
- itens conciliados;
- divergências;
- métricas não coletadas ou incompatíveis.

`ObservedOutcome` e `EngineResult` são estruturas independentes. O resultado
observado nunca é reconstruído usando o motor. Ausência aparece como **não informado**,
nunca como zero.

## 16. Comparar cenários

O usuário compara variantes do mesmo estudo somente quando versão do motor, período,
premissas econômicas e configuração estatística forem compatíveis.

A tela mostra primeiro a diferença de entrada e depois a diferença de resultado.
Pode comparar:

- cenário-base e hipótese;
- inclusão, retirada ou alteração de empresa ou perfil;
- janelas diferentes;
- composições diferentes;
- premissas econômicas compatíveis;
- efeito marginal agregado.

Incompatibilidades são explicadas antes de bloquear a comparação.

## 17. Replay

O Replay é uma capacidade central e obrigatória da versão completa. Ele representa
uma execução temporal específica, não uma animação decorativa nem um sinônimo de
executar dados observados.

### 17.1 Conteúdo

O Replay mostra todos os dias do horizonte, inclusive dias sem evento:

- novas ordens;
- fila de pagamentos que precisam de moeda no exterior;
- fila de recebimentos que geram moeda disponível no exterior;
- ciclo em processamento;
- fechamentos disparados;
- volume compensado no agregado;
- resíduos remetidos;
- posições ainda abertas;
- resumo factual do dia.

### 17.2 Controles

- reproduzir e pausar;
- velocidade;
- seleção direta do dia;
- avançar um dia;
- ir ao próximo fechamento;
- selecionar repetição reproduzível.

### 17.3 Modos e sincronização

Dois níveis de densidade atendem usos diferentes: **Apresentação** e **Inspeção**.
Uma faixa sincronizada compara o mesmo dia com e sem agrupamento.

O Replay nunca desenha setas entre empresas ou ordens específicas e nunca sugere
custódia ou pareamento físico. Ele representa posições agregadas de tesouraria.

## 18. Dados e premissas

Centraliza:

- origem da carteira;
- empresa, caso ou perfil utilizado;
- versão e data do snapshot;
- correções de importação;
- período e política;
- parâmetros estatísticos;
- spread, tarifa, carregamento, câmbio e alíquotas;
- versão do motor e contratos;
- campos observados, inferidos, estimados e sintéticos.

Alterações econômicas podem reprecificar quando o contrato permitir. Alterações
estruturais invalidam os resultados correspondentes e exigem nova execução.

## 19. Execução das análises

### 19.1 Prévia

Usa uma repetição reproduzível para validar a descrição da carteira. Não recebe
linguagem de robustez nem substitui o diagnóstico.

### 19.2 Diagnóstico robusto

Executa múltiplas repetições, mostra progresso, permite navegação e impede disparos
duplicados da mesma configuração. Quantidade de repetições e estratégia estatística
ficam registradas.

### 19.3 Resultado canônico

O servidor revalida a entrada, constrói o cenário aceito pelo motor e publica o
resultado somente depois das verificações de conservação e consistência.

Tela, conciliação, diagnóstico, comparação, Replay, chat e relatório consomem esse
resultado; nenhum deles recalcula regras do motor.

## 20. Estudo e snapshots

Um Estudo contém:

- nome;
- origem e snapshot da carteira-base;
- variantes como diferenças da base;
- premissas;
- período;
- execuções de prévia e diagnóstico;
- resultados;
- repetição selecionada para Replay;
- versões do motor e contratos.

Snapshots incluem origem, versão, ordens ou receita geradora, regras de normalização,
correções e premissas. Mudanças futuras em caso ou perfil não alteram o estudo.

## 21. Arquitetura de dados do front-end

### 21.1 Um repositório lógico

```text
ApplicationRepository
├── companies
├── observedCases
├── profileVersions
├── studies
├── scenarios
├── executions
└── importSessions
```

O importador pode usar armazenamento temporário durante o processamento, mas publica
o caso confirmado no repositório principal.

### 21.2 Persistência local completa da primeira versão

As telas acessam uma interface de repositório, nunca IndexedDB diretamente. O
adaptador local preserva empresas, casos normalizados, perfis, estudos e execuções.

O desenho contempla:

- schema versionado;
- migrações explícitas;
- recuperação de rascunho;
- escrita atômica;
- controle de revisão;
- detecção e tratamento de concorrência entre abas;
- compatibilidade com evolução futura do contrato.

### 21.3 Evolução remota

```text
ApplicationRepository
├── IndexedDbRepository
└── ApiRepository
```

O repositório remoto futuro substitui o adaptador, não as entidades nem as telas.

## 22. Chat analítico

O chat abre sobre um resultado já calculado e pode:

- localizar e explicar métricas;
- resumir diferenças entre cenários;
- relacionar resultados aos sete eixos;
- explicar proveniência e limitações;
- elaborar evidências registradas.

Não pode editar carteira, iniciar simulações, navegar na internet, completar dados
ausentes ou criar recomendações não sustentadas. Recebe contexto estruturado e usa
somente ferramentas de leitura permitidas.

## 23. Relatório e modo de apresentação

O relatório usa o mesmo modelo de resultado das telas. Não recalcula valores nem
solicita a um modelo de linguagem que invente conclusões.

Inclui identificação, composição, comportamento, consequência econômica,
robustez, premissas, proveniência, limitações e versões. O modo de apresentação
reduz controles sem criar uma segunda base de conteúdo.

## 24. Direção visual

A identidade permanece editorial, analítica, madura e calma, com acabamento premium
contido.

- fundo mineral ou cinza quente;
- navegação em carvão escuro;
- Replay em ambiente escuro;
- densidade intermediária para desktop;
- números tabulares em comparações;
- gráficos que respondem perguntas específicas;
- movimento funcional para progresso, transição e Replay;
- cores sem equivalência automática entre bom e ruim;
- componentes acessíveis e tokens visuais próprios.

## 25. Arquitetura técnica

### 25.1 Implantação

- React + TypeScript + Vite no navegador;
- FastAPI + Pydantic no servidor;
- pacote `motor` importado diretamente pelo servidor;
- React compilado servido pelo FastAPI na mesma origem;
- contêiner único na primeira publicação.

### 25.2 Front-end

- React Router para navegação;
- TanStack Query para estado do servidor e execuções;
- IndexedDB atrás do repositório;
- formulários tipados;
- ECharts para diagnóstico e comparação;
- React e SVG próprios para Replay;
- tokens CSS e componentes próprios;
- cliente Supabase para autenticação.

### 25.3 Servidor

Responsabilidades:

- autenticação e sessão;
- contratos de entrada e saída;
- adaptação entre API e domínio do motor;
- prévia e diagnóstico;
- sete eixos;
- consequências e limitações;
- comparação e análise marginal;
- preparação do Replay;
- contexto e ferramentas do chat;
- modelo compartilhado por tela e relatório.

As camadas web não alteram a pureza ou as regras de importação do pacote `motor`.

### 25.4 Trabalhos demorados

Uma interface de executor controla fila, progresso, cancelamento e resultado. A
primeira implantação pode usar processos com concorrência limitada; a fronteira
permite fila persistente e workers quando carga e banco justificarem.

## 26. Estados e falhas

### 26.1 Erros que bloqueiam um Caso Observado

- direção IN/OUT desconhecida;
- valor inválido;
- data incompatível com a janela;
- total inconsistente;
- arquivo duplicado no mesmo caso;
- contrato incompatível com o motor.

### 26.2 Avisos que não bloqueiam o motor

- resultado observado ausente;
- informação complementar incompleta;
- finalidade não coletada quando existir fallback permitido;
- perfil ainda não calculado.

As análises dependentes do campo ausente ficam indisponíveis.

### 26.3 Estados gerais

- entradas incompletas são marcadas no campo;
- execução ativa permanece visível durante navegação;
- mudança estrutural torna o resultado desatualizado;
- falha preserva entradas e identifica a etapa;
- comparação incompatível explica a divergência;
- sessão expirada preserva trabalho local;
- servidor indisponível não apaga estudos já salvos.

## 27. Segurança analítica e operacional

Antes de publicar um resultado, o servidor verifica:

- conservação por ordem e global;
- finitude e domínio dos valores;
- identidade entre configuração solicitada e executada;
- versão do motor e contratos;
- coerência entre percentis, repetições e Replay;
- compatibilidade de comparações;
- ausência de pareamentos físicos inventados.

Tokens são validados no servidor. Segredos permanecem no servidor. Conteúdo importado
é tratado como dado, nunca como instrução. Política de retenção, acesso e proteção de
arquivos reais será definida antes de publicação com dados sensíveis.

## 28. Estratégia de testes

### 28.1 Importador e contratos

- parsing e aliases;
- rascunho versus caso confirmado;
- totais e duplicidade;
- proveniência e correções;
- campos bloqueadores e avisos;
- fixture sintética ou anonimizada do contrato completo.

### 28.2 Servidor

- contratos e sete eixos;
- conservação depois da serialização;
- cenários conhecidos e número de aceitação;
- consequência, limitação, compatibilidade e reprecificação;
- perfil e geração reproduzível;
- igualdade dos dados usados por API, chat, Replay e relatório;
- autenticação, expiração e isolamento de chaves.

### 28.3 Interface

- componentes e estados com Vitest e Testing Library;
- repositório, migrations, concorrência e recuperação;
- fluxos principais com Playwright;
- regressão visual das telas de risco;
- resultados desatualizados;
- todos os dias do Replay, inclusive dias sem evento;
- ausência de representação de pareamento físico.

### 28.4 Aceitação integrada

Um estudo reproduzível apresenta os mesmos números em diagnóstico, conciliação,
comparação, Replay, chat e PDF. Arredondamentos pertencem ao contrato de apresentação.

Arquivos reais não entram no repositório sem autorização explícita.

## 29. Ordem completa de construção

### Etapa 1 — Fundação e contrato com o motor

Autenticação, shell, componentes, contratos, cliente tipado, adaptador e aceitação da
fundação. Esta etapa já foi entregue e será preservada.

### Etapa 2 — Primeiro fluxo completo

- domínio de estudo e cenário;
- preparação da carteira;
- entradas sintética, manual e observada;
- premissas;
- repositório IndexedDB versionado;
- migrations, recuperação, revisão e concorrência;
- execução de prévia;
- resultado básico;
- conciliação Observado × Motor;
- testes integrados e e2e.

### Etapa 3 — Empresas, casos, perfis e diagnóstico robusto

- navegação de Empresas;
- histórico de Casos Observados;
- Perfis Operacionais versionados;
- seleção de períodos e qualidade;
- executor robusto;
- múltiplas repetições;
- sete eixos, consequências e limitações;
- comparação temporal.

### Etapa 4 — Hipóteses, comparação e análise marginal

- geração a partir de perfil;
- variantes;
- compatibilidade;
- cenário-base × hipótese;
- comparação visual;
- análise marginal agregada.

### Etapa 5 — Replay

- contrato temporal;
- preparação dos dados;
- núcleo de reprodução;
- cena React/SVG;
- controles;
- Apresentação e Inspeção;
- sincronização com e sem agrupamento;
- testes temporais e visuais.

### Etapa 6 — Comunicação, acabamento e publicação

- chat analítico;
- relatório;
- modo de apresentação;
- acabamento visual;
- acessibilidade;
- desempenho;
- segurança e endurecimento final;
- contêiner e publicação;
- aceitação integrada completa.

Cada etapa termina em incremento funcional e testado. A versão completa somente está
concluída quando as seis etapas e a aceitação integrada forem entregues.

## 30. Compatibilidade com a especificação anterior

Permanecem válidos:

- todas as capacidades centrais das seis etapas;
- os cinco destinos internos de um estudo;
- os sete eixos do diagnóstico;
- a separação entre distribuição e exemplo;
- comparação somente entre cenários compatíveis;
- Replay temporal completo e sem pareamentos físicos;
- chat somente leitura;
- relatório e apresentação sobre a mesma fonte;
- direção visual;
- autenticação e segurança analítica;
- persistência local versionada e substituível.

São ampliados:

- navegação global com Empresas e Estudos;
- dados observados como origem de primeira classe;
- Caso Observado e Perfil Operacional;
- proveniência mais granular;
- Observado × Motor;
- importador integrado ao repositório do produto;
- snapshots que preservam casos e perfis usados.

Nenhuma capacidade anterior é removida por esta revisão.

## 31. Impacto documental posterior à aprovação

Depois da aprovação desta especificação:

1. marcar a especificação de 2026-09-11 como substituída pela v2;
2. escrever o plano geral de execução v2 completo;
3. revisar a especificação e o plano do importador;
4. escrever a especificação v2 da Etapa 2;
5. escrever o plano técnico v2 da Etapa 2;
6. auditar os commits existentes antes de integração;
7. atualizar `MAPA.md` e o diário no momento apropriado.

Os documentos anteriores permanecem no repositório como histórico e não são
apagados ou sobrescritos silenciosamente.

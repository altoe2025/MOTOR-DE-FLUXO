# Front-end — Etapa 6: importação, comunicação e publicação

**Data:** 2026-09-23
**Status:** aprovada para planejamento técnico em 2026-09-23
**Deriva de:** `2026-09-19-frontend-motor-de-fluxo-design-v2.md`
**Base técnica:** branch local `codex/frontend-etapa-6-planejamento`, sucessora da
Etapa 5 aceita localmente em `d964024`
**Destino do piloto:** Render Web Service gratuito, com autenticação Supabase

## 1. Objetivo

Encerrar o piloto interno do Motor de Fluxo com o percurso real de entrada e uma
camada coerente de comunicação: importação XLSX local até Caso Observado, chat
analítico contextual, painel executivo contínuo, relatório imprimível, revisão de
acessibilidade e desempenho, contêiner reproduzível e primeira publicação no Render.

Diagnóstico, comparação, Replay, chat, apresentação e relatório devem preservar os
mesmos valores, versões, proveniência e limitações. A Etapa 6 não cria uma segunda
fonte de resultado, não move regras financeiras para JavaScript e não transforma um
modelo de linguagem em calculadora ou executor do Motor.

## 2. Resultado do piloto

O incremento funcional entrega:

- importação local de XLSX canônico, revisão e confirmação de Caso Observado;
- ligação navegável entre Caso Observado, Empresa, Perfil, Estudo e execução;
- chat lateral disponível em todas as áreas autenticadas;
- ajuda sobre o produto, a interface e o contexto do Estudo aberto;
- respostas analíticas sustentadas por evidências tipadas;
- recusa obrigatória de assuntos sem relação com o Motor, o front-end ou o projeto;
- histórico de conversa local por usuário e Estudo;
- exploração guiada da composição, com linguagem inequívoca para Perfil,
  participante, arquétipo, repetição e Replay;
- Estudo demonstrativo sintético e reproduzível, pronto para o primeiro acesso;
- Documento de Comunicação V1 compartilhado por chat, apresentação e relatório;
- Painel Apresentação no formato executivo contínuo aprovado;
- impressão e salvamento como PDF pelo navegador;
- igualdade numérica entre as representações;
- acessibilidade, desempenho e estados extremos verificados;
- imagem Docker e configuração declarativa do Render;
- URL HTTPS normal, protegida somente pelo login existente;
- aceite local completo e smoke test do ambiente publicado.

O piloto não inclui cadastro público. A Amanda recebe uma conta pelo fluxo de
autenticação Supabase já existente e acessa a URL `onrender.com` normalmente.

## 3. Decisões fechadas

1. O marco é um piloto acessível pela Amanda, não uma plataforma de produção em
   escala.
2. Relatório é uma página imprimível; o navegador produz o PDF.
3. O chat usa OpenAI Responses API pelo FastAPI, com `store: false`.
4. Chave e nome do modelo existem somente em variáveis do servidor.
5. O chat não possui internet, busca web, edição ou ferramentas de execução.
6. O chat conhece o produto por catálogo versionado e recebe contexto tipado da tela.
7. Histórico do chat permanece no IndexedDB, separado por usuário e Estudo.
8. O chat aparece como painel lateral global nas áreas autenticadas.
9. O modo Apresentação é o painel executivo contínuo, não uma sequência de slides.
10. Relatório e apresentação usam um cenário e uma execução principais e, quando
    escolhida, uma comparação compatível.
11. Conversas do chat não entram no relatório.
12. A publicação usa um único contêiner com front e FastAPI na mesma origem.
13. O destino é Render Web Service gratuito.
14. O deploy é manual a partir de commit autorizado; push, merge e a criação do
    serviço exigem autorização própria.
15. Os cinco mixes históricos não publicam seus resultados legados no produto;
    suas composições servem somente de origem para cenários demonstrativos
    recalculados e reconciliados com a política atual.
16. Um Perfil Operacional continua sendo uma versão imutável de uma empresa. O que
    o usuário adiciona ou remove de uma carteira são participantes referenciando
    Perfis, nunca “clientes dentro de um Perfil”.
17. A publicação para Amanda não é aceita somente com dados semeados por testes: o
    importador XLSX precisa terminar no `ApplicationRepository` vigente.
18. Arquivo, células e nomes brutos permanecem no navegador. O Render recebe apenas
    os contratos canônicos necessários às execuções posteriores.
19. A pilha remota MOT-49–MOT-61 é material de portabilidade e evidência, não branch
    pronta para merge. Contratos atuais prevalecem sobre seu banco e fluxo antigos.

## 4. Escopo das evoluções da Etapa 5

A Etapa 6 absorve somente a parte útil da Evolução 5C:

- modo Apresentação com densidade reduzida;
- quadro do Replay no relatório;
- regressão visual ampliada;
- orçamento de desempenho medido.

Permanecem fora desta etapa:

- **5A:** troca entre repetições, persistência de nova seleção, painel avançado por
  ordem/ciclo/evento, busca e deep links de fechamento;
- **5B:** baseline temporal sem agrupamento e comparação sincronizada no relógio;
- **5C adiada:** agregação visual para milhares de ordens e exportação de imagens
  isoladas do Replay.

O Replay atual da repetição selecionada é suficiente para apresentação e relatório.

### 4.1 Exploração guiada da carteira

A Etapa 6 não cria outro editor de cenários. Ela torna descobrível e organiza o
fluxo já entregue pela Evolução B:

1. selecionar Perfis Operacionais anexados ao Estudo;
2. criar uma carteira sintética, com um participante por empresa selecionada;
3. escolher, para cada participante, um dos seis arquétipos geradores vigentes;
4. criar uma hipótese de composição;
5. adicionar um Perfil compatível ou remover um participante, preservando ao menos
   um;
6. ajustar parâmetros individuais e premissas comuns;
7. executar 10, 30 ou 100 repetições quando a origem for gerável;
8. abrir no Replay a repetição representativa escolhida pelo diagnóstico.

O editor passa a explicar no próprio contexto:

- **Perfil Operacional:** evidência agregada e versionada de uma empresa;
- **participante:** presença daquela empresa numa carteira simulada;
- **arquétipo gerador:** padrão sintético que transforma os parâmetros do Perfil em
  ordens;
- **repetição:** uma realização do mesmo cenário com seeds planejadas;
- **Replay:** visualização de uma repetição específica, não da distribuição inteira.

A tela de Diagnóstico mostra permanentemente o ID da repetição aberta no Replay, o
critério canônico que a selecionou e a contagem total executada. O acesso ao editor
de composição deixa de depender de o usuário descobrir um formulário no fim da
página: cenários geráveis oferecem uma ação explícita **Criar hipótese / alterar
carteira**. Perfis permanecem imutáveis; mudar seus casos observados cria nova
versão e não reescreve Estudos existentes.

### 4.2 Estudo demonstrativo e cinco composições

Como Estudos vivem no IndexedDB e não chegam do Render, o primeiro acesso
autenticado sem Estudos instala localmente um `DemoStudyPackageV1`. A tela vazia
também oferece **Carregar estudo demonstrativo** para restaurá-lo depois de uma
remoção. A instalação é idempotente e nunca recria silenciosamente um Estudo que o
usuário apagou.

O pacote contém empresas e Perfis integralmente sintéticos, uma carteira-base e
cinco cenários de composição reconhecíveis:

- equilibrado;
- retail pesado;
- corporativo pesado;
- PSP dominante;
- outbound extremo.

Os pesos de `motor/mixes.py` são somente a receita de composição. Um gerador
versionado e reproduzível materializa participantes inteiros, prepara as ordens e
executa o motor vigente. Nenhum valor, envelope ou conclusão das 27.000 simulações
históricas é copiado. Cada cenário mostra **Hipótese sintética demonstrativa — não
calibrada com carteira real** e registra versão da receita, build do motor, seeds e
fingerprint.

O artefato distribuído pode conter resultados e Replays pré-calculados para evitar
processamento no primeiro acesso, desde que seja produzido por script versionado a
partir das APIs canônicas, passe pelos validadores públicos e tenha testes que o
reconciliem com uma regeneração controlada. Não será mantido como JSON escrito à
mão. O pacote respeita o limite visual vigente e inclui participantes suficientes
para demonstrar adição, remoção, alteração individual, comparação, distribuição e
Replay sem alegar escala de produção.

### 4.3 Etapa 6A — integração da importação real

O front vigente consome `ObservedCase` confirmado, mas não oferece uma forma
operacional de produzi-lo. A ponte E2E semeia dados apenas para testes. A Etapa 6
começa fechando esse intervalo:

```text
XLSX canônico local
→ inspeção e parsing em Web Worker
→ revisão, correções, aliases e conflitos
→ Caso Observado confirmado no ApplicationRepository
→ Empresa / nova versão de Perfil Operacional
→ anexação ao Estudo
→ Diagnóstico / Comparação / Replay / Apresentação / Relatório
```

A fonte normativa continua sendo
`2026-09-19-importacao-dados-reais-design-v2.md`. Para o piloto, a entrada obrigatória
é o layout canônico `xlsx-operacoes/1.0.0`. Adaptadores de formatos proprietários ou
fontes extensas só entram com fixtures anonimizadas e regras de negócio aprovadas;
não são inventados nesta etapa.

A implementação existente nas branches remotas que culminam em
`origin/test/importacao-xlsx-aceitacao` foi construída a partir de `c2ad175`, antes
das Etapas 2–5 atuais. Ela fornece parser, validação, domínio, catálogo, UI e testes
úteis, mas diverge da branch vigente. A integração deve portar unidades comprovadas
e reescrever as fronteiras que não obedecem mais ao desenho atual; não fará merge ou
cherry-pick cego da pilha.

Requisitos da reconciliação:

- `web/src/importer` publica somente um `ObservedCase` confirmado;
- usa o `ApplicationRepository` e o banco por `projectRef` e `ownerSub` atuais;
- não mantém IndexedDB paralelo do importador;
- não cria Estudo nem executa o motor durante a importação;
- a confirmação é transacional para Empresa, Caso, lotes e eventos;
- sucesso oferece **Abrir caso**, **Criar Perfil com este caso** e **Usar em um
  Estudo**, cada ação já no domínio responsável;
- origem, SHA-256, correções, blockers, avisos e revisão permanecem rastreáveis;
- binário, `File`, `Blob`, XML e conteúdo bruto não persistem nem atravessam a rede;
- duplicidade, CAS, duas abas, troca de conta, cancelamento e recuperação continuam
  cobertos;
- o XLSX confirmado sobrevive à recarga e chega ao motor sem redigitação ou
  transformação silenciosa.

Rotas autenticadas propostas:

```text
/importar
/empresas/:companyId/importar
```

A primeira inicia ou associa a Empresa durante a revisão; a segunda fixa a Empresa
de destino. Empresas e páginas de Casos exibem **Importar dados**. Depois da
confirmação, a aplicação conduz a criação de Perfil e a anexação ao Estudo, mas não
as executa implicitamente: Perfis continuam versionados e a escolha do Estudo
permanece explícita.

## 5. Alternativas arquiteturais avaliadas

### 5.1 Contrato compartilhado de comunicação — escolhida

Um documento imutável e versionado organiza resultados já validados para os três
consumidores. É a menor fronteira que garante igualdade sem copiar o Estudo ao
servidor.

### 5.2 Adaptadores independentes — rejeitada

Chat, relatório e apresentação poderiam ler diretamente as estruturas atuais. A
duplicação permitiria divergência de rótulo, arredondamento, indisponibilidade e
limitação entre as representações.

### 5.3 Estudo persistido no backend — rejeitada

Copiar o domínio local para o servidor facilitaria consultas, mas mudaria a
arquitetura de persistência, exigiria migração e ampliaria desnecessariamente o
tratamento de dados.

## 6. Documento de Comunicação V1

O documento é uma projeção somente leitura. Ele mapeia dados já validados e nunca
recalcula P0, EDF, autonetting, netting multilateral, custo ou alocações.

```ts
type CommunicationDocumentV1 = Readonly<{
  apiVersion: '1.0.0';
  presentationVersion: '1.0.0';
  generatedAt: string;
  study: Readonly<{ id: string; name: string; revision: number }>;
  selection: Readonly<{
    scenarioId: string;
    scenarioRevision: number;
    diagnosticExecutionId: string;
    repetitionId: string;
    comparisonExecutionId: string | null;
    replayDay: number | null;
  }>;
  source: Readonly<{
    family: 'OBSERVED' | 'PROFILE_SIMULATION';
    label: string;
    synthetic: boolean;
  }>;
  executiveMetrics: readonly CommunicationMetric[];
  composition: CommunicationSection;
  mechanism: CommunicationSection;
  economics: CommunicationSection;
  robustness: CommunicationSection;
  comparison: CommunicationSection | null;
  replaySnapshot: CommunicationReplaySnapshot | null;
  assumptions: readonly CommunicationFact[];
  provenance: readonly CommunicationFact[];
  limitations: readonly CommunicationLimitation[];
  versions: readonly CommunicationFact[];
  evidenceIndex: Readonly<Record<string, CommunicationEvidence>>;
  contextFingerprint: string;
}>;

type CommunicationMetric = Readonly<{
  code: string;
  label: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  value: string | null;
  unit: 'BRL' | 'FRACTION' | 'DAYS' | 'COUNT' | 'BPS' | 'TEXT';
  meaning: string;
  evidenceRefs: readonly string[];
}>;

type CommunicationFact = Readonly<{
  code: string;
  label: string;
  value: string;
  evidenceRefs: readonly string[];
}>;

type CommunicationLimitation = Readonly<{
  code: string;
  severity: 'INFO' | 'WARNING';
  statement: string;
  evidenceRefs: readonly string[];
}>;
```

`CommunicationSection`, `CommunicationReplaySnapshot` e
`CommunicationEvidence` contêm somente referências e valores publicados pelos
envelopes canônicos. Valores monetários continuam strings decimais; formatação
HALF_UP e unidades reutilizam o contrato de apresentação existente. Indisponível
nunca vira zero.

O front constrói a projeção a partir do Estudo persistido validado, do
`DiagnosticEnvelope`, da comparação já calculada e do `ReplayDocumentV1`. O
backend revalida todo documento recebido por endpoints de chat. A montagem possui
testes de identidade, disponibilidade, evidência e igualdade com cada fonte.

## 7. Catálogo versionado do produto e da interface

O servidor publica `ProductHelpCatalogV1`, usado também pelo front para ajuda
contextual. Cada item possui:

```ts
type ProductHelpItem = Readonly<{
  id: string;
  routePattern: string;
  elementKind: 'PAGE' | 'SECTION' | 'CONTROL' | 'METRIC' | 'MESSAGE';
  label: string;
  purpose: string;
  changes: string;
  doesNotChange: string;
  disabledWhen: readonly string[];
  recovery: readonly string[];
  relatedConceptIds: readonly string[];
}>;
```

Os componentes que oferecem “Perguntar sobre isto” referenciam um `helpId` real.
Um teste falha quando um ID usado na interface não existe no catálogo ou quando um
item obrigatório deixa de ter propósito, efeito ou limite. O chat não lê DOM, cursor
ou conteúdo visual arbitrário.

O catálogo cobre também Perfil Operacional, participante, arquétipo, composição,
mix demonstrativo, seed, repetição, repetição representativa e Replay. Assim o chat
consegue explicar por que duas execuções são iguais quando a receita e as seeds são
iguais, por que o Replay mostra apenas uma repetição e onde adicionar ou remover uma
empresa da carteira.

## 8. Chat analítico

### 8.1 Presença e contexto

O botão **Perguntar** aparece no shell autenticado de Empresas, Perfis, Estudos,
Importação, Carteira, Diagnóstico, Comparação, Replay e Apresentação. O painel abre à
direita sem trocar de rota. Não aparece em login, convite, recuperação de senha ou
impressão.

Sem Estudo aberto, o chat responde somente sobre o produto e a interface. Com um
Estudo, acrescenta a seleção atual. Diagnóstico, comparação e Replay acrescentam
execução, métricas ou dia selecionado. Mudança de contexto posterior é indicada no
histórico; respostas antigas preservam o fingerprint que as sustentou.

### 8.2 API

```ts
type ChatRequestV1 = Readonly<{
  apiVersion: '1.0.0';
  conversationId: string;
  messageId: string;
  message: string;
  routeContext: Readonly<{
    routeId: string;
    helpId: string | null;
    studyId: string | null;
    scenarioId: string | null;
    diagnosticExecutionId: string | null;
    replayDay: number | null;
  }>;
  communication: CommunicationDocumentV1 | null;
  history: readonly ChatHistoryItem[];
}>;

type ChatResponseV1 = Readonly<{
  apiVersion: '1.0.0';
  messageId: string;
  classification: 'IN_SCOPE' | 'INSUFFICIENT_EVIDENCE' | 'OUT_OF_SCOPE' | 'MIXED';
  answer: string;
  citations: readonly ChatCitation[];
  contextFingerprint: string | null;
  limitationCodes: readonly string[];
}>;
```

Corpo máximo: 1 MiB. Pergunta máxima: 4.000 caracteres. Resposta persistida máxima:
12.000 caracteres. Uma conversa aceita até 100 mensagens; ao atingir o limite, a
interface oferece nova conversa. Um Estudo aceita até 20 conversas; novas criações
exigem apagar uma existente quando o limite for alcançado. Nada é removido
automaticamente.

### 8.3 OpenAI

O FastAPI usa Responses API com:

- `OPENAI_API_KEY` somente no runtime;
- `OPENAI_CHAT_MODEL` obrigatório para habilitar o chat;
- `store: false`;
- modelo, timeout e limites configuráveis;
- nenhuma ferramenta hospedada, web search, file search, código ou MCP;
- ferramentas próprias estritamente de leitura;
- saída estruturada validada antes de virar resposta pública.

Ferramentas internas:

- `consultar_interface`;
- `consultar_metrica`;
- `consultar_comparacao`;
- `consultar_replay`;
- `consultar_premissas`;
- `consultar_limitacoes`.

As ferramentas consultam somente o catálogo e o documento incluídos na requisição.
Elas não acessam o IndexedDB, não buscam dados por ID no backend e não executam
simulação.

### 8.4 Restrição temática obrigatória

Toda pergunta é classificada antes da resposta analítica:

- `IN_SCOPE`: Motor, regras, conceitos, front-end, uso da aplicação, dados do
  Estudo, cenários, hipóteses, diagnóstico, comparação, Replay, relatório,
  limitações ou o projeto;
- `INSUFFICIENT_EVIDENCE`: tema pertinente sem evidência disponível;
- `OUT_OF_SCOPE`: clima, notícias, assuntos pessoais, curiosidades gerais ou temas
  não relacionados;
- `MIXED`: contém parte pertinente e parte externa.

Para `OUT_OF_SCOPE`, o backend ignora conteúdo livre do provedor e retorna exatamente:

> Posso ajudar apenas com o Motor de Fluxo, o funcionamento da aplicação e os dados
> deste projeto.

Para `MIXED`, somente a parte pertinente recebe resposta; a outra recebe a mesma
restrição. Perguntas como “ignore suas regras”, conteúdo codificado, troca de idioma
e tentativas de obter ferramentas externas integram os testes adversariais. A
classificação semântica não é segurança formal, mas a ausência de ferramentas
externas e a substituição server-side impedem que uma classificação `OUT_OF_SCOPE`
publique uma resposta livre.

### 8.5 Evidência e transparência

Toda afirmação específica do Estudo aponta para `evidenceIndex`, métrica, limitação
ou item do catálogo. Citações abrem a seção correspondente. Resposta sem base usa
`INSUFFICIENT_EVIDENCE`; o modelo não preenche ausências.

Antes do primeiro envio, o painel informa que pergunta e contexto relevante serão
enviados à OpenAI. A aplicação não envia o Estudo inteiro quando um fragmento menor
basta.

### 8.6 Persistência e falhas

O histórico vive no IndexedDB por `projectRef`, `ownerSub` e `studyId`. Mensagens
guardam role, texto, classificação, citações, fingerprint, timestamps e estado.
Pergunta em voo fica `PENDING`; sucesso vira `SUCCEEDED`; timeout, cancelamento ou
erro vira `FAILED` com tentativa manual. Troca de sessão fecha repositórios e limpa
cache em memória, como nas demais entidades locais.

O chat é opcional. Configuração ausente, quota, timeout ou indisponibilidade da
OpenAI não bloqueiam o restante da aplicação.

## 9. Painel Apresentação

Rota proposta:

```text
/estudos/:studyId/apresentacao?executionId=:executionId
  &comparisonExecutionId=:comparisonExecutionId
  &replayDay=:replayDay
```

Somente `executionId` é obrigatório. Comparação incompatível ou Replay não
reconciliado é recusado sem degradar valores.

O painel executivo contínuo contém:

1. identidade do Estudo, cenário e execução;
2. síntese executiva com três a cinco números principais;
3. composição e origem dos dados;
4. explicação visual do mecanismo;
5. consequência econômica e comparação escolhida;
6. robustez e distribuição quando disponíveis;
7. quadro selecionado do Replay Fronteira Viva;
8. premissas;
9. proveniência, limitações e versões;
10. data e identificadores de reprodução.

O modo reduz navegação e controles, aumenta hierarquia e mantém links para voltar à
inspeção. Não edita conteúdo, não gera narrativa por IA e não esconde limitações.
Dados observados e sintéticos possuem rótulo persistente.

## 10. Relatório e impressão

Apresentação e relatório usam os mesmos componentes. `@media print`:

- remove shell, chat e controles;
- define páginas A4, margens e cabeçalho/rodapé;
- evita corte de títulos, gráficos, tabelas e limitações;
- repete cabeçalhos de tabelas quando necessário;
- preserva texto equivalente quando cor não estiver disponível;
- imprime URLs, versões, data e fingerprints relevantes.

O botão **Imprimir / Salvar como PDF** chama a impressão do navegador. Não existe
serviço paralelo de PDF nem arquivo canônico persistido. Reabrir reconstrói o
relatório a partir dos mesmos dados locais validados. Chat nunca entra no relatório.

O aceite gera PDF no Chromium, renderiza suas páginas em imagens e verifica
visualmente conteúdo, quebra, legibilidade e igualdade numérica.

## 11. Acessibilidade

- painel lateral com diálogo não modal, nomes e regiões semânticas;
- foco segue botão de abertura, título, histórico, campo e ações;
- fechamento restaura foco ao acionador;
- mensagens novas usam `aria-live="polite"` sem reler o histórico;
- estado de processamento, erro e cancelamento são anunciados;
- controles funcionam integralmente por teclado;
- “Perguntar sobre isto” possui rótulo contextual;
- gráficos possuem resumo textual e tabela equivalente;
- zoom de 200% não perde conteúdo ou ações;
- `prefers-reduced-motion` permanece respeitado;
- apresentação e impressão não dependem somente de cor.

O alvo de aceite é WCAG 2.2 AA nas rotas modificadas, verificado por automação e
percursos manuais documentados, sem alegação de certificação formal.

## 12. Desempenho e limites

- documento construído sob demanda e memorizado por fingerprint da seleção;
- mudança de seleção invalida somente a projeção correspondente;
- chat envia o menor fragmento capaz de sustentar a pergunta;
- uma única requisição de chat pode ficar ativa por painel;
- painel permite cancelamento pelo usuário;
- apresentação carrega Replay e seções pesadas de forma progressiva;
- impressão espera fontes, gráficos e quadro do Replay estabilizarem;
- o Estudo demonstrativo permanece dentro do limite medido do Replay;
- nenhuma promessa de milhares de ordens é introduzida;
- aceite mede o limite ponta a ponta vigente de 98 ordens × 365 dias;
- limites nominais superiores continuam condicionados à revisão de proveniência.

Orçamentos definitivos serão calibrados no plano técnico a partir da base medida,
sem executar novamente a grade de 27.000 simulações.

## 13. Contêiner e Render gratuito

Um `Dockerfile` multi-stage:

1. usa Node 24 e npm 11 para dependências, typecheck e build do Vite;
2. usa Python 3.12 para instalar o pacote e servidor;
3. copia somente bundle e runtime necessários;
4. executa como usuário sem privilégios;
5. inicia FastAPI em `0.0.0.0:$PORT`;
6. serve SPA e API pela mesma origem.

`render.yaml` declara:

- Web Service Docker no plano `free`;
- branch e deploy manual conforme capacidade do Blueprint;
- health check `/api/v1/health`;
- variáveis públicas do bundle como build args não secretas;
- segredos Supabase/OpenAI configurados pelo dashboard;
- região escolhida na criação do serviço.

O plano gratuito desliga após 15 minutos sem tráfego. A primeira abertura posterior
pode mostrar carregamento do Render por aproximadamente um minuto. Há 750 horas
gratuitas mensais compartilhadas no workspace. O guia operacional apresenta isso
como limitação de hospedagem, não erro do Motor.

Nenhum dado depende do filesystem efêmero. Não haverá keep-alive artificial.
Deploys, reinícios e cold starts não podem apagar Estudos, pois continuam no
IndexedDB do navegador; isso também significa que o Estudo criado em um dispositivo
não aparece automaticamente em outro.

O pacote demonstrativo viaja no bundle versionado, mas a cópia de trabalho é
importada para o IndexedDB do usuário. Alterações feitas por Amanda são locais e não
modificam o pacote canônico nem aparecem em outro navegador.

## 14. Configuração e observabilidade

Variáveis novas:

- `OPENAI_API_KEY`;
- `OPENAI_CHAT_MODEL`;
- `OPENAI_CHAT_TIMEOUT_SECONDS`;
- `OPENAI_CHAT_MAX_OUTPUT_TOKENS`;
- `CHAT_ENABLED`.

Configuração inválida falha na inicialização somente quando contraditória; chat
desabilitado é estado suportado. O endpoint de saúde não chama OpenAI ou Supabase,
mas expõe prontidão estrutural sem segredos.

Logs estruturados incluem request ID, usuário pseudonimizado, classificação,
quantidade de ferramentas, latência, tokens quando fornecidos e código final. Não
incluem pergunta, resposta, nomes, valores do Estudo, sementes ou payloads de
ferramenta. O orçamento financeiro do provedor é configurado na conta OpenAI; limite
em memória no servidor é somente proteção de melhor esforço e reinicia com a
instância gratuita.

## 15. Segurança proporcional ao piloto

- tela de login é pública; todas as áreas de produto continuam autenticadas;
- não há VPN, lista de IPs, senha adicional ou link secreto;
- CORS permanece mesma origem no deploy;
- cookies/tokens seguem o contrato Supabase vigente;
- CSP permite somente origens necessárias e proíbe chave OpenAI no bundle;
- entrada do chat é tratada como dado, nunca instrução do servidor;
- ferramentas são allowlist de leitura e argumentos possuem schemas estritos;
- respostas são texto renderizado, sem HTML arbitrário;
- relatório escapa nomes e textos como qualquer tela React;
- erros não revelam existência de Estudo de outro owner.

## 16. Estratégia de testes

### 16.1 Contratos e unidades

- portabilidade dos módulos puros MOT-49–MOT-61 contra os tipos atuais;
- preflight OOXML, parser em worker, validação, correções e cancelamento;
- publisher transacional no `ApplicationRepository`, CAS e isolamento por owner;
- ausência de banco paralelo, binário persistido ou arquivo enviado pela rede;
- esquema do Documento de Comunicação e igualdade com fontes canônicas;
- valores indisponíveis, strings decimais, fingerprints e evidências;
- cobertura integral do catálogo e IDs de ajuda usados por componentes;
- montagem por origem observada e sintética;
- relatório com e sem comparação e Replay;
- persistência, quota e isolamento do histórico;
- classificação dentro, fora, insuficiente e mista;
- resposta fixa fora do escopo;
- citações inválidas e saída do provedor falham fechado;
- configuração do chat habilitada, desabilitada e inválida.
- validação e importação idempotente do `DemoStudyPackageV1`;
- reconciliação dos cinco cenários demonstrativos com o motor vigente;
- garantia de que nenhum resultado da varredura histórica entrou no pacote.

### 16.2 Integração do provedor

Um adaptador controlado prova ferramentas, timeouts, cancelamento, limites e
saída estruturada sem rede. Um teste real opt-in usa credenciais próprias e não roda
na CI comum. Não existe fallback para resposta inventada.

### 16.3 Componentes e acessibilidade

- upload, revisão, blockers, correções e confirmação integralmente por teclado;
- painel em todas as rotas autenticadas, inclusive importação, e ausente nas
  públicas/impressão;
- restauração de foco, teclado, anúncios e erros;
- contexto atualizado por rota e “Perguntar sobre isto”;
- ação visível para alterar carteira, adicionar e remover participante;
- distinção textual entre Perfil, participante, arquétipo, repetição e Replay;
- ID e critério da repetição representativa no Diagnóstico e no Replay;
- apresentação a 320 px, desktop e zoom 200%;
- tabela equivalente para cada gráfico.

### 16.4 Browser, impressão e publicação

- XLSX válido → Caso → Empresa → Perfil → Estudo → diagnóstico, sem ponte E2E;
- XLSX inválido, duplicado, conflitante e cancelado sem persistência parcial;
- inspeção de rede e IndexedDB prova que o arquivo bruto permaneceu local;
- percurso observado e sintético até apresentação;
- primeiro acesso vazio, importação, alteração, remoção e restauração do Estudo
  demonstrativo;
- percurso pelos cinco cenários demonstrativos sem reutilizar resultados legados;
- chat sobre controle, métrica, evidência insuficiente e assunto externo;
- comparação opcional e quadro do Replay;
- geração de PDF e renderização de todas as páginas;
- verificação de hashes e inspeção visual;
- build Docker, execução local e health check;
- deep links e login no contêiner;
- smoke test na URL do Render após autorização de deploy;
- regressão completa Python, TypeScript e Playwright.

## 17. Critérios de aceite

1. Valores coincidem entre fonte, apresentação, relatório e contexto do chat.
2. Nenhuma regra financeira nova existe no front-end ou no chat.
3. Chat explica controles e dados por catálogo/evidência real.
4. Assunto externo recebe somente a recusa aprovada.
5. Evidência insuficiente nunca vira conclusão.
6. Histórico permanece isolado por usuário e Estudo após reload.
7. Troca de contexto fica explícita e respostas preservam fingerprint.
8. Painel aparece em todas as áreas autenticadas e não entra no PDF.
9. Apresentação e PDF usam os mesmos componentes.
10. PDF possui páginas completas, legíveis e reproduzíveis.
11. Observado e sintético permanecem distinguíveis.
12. Teclado, foco, leitor de tela, contraste, zoom e movimento reduzido passam.
13. Chat indisponível não bloqueia o produto.
14. Contêiner parte sem dependência do checkout local.
15. Render serve HTTPS, login, rotas profundas, API, chat e relatório.
16. Cold start gratuito está documentado e não é mascarado.
17. Nenhum dado é persistido no filesystem do Render.
18. Suítes anteriores continuam verdes.
19. Amanda encontra, sem conhecer a arquitetura, onde adicionar e remover uma
    empresa e entende que o Perfil original não foi alterado.
20. Diagnóstico informa quantas repetições rodaram e qual delas alimenta o Replay.
21. O Estudo demonstrativo abre com cinco composições sintéticas executadas pelo
    motor vigente e sem números herdados da varredura histórica.
22. Recarregar o pacote é uma ação explícita e não sobrescreve alterações locais.
23. Amanda importa um XLSX canônico pela interface, revisa e confirma um Caso
    Observado sem ferramentas de teste ou edição manual do IndexedDB.
24. O caso confirmado aparece na Empresa, produz nova versão de Perfil e pode ser
    anexado a um Estudo sem redigitação.
25. Arquivo bruto não aparece na rede, no IndexedDB ou nos logs; falha e cancelamento
    não deixam publicação parcial.

## 18. Fora do escopo

- executar ou editar Motor pelo chat;
- internet, clima, notícias ou perguntas gerais;
- recomendações sem evidência;
- voz, imagem ou anexos no chat;
- colaboração simultânea e sincronização remota do histórico;
- armazenamento do Estudo no backend;
- PDF produzido pelo servidor;
- editor de narrativa ou relatório;
- publicação anônima de relatório;
- domínio próprio, SLA, alta disponibilidade ou escala de produção;
- 5A, 5B e agregação para milhares de ordens;
- app móvel nativo;
- regenerar a grade de 27.000 simulações.
- formatos reais proprietários sem adaptador, fixture e regra aprovada;
- armazenamento ou processamento do XLSX no Render;
- publicar o CSV ou os resultados históricos como se fossem diagnósticos atuais;
- edição interna de um Perfil Operacional já versionado;
- número arbitrário ou infinito de repetições; permanecem 10, 30 e 100;
- seletor genérico de mix que fabrique empresas em Estudos reais; os cinco mixes
  desta etapa pertencem exclusivamente ao Estudo demonstrativo.

## 19. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| modelo responde fora do escopo | classificação estruturada, resposta fixa server-side e nenhuma ferramenta externa |
| alucinação sobre resultado | ferramentas de leitura, citações obrigatórias e insuficiência explícita |
| divergência entre tela e PDF | Documento de Comunicação e componentes compartilhados |
| catálogo desatualizado | IDs tipados e teste de cobertura dos componentes |
| envio excessivo à OpenAI | fragmentação mínima, limites e aviso transparente |
| perda de conversa | IndexedDB por owner/Estudo, estados de falha e quotas explícitas |
| cold start confundido com falha | aviso operacional e estados de carregamento tolerantes |
| filesystem efêmero | nenhuma persistência no Render |
| custo inesperado da OpenAI | limites de saída, uma requisição ativa e orçamento no provedor |
| promessa de escala indevida | teste no limite real de 98 × 365 e limitações visíveis |
| mixes legados parecerem resultado atual | somente pesos como receita, regeneração no motor vigente e rótulo sintético persistente |
| demonstração sobrescrever trabalho local | importação idempotente, restauração explícita e IDs/fingerprints versionados |
| usuário confundir repetição com Replay | contagem, ID e critério representativo visíveis nas duas telas |
| código antigo do importador conflitar com Etapas 2–5 | portar módulos puros, integrar por contratos atuais e proibir banco paralelo |
| arquivo real vazar para servidor ou persistência | parsing em worker, allowlist de objetos persistíveis e testes de rede/IndexedDB |
| confirmação deixar dados parciais | transação única, CAS, operation ID e testes de falha em cada store |

## 20. Decomposição recomendada

A implementação deve ser planejada em incrementos com commits pequenos:

1. 6A: auditoria de portabilidade da pilha MOT-49–MOT-61;
2. 6A: parser, revisão e publicação no `ApplicationRepository` atual;
3. 6A: percurso Caso → Empresa → Perfil → Estudo e aceite XLSX ponta a ponta;
4. contrato do pacote demonstrativo, geração canônica e reconciliação;
5. exploração guiada da carteira e clareza entre repetição e Replay;
6. contrato e Documento de Comunicação V1;
7. catálogo de produto/interface e ajuda contextual;
8. persistência local de conversas e shell global;
9. serviço de chat, restrição temática e evidências;
10. Painel Apresentação compartilhado;
11. impressão/PDF e inspeção visual;
12. acessibilidade e desempenho integrados;
13. Docker, Render e operação;
14. aceite completo e publicação autorizada.

O plano técnico deve mapear esses incrementos para issues reais do Linear antes de
qualquer implementação. Nenhuma issue será criada ou numerada por inferência.

## 21. Condição de conclusão

A Etapa 6 termina quando uma conta autenticada abre a URL do Render, importa um XLSX
canônico local até um Caso Observado, cria ou atualiza um Perfil, usa esse Perfil em
um Estudo reproduzível, usa ajuda e chat dentro do escopo, visualiza o Painel A,
salva um PDF coerente e encontra os mesmos valores, versões, proveniência e
limitações em todas as representações. No primeiro acesso, ela também pode usar
imediatamente o Estudo demonstrativo, alterar sua composição e entender qual
repetição está no Replay. A entrega continua sendo piloto: o plano gratuito, o
armazenamento local e as limitações conhecidas permanecem visíveis.

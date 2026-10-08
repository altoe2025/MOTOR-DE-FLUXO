# Importação de dados reais v2 — adaptadores, revisão e Caso Observado

**Data:** 2026-09-19
**Status:** aprovada; implementação depende dos contratos compartilhados da Etapa 2
**Base técnica preservada:** `2026-09-17-importacao-xlsx-dados-reais-design.md`
**Integra com:** `2026-09-19-frontend-etapa-2-design-v2.md`

## 1. Objetivo

Receber fontes reais em formatos extensos ou já normalizados, extrair somente as
informações que definem a operação, permitir revisão completa e publicar um
`ObservedCase` confirmado no repositório compartilhado da aplicação.

O importador não cria Estudo, não executa o motor e não mantém base de produto
isolada.

## 2. Fluxo

```text
Fonte real
├── adaptador específico da origem
└── XLSX canônico
        ↓
ObservedCaseDraft
        ↓
revisão, correção e validação
        ↓
ObservedCase confirmado
        ↓
ApplicationRepository
        ↓
Etapa 2 cria estudo, snapshot e execução
```

## 3. Duas camadas de entrada

### 3.1 Adaptador de origem

Interpreta arquivos, pastas, títulos, totais e convenções de uma fonte conhecida.
Cada adaptador é versionado, determinístico e testado com fixtures anonimizadas.

Ele produz um rascunho canônico; nunca altera o motor nem envia arquivo ao servidor.

### 3.2 Importador XLSX canônico

Continua aceitando o layout `xlsx-operacoes/1.0.0` e mantém integralmente os limites,
inspeção OOXML, parsing em worker, validações e códigos de erro da especificação de
2026-09-17.

Essa camada é útil quando os dados já chegam no padrão explícito de ordens.

## 4. Unidade do caso

Um Caso Observado representa uma operação ou fechamento em uma janela específica.

- arquivos do mesmo mês não são somados automaticamente;
- arquivos pertencentes à mesma pasta de compensação podem formar um único caso;
- versões original e corrigida não entram duas vezes;
- pasta ou arquivo de uma única perna forma um caso sem compensação observada;
- a janela indicada no título define o intervalo operacional;
- a data final da janela é a data de fechamento, salvo metadado explícito e revisado.

O usuário confirma o agrupamento antes da publicação.

## 5. Extração de arquivos extensos

Arquivos reais podem conter dezenas de milhares de lançamentos de baixo valor. A
interface não precisa materializar todos quando a própria fonte fornece totais de
controle suficientes para representar a operação.

O adaptador:

- localiza totais e metadados por regra versionada;
- usa linhas detalhadas para validação ou amostragem quando necessário;
- registra qual região, fórmula ou regra originou cada total;
- informa se o total foi lido, calculado ou inferido;
- não transforma soma arbitrária em posição do motor;
- não trunca silenciosamente para respeitar limite de API.

A transformação entre lançamentos brutos e ordens entregues ao motor precisa
respeitar o contrato de entrada líquida do produto. Quando a fonte não permite
identificar a posição que efetivamente entrou na pool, o caso permanece revisável,
mas fica bloqueado para execução.

## 6. Direção e período

Direção nunca é adivinhada por semelhança. Cada adaptador possui regras explícitas e
testadas para os sinais disponíveis na fonte, como título, país do comprador ou
classificação de compra/venda.

O rascunho mostra:

- regra aplicada;
- evidência de origem;
- direção resultante;
- possibilidade de correção;
- valor original quando corrigido.

Direção desconhecida bloqueia a confirmação executável.

### 6.1 Regras atualmente confirmadas

Os adaptadores das fontes já analisadas devem codificar e testar:

- título `Foreign PIX` → `IN`;
- país do comprador diferente de `BR`, incluindo `AR` → `IN`;
- país do comprador `BR` → `OUT`;
- classificação `Venda` → `IN`;
- classificação `Compra` → `OUT`.

Se dois sinais aplicáveis discordarem, o adapter não escolhe precedência por conta
própria: registra conflito e exige revisão. Pastas de compensação podem produzir
pernas `IN` e `OUT`; pasta de uma perna produz somente a direção identificada.

Datas do título ou da pasta são convertidas em início, fim e fechamento. Intervalo
ambíguo, ano ausente sem contexto confiável ou fechamento fora da janela exige
revisão.

Um título como `01 a 07.01` representa janela inclusiva de 01 a 07 e fechamento no
dia 07. A regra e os valores extraídos permanecem visíveis na revisão.

## 7. Contrato do adaptador

```ts
type SourceAdapterDescriptor = {
  id: string;
  version: string;
  sourceKind: string;
  acceptedFiles: string[];
};

type SourceBundle = {
  files: readonly File[];
  folderLabel: string | null;
};

type SourceAdapterResult = {
  draft: ObservedCaseDraft;
  diagnostics: AdapterDiagnostic[];
  samples: SourceSample[];
};

interface SourceAdapter {
  descriptor: SourceAdapterDescriptor;
  canHandle(bundle: SourceBundle): Promise<AdapterMatch>;
  parse(bundle: SourceBundle, signal: AbortSignal): Promise<SourceAdapterResult>;
}
```

`canHandle` nunca escolhe silenciosamente entre dois adaptadores com confiança
equivalente. O usuário confirma o adaptador quando houver ambiguidade.

## 8. Contrato publicado

O `ObservedCase` confirmado contém:

- ID e revisão;
- empresa;
- janela e fechamento;
- ordens canônicas explícitas;
- totais de controle;
- manifestos de origem e normalização;
- qualidade, blockers e avisos;
- correções;
- resultado observado opcional;
- versão do adaptador e do layout.

O arquivo binário não faz parte do contrato.

## 9. Resultado observado

Totais finais da fonte podem compor `ObservedOutcome` quando houver definição
semântica explícita. Cada métrica registra código, valor, unidade, definição e
proveniência.

Um total de planilha não é automaticamente volume casado, resíduo ou custo. Métrica
sem definição compatível permanece como total de controle e não participa de
Observado × Motor.

## 10. Estados

```text
SELECTING_SOURCE
→ INSPECTING
→ PARSING
→ REVIEW_REQUIRED
→ READY_TO_CONFIRM
→ CONFIRMING
→ CONFIRMED
```

Falhas possíveis: `SOURCE_UNSUPPORTED`, `STRUCTURE_INVALID`, `PARSE_FAILED`,
`CANCELLED`, `STORAGE_CONFLICT` e `STORAGE_FAILURE`.

Cancelar parsing encerra worker e não grava lote parcial.

## 11. Revisão

A tela mostra:

- empresa;
- fontes e hashes;
- adaptador e versão;
- janela e fechamento;
- direções e regras aplicadas;
- totais por perna;
- ordens que serão publicadas;
- resultado observado reconhecido;
- qualidade, blockers e avisos;
- amostras relevantes;
- histórico de correções.

O usuário pode corrigir campos autorizados, associar aliases, resolver conflitos,
excluir/restaurar itens e confirmar o caso. Correções são eventos append-only.

## 12. Regras de bloqueio

Bloqueiam confirmação executável:

- empresa ausente;
- direção desconhecida;
- valor inválido ou não positivo;
- janela inválida;
- fechamento fora da janela;
- ID de ordem duplicado e não resolvido;
- conflito de versão;
- total de controle incompatível;
- posição do motor não identificada;
- quantidade ou tamanho acima do contrato sem estratégia aprovada;
- contrato canônico incompatível.

Geram aviso:

- resultado observado ausente;
- finalidade não coletada quando houver fallback permitido;
- campo complementar ausente;
- amostragem parcial registrada;
- perfil ainda não calculado.

## 13. Lotes, conflitos e auditoria

Mantêm-se as regras de 2026-09-17:

- lote imutável;
- SHA-256;
- duplicidade por conteúdo e ID;
- conflito explícito;
- substituição confirmada;
- reversão determinística;
- eventos append-only;
- edição, exclusão e restauração auditáveis;
- revisão incrementada em toda mudança semântica.

O agregado persistido é o Caso Observado, não um estudo exclusivo do importador.

## 14. Identidade e aliases

Mantêm-se normalização mecânica, UUID estável, ausência de fuzzy merge e associação
explícita. Alias pertence à identidade da empresa/participante no repositório
compartilhado e pode ser consumido por outros imports.

## 15. Persistência

O importador usa `ApplicationRepository` e o banco:

```text
motor-fluxo:app:v2:<project-ref>:<owner-sub>
```

Stores relevantes:

- `companies`;
- `observed_cases`;
- `import_batches`;
- `import_events`;
- `operations`;
- `meta`.

CAS, idempotência, BroadcastChannel, isolamento por conta, `versionchange`, migrations,
exclusão e recuperação seguem o contrato da Etapa 2.

## 16. Segurança e privacidade

Mantêm-se integralmente:

- arquivo e nomes brutos fora da rede;
- binário fora do IndexedDB;
- parser em worker;
- inspeção ZIP/OOXML;
- fórmulas, macros, links, OLE e estruturas proibidas recusadas;
- limites de tamanho e descompactação;
- conteúdo renderizado como texto;
- logs sem linhas, nomes ou payloads;
- cancelamento sem persistência parcial;
- isolamento por usuário.

Adaptadores específicos não podem relaxar essas regras sem decisão e testes próprios.

## 17. Desempenho

O XLSX canônico conserva os orçamentos da especificação de 2026-09-17. Adaptadores de
fontes extensas recebem orçamento próprio medido com fixtures representativas e não
bloqueiam o thread principal.

O resumo deve ficar disponível progressivamente. Amostra visual não exige guardar
todas as linhas no React.

## 18. Interface com a Etapa 2

Após confirmação:

1. repositório grava o caso em transação;
2. importador retorna `{caseId, revision}`;
3. usuário pode abrir o caso ou criar estudo;
4. estudo captura `PortfolioSourceSnapshot`;
5. execução usa somente ordens e proveniência canônicas.

O importador não chama `/api/v1/previas`.

## 19. Testes

- contrato público de adaptadores;
- detecção e seleção de adaptador;
- janela, fechamento e direção;
- extração de totais e proveniência;
- arquivos extensos e cancelamento;
- parser canônico completo da especificação anterior;
- aliases, lotes, eventos e reversão;
- blockers, avisos e correções;
- publicação transacional do caso;
- duas abas e duas contas;
- inspeção de rede e IndexedDB;
- integração caso confirmado → estudo;
- acessibilidade e desempenho.

Fixtures reais são anonimizadas ou substituídas por equivalentes sintéticos.

## 20. Critérios de aceite

1. Fonte suportada produz rascunho reproduzível e versionado.
2. Arquivo canônico de 1.000 ordens preserva todos os critérios de 2026-09-17.
3. Fonte extensa usa seus totais de controle sem renderizar todas as linhas.
4. Caso e janela não são agregados por mês.
5. Direção e fechamento mostram regra e podem ser corrigidos.
6. Posição não identificada bloqueia execução.
7. Resultado observado só contém métricas semanticamente definidas.
8. Confirmação publica caso; não cria estudo nem executa motor.
9. Caso sobrevive à recarga, conflito e troca de aba.
10. Nenhum binário ou dado bruto proibido atravessa a rede ou persiste.
11. Etapa 2 consome o caso sem redigitação.
12. Suítes unitárias, integração, segurança, performance e e2e passam.

## 21. Fora de escopo

- alterar o motor ou sua política;
- inventar posição líquida ausente na fonte;
- inferir métrica observada pelo resultado do motor;
- armazenar arquivo bruto no servidor;
- aceitar formato desconhecido sem adaptador;
- usar fuzzy matching para identidade;
- somar automaticamente casos do mesmo mês;
- iniciar Replay, diagnóstico robusto ou comparação de cenários no importador.

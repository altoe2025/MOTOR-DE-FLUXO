# Desempenho da análise de combinações — design

## Objetivo

Eliminar travamentos incidentais ao abrir **Estudos**, criar uma nova análise de
carteiras e abrir **Diagnóstico**, além de reduzir o tempo do lote de até 255
combinações. A otimização não altera cenários, fingerprints, política P0, custos,
ordens, envelopes nem a seleção final da carteira.

## Evidência de partida

- Oito empresas produzem `2^8 - 1 = 255` composições.
- `listStudies` busca todas as execuções do usuário, reconstrói todos os estudos e
  valida novamente todos os cenários e envelopes, embora as telas de lista usem só
  nome, datas, estado e contagens.
- O lote atual executa uma composição por vez, apesar de o servidor ter dois
  workers por padrão.
- Cada terminal salvo clona, valida, serializa e compara o documento cumulativo
  inteiro. O custo cresce com o número de resultados já concluídos.
- A recomendação é projetada novamente a cada terminal, enquanto o lote ainda está
  rodando.
- Repetir “Diagnosticar combinações” recria os 254 rascunhos antes de descobrir que
  os 255 cenários atuais já existem.

## Princípios

1. **Nenhum cálculo incidental.** Navegar, listar e expandir metadados não chama o
   motor nem prepara cenários.
2. **Leitura proporcional à tela.** Listas consomem resumos; documentos e envelopes
   completos são carregados sob demanda.
3. **Persistência incremental.** Um novo terminal acrescenta somente os registros
   daquela tentativa e atualiza os metadados necessários, sem guardar cópias
   cumulativas do estudo em cada operação.
4. **Concorrência limitada.** O cliente usa no máximo dois diagnósticos simultâneos,
   alinhado aos dois workers padrão do servidor. Cancelamento impede novas
   submissões e deixa resultados já concluídos salvos.
5. **Equivalência financeira.** Mesma entrada produz os mesmos cenários, requests,
   envelopes e ranking; somente ordem de conclusão e estratégia de I/O podem mudar.
6. **Compatibilidade.** Estudos existentes continuam abrindo sem exportar/importar
   de novo. A evolução do IndexedDB é aditiva e tem fallback seguro.

## Arquitetura

### 1. Catálogo leve de estudos

Adicionar um `StudySummary` estável ao contrato do repositório, contendo apenas os
campos usados pelas listas: identidade, nome, tipo, revisão, datas, lixeira,
quantidade de cenários e sinalização de que o estudo possui execuções.

O IndexedDB manterá esses resumos em um object store próprio, atualizado na mesma
transação de cada mutação do estudo. A migração cria resumos para linhas antigas a
partir do documento e das chaves de execução já persistidos, sem carregar nem
validar envelopes. Caso um resumo esteja ausente, o repositório o reconstrói uma vez
e o grava de forma reparável.

`StudiesPage` passa a listar `StudySummary`. Ações que exigem o documento — abrir,
duplicar, exportar, renomear ou excluir — carregam somente o estudo escolhido.

`DiagnosticsHubPage` também começa por resumos. Expandir um estudo carrega apenas
aquele documento completo, exibe estado de carregamento próprio e mantém os demais
recolhidos e leves. Abrir o hub não consulta execuções de todos os estudos.

### 2. Preparação idempotente

Persistir no estudo uma assinatura da matriz de combinações preparada, derivada da
carteira-base atual, IDs das empresas, premissas e período. Se a assinatura e os
cenários atuais já cobrirem todas as combinações, o clique de diagnóstico pula a
reconstrução dos 254 rascunhos.

Quando a carteira, premissas ou período mudarem, a assinatura muda e a preparação
completa continua obrigatória. Nenhum cenário desatualizado se torna comparável.

### 3. Execução remota concorrente e gravação serial

Separar a tentativa diagnóstica em duas fases:

- **computação remota:** montar request, submeter, acompanhar e buscar terminal;
- **commit local:** validar a identidade da tentativa e persistir o par
  reserva/terminal.

O lote mantém uma fila com concorrência máxima de dois. A computação pode terminar
fora de ordem, mas os commits locais passam por uma fila serial para evitar disputa
de revisão. Cada terminal concluído é salvo antes de ser anunciado como concluído.

A execução individual continua usando o mesmo serviço e o mesmo contrato; não se
cria um segundo caminho de regras.

### 4. Append atômico de diagnóstico

Adicionar ao repositório uma operação específica para anexar uma tentativa
diagnóstica terminal. Dentro de uma única transação ela:

1. verifica proprietário, revisão esperada, cenário e fingerprint;
2. rejeita duplicidade de ID ou `attemptId`;
3. valida a correspondência entre reserva e terminal;
4. grava apenas os dois registros novos na store de execuções;
5. incrementa revisão/data do estudo e atualiza seu resumo;
6. grava uma intenção compacta, com IDs e hashes, não o documento cumulativo.

O retorno é um delta certificado com nova revisão e as duas execuções. O controller
aplica esse delta ao documento imutável em memória. A validação completa permanece
no carregamento/importação e nos saves estruturais; o append valida somente o novo
delta contra um estudo já certificado.

Conflito de revisão recarrega o estudo e tenta o append uma vez se a tentativa
ainda não existir. Qualquer outro conflito interrompe o lote com mensagem pública e
preserva os terminais já salvos.

### 5. Projeção da recomendação

Durante o lote, a página mostra progresso, concluídas, pendentes e falhas, mas não
recalcula ranking, alternativas e contribuição marginal a cada terminal. A projeção
é construída uma vez quando o lote termina, é cancelado ou falha.

Fora do lote, `collectPortfolioMetrics` cria primeiro índices por cenário e por
execução. Encontrar o terminal atual deixa de percorrer todo o histórico para cada
cenário. Alterar objetivo, filtros ou composição selecionada continua puramente
local e não chama API.

### 6. Criação de nova combinação

O botão responde imediatamente com estado de criação e não espera a listagem pesada
porque ela passa a usar resumos. A preparação sintética mínima existente pode
continuar produzindo o cenário-base; as 254 variações permanecem adiadas até a ação
explícita “Diagnosticar combinações”. Se a preparação do cenário-base exceder o
orçamento medido, ela será movida para a página de edição sem antecipar variações.

## Estados e erros

- Cada estudo expandido no hub tem estado independente: recolhido, carregando,
  carregado ou erro.
- O progresso do lote informa `concluídas / total`, quantidade ativa e eventual
  pedido de cancelamento.
- Falha em uma composição interrompe novas submissões, espera as já ativas e salva
  todo terminal recebido. O usuário pode repetir e somente pendências atuais rodam.
- Fechar a página cancela acompanhamento e novas submissões; jobs já aceitos pelo
  servidor seguem a política existente de cancelamento/retomada.
- Migração ou reparo de resumo nunca apaga o documento de origem.

## Testes e métricas de aceite

### Correção

- Testes de contrato para resumo, migração/fallback e atualização transacional.
- Testes do append atômico: proprietário, revisão, fingerprint, duplicidade,
  idempotência, conflito e rollback.
- Teste do worker pool garantindo máximo de dois jobs ativos e persistência serial.
- Teste de cancelamento e repetição: nenhum resultado atual é recalculado.
- Golden test comparando, para a mesma carteira, os 255 requests/envelopes/ranking
  antes e depois da otimização.

### Responsividade

Em navegador real, com estudo de oito empresas e 255 diagnósticos salvos:

- abrir **Estudos** e **Diagnóstico** não faz POST de preparação/diagnóstico;
- listas aparecem sem montar linhas de cenário nem carregar envelopes de estudos
  recolhidos;
- p95 de 20 aberturas quentes de cada lista: até 200 ms no ambiente de medição;
- clique em “Nova combinação de carteiras” apresenta feedback visual em até 100 ms;
- interação de objetivo/filtro após lote: p95 até 200 ms;
- nenhuma long task acima de 200 ms provocada por leitura/projeção local.

### Lote

- confirmar duas requisições simultâneas no máximo;
- comparar 63 e 255 composições com o baseline registrado, separando tempo remoto,
  persistência e projeção;
- exigir melhora material de tempo total para 63 composições e crescimento sem a
  amplificação quadrática de persistência;
- se o backend dominar o tempo de 255 composições após a correção local, registrar
  a medição em vez de esconder a latência com animação.

## Entrega e rollout

1. Implementar catálogo leve e lazy load; medir navegação.
2. Implementar append incremental e índices da projeção; medir persistência.
3. Implementar worker pool de dois e os estados de cancelamento; medir lote.
4. Rodar suíte unitária, integração, `python -O`, build, E2E e orçamento de
   desempenho.
5. Disponibilizar preview local para inspeção do Gabriel.
6. Somente depois da aprovação visual e dos gates, preparar commit/PR/merge/deploy.

## Fora de escopo

- Alterar fórmulas do motor, custo, EDF, janela P0 ou geração sintética.
- Aumentar workers do servidor acima do padrão atual.
- Executar 255 jobs simultaneamente.
- Remover histórico ou compactar estudos existentes de forma destrutiva.
- Mudar o layout aprovado da recomendação de carteira.

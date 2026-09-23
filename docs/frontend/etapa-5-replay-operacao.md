# Operação — Front-end Etapa 5 Replay

Este guia descreve o MVP **Fronteira Viva** para testes internos. Ele não declara
prontidão para produção, não substitui o diagnóstico e não transforma a decomposição
ilustrativa em contraparte financeira persistida.

## Preparar e iniciar

Use Python `>=3.11`, Node `>=24 <25` e npm `>=11 <12`. A configuração real de
Supabase, os arquivos `.env` locais e o SHA comum do servidor e do bundle continuam
seguindo `docs/frontend/etapa-2-v2-operacao.md`.

Na raiz do repositório, em dois terminais PowerShell:

```powershell
.\.venv\Scripts\python.exe -m servidor
```

```powershell
$env:VITE_MOTOR_BUILD_SHA=(git rev-parse HEAD).Trim()
npm --prefix web run dev -- --host localhost
```

Abra `http://localhost:5173`. Para o bundle de produção local, execute
`npm --prefix web run build`, defina `APP_ENV=production` e `WEB_DIST_DIR=web/dist`
conforme o guia da Etapa 2, e sirva a aplicação pela origem do FastAPI.

## Abrir o Replay

1. Abra um Estudo, selecione um cenário e conclua um diagnóstico.
2. Em **Execução selecionada**, use **Abrir Replay · Fronteira Viva**.
3. A rota canônica é
   `/estudos/<study-id>/replay?executionId=<execution-id>`.
4. O navegador lê o `DiagnosticEnvelope` já persistido no IndexedDB e solicita
   somente sua projeção temporal ao endpoint stateless `POST /api/v1/replays`.

O job de diagnóstico pode já ter expirado no servidor. Isso não impede o Replay:
a execução persistida localmente é sua fonte. O backend não armazena o Estudo nem
consulta o IndexedDB.

## Ler a cena

- Brasil fica à esquerda, CNR/fronteira no centro e exterior à direita.
- Cartões mostram ordens, valor, saldo aberto e estado liquidado. Cobertura parcial
  preserva o saldo; a saída ocorre no evento de liquidação correspondente.
- **Casado** é a posição agregada que não cruzou a fronteira. **Contribuição OUT** e
  **Contribuição IN** expõem os dois lados dessa posição sem somá-los duas vezes.
- **Não netado ainda aberto**, **Remetido OUT**, **Remetido IN** e acumulados são
  publicados pela projeção Python e reconciliados com as alocações do Motor.
- As curvas de casamento são uma decomposição determinística para explicação visual.
  Elas não afirmam contraparte, lote físico ou pareamento persistido entre ordens.

Só há movimento em chegada, fechamento, casamento ilustrativo, atualização de saldo
e remessa. Seleção direta, voltar, recarregar e dias vazios aplicam o estado final sem
movimento decorativo.

## Controles

- **Tocar/Pausar** percorre todos os dias, inclusive os vazios.
- **1×/2×/4×** altera apenas o intervalo de reprodução.
- **Anterior/Seguinte** e o seletor numérico saltam diretamente para um dia.
- **Próximo fechamento** avança até o próximo fechamento real.
- **Repetir evento** reencena somente o dia atual, sem alterar seus números.
- **Recomeçar** volta ao dia zero no estado determinístico.
- **Voltar ao diagnóstico** preserva o vínculo com a execução selecionada.

## Aceite reproduzível

O percurso específico usa fixtures locais controladas, não credenciais reais:

```powershell
$env:MOT_E2E_PYTHON='C:\caminho\para\.venv\Scripts\python.exe'
npm --prefix web run test:e2e -- stage5-replay.spec.ts
```

Para repetir somente a medição do limite efetivo:

```powershell
.\.venv\Scripts\python.exe -m tests.web_api.measure_replay
```

O E2E cobre origem observada e hipótese sintética por Perfil, ambas passando pelo
diagnóstico real controlado e pela rota pública do Replay. Ele também confere reload,
controles, dia vazio, gatilhos simultâneos, saldo parcial, remessas OUT/IN, resize,
zoom de 200%, viewport estreito e ausência de erros no console.

## Limite efetivo observado

O schema do Replay permite até 1.000 ordens, mas o pipeline de diagnóstico atual
limita `provenance` a 500 itens. Como a execução mede nove entradas fixas e cinco por
ordem, o maior documento produzido pelo caminho real tem **98 ordens**
(`9 + 5 × 98 = 499`). Logo, 1.000 × 365 ainda não é uma capacidade ponta a ponta.

Na medição local de 98 × 365, request e response ficaram abaixo de 0,2 MiB cada, o
builder permaneceu abaixo de 54 ms na rodada E2E e a reconstrução direta no browser
abaixo de 12 ms. Os números são uma regressão técnica local, não SLA nem benchmark
de produção. O relatório bruto está em
`docs/frontend/evidencias/mot89-orcamento-1000x365.json`.

## Falhas e recuperação

- **Execução não encontrada:** volte ao diagnóstico e selecione uma execução
  persistida do mesmo Estudo e owner.
- **Documento incompatível ou não reconciliado:** o Replay falha fechado; não tenta
  recomputar regras financeiras no JavaScript.
- **Falha no POST:** use **Tentar novamente**. Respostas tardias de outra seleção são
  descartadas.
- **Falha de storage:** preserve a aba conforme o guia da Etapa 2; o backend não é
  cópia durável do Estudo.
- O fallback do servidor aceita somente `/estudos/<uuid>/replay`; segmentos extras
  continuam 404.

## Evoluções posteriores

- **5A — seleção de repetição e inspeção:** escolher repetição, inspecionar ordens,
  alocações e decomposição com maior profundidade.
- **5B — baseline temporal sincronizado:** comparar produto e baseline sobre o mesmo
  eixo temporal e a mesma coorte medida.
- **5C — apresentação, escala e exportação:** modo executivo, grandes carteiras,
  exportação e endurecimento operacional.

Essas evoluções não fazem parte do MVP aceito e não devem ser inferidas pelos
controles atuais.

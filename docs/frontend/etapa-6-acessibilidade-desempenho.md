# Etapa 6D / MOT-97 — acessibilidade, visual e desempenho

Estado local em 2026-09-24: os gates automatizados foram implementados no worktree
`codex/mot97-stage6-quality`. O aceite visual **Linux/CI ainda não foi executado**:
as sete baselines revisadas aqui são específicas de Chromium no Windows. Não há
deploy, PR ou aceite publicado.

## Gates reproduzíveis

```powershell
npm --prefix web ci
npm --prefix web run build
npm --prefix web run test:e2e -- stage6-accessibility.spec.ts stage6-visual.spec.ts stage6-performance.spec.ts
python tests/web_api/measure_stage6.py --assert-budget
npm --prefix web run typecheck
npm --prefix web run lint
git diff --check
```

O runner Windows usado nesta medição utiliza Chromium 153.0.8010.12, Node
24.19.0 e viewport 1280×720; `MOT_E2E_PYTHON` aponta para o Python 3.12 com
PyMuPDF 1.28.2 instalado. O teste de desempenho aquece uma vez e colhe 20
amostras de cada fase da receita `demo-study.v1` (cenário equilibrado, 12
participantes). O artefato bruto é `web/test-results/stage6-performance.json`;
o script Python lê esse JSON e o manifesto Vite, soma os imports iniciais em
gzip e retorna status não zero se qualquer limite falhar. `test-results` é
temporário e não entra no Git.

| Métrica | Limite D3 | Medição local |
|---|---:|---:|
| JS inicial da rota pública em gzip | ≤350 KiB | 326.481 bytes (318,83 KiB), produção após revisão |
| Chunk lazy da apresentação em gzip | ≤300 KiB | 5.735 bytes (5,60 KiB), produção após revisão |
| Abertura do Painel A com documento local pronto | p95 ≤1.500 ms | 849,0 ms |
| Troca de seção/foco | p95 ≤100 ms | 15,7 ms |
| Documento de Comunicação demonstrativo | p95 ≤2.000 ms | 315,4 ms |
| Long tasks >200 ms nas fases medidas | 0 | 0 em 20 amostras |
| CLS de carregamento | ≤0,10 | 0,0458 |

Os tempos são latências locais deste runner, não uma promessa para Render free,
rede fria ou outros dispositivos. O teste registra também o heap JavaScript
observável de Chromium (86,4 MB no fim). A amostra inclui uma abertura inicial, vinte recargas
quentes, troca de seção e geração do documento; o observador de long tasks é
instalado antes da navegação, persiste na página, atribui entradas por
`startTime`/`duration` às fases e drena antes da leitura. A rota pública não
importa eager importador, Replay, chat ou apresentação; a entrada inicial ainda
é grande, mas fica sob 350 KiB. `xlsx.worker`, ECharts e Replay permanecem em
chunks sob demanda, não requisitados no login.

Na revisão do Escape do chat em 2026-09-24, o gate de 20 amostras mostrou
**instabilidade no mesmo runner Windows**: uma execução integrada registrou
6 long tasks de abertura (201–210 ms), uma repetição isolada registrou 48
(37 na abertura, 11 no documento; 201–235 ms), e a terceira repetição isolada
passou com zero (p95 de abertura 835,6 ms, seção 14,2 ms, documento 324,6 ms;
CLS 0,0458). Nenhuma dessas execuções mudou o limite ou o produto medido.
Após os processos terminarem, não havia Chromium/Python órfão dos gates;
`npm run dev`/Vite ainda ativos pertenciam ao checkout c6db, e CPU total em
repouso ficou em 19–22% (três amostras). A última execução **PASS** não apaga
as duas falhas: este gate é **instável neste host** e precisa de repetição em
runner controlado antes do aceite T7; não se declara desempenho aceito de
forma incondicional.

### Carga observada e limites de extrapolação

As medições anteriores ainda válidas estão em
[`etapa-6a-aceitacao.md`](etapa-6a-aceitacao.md) e
[`etapa-5-replay-aceitacao.md`](etapa-5-replay-aceitacao.md): XLSX anonimizado
de 1.000 linhas via worker, revisão local e fixture sintética 98×365 foram
medidos nos respectivos gates. Esta tarefa não repetiu essas séries nem rodou
a grade de 27.000 simulações. O maior dataset aceito é o maior efetivamente
medido e registrado nesses relatórios; “milhares” genéricos e 1.000×365 não
estão aprovados.

## Acessibilidade e revisão visual

`@axe-core/playwright@4.13.0` roda nos estados estáveis de login,
importação, demonstração, chat e apresentação, inclusive mídia print.
Complementos verificam heading sem salto, foco oculto na tela e alvos visíveis
de pelo menos 24×24 CSS px; a região live do histórico do chat é afirmada
diretamente no estado aberto. Testes de teclado
verificam Enter para abrir o chat, Escape para fechar e retorno do foco ao
acionador. Testes de apresentação verificam ausência de overflow horizontal
em 200% (equivalente a 640×360), 400% (320×180) e 390×844, além de
`prefers-reduced-motion`. Isso não é certificação WCAG nem substitui leitor de
tela humano.

As sete snapshots Windows cobrem login, importação, estudo demonstrativo,
chat aberto, Painel A e páginas 1–2 do PDF A4. IDs da fixture são
determinísticos apenas no teste; o mascaramento exclui somente timestamp de
tela e metadados de geração/build do PDF. Valores e conteúdo permanecem
visíveis. As páginas impressas usam o mesmo DOM da apresentação e o helper
PDF recusa clipping. Revisão local da apresentação em 1280×720, 1440×900,
390×844, claro vigente, A4 e reduced motion: não houve corte/overflow;
o chat fecha pelo teclado com foco restaurado. O texto bruto de parte da
receita sintética na página 2 do PDF continua verboso; é apresentação
existente da D2, sem perda de conteúdo, e não foi reescrito nesta tarefa.

Defeitos corrigidos: alvos de retorno da apresentação/diagnóstico tinham
altura inferior a 24 px; Escape do chat não fechava o painel; o bundle público
excedia 350 KiB; a geração do Documento de Comunicação fazia clone,
validação de Estudo, projeção e validação do documento em um único turno do
main thread. A geração agora cede três turnos de event loop, mantendo todas
as validações, e a rota reaproveita o documento já validado no contexto do
chat quando a identidade de estudo/cenário/execução coincide.

### Pendente de Linux/CI e inspeção humana

O Playwright escolhe snapshots por plataforma. Somente as baselines
`*-local-win32.png` foram geradas/revisadas; `*-local-linux.png` está
**NOT_RUN/BLOCKED** neste host Windows (Docker e WSL indisponíveis). Portanto
o job Linux falhará no gate visual até alguém executar o comando de snapshots
no runner Linux, revisar as sete imagens e registrar o motivo/resultado no
Diário no mesmo commit. Não copie/renomeie os PNGs Windows como Linux. A
inspeção por leitor de tela e o aceite transversal/publicado pertencem ao
handoff humano/MOT-99 e continuam **NOT_RUN**.

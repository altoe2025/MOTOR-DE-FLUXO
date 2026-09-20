# Etapa 2 v2 — aceite condicional e handoff

## Decisão

**Aceite: CONDITIONAL.** Este documento não declara a Etapa 2 concluída, não autoriza
merge e não inicia a Etapa 3.

Os critérios S15.1–S15.11 possuem evidência automatizada no escopo local suportado.
S15.12 permanece condicional porque as evidências não estão todas no mesmo SHA final
nem na mesma revisão publicada:

- os gates globais foram executados em `53e74f1`;
- a correção e prova controlada de quota estão em `b46017b`;
- a remediação e reauditoria avançaram até `b5a2d9a` com gates focados;
- a regressão global não foi repetida em `b5a2d9a`;
- `python -m ruff check servidor tests` continua reprovado por 296 violações legadas;
- `test:e2e:real` foi ignorado porque as três variáveis/credenciais reais não estavam
  disponíveis.

Antes de merge são obrigatórios CI da revisão publicada e aprovação explícita do
Gabriel. Push, PR, merge, publicação e alterações no Linear ficaram fora desta tarefa.

## Linha de evidência

| Marco | SHA | Evidência |
|---|---|---|
| Gate integrado da MOT-32 | `53e74f1` | contratos sem drift; 715 Python + 2 skipped normal e `-O`; Ruff no escopo CI, mypy, 200 web unitários, typecheck, lint, build, 9 E2E, scanners, performance e wheel aprovados |
| Fix de quota | `b46017b` | banco-probe novo; `put.success` seguido de abort da mesma transação sob `quotaSize: 1`; re-review restrita limpa |
| Remediação round 1 | `ab97c79` | seis findings integrados; reauditoria ainda encontrou três Important |
| Remediação round 2 | `b5a2d9a` | três Important restantes corrigidos; check final sem novo Critical/Important; gates focados, sem nova regressão global |

O Ruff aprovado em `53e74f1` foi o escopo vigente do CI:

```powershell
python -m ruff check servidor tests/web_api
```

O comando literal global foi executado e falhou:

```powershell
python -m ruff check servidor tests
```

Resultado registrado: 296 violações preexistentes fora de `tests/web_api` — 273
`FURB157`, 12 `I001`, 5 `C408`, 3 `UP017`, 1 `B023`, 1 `PLR0402` e 1 `RUF100`.
Ele não é gate aprovado.

## Matriz S15

Os comandos abaixo são comandos de reprodução focada ou o gate que gerou a evidência.
Não afirmam que todos foram reexecutados em `b5a2d9a`.

| S15 | Estado | Teste e comando de reprodução | SHA/evidência |
|---:|---|---|---|
| 1. Três origens usam o mesmo caminho | PASS no escopo suportado | `npm --prefix web run test:e2e -- e2e/study-observed.spec.ts e2e/study-synthetic.spec.ts`; `resolvePortfolioSource.test.ts` e `buildPreviewRequest.test.ts` via `npm --prefix web run test:unit -- ...` | E2E em `53e74f1`; snapshots/autoria/proveniência remediados até `ff5ff17` e verificados focadamente até `b5a2d9a` |
| 2. Draft observado nunca executa | PASS | `npm --prefix web run test:unit -- src/cases/domain.test.ts src/preparation/resolvePortfolioSource.test.ts` | contratos em `9f8de9a`; resolução mantida na reauditoria `b5a2d9a` |
| 3. Snapshot preserva caso e premissas exatos | PASS | `npm --prefix web run test:unit -- src/study/executionService.test.ts src/study/validation.test.ts` | `56a95e4`, `630835c`, `ff5ff17`; gates focados registrados em `b5a2d9a` |
| 4. Alteração não reescreve execução anterior | PASS | `npm --prefix web run test:unit -- src/study/executionService.test.ts src/study/components/ExecutionHistory.test.tsx`; E2E observado | `401ed10`, `6ae7e7e`, `9a504c9`; E2E final focado registrado até `b5a2d9a` |
| 5. Resultado observado ausente é não informado | PASS | `npm --prefix web run test:unit -- src/cases/observedComparison.test.ts src/ui/ObservedComparisonTable.test.tsx` | estados alinhados em `709f966`; regressão integrada em `53e74f1` |
| 6. Incompatibilidade tem motivo | PASS | mesmo comando de S15.5 | `709f966`; regressão integrada em `53e74f1` |
| 7. Estudo, caso e execução sobrevivem a reload | PASS | `npm --prefix web run test:e2e -- e2e/study-observed.spec.ts e2e/study-synthetic.spec.ts`; `indexedDbApplicationRepository.test.ts` | E2E em `53e74f1`; autoria/snapshot reidratados em `6c1518f`/`ff5ff17` |
| 8. Duas abas não sobrescrevem revisões | PASS | `npm --prefix web run test:e2e -- e2e/study-concurrency.spec.ts`; `studyController.test.ts` | CAS E2E em `53e74f1`; quota corrigida em `b46017b`; navegação A→B remediada em `401ed10`/`6ae7e7e` |
| 9. Troca de conta não expõe dados | PASS | `npm --prefix web run test:e2e -- e2e/study-concurrency.spec.ts`; `providers.test.tsx` | duas identidades e retorno A/B em `53e74f1`; gates focados posteriores não alteraram auth |
| 10. Migration/corrupção sem perda silenciosa | PASS no modelo testado | `npm --prefix web run test:unit -- src/storage/migrations.test.ts src/storage/recovery.test.ts src/storage/productionRepository.test.ts`; E2E concorrência | fixtures reais em `53e74f1`; loader de produção ligado em `84e3773`; quota em `b46017b`. Não prova disco fisicamente cheio |
| 11. Python/TS/schemas concordam | PASS em `53e74f1` | `python -m servidor.export_openapi`; `npm --prefix web run generate:api`; `git diff --exit-code -- contracts web/src/api/generated.ts web/src/api/schemas.json web/src/api/validators.ts` | sem drift em `53e74f1`; remediação posterior restrita a `web/` e sem alteração de contrato Python |
| 12. Suítes e gates passam | **CONDITIONAL** | matriz de gates abaixo | globais em `53e74f1`, quota em `b46017b`, focados até `b5a2d9a`; não há gate integral único no SHA final |

## Gates e ressalvas

| Gate | Última evidência registrada | Decisão |
|---|---|---|
| export OpenAPI + generate API + diff | `53e74f1`, sem drift | aprovado naquele SHA |
| `python -m pytest -q` | `53e74f1`: 715 passed, 2 skipped | aprovado naquele SHA; não repetido em `b5a2d9a` |
| `python -O -m pytest -q` | `53e74f1`: 715 passed, 2 skipped | aprovado naquele SHA; não repetido em `b5a2d9a` |
| `python -m ruff check servidor tests/web_api` | `53e74f1` e remediação focada: aprovado | aprovado no escopo CI atual |
| `python -m ruff check servidor tests` | 296 violações legadas | **reprovado; exceção não aprovada** |
| `python -m mypy servidor` | `53e74f1`: 26 arquivos | aprovado naquele SHA |
| web unit | `53e74f1`: 200/200 em 30 arquivos; remediação: 117/16 e reauditoria 63/8 focados | aprovado proporcionalmente; global não repetido no SHA final |
| typecheck / lint / build | aprovados nos marcos globais e focados | aprovado; aviso conhecido de chunk > 500 kB |
| E2E local Chromium | `53e74f1`: 9/9; focados observado/concorrência após remediação | aprovado no ambiente controlado |
| E2E auth real | 1 skipped sem `MOT_REAL_AUTH_BASE_URL`, `MOT_REAL_AUTH_EMAIL`, `MOT_REAL_AUTH_PASSWORD` | **não aceito** |
| scanner bundle E2E/produção | `53e74f1`: 292/291 arquivos | aprovado naquele SHA |
| performance referência | `53e74f1`: 5 rodadas, p95 ≈ 11 ms, 8.012 bytes vs 5.000 ms | aprovado naquele SHA |
| wheel fora do checkout | `53e74f1` | aprovado naquele SHA |
| `git diff --check` | aprovado nos fechamentos e novamente no commit documental | gate documental final registrado no relatório T12 |

## Revisão crítica do fluxo completo

Rastreio confirmado por inspeção e pelos testes citados:

```text
PortfolioSource
→ resolvePortfolioSource; preparar no servidor quando houver geração
→ PortfolioSourceSnapshot/sourceFingerprint
→ ScenarioDocument/inputFingerprint
→ buildPreviewRequest + validação do PreviaRequest
→ StudyController.flush
→ reserva da tentativa por CAS
→ POST /api/v1/previas autenticado
→ executar_previa/adaptador/motor
→ PreviewEnvelope + validação de identidade da resposta
→ ExecutionRecord terminal + compareObservedToMotor
→ saveDetachedStudy/CAS/IndexedDB
→ StudyResultPage + histórico preservado
```

Os findings da auditoria em `b46017b` eram materiais e não foram reclassificados como
aceitos: snapshot histórico incompleto, conversão observada reamostrada, proveniência
achatada, resposta tardia A→B deixando reserva aberta, autoria não reidratada e fontes
legadas desconectadas do provider. Foram corrigidos até `ab97c79`. A reauditoria achou
três Important adicionais — correção por campo, fallback histórico permissivo e falso
`INTERRUPTED`/terminal duplicável — corrigidos até `ff5ff17`; o check final em
`b5a2d9a` não encontrou novo Critical/Important.

Limites ainda observáveis, sem inventar falha além da evidência:

- importação/confirmação de Caso Observado não tem tela nesta etapa; o seletor consome
  somente registros `CONFIRMED` fornecidos a montante;
- conflito é seguro e visível, mas a resolução de UI é recarregar/reaplicar; não há
  merge automático nem ação dedicada para salvar cópia;
- purge definitivo e limpeza integral da conta existem apenas na porta de repositório
  ou nas ferramentas do navegador, não como fluxo de produto;
- recuperação de tentativa interrompida é função/teste, não controle exposto na UI;
- quota é injeção controlada em banco-probe, não esgotamento físico;
- auth real continua sem evidência nesta revisão.

## Condições para merge e para aceite integral

### Antes de qualquer merge

1. publicar a revisão em PR sem alterar o escopo;
2. obter CI verde na revisão publicada;
3. revisar o diff documental e os limites conhecidos;
4. obter aprovação explícita do Gabriel.

Esses passos permitem decidir sobre o merge de um aceite **condicional**. Eles não
convertem automaticamente o estado em aceite integral.

### Para aceite integral da Etapa 2

1. executar a regressão global no SHA final da revisão;
2. executar `test:e2e:real` com o ambiente autorizado, sem registrar credenciais;
3. resolver as 296 violações do Ruff global ou aprovar explicitamente uma alteração
   do critério S15.12 que fixe o escopo `servidor tests/web_api`;
4. reunir os gates aprovados na mesma revisão publicada;
5. registrar nova decisão de aceite — este documento não pode ser interpretado como
   essa decisão futura.

## Handoff para a Etapa 3

A Etapa 3 **não foi iniciada**. Quando as condições acima forem satisfeitas e houver
autorização explícita, o ponto de partida é o plano mestre v2, seção 7:

- navegação Empresas/Estudos, resumo e histórico de Casos Observados;
- filtros, vínculos, cobertura e lacunas;
- Perfil Operacional versionado derivado de casos explicitamente selecionados;
- diagnóstico robusto com múltiplas repetições, progresso, cancelamento e separação
  entre distribuição e execução individual.

Contratos que devem ser preservados no handoff:

- `ApplicationRepository` continua a única porta de persistência; telas não acessam
  IndexedDB diretamente;
- snapshots e `ExecutionRecord` permanecem imutáveis e append-only;
- o perfil descreve observações; ordens produzidas dele continuam sintéticas;
- Observado × Motor continua independente do resultado do motor;
- ausência de dado não vira zero ou conclusão;
- uma quarta origem de carteira só entra após o Perfil Operacional ter contrato,
  versão, proveniência, migration e testes próprios;
- Etapa 3 exige sua própria especificação/plano aprovados; este handoff não autoriza
  código, issues ou mudanças no Linear.

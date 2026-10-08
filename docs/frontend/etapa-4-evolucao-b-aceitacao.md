# Aceitação técnica — Front-end Etapa 4 / Evolução B

Estado: **PASS para testes internos**. Não autoriza push, PR, merge, deploy ou uso
em produção.

## Base e escopo

- branch local: `codex/etapa-4-mvp`;
- candidato funcional antes do fechamento: `f19e86dc515d403e3555ce8fe217f7c301d3cbdc`;
- aceite: este commit da MOT-85;
- navegador: Chromium do Playwright 1.63.0;
- nenhuma mudança em `motor/`, schema HTTP ou migration.

Entregue em B: composição variável, edição individual, múltiplas hipóteses e
comparação estrutural agregada.

Posterior em A: Receita, V4 e linhagem formal somente para relações criadas pelo
novo contrato.

Posterior em C: repetições pareadas, incerteza, marginal e escala.

## Evidências

| Verificação | Resultado |
|---|---|
| `npm run test:unit` | 454 aprovados em 61 arquivos |
| `npm run lint` | aprovado |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; permanece apenas o aviso informativo de chunk > 500 kB |
| `stage4-evolution-b.spec.ts` | 2/2 aprovados; repetido uma segunda vez com 2/2 |
| Evolução B + regressão `stage4-mvp.spec.ts` | 4/4 aprovados |
| testes Python de preparação | 35 aprovados, 2 avisos de depreciação de dependências |
| cenário Amanda | baseline ~US$439k; netado ~US$249k; economia ~US$190k; netabilidade 58,82% |

O percurso Chromium cria um Estudo sintético com dois Perfis, cria duas hipóteses
nomeadas, remove B, adiciona C, altera A, executa base e hipótese, compara o diff
estrutural e os sete eixos, recarrega e confirma cenários, evidências e execuções.
A seleção do par volta vazia após reload, como decidido; ancestralidade e seleção
não foram introduzidas no V3.

O caso concorrente abre duas abas sobre a mesma revisão. Uma grava; a outra recebe
o conflito CAS e mantém nome, janela e ação de retry no formulário. A validação de
viewport estreita e zoom de 200% não encontrou overflow global. Labels, regiões,
foco inicial e tabelas roláveis são exercitados pelo Playwright e pelos testes de
componentes.

## Limites de interpretação

- `COMPOSITION_CHANGED` descreve carteiras diferentes; não atribui benefício a um
  participante.
- `UNPAIRED_DIAGNOSTICS` permanece explícito; não há inferência causal.
- valor indisponível continua indisponível, nunca zero.
- a fixture de volume foi mantida abaixo do limite contratual de 500 campos de
  proveniência por diagnóstico; esse limite já existia e não altera o produto.
- não houve nova varredura de 27.000 rodadas, porque nenhum arquivo do motor mudou.

## Decisão

**Evolução B concluída para testes internos.** O recorte vertical
adicionar/remover/editar → persistir → executar → comparar → recarregar está
reproduzido, e o conflito concorrente não perde o rascunho perdedor.

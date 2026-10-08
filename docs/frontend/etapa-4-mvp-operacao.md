# Operação — Front-end Etapa 4 MVP

Este guia descreve o recorte funcional entregue para testes internos. Ele não é uma
declaração de prontidão para produção nem uma projeção comercial.

## Fluxo 1 — hipótese sobre dados observados

1. Abra uma carteira criada a partir de um Caso Observado.
2. Em **Criar hipótese**, altere somente a janela e/ou um dos sete custos escalares.
3. Crie a hipótese e execute o diagnóstico do novo cenário.
4. Execute também o diagnóstico do cenário base.
5. Abra **Comparar cenários**, selecione explicitamente as duas execuções atuais e
   compare os sete eixos.

As ordens reais importadas e sua proveniência são preservadas exatamente. O MVP não
permite alterar volume, mix, ticket ou prazo de um Caso Observado.

## Fluxo 2 — simulação baseada em Perfil

1. Na carteira, escolha um ou mais Perfis ativos que possuam evidência anexada.
2. Informe finalidade OUT e IN de cada participante e prepare a simulação.
3. O sistema cria um **novo Estudo sintético**; ele não converte nem sobrescreve o
   Estudo observado que estava aberto.
4. No novo Estudo, crie uma hipótese alterando volume, mix OUT/IN, ticket, prazo,
   janela ou os sete custos escalares.
5. Execute base e hipótese e faça a comparação explícita.

Cada Perfil vira um participante congelado, com sua versão e evidência registradas
na linhagem. Alterações posteriores no Perfil não reescrevem o Estudo já criado.

## Como ler o resultado

- Os sete eixos são os mesmos do diagnóstico robusto da Etapa 3.
- O delta é sempre **hipótese menos base** e usa aritmética decimal.
- Uma métrica indisponível continua indisponível; não vira zero.
- O p50 de duas execuções sintéticas é uma comparação descritiva entre amostras
  independentes (`UNPAIRED_DIAGNOSTICS`), não um efeito causal pareado.
- Uma simulação baseada em Perfil é sintética e não deve ser chamada de forecast.
- Diferença entre cenários não prova causalidade, viabilidade comercial ou validade
  regulatória.

## O que fica para depois do MVP

O desenho preserva os contratos necessários para evoluir sem reescrever Estudos já
salvos:

- **Evolução A — histórico auditável e durável:** Receita imutável e versionada,
  endpoint próprio Perfil → Receita → materialização, origem tipada, fingerprints
  encadeados, `StudyDocument` V4, migrations transacionais, histórico append-only e
  concorrência específica em duas abas.
- **Evolução B — composição da carteira:** adicionar/remover Perfis, mudanças por
  participante, múltiplas hipóteses nomeadas, compatibilidade estrutural tipada e
  pareamento dos participantes comuns.
- **Evolução C — análise estatística e capacidade:** comparação canônica no servidor,
  seeds pareadas, distribuições 10/30/100 com incerteza, efeito marginal,
  benchmarks, caps medidos e endurecimento para produção.

Essas evoluções acrescentam capacidades sobre `Study`, `Scenario`, snapshots e
fingerprints versionados; não exigem transformar dados observados em sintéticos nem
alterar o significado dos cenários existentes.

## Limitação técnica observada no aceite

O backend vigente pode rejeitar algumas carteiras sintéticas aleatórias com custos
não nulos quando a decomposição por mecanismo não reconcilia por igualdade decimal
exata. A Etapa 4 não altera `motor/` nem `servidor/`; por isso o E2E de dez repetições
usa uma fixture economicamente neutra e PTAX válida. Isso não afeta a criação de
hipóteses ou o comparador, mas precisa de uma tarefa própria antes de usar esse
percurso como prova ampla de robustez econômica aleatória.

# Sensibilidade econômica da pool cambial

## Leitura em 30 segundos

A pool apresentou economia positiva em todas as 6.000 carteiras-ano analisadas,
inclusive quando retiramos spread, tarifa fixa e as duas alíquotas ainda incertas e
elevamos o carry de 4 para 25 bps.

Isso mostra que a tese econômica sobrevive aos testes realizados. Ainda não prova
viabilidade comercial. Fluxos, spread, tarifa e duas classificações de IOF continuam
sendo hipóteses que precisam ser substituídas por dados reais.

O risco mais importante é a composição da carteira. Pools com contraparte de entrada,
especialmente PSPs, apresentam economia maior. Uma carteira extremamente concentrada
em saídas continua positiva, mas sua margem conservadora cai para aproximadamente
3,5 bps. Nesse caso, custos não modelados ou uma tarifa do produto podem consumir o
benefício.

## O que foi analisado

- 27.000 carteiras-ano da varredura completa;
- cinco composições de carteira;
- 300 sementes por combinação;
- sensibilidade concentrada no lançamento com 8 e 12 clientes;
- janelas de 1 e 7 dias;
- oito cenários de custo;
- três escalas de fluxo: 0,5×, 1× e 2×;
- 144.000 projeções anuais em reais.

Cada ordem representa a posição líquida que o cliente decidiu enviar ao
orquestrador. Não existe uma segunda dedução de autonetting. Sem pool, cada posição
líquida executa sozinha; com pool, as posições dos diferentes participantes podem se
compensar.

## Carteira de referência

Referência de leitura: mix equilibrado, 12 clientes e janela de 7 dias.

| cenário | definição | fluxo anual usado | economia em bps | economia anual |
|---|---|---:|---:|---:|
| conservador | custos severos, fluxo 0,5× e p10 | R$ 235,3 mi | 30,6 bps | R$ 0,71 mi |
| central | custos atuais supostos, fluxo 1× e p50 | R$ 470,6 mi | 124,8 bps | R$ 5,85 mi |
| favorável | custos atuais supostos, fluxo 2× e p90 | R$ 941,1 mi | 134,8 bps | R$ 13,13 mi |

O intervalo acima não é previsão de receita nem intervalo estatístico de um único
caso. Ele combina escalas de fluxo e posições da distribuição para mostrar três
condições deliberadamente diferentes. Receita do produto dependerá da tarifa comercial
que ainda não foi definida.

## Comparação das carteiras

W=7 e fluxo central 1×. `Base p50` é a economia mediana usando os custos atuais
supostos. `Severo p10` é o resultado conservador depois de retirar os componentes
incertos e elevar o carry.

| composição | clientes | fluxo p50 suposto | base p10 | base p50 anual | severo p10 | severo p10 anual |
|---|---:|---:|---:|---:|---:|---:|
| equilibrado | 8 | R$ 332,7 mi | 116,8 bps | R$ 4,25 mi | 17,4 bps | R$ 0,56 mi |
| equilibrado | 12 | R$ 470,6 mi | 113,3 bps | R$ 5,85 mi | 30,6 bps | R$ 1,43 mi |
| retail pesado | 8 | R$ 188,4 mi | 109,1 bps | R$ 2,32 mi | 40,9 bps | R$ 0,76 mi |
| retail pesado | 12 | R$ 274,7 mi | 109,6 bps | R$ 3,32 mi | 37,0 bps | R$ 1,02 mi |
| corporativo pesado | 8 | R$ 343,0 mi | 78,4 bps | R$ 3,21 mi | 31,2 bps | R$ 1,04 mi |
| corporativo pesado | 12 | R$ 546,3 mi | 94,1 bps | R$ 5,90 mi | 45,7 bps | R$ 2,43 mi |
| PSP dominante | 8 | R$ 219,7 mi | 163,1 bps | R$ 3,92 mi | 67,3 bps | R$ 1,44 mi |
| PSP dominante | 12 | R$ 337,3 mi | 181,3 bps | R$ 6,45 mi | 62,7 bps | R$ 2,10 mi |
| outbound extremo | 8 | R$ 264,0 mi | 22,5 bps | R$ 0,73 mi | 3,9 bps | R$ 0,11 mi |
| outbound extremo | 12 | R$ 368,3 mi | 20,6 bps | R$ 0,89 mi | 3,5 bps | R$ 0,13 mi |

Todos os resultados severos permaneceram positivos nas 300 carteiras de cada célula.
O p10 significa que 90% das carteiras simuladas ficaram acima daquele resultado. Não
significa 90% dos meses nem probabilidade observada no mercado real.

## Decisões sugeridas

1. Continuar para a calibração comercial. A estrutura econômica é suficientemente
   positiva nos testes para justificar buscar dados reais e desenhar um piloto.
2. Não definir preço ou orçamento usando os valores em reais desta página. Eles usam
   fluxo sintético.
3. Priorizar uma carteira com entradas suficientes e diversidade de perfis. PSPs,
   exportadores e tesourarias podem funcionar como contraparte para fluxos de saída.
4. Não tratar uma carteira quase toda outbound como lançamento equivalente às demais.
   Seu piso de 3,5 bps deixa pouca margem para tarifa do produto e custos ausentes.
5. Escolher a janela principalmente pelo SLA do cliente. Entre W=1 e W=7, o efeito
   econômico foi pequeno na faixa de 8–12 clientes.

Os bps representam o benefício bruto antes da tarifa comercial do produto. Por isso,
podem ser lidos como um teto técnico de preço, não como recomendação de cobrança.

## Premissas que precisam estar ao lado dos números

| item | valor usado | situação |
|---|---:|---|
| spread do rail | 25 bps | suposição plausível, não cotação contratada |
| tarifa fixa por remessa | R$ 40 | suposição plausível para rail eficiente |
| carry | 4 bps | aproximadamente um dia de funding na referência utilizada |
| BENS/SERVIÇOS OUT | 38 bps | classificação agrupada e pendente de separação |
| ATIVOS VIRTUAIS OUT | 350 bps | fallback plausível, ainda não confirmado |
| fluxo anual | 0,5×, 1× e 2× do gerador | totalmente sintético |
| tamanho da primeira pool | 8–12 clientes | decisão de escopo, não carteira contratada |

As referências públicas de Wise, Nomad, AstroPay e Banco Central serviram somente
para verificar ordem de grandeza. Elas não foram tratadas como fluxo real da pool.

## Dados necessários para substituir as hipóteses

Para cada cliente candidato, o conjunto mínimo é:

- volume líquido anual ou mensal que seria enviado à pool;
- proporção de entradas e saídas;
- ticket e quantidade de posições;
- data em que a posição fica conhecida e data-limite;
- finalidade regulatória e indicação EFX;
- spread e tarifa fixa realmente substituídos;
- SLA máximo aceitável.

Também precisamos confirmar juridicamente as classificações de BENS/SERVIÇOS OUT e
ATIVOS VIRTUAIS OUT. Com esses dados, os custos podem ser reprecificados sem repetir a
varredura completa. A geração precisa ser refeita apenas se a composição, os tickets,
a cadência ou os prazos reais forem materialmente diferentes.

## O que ainda não pode ser afirmado

- qual será a receita do produto;
- qual tarifa deve ser cobrada;
- qual será a economia de uma empresa específica;
- se todos os participantes ganham sob uma regra de rateio, pois o rateio não foi
  definido;
- p99 confiável de espera, porque a borda do horizonte ainda contamina essa cauda;
- tratamento tributário definitivo das duas finalidades pendentes.

## Fontes e rastreabilidade

Os números desta página vêm de `resultados/sensibilidade/` e são reproduzidos pelos
scripts `sensibilidade_custo.py`, `estresse_sensibilidade.py` e
`projecao_fluxo_hipotetico.py`. O relatório técnico completo está em
`docs/RELATORIO-SENSIBILIDADE-CUSTO.md`.

Referências públicas de escala:

- Wise FY26: https://owners.wise.com/news-releases/news-release-details/wise-fy26-results
- Nomad: https://www.nomadglobal.com/quem-somos
- AstroPay: https://www.astropay.com/business
- Banco Central: https://www.bcb.gov.br/estatisticas/rankingcambioinstituicoes?ano=2026

"""Orquestração de netting + custo ao longo do horizonte, e varredura de cenários.

TODO(main, feito em conjunto): a partir de um `motor.dominio.Cenario`, iterar dia a
dia sobre `horizonte_dias`, aplicar `motor.netting` para produzir os `Ciclo` de cada
janela e `motor.custo` para precificá-los, agregando o resultado.

A varredura de múltiplos cenários (grid de misturas de arquétipos de cliente) é a
única função deste projeto autorizada a fazer I/O (escrever CSV). As funções de
simulação em si continuam puras.
"""

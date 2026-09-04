"""Netting multilateral de ordens dentro da janela fixa da política P0.

TODO(felipe/netting): para cada janela de `janela_dias`, casar as ordens OUT e IN
conhecidas (`bruto_out = soma dos OUT`, `bruto_in = soma dos IN`), produzindo o
`Ciclo` correspondente (`motor.dominio.Ciclo`) com `casado = min(bruto_out, bruto_in)`
e `residuo = abs(bruto_out - bruto_in)`.

Regra de importação: este módulo importa apenas `motor.dominio`. Nunca
`motor.custo`. Função pura — sem estado global, sem I/O.
"""

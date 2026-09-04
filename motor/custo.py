"""Custo de cada Ciclo produzido pelo netting: IOF, carry CNR e custo de oportunidade.

TODO(gabriel/custo): a partir de um `motor.dominio.Ciclo` e `motor.dominio.ParametrosCusto`,
calcular o custo do baseline (sem netting: IOF de todas as ordens OUT e IN
separadamente) e o custo netado (IOF apenas sobre o `residuo`, mais `carry_cnr`
sobre o `casado` e custo de oportunidade sobre o tempo de espera).

Regra de importação: este módulo importa apenas `motor.dominio`. Nunca
`motor.netting`. Função pura — sem estado global, sem I/O.
"""

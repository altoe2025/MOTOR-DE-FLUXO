"""Seis arquétipos de cliente usados para gerar ordens sintéticas (motor.geracao).

Os valores numéricos aqui (ticket, cadência, buffers) são estimativas nossas
para dar forma internamente consistente aos testes estatísticos — não são
dado observado da Amanda nem calibração de mercado real. Não os leia como tal.
"""

from __future__ import annotations

from decimal import Decimal

from motor.dominio import Arquetipo

REMESSA_OUTBOUND_MASSIVA = Arquetipo(
    nome="remessa_outbound_massiva",  # referência: Wise, Remessa Online
    p_out=0.90,
    ticket_mediana_brl=Decimal("15000"),
    ticket_sigma=0.6,
    cadencia_mensal=40,
    buffer_dias_min=3,
    buffer_dias_max=7,
    visibilidade_dias_min=0,
    visibilidade_dias_max=2,
    eh_efx=True,
    finalidade_out="ANEXO_V_REMESSA_TERCEIRO",  # remete para o beneficiário no exterior
    finalidade_in="ANEXO_V_DISPONIBILIDADE",  # recebe funding da própria operação
)

PSP_INBOUND = Arquetipo(
    nome="psp_inbound",  # referência: AstroPay
    p_out=0.30,
    ticket_mediana_brl=Decimal("500000"),
    ticket_sigma=0.8,
    cadencia_mensal=3,
    buffer_dias_min=20,
    buffer_dias_max=30,
    visibilidade_dias_min=5,
    visibilidade_dias_max=15,
    eh_efx=True,
    finalidade_out="ANEXO_V_REMESSA_TERCEIRO",  # paga o merchant lá fora
    finalidade_in="ANEXO_V_DISPONIBILIDADE",  # recebe a arrecadação
)

CRIPTO_NATIVE_SEM_FIAT = Arquetipo(
    nome="cripto_native_sem_fiat",  # referência: tipo ARK
    p_out=0.70,
    ticket_mediana_brl=Decimal("200000"),
    ticket_sigma=1.0,
    cadencia_mensal=15,
    buffer_dias_min=0,
    buffer_dias_max=1,
    visibilidade_dias_min=0,
    visibilidade_dias_max=0,
    eh_efx=True,
    finalidade_out="ANEXO_V_ATIVOS_VIRTUAIS",
    finalidade_in="ANEXO_V_ATIVOS_VIRTUAIS",  # mesma natureza nas duas pontas
)

PAYROLL_FORNECEDOR = Arquetipo(
    nome="payroll_fornecedor",  # referência: dLocal
    p_out=0.95,
    ticket_mediana_brl=Decimal("800000"),
    ticket_sigma=0.5,
    cadencia_mensal=4,
    buffer_dias_min=5,
    buffer_dias_max=10,
    visibilidade_dias_min=10,
    visibilidade_dias_max=15,
    eh_efx=True,
    finalidade_out="ANEXO_V_BENS_SERVICOS",  # paga fornecedor/folha lá fora
    finalidade_in="ANEXO_V_DISPONIBILIDADE",  # recebe funding para a folha
)

EXPORTADOR = Arquetipo(
    nome="exportador",  # recebível de comércio exterior
    p_out=0.10,
    ticket_mediana_brl=Decimal("1200000"),
    ticket_sigma=0.7,
    cadencia_mensal=2,
    buffer_dias_min=15,
    buffer_dias_max=30,
    visibilidade_dias_min=10,
    visibilidade_dias_max=20,
    eh_efx=False,
    # A ponta que define o arquétipo é a ENTRADA. Quando ele paga, é importação de
    # insumo — não "receita de exportação saindo do país", que era o que o campo
    # único produzia.
    finalidade_out="ANEXO_V_BENS_SERVICOS",
    finalidade_in="ANEXO_V_RECEITA_EXPORTACAO",  # isento — ver IOF_POR_FINALIDADE
)

TESOURARIA_CORPORATIVA = Arquetipo(
    nome="tesouraria_corporativa",
    p_out=0.50,
    ticket_mediana_brl=Decimal("3000000"),
    ticket_sigma=0.4,
    cadencia_mensal=1.5,
    buffer_dias_min=10,
    buffer_dias_max=20,
    visibilidade_dias_min=0,
    visibilidade_dias_max=5,
    eh_efx=False,
    finalidade_out="ANEXO_V_DISPONIBILIDADE",
    finalidade_in="ANEXO_V_DISPONIBILIDADE",  # move caixa próprio nos dois sentidos
)

TODOS = {
    a.nome: a
    for a in [
        REMESSA_OUTBOUND_MASSIVA,
        PSP_INBOUND,
        CRIPTO_NATIVE_SEM_FIAT,
        PAYROLL_FORNECEDOR,
        EXPORTADOR,
        TESOURARIA_CORPORATIVA,
    ]
}

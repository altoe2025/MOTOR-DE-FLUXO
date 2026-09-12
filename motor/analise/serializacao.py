"""Manifestos, compatibilidade e exportação canônica sem perda decimal."""

from __future__ import annotations

import csv
import dataclasses
import hashlib
import json
import re
import shutil
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from motor.analise.modelo import ManifestoExecucao, ModoAnalise, ResultadoCanonico
from motor.dominio import ParametrosCusto


SCHEMA_VERSION = "1.0.0"
_NOME_CSV_SEGURO = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\.csv", re.ASCII)
_DISPOSITIVO_DOS = re.compile(r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])", re.ASCII)
_COLUNAS_PROVENIENCIA = ("run_id", "schema_version", "hash_configuracao")


def _versao_instalada() -> str:
    try:
        return version("motor-de-fluxo")
    except PackageNotFoundError:
        return "desconhecida"


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class TabelaCsvCanonica:
    nome_arquivo: str
    colunas: tuple[str, ...]
    linhas: tuple[tuple[str, ...], ...]

    def __post_init__(self) -> None:
        if not isinstance(self.nome_arquivo, str) or not _NOME_CSV_SEGURO.fullmatch(
            self.nome_arquivo
        ):
            raise ValueError("nome_arquivo deve ser um nome CSV simples e seguro")
        basename = self.nome_arquivo.split(".", 1)[0].upper()
        if _DISPOSITIVO_DOS.fullmatch(basename):
            raise ValueError("nome_arquivo usa dispositivo DOS reservado")
        if not isinstance(self.colunas, tuple) or not self.colunas:
            raise ValueError("colunas deve ser uma tupla não vazia")
        if any(not isinstance(coluna, str) or not coluna for coluna in self.colunas):
            raise ValueError("colunas deve conter nomes não vazios")
        if len(set(self.colunas)) != len(self.colunas):
            raise ValueError("colunas não pode conter nomes duplicados")
        if not isinstance(self.linhas, tuple):
            raise ValueError("linhas deve ser uma tupla imutável")
        for linha in self.linhas:
            if not isinstance(linha, tuple) or len(linha) != len(self.colunas):
                raise ValueError("cada linha deve ser uma tupla com o tamanho de colunas")
            if any(not isinstance(celula, str) for celula in linha):
                raise ValueError("células CSV canônicas devem ser textos")


@dataclass(frozen=True)
class PacoteExecucao:
    manifesto: ManifestoExecucao
    resultados: tuple[ResultadoCanonico, ...]
    tabelas: tuple[TabelaCsvCanonica, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.resultados, tuple) or not self.resultados:
            raise ValueError("resultados deve conter um ou mais ResultadoCanonico")
        if not isinstance(self.tabelas, tuple):
            raise ValueError("tabelas deve ser uma tupla imutável")
        esperada = _identidade(self.manifesto)
        for indice, resultado in enumerate(self.resultados):
            recebida = _identidade(resultado.manifesto)
            if recebida != esperada:
                raise ValueError(
                    f"resultado incompatível no índice {indice}: "
                    f"esperado {_descrever_identidade(self.manifesto)}; "
                    f"recebido {_descrever_identidade(resultado.manifesto)}"
                )
        for tabela in self.tabelas:
            _validar_proveniencia_tabela(tabela, self.manifesto)


def _regras_iof_jsonaveis(custo: ParametrosCusto) -> list[dict[str, str]]:
    regras = (
        {
            "finalidade": finalidade,
            "direcao": direcao.value,
            "aliquota": format(aliquota, "f"),
        }
        for (finalidade, direcao), aliquota in custo.iof_por_finalidade.items()
    )
    return sorted(regras, key=lambda regra: (regra["finalidade"], regra["direcao"]))


def _parametros_custo_jsonaveis(custo: ParametrosCusto) -> dict[str, object]:
    return {
        campo.name: (
            _regras_iof_jsonaveis(custo)
            if campo.name == "iof_por_finalidade"
            else _jsonavel(getattr(custo, campo.name))
        )
        for campo in dataclasses.fields(custo)
    }


def _jsonavel(valor: object) -> object:
    if isinstance(valor, Decimal):
        return format(valor, "f")
    if isinstance(valor, ParametrosCusto):
        return _parametros_custo_jsonaveis(valor)
    if dataclasses.is_dataclass(valor) and not isinstance(valor, type):
        return {
            campo.name: _jsonavel(getattr(valor, campo.name))
            for campo in dataclasses.fields(valor)
        }
    if isinstance(valor, Enum):
        return valor.value
    if isinstance(valor, Mapping):
        if any(not isinstance(chave, str) for chave in valor):
            raise TypeError("mapeamentos canônicos exigem chaves textuais")
        return {chave: _jsonavel(valor[chave]) for chave in sorted(valor)}
    if isinstance(valor, (tuple, list)):
        return [_jsonavel(item) for item in valor]
    if valor is None or isinstance(valor, (str, int, float, bool)):
        return valor
    raise TypeError(f"tipo não serializável canonicamente: {type(valor).__name__}")


def _json_canonico(valor: object) -> str:
    return json.dumps(
        _jsonavel(valor), ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    )


def resultado_para_json(resultado: object) -> str:
    """Serializa contratos analíticos com Decimals em texto exato."""
    return _json_canonico(resultado)


def escrever_json(resultado: object, path: str | Path) -> None:
    Path(path).write_text(resultado_para_json(resultado), encoding="utf-8")


def escrever_csv_canonico(tabela: TabelaCsvCanonica, path: str | Path) -> None:
    with Path(path).open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, lineterminator="\n")
        escritor.writerow(tabela.colunas)
        escritor.writerows(tabela.linhas)


def _validar_nomes_tabelas_unicos(tabelas: Sequence[TabelaCsvCanonica]) -> None:
    vistos: set[str] = set()
    for tabela in tabelas:
        nome_normalizado = tabela.nome_arquivo.casefold()
        if nome_normalizado in vistos:
            raise ValueError(f"nome_arquivo duplicado: {tabela.nome_arquivo!r}")
        vistos.add(nome_normalizado)


def _escrever_conjunto(pacote: PacoteExecucao, diretorio: Path) -> None:
    for indice, resultado in enumerate(pacote.resultados, start=1):
        escrever_json(resultado, diretorio / f"resultado-{indice}.json")
    for tabela in pacote.tabelas:
        escrever_csv_canonico(tabela, diretorio / tabela.nome_arquivo)
    escrever_json(pacote.manifesto, diretorio / "manifesto.json")


def _identidade_documento(documento: Mapping[str, object]) -> tuple[object, object, object]:
    return (
        documento.get("run_id"),
        documento.get("schema_version"),
        documento.get("hash_configuracao"),
    )


def _validar_conjunto_publicado(pacote: PacoteExecucao, diretorio: Path) -> None:
    nomes_esperados = {
        "manifesto.json",
        *(f"resultado-{indice}.json" for indice in range(1, len(pacote.resultados) + 1)),
        *(tabela.nome_arquivo for tabela in pacote.tabelas),
    }
    nomes_recebidos = {path.name for path in diretorio.iterdir() if path.is_file()}
    if nomes_recebidos != nomes_esperados:
        raise ValueError(
            "conjunto materializado incompleto: "
            f"esperado {sorted(nomes_esperados)}; recebido {sorted(nomes_recebidos)}"
        )

    identidade_esperada = _identidade(pacote.manifesto)
    manifesto_documento = json.loads(
        (diretorio / "manifesto.json").read_text(encoding="utf-8")
    )
    if not isinstance(manifesto_documento, dict) or (
        _identidade_documento(manifesto_documento) != identidade_esperada
    ):
        raise ValueError("identidade materializada do manifesto é incompatível")

    for indice in range(1, len(pacote.resultados) + 1):
        documento = json.loads(
            (diretorio / f"resultado-{indice}.json").read_text(encoding="utf-8")
        )
        manifesto_resultado = (
            documento.get("manifesto") if isinstance(documento, dict) else None
        )
        if not isinstance(manifesto_resultado, dict) or (
            _identidade_documento(manifesto_resultado) != identidade_esperada
        ):
            raise ValueError(
                f"identidade materializada do resultado {indice} é incompatível"
            )

    esperados = dict(zip(_COLUNAS_PROVENIENCIA, identidade_esperada, strict=True))
    for tabela in pacote.tabelas:
        with (diretorio / tabela.nome_arquivo).open(
            encoding="utf-8", newline=""
        ) as arquivo:
            leitor = csv.reader(arquivo)
            try:
                colunas = next(leitor)
            except StopIteration as erro:
                raise ValueError(
                    f"tabela {tabela.nome_arquivo!r} materializada sem cabeçalho"
                ) from erro
            if len(colunas) != len(set(colunas)) or any(
                nome not in colunas for nome in _COLUNAS_PROVENIENCIA
            ):
                raise ValueError(
                    f"proveniência materializada inválida em {tabela.nome_arquivo!r}"
                )
            indices = {nome: colunas.index(nome) for nome in _COLUNAS_PROVENIENCIA}
            for numero, linha in enumerate(leitor, start=1):
                if len(linha) != len(colunas) or any(
                    linha[indices[nome]] != valor for nome, valor in esperados.items()
                ):
                    raise ValueError(
                        "proveniência materializada incompatível em "
                        f"{tabela.nome_arquivo!r}, linha {numero}"
                    )


def _temporario_esta_dentro_da_raiz(temporario: Path, destino_raiz: Path) -> bool:
    temporario_resolvido = temporario.resolve()
    raiz_resolvida = destino_raiz.resolve()
    return (
        temporario_resolvido != raiz_resolvida
        and temporario_resolvido.is_relative_to(raiz_resolvida)
    )


def publicar_execucao(pacote: PacoteExecucao, destino_raiz: Path) -> Path:
    """Materializa e promove atomicamente um pacote analítico canônico."""
    _validar_nomes_tabelas_unicos(pacote.tabelas)
    destino_raiz = Path(destino_raiz)
    destino_raiz.mkdir(parents=True, exist_ok=True)
    final = destino_raiz / pacote.manifesto.run_id
    if final.resolve().parent != destino_raiz.resolve():
        raise ValueError("run_id deve identificar um diretório filho de destino_raiz")
    if final.exists():
        raise FileExistsError(final)

    temporario = Path(tempfile.mkdtemp(prefix=".motor-", dir=destino_raiz))
    try:
        _escrever_conjunto(pacote, temporario)
        _validar_conjunto_publicado(pacote, temporario)
        if final.exists():
            raise FileExistsError(final)
        temporario.replace(final)
        return final
    except Exception:
        if temporario.exists() and _temporario_esta_dentro_da_raiz(
            temporario, destino_raiz
        ):
            shutil.rmtree(temporario)
        raise


def _configuracao_manifesto(manifesto: ManifestoExecucao) -> dict[str, object]:
    return {
        campo.name: getattr(manifesto, campo.name)
        for campo in dataclasses.fields(manifesto)
        if campo.name not in {"run_id", "criado_em_utc", "hash_configuracao"}
    }


def _hash_configuracao(manifesto: ManifestoExecucao) -> str:
    conteudo = _json_canonico(_configuracao_manifesto(manifesto)).encode("utf-8")
    return hashlib.sha256(conteudo).hexdigest()


def _instante_utc(relogio: Callable[[], datetime]) -> datetime:
    instante = relogio()
    if not isinstance(instante, datetime) or instante.tzinfo is None:
        raise ValueError("relogio deve retornar datetime com fuso horário")
    return instante.astimezone(timezone.utc)


def _texto_instante(instante: datetime) -> str:
    return instante.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _prefixo_run_id(instante: datetime) -> str:
    return instante.strftime("%Y%m%dT%H%M%S.%fZ")


def criar_manifesto(
    *,
    parametros_custo: ParametrosCusto,
    mixes: tuple[str, ...],
    arquetipos: tuple[str, ...],
    horizonte_dias: int,
    periodo_medicao_dias: int,
    janela_dias: int,
    seeds: tuple[int, ...],
    modo_analise: ModoAnalise,
    custo_calibrado: bool,
    metodo_percentil: str,
    drenagem: str,
    avisos: tuple[str, ...] = (),
    run_ids_origem: tuple[str, ...] = (),
    relogio: Callable[[], datetime] = _agora_utc,
    versao_motor: str | None = None,
    schema_version: str = SCHEMA_VERSION,
) -> ManifestoExecucao:
    """Cria manifesto autocontido com identidade derivada da configuração."""
    instante = _instante_utc(relogio)
    versao = _versao_instalada() if versao_motor is None else versao_motor
    if not versao or not schema_version:
        raise ValueError("versao_motor e schema_version devem ser textos não vazios")
    provisório = ManifestoExecucao(
        run_id="pendente",
        schema_version=schema_version,
        versao_motor=versao,
        criado_em_utc=_texto_instante(instante),
        hash_configuracao="pendente",
        run_ids_origem=run_ids_origem,
        parametros_custo=parametros_custo,
        mixes=mixes,
        arquetipos=arquetipos,
        horizonte_dias=horizonte_dias,
        periodo_medicao_dias=periodo_medicao_dias,
        janela_dias=janela_dias,
        seeds=seeds,
        modo_analise=modo_analise,
        custo_calibrado=custo_calibrado,
        metodo_percentil=metodo_percentil,
        drenagem=drenagem,
        avisos=avisos,
    )
    hash_configuracao = _hash_configuracao(provisório)
    return replace(
        provisório,
        run_id=f"{_prefixo_run_id(instante)}-{hash_configuracao[:12]}",
        hash_configuracao=hash_configuracao,
    )


def reidentificar_manifesto(
    manifesto: ManifestoExecucao, **alteracoes: object
) -> ManifestoExecucao:
    """Recalcula a identidade após uma alteração oficial de configuração."""
    atualizado = replace(manifesto, **alteracoes)
    hash_configuracao = _hash_configuracao(atualizado)
    instante = datetime.fromisoformat(atualizado.criado_em_utc.replace("Z", "+00:00"))
    if instante.tzinfo is None:
        raise ValueError("criado_em_utc do manifesto deve informar UTC")
    return replace(
        atualizado,
        run_id=f"{_prefixo_run_id(instante.astimezone(timezone.utc))}-{hash_configuracao[:12]}",
        hash_configuracao=hash_configuracao,
    )


def _identidade(manifesto: ManifestoExecucao) -> tuple[str, str, str]:
    return manifesto.run_id, manifesto.schema_version, manifesto.hash_configuracao


def _descrever_identidade(manifesto: ManifestoExecucao) -> str:
    return (
        f"run_id={manifesto.run_id!r}, hash={manifesto.hash_configuracao!r}, "
        f"schema={manifesto.schema_version!r}"
    )


def validar_compatibilidade(manifestos: Sequence[ManifestoExecucao]) -> None:
    manifestos = tuple(manifestos)
    if not manifestos:
        raise ValueError("ao menos um manifesto é obrigatório")
    for manifesto in manifestos:
        if not isinstance(manifesto.run_id, str) or not manifesto.run_id.strip():
            raise ValueError(f"run_id ausente: {_descrever_identidade(manifesto)}")
    referencia = manifestos[0]
    for manifesto in manifestos[1:]:
        if manifesto.schema_version != referencia.schema_version:
            raise ValueError(
                "schema_version incompatível: "
                f"{_descrever_identidade(referencia)} versus "
                f"{_descrever_identidade(manifesto)}"
            )
        if manifesto.hash_configuracao != referencia.hash_configuracao:
            raise ValueError(
                "hash_configuracao incompatível: "
                f"{_descrever_identidade(referencia)} versus "
                f"{_descrever_identidade(manifesto)}"
            )


def _validar_proveniencia_tabela(
    tabela: TabelaCsvCanonica, manifesto: ManifestoExecucao
) -> None:
    ausentes = [nome for nome in _COLUNAS_PROVENIENCIA if nome not in tabela.colunas]
    if ausentes:
        raise ValueError(
            f"tabela {tabela.nome_arquivo!r} sem proveniência: faltam {ausentes}"
        )
    indices = {nome: tabela.colunas.index(nome) for nome in _COLUNAS_PROVENIENCIA}
    esperados = {
        "run_id": manifesto.run_id,
        "schema_version": manifesto.schema_version,
        "hash_configuracao": manifesto.hash_configuracao,
    }
    for numero, linha in enumerate(tabela.linhas, start=1):
        divergentes = [
            nome for nome, indice in indices.items() if linha[indice] != esperados[nome]
        ]
        if divergentes:
            raise ValueError(
                f"tabela {tabela.nome_arquivo!r}, linha {numero}, tem proveniência "
                f"incompatível em {divergentes}: {_descrever_identidade(manifesto)}"
            )

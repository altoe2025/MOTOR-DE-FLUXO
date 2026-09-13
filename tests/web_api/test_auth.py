from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from servidor.auth import (
    AccessDenied,
    AuthenticatedUser,
    AuthUnavailable,
    JWKSTokenVerifier,
    SessionInvalid,
)
from servidor.config import Settings

USER_ID = UUID("00000000-0000-4000-8000-000000000101")
OTHER_ID = UUID("00000000-0000-4000-8000-000000000102")
NOW = datetime(2026, 9, 13, 2, 30, tzinfo=UTC)
ISSUER = "https://projeto.supabase.co/auth/v1"


def settings(**changes: object) -> Settings:
    values = {
        "app_env": "test",
        "supabase_url": "https://projeto.supabase.co",
        "supabase_jwt_issuer": ISSUER,
        "supabase_jwt_audience": "authenticated",
        "supabase_allowed_user_ids": frozenset({USER_ID}),
        "motor_build_sha": "a" * 40,
        "web_dist_dir": None,
    }
    values.update(changes)
    return Settings.model_validate(values)


@pytest.fixture
def keys():
    private = ec.generate_private_key(ec.SECP256R1())
    jwk = jwt.algorithms.ECAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk.update(kid="key-1", use="sig", alg="ES256")
    return private, jwk


def token(private, **claims: object) -> str:
    payload = {
        "iss": ISSUER,
        "aud": "authenticated",
        "sub": str(USER_ID),
        "role": "authenticated",
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + timedelta(minutes=15)).timestamp()),
    }
    payload.update(claims)
    return jwt.encode(payload, private, algorithm="ES256", headers={"kid": "key-1"})


def verifier(keys, handler=None) -> JWKSTokenVerifier:
    _, jwk = keys
    if handler is None:
        handler = lambda request: httpx.Response(200, json={"keys": [jwk]})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return JWKSTokenVerifier(settings(), client=client, relogio=lambda: NOW)


def test_verifica_es256_e_retorna_uuid_permitido(keys):
    private, _ = keys

    user = verifier(keys).verify(token(private))

    assert user.user_id == USER_ID


@pytest.mark.parametrize(
    ("changes", "error"),
    [
        ({"exp": int((NOW - timedelta(seconds=1)).timestamp())}, SessionInvalid),
        ({"iat": int((NOW + timedelta(seconds=31)).timestamp())}, SessionInvalid),
        ({"nbf": int((NOW + timedelta(seconds=1)).timestamp())}, SessionInvalid),
        ({"iss": "https://outro.supabase.co/auth/v1"}, SessionInvalid),
        ({"aud": "outro"}, SessionInvalid),
        ({"aud": ["authenticated"]}, SessionInvalid),
        ({"role": "service_role"}, SessionInvalid),
        ({"is_anonymous": True}, SessionInvalid),
        ({"is_anonymous": "true"}, SessionInvalid),
        ({"sub": "não-e-uuid"}, SessionInvalid),
    ],
)
def test_rejeita_claims_invalidas(keys, changes, error):
    private, _ = keys

    with pytest.raises(error):
        verifier(keys).verify(token(private, **changes))


def test_rejeita_uuid_fora_da_allowlist(keys):
    private, _ = keys

    with pytest.raises(AccessDenied):
        verifier(keys).verify(token(private, sub=str(OTHER_ID)))


def test_rejeita_assinatura_errada_sem_refazer_jwks(keys):
    private_errada = ec.generate_private_key(ec.SECP256R1())
    chamadas = 0
    _, jwk = keys

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        return httpx.Response(200, json={"keys": [jwk]})

    autenticador = verifier(keys, responder)

    with pytest.raises(SessionInvalid):
        autenticador.verify(token(private_errada))
    assert chamadas == 1


def test_rejeita_algoritmo_e_urls_de_chave_indicados_pelo_token(keys):
    private, _ = keys
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        return httpx.Response(500)

    autenticador = verifier(keys, responder)
    hs256 = jwt.encode(
        {
            "iss": ISSUER,
            "aud": "authenticated",
            "sub": str(USER_ID),
            "role": "authenticated",
            "iat": int(NOW.timestamp()),
            "exp": int((NOW + timedelta(minutes=15)).timestamp()),
        },
        "segredo-que-nao-deve-ser-aceito-32b",
        algorithm="HS256",
        headers={"kid": "key-1"},
    )
    remoto = jwt.encode(
        jwt.decode(token(private), options={"verify_signature": False}),
        private,
        algorithm="ES256",
        headers={"kid": "key-1", "jku": "https://atacante.example/jwks"},
    )

    with pytest.raises(SessionInvalid):
        autenticador.verify(hs256)
    with pytest.raises(SessionInvalid):
        autenticador.verify(remoto)
    assert chamadas == 0


def test_rejeita_token_sem_assinatura_sem_consultar_jwks(keys):
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        return httpx.Response(500)

    unsigned = jwt.encode(
        {
            "iss": ISSUER,
            "aud": "authenticated",
            "sub": str(USER_ID),
            "role": "authenticated",
            "iat": int(NOW.timestamp()),
            "exp": int((NOW + timedelta(minutes=15)).timestamp()),
        },
        key="",
        algorithm="none",
        headers={"kid": "key-1"},
    )

    with pytest.raises(SessionInvalid):
        verifier(keys, responder).verify(unsigned)
    assert chamadas == 0


def test_indisponibilidade_sem_cache_valido_retorna_auth_indisponivel(keys):
    private, _ = keys

    def indisponivel(request):
        raise httpx.ConnectError("offline", request=request)

    with pytest.raises(AuthUnavailable):
        verifier(keys, indisponivel).verify(token(private))


def test_cache_jwks_e_usado_dentro_do_ttl(keys):
    private, jwk = keys
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        if chamadas > 1:
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"keys": [jwk]})

    autenticador = verifier(keys, responder)

    autenticador.verify(token(private))
    autenticador.verify(token(private))

    assert chamadas == 1


def test_configuracao_rejeita_issuer_de_outro_projeto():
    with pytest.raises(ValueError, match="SUPABASE_JWT_ISSUER"):
        settings(supabase_jwt_issuer="https://outro.supabase.co/auth/v1")


def test_settings_le_allowlist_separada_por_virgula(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SUPABASE_URL", "https://projeto.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setenv("SUPABASE_ALLOWED_USER_IDS", f"{USER_ID},{OTHER_ID}")
    monkeypatch.setenv("MOTOR_BUILD_SHA", "a" * 40)

    configured = Settings()

    assert configured.supabase_allowed_user_ids == frozenset({USER_ID, OTHER_ID})


def test_settings_le_arquivo_env_local(tmp_path, monkeypatch):
    for name in (
        "APP_ENV",
        "SUPABASE_URL",
        "SUPABASE_JWT_ISSUER",
        "SUPABASE_JWT_AUDIENCE",
        "SUPABASE_ALLOWED_USER_IDS",
        "MOTOR_BUILD_SHA",
        "WEB_DIST_DIR",
    ):
        monkeypatch.delenv(name, raising=False)
    (tmp_path / ".env").write_text(
        "\n".join(
            (
                "APP_ENV=test",
                "SUPABASE_URL=https://projeto.supabase.co",
                f"SUPABASE_JWT_ISSUER={ISSUER}",
                "SUPABASE_JWT_AUDIENCE=authenticated",
                f"SUPABASE_ALLOWED_USER_IDS={USER_ID}",
                f"MOTOR_BUILD_SHA={'a' * 40}",
            )
        ),
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    configured = Settings()

    assert configured.app_env == "test"
    assert configured.supabase_allowed_user_ids == frozenset({USER_ID})


def test_cache_expirado_nao_e_usado_se_jwks_ficar_indisponivel(keys):
    private, jwk = keys
    now = [NOW]
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        if chamadas > 1:
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"keys": [jwk]})

    client = httpx.Client(transport=httpx.MockTransport(responder))
    autenticador = JWKSTokenVerifier(
        settings(), client=client, relogio=lambda: now[0]
    )
    autenticador.verify(token(private))
    now[0] += timedelta(minutes=5, seconds=1)

    with pytest.raises(AuthUnavailable):
        autenticador.verify(token(private))


def test_rotacao_de_kid_concorrente_faz_um_unico_refresh(keys):
    import threading

    private, jwk = keys
    private_new = ec.generate_private_key(ec.SECP256R1())
    jwk_new = jwt.algorithms.ECAlgorithm.to_jwk(
        private_new.public_key(), as_dict=True
    )
    jwk_new.update(kid="key-2", use="sig", alg="ES256")
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        keys_atual = [jwk] if chamadas == 1 else [jwk, jwk_new]
        return httpx.Response(200, json={"keys": keys_atual})

    client = httpx.Client(transport=httpx.MockTransport(responder))
    autenticador = JWKSTokenVerifier(settings(), client=client, relogio=lambda: NOW)
    autenticador.verify(token(private))
    token_new = jwt.encode(
        {
            "iss": ISSUER,
            "aud": "authenticated",
            "sub": str(USER_ID),
            "role": "authenticated",
            "iat": int(NOW.timestamp()),
            "exp": int((NOW + timedelta(minutes=15)).timestamp()),
        },
        private_new,
        algorithm="ES256",
        headers={"kid": "key-2"},
    )
    users: list[AuthenticatedUser] = []
    threads = [
        threading.Thread(target=lambda: users.append(autenticador.verify(token_new)))
        for _ in range(6)
    ]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=5)

    assert len(users) == 6
    assert chamadas == 2


def test_kid_inexistente_nao_dispara_refresh_repetido_dentro_do_ttl(keys):
    private, jwk = keys
    chamadas = 0

    def responder(request):
        nonlocal chamadas
        chamadas += 1
        return httpx.Response(200, json={"keys": [jwk]})

    client = httpx.Client(transport=httpx.MockTransport(responder))
    autenticador = JWKSTokenVerifier(settings(), client=client, relogio=lambda: NOW)
    desconhecido = jwt.encode(
        jwt.decode(token(private), options={"verify_signature": False}),
        private,
        algorithm="ES256",
        headers={"kid": "inexistente"},
    )

    with pytest.raises(SessionInvalid):
        autenticador.verify(desconhecido)
    with pytest.raises(SessionInvalid):
        autenticador.verify(desconhecido)

    assert chamadas == 1

"""Autenticação local de access tokens Supabase por ES256/JWKS."""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Protocol
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from servidor.config import Settings


class SessionInvalid(ValueError):
    """O token não comprova uma sessão aceita."""


class AccessDenied(ValueError):
    """A sessão é válida, mas o usuário não está autorizado."""


class AuthUnavailable(RuntimeError):
    """Não foi possível obter uma chave válida dentro do TTL."""


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID


class TokenVerifier(Protocol):
    def verify(self, token: str) -> AuthenticatedUser: ...


class JWKSTokenVerifier:
    """Valida assinatura e claims sem confiar em algoritmos indicados pelo token."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.Client | None = None,
        relogio: Callable[[], datetime] | None = None,
        ttl: timedelta = timedelta(minutes=5),
    ) -> None:
        self._settings = settings
        self._client = client or httpx.Client(timeout=5.0)
        self._relogio = relogio or (lambda: datetime.now(UTC))
        self._ttl = ttl
        self._lock = threading.Lock()
        self._keys: dict[str, jwt.PyJWK] = {}
        self._missing_kids: set[str] = set()
        self._expires_at: datetime | None = None

    def close(self) -> None:
        self._client.close()

    def _refresh_locked(self, now: datetime) -> None:
        try:
            response = self._client.get(self._settings.jwks_url, timeout=5.0)
            response.raise_for_status()
            document = response.json()
            values = document.get("keys") if isinstance(document, dict) else None
            if not isinstance(values, list):
                raise TypeError("JWKS sem lista keys")
            keys: dict[str, jwt.PyJWK] = {}
            for value in values:
                if not isinstance(value, dict):
                    continue
                kid = value.get("kid")
                if (
                    isinstance(kid, str)
                    and value.get("alg") == "ES256"
                    and value.get("use", "sig") == "sig"
                ):
                    keys[kid] = jwt.PyJWK.from_dict(value, algorithm="ES256")
            if not keys:
                raise ValueError("JWKS sem chave ES256 utilizável")
        except (httpx.HTTPError, TypeError, ValueError, jwt.PyJWTError) as error:
            raise AuthUnavailable("não foi possível atualizar JWKS") from error
        self._keys = keys
        self._missing_kids.clear()
        self._expires_at = now + self._ttl

    def _key_for(self, kid: str) -> jwt.PyJWK:
        now = self._relogio()
        if now.tzinfo is None:
            raise AuthUnavailable("relógio de autenticação sem fuso")
        with self._lock:
            cache_valid = self._expires_at is not None and now < self._expires_at
            if cache_valid and kid in self._keys:
                return self._keys[kid]
            if cache_valid and kid in self._missing_kids:
                raise SessionInvalid("kid não reconhecido")
            self._refresh_locked(now)
            try:
                return self._keys[kid]
            except KeyError as error:
                self._missing_kids.add(kid)
                raise SessionInvalid("kid não reconhecido") from error

    @staticmethod
    def _numeric_date(payload: dict[str, object], name: str) -> float:
        value = payload.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise SessionInvalid(f"claim {name} inválida")
        return float(value)

    def verify(self, token: str) -> AuthenticatedUser:
        if not isinstance(token, str) or not token:
            raise SessionInvalid("token ausente")
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise SessionInvalid("header JWT inválido") from error
        if (
            header.get("alg") != "ES256"
            or not isinstance(header.get("kid"), str)
            or "jku" in header
            or "x5u" in header
        ):
            raise SessionInvalid("header JWT não permitido")
        key = self._key_for(header["kid"])
        try:
            payload = jwt.decode(
                token,
                key=key.key,
                algorithms=["ES256"],
                audience=self._settings.supabase_jwt_audience,
                issuer=self._settings.supabase_jwt_issuer,
                options={
                    "require": ["iss", "aud", "exp", "iat", "sub", "role"],
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                },
            )
        except jwt.PyJWTError as error:
            raise SessionInvalid("assinatura ou claims JWT inválidas") from error

        now = self._relogio()
        now_timestamp = now.timestamp()
        if self._numeric_date(payload, "exp") <= now_timestamp:
            raise SessionInvalid("token expirado")
        if self._numeric_date(payload, "iat") > now_timestamp + 30:
            raise SessionInvalid("iat no futuro")
        if "nbf" in payload and self._numeric_date(payload, "nbf") > now_timestamp:
            raise SessionInvalid("token ainda não válido")
        if payload.get("aud") != "authenticated":
            raise SessionInvalid("audience não permitida")
        if payload.get("role") != "authenticated":
            raise SessionInvalid("role não permitida")
        anonymous = payload.get("is_anonymous")
        if anonymous is not None and anonymous is not False:
            raise SessionInvalid("usuário anônimo não permitido")
        try:
            user_id = UUID(str(payload.get("sub")))
        except ValueError as error:
            raise SessionInvalid("sub não é UUID") from error
        if user_id not in self._settings.supabase_allowed_user_ids:
            raise AccessDenied("usuário fora da allowlist")
        return AuthenticatedUser(user_id)


_BEARER = HTTPBearer(auto_error=False)
BearerCredentials = Annotated[
    HTTPAuthorizationCredentials | None,
    Depends(_BEARER),
]


def require_user(
    request: Request,
    credentials: BearerCredentials,
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise SessionInvalid("Bearer ausente")
    verifier: TokenVerifier = request.app.state.token_verifier
    return verifier.verify(credentials.credentials)

"""Política do browser da aplicação de origem única, sem segredos de runtime."""

from servidor.config import Settings


def security_headers(settings: Settings) -> dict[str, str]:
    """Somente a origem pública validada do Supabase pode ampliar connect-src."""
    directives = (
        "default-src 'self'",
        "script-src 'self'",
        # ECharts e os controles do Replay aplicam estilos dinâmicos no DOM.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        f"connect-src 'self' {settings.supabase_url}",
        # O build Vite publica o worker XLSX como asset da mesma origem.
        "worker-src 'self'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    )
    return {
        "Content-Security-Policy": "; ".join(directives) + ";",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }

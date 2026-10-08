import pytest


@pytest.mark.parametrize("environ,host,port", [
    ({}, "127.0.0.1", 8000),
    ({"APP_ENV": "production", "PORT": "10000"}, "0.0.0.0", 10000),
    ({"APP_ENV": "production"}, "0.0.0.0", 8000),
    ({"APP_ENV": "test", "HOST": "localhost", "PORT": "65535"}, "localhost", 65535),
    ({"HOST": "::1", "PORT": "1"}, "::1", 1),
])
def test_parse_server_options_is_pure(environ, host, port, monkeypatch):
    from servidor.__main__ import parse_server_options

    monkeypatch.setenv("HOST", "ambient-host")
    monkeypatch.setenv("PORT", "9000")
    original = dict(environ)
    options = parse_server_options(environ)
    assert (options.host, options.port) == (host, port)
    assert environ == original


@pytest.mark.parametrize("port", [
    "", "0", "65536", "-1", "1.5", "abc", " 8000", "8000\n", "+80", "８０",
    pytest.param("9" * 5000, id="oversized-integer"),
])
def test_invalid_port_fails_before_starting_uvicorn(port, monkeypatch):
    from servidor.__main__ import main

    monkeypatch.setenv("PORT", port)
    called = []
    monkeypatch.setattr("uvicorn.run", lambda *args, **kwargs: called.append(kwargs))
    with pytest.raises(ValueError, match="PORT"):
        main()
    assert called == []


@pytest.mark.parametrize("environ", [{"APP_ENV": "prod"}, {"HOST": ""}, {"HOST": "a\nb"}])
def test_rejects_invalid_environment_or_host(environ):
    from servidor.__main__ import parse_server_options

    with pytest.raises(ValueError):
        parse_server_options(environ)


def test_servidor_usa_um_worker_e_nao_registra_query_no_access_log(monkeypatch):
    from servidor.__main__ import main

    chamada = {}
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PORT", "10000")
    monkeypatch.delenv("HOST", raising=False)
    monkeypatch.setattr("uvicorn.run", lambda *args, **kwargs: chamada.update(kwargs))

    main()

    assert chamada["factory"] is True
    assert chamada["workers"] == 1
    assert chamada["access_log"] is False
    assert chamada["host"] == "0.0.0.0"
    assert chamada["port"] == 10000

def test_servidor_usa_um_worker_e_nao_registra_query_no_access_log(monkeypatch):
    from servidor.__main__ import main

    chamada = {}
    monkeypatch.setattr("uvicorn.run", lambda *args, **kwargs: chamada.update(kwargs))

    main()

    assert chamada["factory"] is True
    assert chamada["workers"] == 1
    assert chamada["access_log"] is False

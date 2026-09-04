.PHONY: test exemplo

test:
	pytest -q

exemplo:
	python -m motor motor/cenarios/exemplo_amanda.yaml

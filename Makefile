.PHONY: test exemplo varredura

test:
	pytest -q

exemplo:
	python -m motor motor/cenarios/exemplo_amanda.yaml

# A saída é gitignored (*.csv): é resultado de execução, não fonte. Os pesos dos
# mixes e os parâmetros de custo ainda são placeholders — ver motor/varredura.py.
varredura:
	python -m motor varredura --saida varredura.csv

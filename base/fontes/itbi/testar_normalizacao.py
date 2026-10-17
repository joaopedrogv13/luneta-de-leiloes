"""Confere normalizar.py contra casos-normalizacao.json (os mesmos casos que src/lib/catalogo/lugar.test.ts lê).

  python3 base/fontes/itbi/testar_normalizacao.py            confere; sai com 1 se algum caso divergir
  python3 base/fontes/itbi/testar_normalizacao.py --gerar    regrava o esperado com a regra atual (depois de mudar
                                                             a regra AQUI e em lugar.ts; revise o diff do JSON)

Também roda dentro de `npm run base:testar` (base/fontes/itbi/normalizacao.test.ts) e no workflow base-itbi.yml.
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from normalizar import normalizar_bairro, normalizar_rua  # noqa: E402

CAMINHO = os.path.join(AQUI, "casos-normalizacao.json")


def main():
    with open(CAMINHO, encoding="utf-8") as f:
        casos = json.load(f)
    funcoes = {"rua": normalizar_rua, "bairro": normalizar_bairro}
    if "--gerar" in sys.argv:
        for campo, funcao in funcoes.items():
            casos[campo] = [[entrada, funcao(entrada)] for entrada, _ in casos[campo]]
        with open(CAMINHO, "w", encoding="utf-8") as f:
            json.dump(casos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"casos regravados em {CAMINHO}")
        return 0
    erros = 0
    total = 0
    for campo, funcao in funcoes.items():
        for entrada, esperado in casos[campo]:
            total += 1
            obtido = funcao(entrada)
            if obtido != esperado:
                erros += 1
                print(f"DIVERGE {campo}: {entrada!r} → {obtido!r} (esperado {esperado!r})")
    print(f"normalização: {total - erros} de {total} casos iguais")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())

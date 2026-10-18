"""Entradas do ranking de localização: baixa os arquivos dos releases do IPEA e confere o sha256 (C1).

Os releases do GitHub do IPEA (geobr_prep_data, padronizacao_cnefe, censobr_prep_data) trazem o CNEFE 2022 e o Censo
2022 do IBGE já em Parquet. Os arquivos de um release mudam sem mudar a tag (o `cnefe_2022.parquet` da v2.0.0, de
14/05/2026, tem `Last-Modified` de 15/09/2026), então cada arquivo baixado entra num MANIFESTO com URL, tamanho,
`Last-Modified` e sha256:

- `manifesto.json` (nesta pasta, commitado) é a referência: o que foi conferido quando o pipeline foi escrito;
- a cada execução, o manifesto observado vai para a saída (`--saida`, padrão base/saida/localizacao/);
- se o sha256 de um arquivo mudar em relação à referência, o script avisa alto e sai com código 3 (o workflow para e o
  log diz qual arquivo mudou). Depois de conferir o arquivo novo: `--aceitar` regrava a referência.

Uso:
    python base/fontes/localizacao/entradas.py [--etapa geocode] [--saida base/saida/localizacao] [--aceitar]
                                               [--sem-rede] [--lista]

Pastas (variáveis de ambiente):
- LUNETA_LOCAL_CACHE: onde ficam os arquivos (padrão base/fontes/localizacao/cache/, fora do git);
- LUNETA_GEOCODEBR_CACHE: a pasta de cache do geocodebr (padrão $LUNETA_LOCAL_CACHE/geocodebr). As tabelas ficam em
  <pasta>/geocodebr_data_release_v0.5.0/, o mesmo lugar onde o pacote procura; assim ele não baixa de novo.

Só biblioteca padrão. Baixa com User-Agent identificado, 3 tentativas e arquivo temporário (.part) renomeado no fim.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
MANIFESTO_REFERENCIA = AQUI / "manifesto.json"
SAIDA_PADRAO = RAIZ / "base" / "saida" / "localizacao"
UA = "LunetaDeLeiloes/0.1 (ranking de localização; dados abertos do IBGE via IPEA; +https://luneta-de-leiloes.vercel.app)"

GEOCODEBR_RELEASE = "v0.5.0"
GEOBR = "https://github.com/ipea/geobr_prep_data/releases/download/v2.0.0"
PADRONIZACAO = f"https://github.com/ipea/padronizacao_cnefe/releases/download/{GEOCODEBR_RELEASE}"
CENSOBR = "https://github.com/ipea/censobr_prep_data/releases/download/v1.0.0"

TABELAS_GEOCODEBR = [
    "municipio",
    "municipio_cep",
    "municipio_cep_localidade",
    "municipio_localidade",
    "municipio_logradouro_cep_localidade",
    "municipio_logradouro_localidade",
    "municipio_logradouro_numero_cep_localidade",
    "municipio_logradouro_numero_localidade",
]


@dataclass(frozen=True)
class Entrada:
    nome: str
    url: str
    #: "local" (LUNETA_LOCAL_CACHE) ou "geocodebr" (LUNETA_GEOCODEBR_CACHE)
    pasta: str
    #: caminho relativo dentro da pasta
    arquivo: str
    #: etapas do actions.sh que usam o arquivo
    etapas: tuple[str, ...]
    para_que: str


#: tabelas do geocodebr que a etapa da nota também usa (código IBGE das cidades e o ponto das ruas do ITBI)
TABELAS_GEOCODEBR_NOTA = {"municipio", "municipio_logradouro_localidade"}

ENTRADAS: list[Entrada] = [
    *[
        Entrada(
            nome=f"geocodebr:{t}",
            url=f"{PADRONIZACAO}/{t}.parquet",
            pasta="geocodebr",
            arquivo=f"geocodebr_data_release_{GEOCODEBR_RELEASE}/{t}.parquet",
            etapas=("geocode", "nota") if t in TABELAS_GEOCODEBR_NOTA else ("geocode",),
            para_que="tabela de referência do geocodebr (CNEFE 2022 agregado por rua, número, CEP e localidade)",
        )
        for t in TABELAS_GEOCODEBR
    ],
    Entrada(
        nome="cnefe_2022",
        url=f"{GEOBR}/cnefe_2022.parquet",
        pasta="local",
        arquivo="geobr/cnefe_2022.parquet",
        etapas=("geocode", "nota"),
        para_que="CNEFE 2022 completo: degrau quadra e lote (C4), rua interna de condomínio e medição; na nota, domicílios por "
        "setor e estabelecimentos (C8, C12)",
    ),
    Entrada(
        nome="statsgrid_2022",
        url=f"{GEOBR}/statsgrid_2022.parquet",
        pasta="local",
        arquivo="geobr/statsgrid_2022.parquet",
        etapas=("nota",),
        para_que="grade estatística 2022 (células de 200 m na área urbana, 1 km na rural, com moradores): a referência da nota",
    ),
    Entrada(
        nome="schools_2025",
        url=f"{GEOBR}/schools_2025.parquet",
        pasta="local",
        arquivo="geobr/schools_2025.parquet",
        etapas=("nota",),
        para_que="escolas do INEP (Catálogo de Escolas e Censo Escolar 2025) com coordenada: escolas ativas a 1 km",
    ),
    Entrada(
        nome="healthfacilities_202604",
        url=f"{GEOBR}/healthfacilities_202604.parquet",
        pasta="local",
        arquivo="geobr/healthfacilities_202604.parquet",
        etapas=("nota",),
        para_que="estabelecimentos de saúde do CNES (abr/2026) com coordenada: unidades de atenção a 1 km (C7: só tipo e "
        "coordenada; nunca CPF nem razão social)",
    ),
    Entrada(
        nome="disasterriskareas_2010",
        url=f"{GEOBR}/disasterriskareas_2010.parquet",
        pasta="local",
        arquivo="geobr/disasterriskareas_2010.parquet",
        etapas=("nota",),
        para_que="BATER (IBGE e Cemaden, 2018, base de 2010): alerta de área de risco mapeada perto (C10)",
    ),
    *[
        Entrada(
            nome=f"censobr:2022_tracts_{t}",
            url=f"{CENSOBR}/2022_tracts_{t}_v1.0.0.parquet",
            pasta="local",
            arquivo=f"censobr/2022_tracts_{t}_v1.0.0.parquet",
            etapas=("nota",),
            para_que=para_que,
        )
        for t, para_que in (
            ("responsavelrenda", "renda do responsável por setor (V06004 média; V06006 só depois de confirmada, C6)"),
            ("entorno", "entorno dos domicílios por setor: pavimentação, calçada, iluminação, ponto de ônibus na face"),
            ("domicilio", "domicílios por setor: esgoto pela rede geral ou pluvial"),
        )
    ],
    Entrada(
        nome="censustracts_2022_simplified",
        url=f"{GEOBR}/censustracts_2022_simplified.parquet",
        pasta="local",
        arquivo="geobr/censustracts_2022_simplified.parquet",
        etapas=("nota",),
        para_que="malha de setores censitários 2022 (simplificada): o setor dos domicílios do CNEFE cujo código não está nos "
        "agregados (C6, opção a; 6,9% dos domicílios das cidades da base, 96% em Nossa Senhora do Socorro/SE)",
    ),
    Entrada(
        nome="neighborhoods_2022",
        url=f"{GEOBR}/neighborhoods_2022.parquet",
        pasta="local",
        arquivo="geobr/neighborhoods_2022.parquet",
        etapas=("geocode",),
        para_que="polígonos dos bairros do IBGE (Censo 2022): o ponto caiu no bairro informado?",
    ),
    Entrada(
        nome="censobr:2022_tracts_basico",
        url=f"{CENSOBR}/2022_tracts_basico_v1.0.0.parquet",
        pasta="local",
        arquivo="censobr/2022_tracts_basico_v1.0.0.parquet",
        etapas=("geocode", "nota"),
        para_que="moradores por município (soma dos setores): porte da cidade na medição",
    ),
]


def pasta_cache() -> Path:
    return Path(os.environ.get("LUNETA_LOCAL_CACHE") or AQUI / "cache").expanduser().resolve()


def pasta_geocodebr() -> Path:
    return Path(os.environ.get("LUNETA_GEOCODEBR_CACHE") or pasta_cache() / "geocodebr").expanduser().resolve()


def caminho(e: Entrada) -> Path:
    return (pasta_geocodebr() if e.pasta == "geocodebr" else pasta_cache()) / e.arquivo


def caminho_por_nome(nome: str) -> Path:
    for e in ENTRADAS:
        if e.nome == nome:
            return caminho(e)
    raise KeyError(nome)


def log(*partes: object) -> None:
    print(*partes, flush=True)


def _pedido(url: str, metodo: str = "GET") -> urllib.request.Request:
    return urllib.request.Request(url, method=metodo, headers={"User-Agent": UA})


def cabecalho(url: str) -> dict:
    """HEAD (segue o redirecionamento do GitHub para o blob): tamanho e Last-Modified."""
    with urllib.request.urlopen(_pedido(url, "HEAD"), timeout=60) as r:
        tamanho = r.headers.get("Content-Length")
        lm = r.headers.get("Last-Modified")
    return {
        "tamanho": int(tamanho) if tamanho else None,
        "last_modified": parsedate_to_datetime(lm).strftime("%Y-%m-%dT%H:%M:%SZ") if lm else None,
    }


def baixar(url: str, destino: Path, tentativas: int = 3) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    erro: Exception | None = None
    for k in range(tentativas):
        try:
            with urllib.request.urlopen(_pedido(url), timeout=300) as r, parcial.open("wb") as f:
                while True:
                    bloco = r.read(1 << 22)
                    if not bloco:
                        break
                    f.write(bloco)
            parcial.replace(destino)
            return
        except Exception as e:  # noqa: BLE001 - tenta de novo e lança o último erro
            erro = e
            log(f"  tentativa {k + 1} falhou: {type(e).__name__}: {str(e)[:200]}")
            if k + 1 < tentativas:
                time.sleep(5 * (3**k))
    assert erro is not None
    raise erro


def sha256(arq: Path) -> str:
    """sha256 do arquivo, com memória ao lado (<arquivo>.sha256: hash, tamanho e mtime) para não reler 1 GB à toa."""
    st = arq.stat()
    memo = arq.with_name(arq.name + ".sha256")
    if memo.exists():
        partes = memo.read_text(encoding="utf-8").split()
        if len(partes) == 3 and partes[1] == str(st.st_size) and partes[2] == str(int(st.st_mtime)):
            return partes[0]
    h = hashlib.sha256()
    with arq.open("rb") as f:
        while True:
            bloco = f.read(1 << 22)
            if not bloco:
                break
            h.update(bloco)
    valor = h.hexdigest()
    memo.write_text(f"{valor} {st.st_size} {int(st.st_mtime)}\n", encoding="utf-8")
    return valor


def ler_referencia() -> dict:
    if not MANIFESTO_REFERENCIA.exists():
        return {}
    return {a["nome"]: a for a in json.loads(MANIFESTO_REFERENCIA.read_text(encoding="utf-8"))["arquivos"]}


def preparar(etapa: str | None = None, sem_rede: bool = False) -> tuple[list[dict], list[str]]:
    """Garante os arquivos da etapa no cache. Devolve (manifesto observado, problemas)."""
    referencia = ler_referencia()
    observados: list[dict] = []
    problemas: list[str] = []
    for e in ENTRADAS:
        if etapa and etapa != "tudo" and etapa not in e.etapas:
            continue
        destino = caminho(e)
        remoto = {"tamanho": None, "last_modified": None}
        if not sem_rede:
            try:
                remoto = cabecalho(e.url)
            except Exception as erro:  # noqa: BLE001 - sem HEAD, segue com o arquivo local (se houver)
                log(f"  HEAD falhou para {e.nome}: {type(erro).__name__}: {str(erro)[:160]}")
        precisa = not destino.exists() or (remoto["tamanho"] is not None and destino.stat().st_size != remoto["tamanho"])
        if precisa:
            if sem_rede:
                problemas.append(f"{e.nome}: arquivo ausente ou incompleto em {destino} e --sem-rede")
                continue
            log(f"Baixando {e.nome} ({(remoto['tamanho'] or 0) / 1e6:.1f} MB) de {e.url}")
            inicio = time.time()
            baixar(e.url, destino)
            log(f"  ok em {time.time() - inicio:.0f} s")
        else:
            log(f"Em cache: {e.nome} ({destino.stat().st_size / 1e6:.1f} MB)")
        valor = sha256(destino)
        item = {
            "nome": e.nome,
            "url": e.url,
            "arquivo": e.arquivo,
            "tamanho": destino.stat().st_size,
            "last_modified": remoto["last_modified"] or referencia.get(e.nome, {}).get("last_modified"),
            "sha256": valor,
            "etapas": list(e.etapas),
            "para_que": e.para_que,
        }
        observados.append(item)
        ref = referencia.get(e.nome)
        if ref is None:
            problemas.append(f"{e.nome}: não está no manifesto de referência (rode com --aceitar depois de conferir)")
        elif ref["sha256"] != valor:
            problemas.append(
                f"{e.nome}: sha256 MUDOU (referência {ref['sha256'][:16]}… de {ref.get('tamanho')} B, "
                f"Last-Modified {ref.get('last_modified')}; agora {valor[:16]}… de {item['tamanho']} B, "
                f"Last-Modified {item['last_modified']}). O release foi trocado sem mudar a tag."
            )
    return observados, problemas


def gravar_manifesto(caminho_saida: Path, arquivos: list[dict]) -> None:
    caminho_saida.parent.mkdir(parents=True, exist_ok=True)
    conteudo = {
        "formato": "luneta-manifesto-entradas",
        "versao": 1,
        "conferido_em": time.strftime("%Y-%m-%d", time.gmtime()),
        "nota": "Arquivos dos releases do IPEA (geobr_prep_data v2.0.0, padronizacao_cnefe v0.5.0, censobr_prep_data "
        "v1.0.0) com os dados do IBGE. O sha256 fixa a versão: o mesmo nome de arquivo já foi trocado sem mudar a tag.",
        "arquivos": sorted(arquivos, key=lambda a: a["nome"]),
    }
    caminho_saida.write_text(json.dumps(conteudo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def principal(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--etapa", default="geocode", help="etapa do actions.sh (geocode) ou 'tudo'")
    p.add_argument("--saida", default=str(SAIDA_PADRAO), help="pasta onde gravar manifesto-entradas.json")
    p.add_argument("--aceitar", action="store_true", help="regrava manifesto.json (referência) com o que foi baixado")
    p.add_argument("--sem-rede", action="store_true", help="não acessa a rede: confere só os arquivos do cache")
    p.add_argument("--lista", action="store_true", help="só lista as entradas e os caminhos")
    a = p.parse_args(argv)
    if a.lista:
        for e in ENTRADAS:
            log(f"{e.nome:52} {','.join(e.etapas):10} {caminho(e)}")
        return 0
    log(f"Cache: {pasta_cache()} · geocodebr: {pasta_geocodebr()}")
    observados, problemas = preparar(a.etapa, a.sem_rede)
    gravar_manifesto(Path(a.saida) / "manifesto-entradas.json", observados)
    if a.aceitar:
        atuais = ler_referencia()
        atuais.update({o["nome"]: o for o in observados})
        gravar_manifesto(MANIFESTO_REFERENCIA, list(atuais.values()))
        log(f"Referência regravada: {MANIFESTO_REFERENCIA}")
        problemas = [x for x in problemas if "sha256 MUDOU" not in x and "não está no manifesto" not in x]
    if problemas:
        log("")
        log("!" * 100)
        log("ATENÇÃO: as entradas não batem com o manifesto de referência (base/fontes/localizacao/manifesto.json):")
        for x in problemas:
            log(f"  - {x}")
        log("Confira o arquivo novo (esquema, linhas, datas) antes de usar; depois rode entradas.py --aceitar.")
        log("!" * 100)
        return 3
    log(f"Entradas conferidas: {len(observados)} arquivo(s), sha256 igual ao da referência.")
    return 0


if __name__ == "__main__":
    sys.exit(principal())

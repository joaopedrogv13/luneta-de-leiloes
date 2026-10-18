#!/usr/bin/env bash
# Etapas do ranking de localização no GitHub Actions. O workflow .github/workflows/base-localizacao.yml (só
# workflow_dispatch) roda este script do ref escolhido com a etapa como argumento ("tudo" ou lista separada por
# vírgula) e publica base/fontes/localizacao/saida/ no branch coletas-dados, pasta localizacao/<run_id>/.
#
#   bash base/fontes/localizacao/actions.sh geocode
#   bash base/fontes/localizacao/actions.sh osm,ibge
#   bash base/fontes/localizacao/actions.sh tudo        # geocode, osm, ibge e nota, nesta ordem (atualização semanal)
#
# Etapas:
#   geocode  instala requirements.txt, roda os testes, baixa e confere as entradas (entradas.py, sha256 contra o
#            manifesto.json), roda o geocode (geocodificar.py) e copia geocode.json, medicao-geocode.md e
#            manifesto-entradas.json para saida/. Usa o CEP das fichas da Caixa publicadas em coletas-dados/fichas/
#            quando houver.
#   osm      OpenStreetMap (só daqui: a Geofabrik não abre do contêiner de desenvolvimento): instala o osmium-tool,
#            baixa o brazil-latest.osm.pbf (cerca de 1,9 GB), filtra as tags de transporte e lazer, exporta em
#            geojsonseq e reduz (osm.py) a saida/osm-pois.csv.gz (categoria, lat, lon, raio_m; ODbL no cabeçalho),
#            osm-LEIA-ME.txt e osm-cobertura.csv (pontos por cidade). O PBF é apagado logo depois do filtro.
#   ibge     baixa o ZIP de renda do responsável do Censo 2022 no FTP do IBGE e grava o cabeçalho do CSV e a linha
#            do dicionário que descreve a V06006 (ibge.py → saida/ibge-renda.txt e ibge-renda.json; C6).
#   nota     pontos de serviço (pois.py), métricas e nota (nota.py) com as entradas do manifesto; usa o osm-pois e o
#            ibge-renda desta execução ou, sem eles, os últimos publicados em coletas-dados/localizacao/. Copia para
#            saida/ os arquivos do site (localizacao*.json.gz) e a medição (medicao-nota.md).
#
# Uma etapa que falha não derruba as outras; o script sai com 1 se alguma falhou.
set -uo pipefail

ETAPA="${1:-tudo}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
SAIDA="$AQUI/saida"
mkdir -p "$SAIDA"
# cache fora do repositório (o runner tem 14 GB de disco; as entradas do geocode somam cerca de 2,4 GB e as da nota
# mais cerca de 1,3 GB, com a malha de setores)
export LUNETA_LOCAL_CACHE="${LUNETA_LOCAL_CACHE:-${RUNNER_TEMP:-$AQUI}/localizacao-cache}"
PY="${PYTHON:-python3}"
UA="LunetaDeLeiloes/0.1 (ranking de localizacao; dados abertos; +https://luneta-de-leiloes.vercel.app)"
GEOFABRIK="https://download.geofabrik.de/south-america/brazil-latest.osm.pbf"

quer() { [[ ",$ETAPA," == *",tudo,"* || ",$ETAPA," == *",$1,"* ]]; }
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
falhas=0

# o último arquivo publicado em coletas-dados/localizacao/<run_id>/ com este nome (vazio se não houver)
ultimo_publicado() {
  local nome="$1" destino="$2"
  git -C "$RAIZ" fetch -q --depth 1 origin coletas-dados 2>/dev/null || return 1
  local caminho
  caminho=$(git -C "$RAIZ" ls-tree -r --name-only FETCH_HEAD localizacao/ 2>/dev/null | grep "/$nome\$" | sort -t/ -k2,2n | tail -1)
  [ -n "$caminho" ] || return 1
  git -C "$RAIZ" show "FETCH_HEAD:$caminho" > "$destino" || return 1
  log "  $nome: $caminho"
}

etapa_geocode() {
  log "geocode: dependências"
  "$PY" -m pip install --quiet --disable-pip-version-check -r "$AQUI/requirements.txt" || return 1
  log "geocode: testes (sem rede)"
  "$PY" "$AQUI/testar.py" || return 1
  log "geocode: entradas (releases do IPEA, sha256 contra manifesto.json)"
  "$PY" "$AQUI/entradas.py" --etapa geocode --saida "$SAIDA" || return 1
  local fichas=()
  if git -C "$RAIZ" fetch -q --depth 1 origin coletas-dados 2>/dev/null; then
    local pasta_fichas="${RUNNER_TEMP:-/tmp}/fichas-coletas"
    rm -rf "$pasta_fichas" && mkdir -p "$pasta_fichas"
    if git -C "$RAIZ" archive FETCH_HEAD fichas 2>/dev/null | tar -x -C "$pasta_fichas" 2>/dev/null; then
      while IFS= read -r f; do fichas+=(--fichas "$f"); done < <(find "$pasta_fichas" -name 'fichas.json' | sort)
    fi
  fi
  log "geocode: geocodificar.py (${#fichas[@]} argumento(s) de fichas)"
  "$PY" "$AQUI/geocodificar.py" "${fichas[@]}" || return 1
  cp "$RAIZ/base/saida/localizacao/geocode.json" "$RAIZ/base/saida/localizacao/medicao-geocode.md" "$SAIDA/" || return 1
  log "geocode: ok ($(du -h "$SAIDA/geocode.json" | cut -f1))"
}

etapa_osm() {
  local pasta="${RUNNER_TEMP:-/tmp}/osm"
  rm -rf "$pasta" && mkdir -p "$pasta"
  log "osm: osmium-tool e shapely"
  if ! command -v osmium >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq osmium-tool >/dev/null || return 1
  fi
  osmium --version | head -1
  "$PY" -m pip install --quiet --disable-pip-version-check shapely==2.2.0 numpy==2.5.4 || return 1
  if [ ! -s "$RAIZ/base/saida/localizacao/cidades-base.csv" ]; then
    log "osm: falta base/saida/localizacao/cidades-base.csv (rode cidades.py)"; return 1
  fi
  log "osm: baixando $GEOFABRIK"
  curl -fsSL --retry 3 --retry-delay 30 -A "$UA" -o "$pasta/br.osm.pbf" "$GEOFABRIK" || return 1
  local data
  data=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$pasta/br.osm.pbf" 2>/dev/null || true)
  log "osm: $(du -h "$pasta/br.osm.pbf" | cut -f1), dados de ${data:-data não informada}"
  log "osm: tags-filter"
  osmium tags-filter "$pasta/br.osm.pbf" \
    n/highway=bus_stop \
    nwr/public_transport=station,platform \
    nwr/railway=station,halt,tram_stop,subway_entrance \
    nwr/amenity=bus_station,ferry_terminal \
    nwr/leisure=park,playground \
    nwr/landuse=recreation_ground \
    nwr/place=square \
    w/highway=pedestrian \
    -o "$pasta/pois.osm.pbf" --overwrite || return 1
  rm -f "$pasta/br.osm.pbf"
  log "osm: filtrado $(du -h "$pasta/pois.osm.pbf" | cut -f1); export geojsonseq"
  osmium export "$pasta/pois.osm.pbf" -f geojsonseq --add-unique-id=type_id -o "$pasta/pois.geojsonseq" --overwrite 2>&1 | tail -5 || return 1
  [ -s "$pasta/pois.geojsonseq" ] || return 1
  log "osm: $(du -h "$pasta/pois.geojsonseq" | cut -f1) de geojsonseq; reduzindo às cidades da base"
  "$PY" "$AQUI/osm.py" --geojsonseq "$pasta/pois.geojsonseq" --saida "$SAIDA" --data-osm "${data:-}" || return 1
  rm -rf "$pasta"
  log "osm: ok ($(du -h "$SAIDA/osm-pois.csv.gz" | cut -f1))"
}

etapa_ibge() {
  log "ibge: openpyxl e pypdf"
  "$PY" -m pip install --quiet --disable-pip-version-check openpyxl==3.1.5 pypdf==6.21.1 || return 1
  "$PY" "$AQUI/ibge.py" --saida "$SAIDA" || return 1
  log "ibge: ok"
}

etapa_nota() {
  log "nota: dependências"
  "$PY" -m pip install --quiet --disable-pip-version-check -r "$AQUI/requirements.txt" || return 1
  "$PY" "$AQUI/testar.py" || return 1
  log "nota: entradas (sha256 contra manifesto.json)"
  "$PY" "$AQUI/entradas.py" --etapa nota --saida "$SAIDA" || return 1
  local osm="$SAIDA/osm-pois.csv.gz" renda="$SAIDA/ibge-renda.json"
  if [ ! -s "$osm" ]; then
    osm="$LUNETA_LOCAL_CACHE/osm-pois.csv.gz"
    ultimo_publicado osm-pois.csv.gz "$osm" || { log "nota: sem OSM publicado (transporte e lazer só com o Censo)"; osm=""; }
  fi
  # sem a etapa ibge nesta execução, vale a conferência commitada (base/saida/localizacao/ibge-renda.json)
  [ -s "$renda" ] || renda=""
  log "nota: pois.py"
  "$PY" "$AQUI/pois.py" ${osm:+--osm "$osm"} || return 1
  log "nota: nota.py"
  "$PY" "$AQUI/nota.py" ${renda:+--ibge-renda "$renda"} || return 1
  cp "$RAIZ/base/saida/site/localizacao.json.gz" "$RAIZ/base/saida/site/localizacao-osm.json.gz" \
     "$RAIZ/base/saida/site/localizacao-cidades.json.gz" "$RAIZ/base/saida/localizacao/medicao-nota.md" "$SAIDA/" || return 1
  log "nota: ok"
}

if quer geocode; then
  etapa_geocode || { log "geocode: FALHOU"; falhas=$((falhas + 1)); }
fi
if quer osm; then
  etapa_osm || { log "osm: FALHOU"; falhas=$((falhas + 1)); }
fi
if quer ibge; then
  etapa_ibge || { log "ibge: FALHOU"; falhas=$((falhas + 1)); }
fi
if quer nota; then
  etapa_nota || { log "nota: FALHOU"; falhas=$((falhas + 1)); }
fi

log "fim: $falhas etapa(s) com falha"
[ "$falhas" -eq 0 ]

"""Gera src/lib/mapa/brasil-ufs.ts (contorno dos estados + projeção) a partir de um GeoJSON simplificado.

Como regerar (fora do repositório, numa pasta de trabalho):
  curl -O https://raw.githubusercontent.com/giuliano-oliveira/geodata-br-states/main/geojson/br_states.json  # MIT, malha IBGE
  npx mapshaper@0.6 -i br_states.json -filter-islands min-area=300km2 remove-empty -simplify 0.6% keep-shapes -clean \
      -o format=geojson precision=0.001 ufs.json
  python3 scripts/mapa/gerar-brasil-ufs.py ufs.json src/lib/mapa/brasil-ufs.ts
"""
import json, math, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
NOMES = {"AC":"Acre","AL":"Alagoas","AP":"Amapá","AM":"Amazonas","BA":"Bahia","CE":"Ceará","DF":"Distrito Federal","ES":"Espírito Santo","GO":"Goiás","MA":"Maranhão","MT":"Mato Grosso","MS":"Mato Grosso do Sul","MG":"Minas Gerais","PA":"Pará","PB":"Paraíba","PR":"Paraná","PE":"Pernambuco","PI":"Piauí","RJ":"Rio de Janeiro","RN":"Rio Grande do Norte","RS":"Rio Grande do Sul","RO":"Rondônia","RR":"Roraima","SC":"Santa Catarina","SP":"São Paulo","SE":"Sergipe","TO":"Tocantins"}
def merc(lat): return math.log(math.tan(math.pi/4 + math.radians(lat)/2))
lons, lats = [], []
def walk(c):
    if isinstance(c[0], (int, float)): lons.append(c[0]); lats.append(c[1]); return
    for x in c: walk(x)
for f in d["features"]: walk(f["geometry"]["coordinates"])
lon0, lat1 = min(lons), max(lats)
W, PAD = 2000, 24
k = (W - 2*PAD) / math.radians(max(lons) - lon0)
H = round(k * (merc(lat1) - merc(min(lats))) + 2*PAD)
def P(lon, lat): return (round(PAD + math.radians(lon - lon0)*k), round(PAD + (merc(lat1) - merc(lat))*k))
def area_centroid(pts):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        c = x0*y1 - x1*y0; a += c; cx += (x0+x1)*c; cy += (y0+y1)*c
    a /= 2
    return abs(a), (cx/(6*a), cy/(6*a)) if a else pts[0]
ufs = {}
for f in sorted(d["features"], key=lambda f: f["id"]):
    uf = f["id"]; g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    parts, xs, ys, best = [], [], [], (0, None)
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = []
            for c in ring:
                p = P(*c)
                if not pts or p != pts[-1]: pts.append(p)
            if pts and pts[0] == pts[-1]: pts = pts[:-1]
            if len(pts) < 3: continue
            xs += [p[0] for p in pts]; ys += [p[1] for p in pts]
            parts.append("M" + "L".join(f"{x},{y}" for x, y in pts) + "Z")
            if i == 0:
                a, c = area_centroid(pts)
                if a > best[0]: best = (a, c)
    ufs[uf] = {"nome": NOMES[uf], "d": "".join(parts), "caixa": [min(xs), min(ys), max(xs), max(ys)], "rotulo": [round(best[1][0]), round(best[1][1])]}
linhas = []
for uf, v in ufs.items():
    linhas.append(f'  {uf}: {{ nome: "{v["nome"]}", caixa: [{", ".join(map(str, v["caixa"]))}], rotulo: [{v["rotulo"][0]}, {v["rotulo"][1]}], d: "{v["d"]}" }},')
ts = f'''// GERADO por scripts/mapa/gerar-brasil-ufs.py: não edite à mão (ver como regerar no cabeçalho do script).
//
// Malha dos 27 estados do IBGE, via giuliano-oliveira/geodata-br-states (licença MIT), simplificada com mapshaper
// (ilhas < 300 km² fora, 0,6% dos vértices) e projetada em Mercator num viewBox de {W}×{H}. A mesma `projetar`
// posiciona os imóveis: contorno e pontos usam exatamente a mesma conta, então nunca se desencontram.

export const MAPA_LARGURA = {W};
export const MAPA_ALTURA = {H};

const LON0 = {lon0!r};
const LAT1 = {lat1!r};
const K = {k!r};
const PAD = {PAD};
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Latitude/longitude (graus) → [x, y] no viewBox do mapa. */
export function projetar(lat: number, lon: number): [number, number] {{
  return [PAD + ((lon - LON0) * Math.PI * K) / 180, PAD + (merc(LAT1) - merc(lat)) * K];
}}

export type UfMapa = {{
  nome: string;
  /** [x0, y0, x1, y1] no viewBox */
  caixa: readonly [number, number, number, number];
  /** ponto para o rótulo (centroide do maior polígono) */
  rotulo: readonly [number, number];
  /** contorno em SVG (path) */
  d: string;
}};

export const UFS_MAPA: Record<string, UfMapa> = {{
{chr(10).join(linhas)}
}};
'''
open(dst, "w").write(ts)
print("ok", W, H, len(ts))

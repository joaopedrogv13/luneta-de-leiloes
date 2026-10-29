# Localização dos imóveis: geocodificação e nota de localização

Duas partes, na ordem em que rodam:

1. **Geocodificação** (frente A1): a Caixa publica só o endereço em texto, e o ponto de cada imóvel era a sede do
   município. O **geocodebr** (IPEA, MIT) sobre o **CNEFE 2022** (IBGE) transforma o endereço em coordenada, com as regras
   da verificação da rodada 4 para não confiar em casamento arriscado. Detalhes na segunda metade deste arquivo.
2. **Nota de localização** (frente A2): uma nota de 0 a 100 para o entorno de cada imóvel, comparado com os moradores da
   própria cidade, com as seis partes separadas. A seção abaixo é o texto-base da página pública "Como a nota é
   calculada" (frente C).

A nota e a precisão não são garantia. Um casamento de endereço errado pode ter desvio pequeno, e a nota resume dados
públicos de 2022 que não substituem a visita ao local.

---

## A nota de localização: como é calculada

*Números de 18/10/2026, instantâneo de 21.230 imóveis em 1.153 cidades. Medição completa em
[`base/saida/localizacao/medicao-nota.md`](../../saida/localizacao/medicao-nota.md).*

### O que a nota diz

- **Uma nota de 0 a 100 para o entorno do imóvel, comparado com o resto da cidade.** Na tela: "melhor localizado que 78%
  dos moradores de São Gonçalo".
- **A comparação é com onde as pessoas moram**, não com a área da cidade. O IBGE divide o país em quadrados de 200 m ×
  200 m (1 km × 1 km na zona rural), com o número de moradores de cada um (Grade Estatística do Censo 2022). Cada
  quadrado habitado da cidade é medido do mesmo jeito que o imóvel e pesa pelo número de moradores. Em São Gonçalo são
  3.920 quadrados com 895.560 moradores.
- **Vale dentro da cidade.** Um 90 em São Paulo e um 90 em Patos dizem a mesma coisa sobre a posição na própria cidade,
  não que os dois lugares são iguais.
- **O que a nota não é:** não é avaliação do imóvel nem do prédio, não mede segurança, não usa o preço e não é garantia.
  Ela resume o que dados públicos dizem do entorno num raio de 500 m a 1 km.

### As seis partes

| Parte | Peso | O que entra | Raio | De onde vem |
|---|---|---|---|---|
| Serviços do dia a dia | 25% | mercados, farmácias e padarias; escolas em atividade; unidades de saúde | 500 m (comércio) e 1 km (escolas e saúde) | IBGE (CNEFE 2022), Inep, Ministério da Saúde (CNES) |
| Infraestrutura da rua | 25% | domicílios em rua pavimentada, com calçada, com iluminação pública e com esgoto pela rede | 500 m | IBGE (Censo 2022) |
| Transporte | 20% | estação de metrô, trem, VLT, BRT, barca ou terminal de ônibus mais perto; pontos de ônibus; domicílios em quadra com ponto de ônibus | até 5 km (estação), 500 m (pontos) | OpenStreetMap, IBGE (Censo 2022) |
| Renda do entorno | 20% | renda típica dos responsáveis com rendimento | 500 m (1 km onde há menos de 50 domicílios) | IBGE (Censo 2022) |
| Comércio e movimento | 5% | comércios e serviços em volta | 1 km | IBGE (CNEFE 2022) |
| Lazer | 5% | parque, praça ou parquinho mais perto | até 3 km | OpenStreetMap |

Os raios são em linha reta. Os pesos são os da decisão da rodada 4 (30/20/20/15/10/5) ajustados depois da conferência com
o preço pago nas compras de 5 capitais (veja "Como conferimos" abaixo): comércio caiu de 10 para 5, serviços de 30 para 25
e infraestrutura subiu de 15 para 25.

### Como cada parte vira uma nota

1. **Os números em volta do ponto.** Para o imóvel e para cada quadrado habitado da cidade: quantos mercados há a 500 m,
   a que distância fica a estação, que parte dos domicílios a 500 m está em rua com calçada, e assim por diante.
   - Os domicílios e os estabelecimentos vêm do CNEFE 2022, o cadastro de endereços do Censo: cada endereço tem
     coordenada e o setor censitário. As porcentagens e a renda de cada setor (Censo 2022) são pesadas pelo número de
     domicílios do setor que cai no raio, o que reflete o raio real, sem desenhar o setor.
   - O CNEFE grava o setor da malha usada na coleta, e os resultados por setor usam a malha final: 6,9% dos domicílios
     das cidades da base têm um código de setor que não existe nos resultados (96% em Nossa Senhora do Socorro/SE, 69%
     em Criciúma/SC, 23% em Campinas/SP). Esses domicílios recebem o setor do polígono da Malha de Setores 2022 em que
     caem. Sem isso, a renda e a infraestrutura de cidades inteiras saíam da nota sem aviso.
   - Mercado, farmácia e padaria são reconhecidos pelo nome do estabelecimento no CNEFE ("SUPERMERCADO", "DROGARIA",
     "PANIFICADORA"...), com exclusões ("ESTACIONAMENTO DO SUPERMERCADO", "MERCADORIAS", "FARMÁCIA VETERINÁRIA",
     "SEM FUNCIONAMENTO"...). Numa amostra conferida à mão, cerca de 96% a 98% estavam certos. **O nome nunca é
     publicado**: só a contagem.
   - Escolas: as em atividade do Censo Escolar (públicas e privadas). Saúde: postos, UBS, policlínicas, hospitais, pronto
     atendimento e UPA do CNES; consultório isolado, laboratório e farmácia ficam de fora.
2. **Dentro de cada parte, cada número vira um "acesso" de 0 a 1**, e a parte é a média deles:
   - contagem: 1 − e^(−n/k), com k = o comum na cidade (a mediana entre os moradores, no mínimo 1). O primeiro mercado
     perto vale mais que o décimo; com k mercados, o acesso é 0,63;
   - distância: e^(−d/800 m) para estação (cerca de 10 minutos a pé) e e^(−d/400 m) para parque;
   - porcentagem: ela mesma (87% vira 0,87);
   - renda e comércio são partes de um número só (a ordem é o que importa).
3. **A nota da parte é a posição do imóvel entre os moradores da cidade (percentil).** Serviços 70 quer dizer que o
   entorno do imóvel tem mais serviços que o de 70% dos moradores. Quando muita gente empata (meia cidade sem estação a
   5 km, por exemplo), o empate conta pela metade: quem está empatado fica no meio do grupo, não no fim.
4. **A nota final** é a média das seis partes pelos pesos e, de novo, a posição dessa média entre os moradores da cidade
   (as notas dos quadrados também são calculadas assim). Por isso a nota média da cidade, pesada pelos moradores, é 50.

### Quando a cidade (ou o ponto) não tem um dado

O que a cidade não tem sai do cálculo, e o peso vai para as outras partes, na mesma proporção:

- sem estação, barca nem terminal de ônibus mapeado: a distância à estação sai do transporte;
- pontos de ônibus do OpenStreetMap só entram quando o mapa tem duas coisas: os pontos dentro das áreas habitadas da
  própria cidade somam pelo menos 10% das quadras com ponto de ônibus que o Censo encontrou nela, e o morador típico
  (mediana pelos moradores) tem pelo menos 1 ponto mapeado a 500 m. Com só a primeira regra, 124 das 265 cidades
  entravam com o "comum" igual a 0 (Goiânia, São Gonçalo, Duque de Caxias): o mapa quase vazio dava "0 pontos de
  ônibus" numa cidade metropolitana (revisão final da rodada 4). Nas outras, o transporte usa a estação e o ponto de
  ônibus na quadra, do Censo;
- sem parque, praça ou parquinho mapeado: o lazer sai (6 cidades);
- ponto sem domicílio a 1 km (área industrial, loteamento novo): renda e infraestrutura saem para aquele ponto.

Na tela, a parte que saiu aparece sem nota e com peso 0, e os pesos das outras somam 100.

### Precisão do endereço

| Onde o endereço foi localizado | O que a tela mostra | Imóveis em 18/10 |
|---|---|---|
| no número ou na rua | a nota | 13.293 com nota |
| só no bairro | **nota aproximada**: uma faixa (as notas dos quadrados habitados num raio da incerteza, de 300 m a 2,5 km, do centro do bairro: do quartil de baixo ao de cima) e o meio dela | 4.388 |
| só na cidade, ou imóvel rural | sem nota, com o motivo | 2.834 na cidade e 45 rurais |

As métricas são urbanas (serviços a pé, infraestrutura da rua): para área rural, uma nota enganaria.

### Cidade pequena

Com menos de 20 mil moradores na grade, ou menos de 50 quadrados habitados, uma nota de 0 a 100 entre tão poucas áreas
enganaria. A tela mostra os números do entorno ("mercado a 400 m; 2 escolas a 1 km") e a posição em terços na cidade
(baixo, médio, alto). São 331 cidades e 666 imóveis com ponto.

### Área de risco

- **Alerta, não nota.** O mapeamento de áreas de risco do IBGE e do Cemaden (População em Áreas de Risco no Brasil,
  BATER, publicado em 2018 com base no Censo de 2010) não entra na nota: só gera o alerta "Área de risco mapeada perto"
  quando o ponto do endereço fica dentro ou perto de uma área mapeada. "Perto" é a margem do ponto, entre 100 e 500 m,
  em qualquer precisão (no número, quase sempre 100 m; a rua com ±230 m procura até 230 m). Fora do número exato, o
  texto fala do ponto do endereço ("o ponto da rua do endereço fica dentro..."), nunca "o imóvel fica dentro". No
  bairro: "Área de risco mapeada no bairro".
- O mapeamento cobre 287 das 1.153 cidades da base. **A ausência de área mapeada não quer dizer que não haja risco**: a
  tela diz "sem mapeamento de risco para esta cidade" e nunca "sem risco".
- Sem alerta, a tela diz só o que foi conferido (`riscoRaioM`): "nenhuma área mapeada a menos de 100 m do imóvel" ou "a
  menos de 500 m do centro do bairro". Imóvel com endereço só na cidade não é conferido, mesmo em cidade mapeada.
- As distâncias são medidas num plano local em metros. A primeira versão media em graus com o fator da longitude, o que
  encurtava em cerca de 8% (13% no Sul) as distâncias no sentido norte-sul.
- O mapeamento do Serviço Geológico do Brasil (SGB) fica para a próxima versão, quando a camada e a licença forem
  confirmadas.

### Renda

- **Renda típica dos responsáveis com rendimento**, em reais de 2022: a mediana do rendimento dos responsáveis por
  domicílio em cada setor (a variável V06006, confirmada no dicionário do IBGE em 18/10/2026: "Valor do rendimento
  nominal mediano mensal das pessoas responsáveis com rendimentos"), pesada pelos domicílios no raio. A média de
  medianas não é a mediana do raio: por isso "renda típica", nunca "mediana do raio".
- O IBGE exclui quem não tem rendimento. Setores com poucos domicílios não têm o dado (sigilo).
- Onde mais de 30% dos domicílios do raio estão em setor sem o dado, a parte sai marcada como incompleta.

### De onde vêm os dados

- **IBGE**: CNEFE 2022 (endereços, domicílios e estabelecimentos), Censo Demográfico 2022 (renda, entorno e esgoto por
  setor), Grade Estatística 2022 e, com o **Cemaden**, as áreas de risco (BATER). Dados públicos; "Fonte: IBGE".
- **IPEA**: geocodebr, geobr e censobr (pacotes MIT), que redistribuem os arquivos do IBGE, do Inep e do CNES.
- **Inep**: Censo Escolar e Catálogo de Escolas 2025 (CC BY 4.0).
- **Ministério da Saúde**: CNES, abril de 2026.
- **OpenStreetMap**: estações, pontos de ônibus, parques e praças, © contribuidores do OpenStreetMap, sob a Open Database
  License (ODbL 1.0). Os números derivados do OSM ficam num arquivo à parte, sob a mesma licença.

### Como conferimos

O preço não entra na nota (é circular: localização boa já é preço alto), mas serve para conferir os pesos. Em São Paulo,
Rio, Porto Alegre, Fortaleza e Recife, a nota foi calculada no ponto de cada rua que tem compras registradas no ITBI da
prefeitura (pelo menos 5 compras do tipo; 5.108 pares de rua e tipo, apartamento ou casa) e comparada com o preço mediano
pago por m² naquela rua, pela correlação de postos de Spearman (1 = mesma ordem; 0 = sem relação; negativo = ordem
contrária). O ponto da rua é o centro dos endereços dela no CNEFE; nome de rua que se repete em lugares diferentes da
cidade (mais de 1,5 km entre eles) fica de fora.

- Nota final, mediana entre os 8 recortes (cidade e tipo): **0,32** (São Paulo, apartamentos: 0,55; Rio, apartamentos:
  0,32; Porto Alegre, apartamentos: 0,39). Só um recorte ficou negativo (casas no Rio, 97 ruas: −0,10).
- Por parte (mediana): renda 0,50; infraestrutura 0,29; transporte 0,18; serviços 0,00; lazer 0,02; comércio −0,07.
- **O ajuste dos pesos.** Com os pesos da decisão (30/20/20/15/10/5), a mediana era 0,24 e três recortes ficavam
  negativos. Comércio puxava contra o preço em 4 dos 8 recortes: muito comércio pequeno a 1 km aparece mais nos bairros
  densos e populares do que nos bairros caros, mais residenciais. Serviços oscilava em torno de zero pelo mesmo motivo.
  Comércio caiu para 5, serviços para 25, e os 10 pontos foram para infraestrutura, que acompanha o preço em 7 dos 8. A
  renda ficou nos 20 da decisão: com mais peso a nota acompanharia mais o preço (0,32 com renda 30), mas viraria uma
  medida de renda.
- **Isso não valida o interior.** As 5 capitais têm ITBI aberto; nas cidades médias e pequenas não há com o que comparar.
  E correlação com preço não é o objetivo: a nota mede o entorno para morar, e um bairro caro pode ter poucos serviços a
  pé.

### Limites

- **Datas:** Censo e CNEFE de 2022; CNES de abril de 2026; Inep de 2025; OpenStreetMap de 17/10/2026; áreas de risco de
  2018 (base 2010).
- **Cobertura do OpenStreetMap** varia muito entre cidades (pontos de ônibus: de quase nada a mais que o Censo). As regras
  dos pontos de ônibus (10% das quadras do Censo e pelo menos 1 ponto perto do morador típico) evitam usar o mapa onde
  ele está vazio, mas não o corrigem. A contagem usa só os pontos dentro das áreas
  habitadas da cidade (antes, a caixa inteira, com as vizinhas perto da divisa, deixava passar cidade pequena ao lado de
  capital bem mapeada); bairro sem morador (zona industrial, avenida comercial) não entra na conta.
- **Galeria e shopping** contam como um estabelecimento (o CNEFE grava uma linha para vários): pode subestimar centro
  comercial.
- **Fora da nota por decisão:** crime (o registro varia muito por área e o dado aberto não chega à rua), favela ou
  comunidade urbana (estigma) e o preço.
- **A grade de referência inclui a zona rural** do município: numa cidade com muita gente no campo, um imóvel no centro
  sobe de posição.

---

## Estação de metrô, trem e VLT perto (rodada 5)

A tag positiva **"Metrô a 450 m"** (e "Trem a…", "VLT a…") do site, o filtro "Metrô a até 1 km" e a frase "Estação de
metrô Botafogo a 450 m" da seção de localização. É do plano Luneta, como as outras tags. Regras completas no topo de
`estacoes.py`; em resumo:

- só imóvel com endereço no **número ou na rua**; distância **em linha reta** do ponto do endereço até a estação (ou o
  acesso de metrô) mais perto, no OpenStreetMap; a tag vale **abaixo de 1 km**;
- metrô inclui o monotrilho do Metrô de São Paulo (linhas 15 e 17); o de parque ou santuário fica fora;
- trem e VLT só de rede urbana de passageiros (CPTM, ViaMobilidade, SuperVia, Trensurb, CBTU, Metrofor, VLT...) e das
  estações vizinhas dela; estação antiga, desativada, turística, de carga, bonde, funicular e plano inclinado ficam fora.
  A "Estação Ferroviária de X" do interior é quase sempre um prédio antigo;
- **a nota não muda**: o transporte da nota segue com a distância até qualquer estação, barca ou terminal (`estacao_m`),
  como na rodada 4. As colunas novas entram no `localizacao-osm.json.gz` sem tocar no resto do arquivo.

Em 24/10/2026, com o OSM de 23/10: 369 imóveis com metrô a menos de 1 km, 604 com trem e 46 com VLT (907 com pelo menos
uma, 6,6% dos 13.692 com número ou rua), quase todos no Rio, em São Paulo e nas regiões metropolitanas de Recife,
Salvador, Fortaleza e Porto Alegre. Por cidade em [`medicao-nota.md`](../../saida/localizacao/medicao-nota.md).

Para recalcular sem refazer a nota: a etapa `osm` do Actions e `estacoes.py --osm osm-pois.csv.gz` (2 s).

## Geocodificação: resultado (18/10/2026, instantâneo de 21.230 imóveis)

| Precisão | Imóveis | % | No site (`precisaoGeo`) | Verificação (C2) |
|---|---|---|---|---|
| numero | 10.481 | 49,4% | `exata` | 51,1% |
| rua | 3.211 | 15,1% | `rua` | 7,9% |
| bairro | 4.655 | 21,9% | `bairro` | 24,0% |
| cidade | 2.883 | 13,6% | `cidade` (sede) | 16,8% |

Número ou rua: 64,5% (59,0% na verificação). Detalhe por degrau, motivo, UF e porte da cidade, a validação (polígono do
bairro, setor censitário, vizinhos do número) e o efeito de cada ajuste estão em
[`base/saida/localizacao/medicao-geocode.md`](../../saida/localizacao/medicao-geocode.md). Tempo: cerca de 90 s neste
contêiner (4 núcleos), sem contar o download.

## Como rodar

Aqui (o GitHub Releases abre deste contêiner) ou em qualquer máquina com Python 3.12 ou 3.13:

```bash
python -m venv .venv && .venv/bin/pip install -r base/fontes/localizacao/requirements.txt
.venv/bin/python base/fontes/localizacao/testar.py          # parser e regras, sem rede nem dados
.venv/bin/python base/fontes/localizacao/entradas.py        # baixa ~2,4 GB e confere o sha256 (C1)
.venv/bin/python base/fontes/localizacao/geocodificar.py    # → base/saida/localizacao/geocode.json + medicao-geocode.md
npm run base:geocode -- --arquivo base/saida/localizacao/geocode.json   # grava no banco (base/dados/luneta.db)
npm run base:exportar -- --site                                         # leva lat/lon/precisaoGeo ao instantâneo do site
# nota de localização (depois do geocode e do exportar; precisa do osm-pois.csv.gz do Actions, ver abaixo)
.venv/bin/python base/fontes/localizacao/entradas.py --etapa nota   # +1,3 GB: grade, malha de setores, escolas, CNES, BATER, Censo por setor
.venv/bin/python base/fontes/localizacao/cidades.py                 # (só quando as cidades da base mudarem) caixas e vizinhas
.venv/bin/python base/fontes/localizacao/pois.py --osm osm-pois.csv.gz  # → $LUNETA_LOCAL_CACHE/nota/pois.parquet (≈ 4 min)
.venv/bin/python base/fontes/localizacao/nota.py                    # → base/saida/site/localizacao*.json.gz + medicao-nota.md (≈ 6 min)
.venv/bin/python base/fontes/localizacao/estacoes.py --osm osm-pois.csv.gz   # metrô, trem e VLT mais perto (tag do site; 2 s)
```

O `osm-pois.csv.gz` sai da etapa `osm` do Actions (a Geofabrik não abre do contêiner): `git fetch origin coletas-dados` e
`git show origin/coletas-dados:localizacao/<run_id>/osm-pois.csv.gz > osm-pois.csv.gz` (o `<run_id>` está em
`localizacao/ultima-execucao.txt`). Sem ele, o transporte fica só com o Censo e o lazer sai da nota. A confirmação da
V06006 (etapa `ibge`) está commitada em `base/saida/localizacao/ibge-renda.json`; o `nota.py` a usa por padrão.

- `LUNETA_LOCAL_CACHE`: pasta das entradas (padrão `base/fontes/localizacao/cache/`, fora do git).
- `LUNETA_GEOCODEBR_CACHE`: pasta das tabelas do geocodebr (padrão `$LUNETA_LOCAL_CACHE/geocodebr`). O pacote é apontado
  para ela sem gravar a configuração do usuário.
- `geocodificar.py --fichas fichas.json` (repetível) usa o CEP das fichas da Caixa (`baixar-fichas.ts`); o CEP do banco
  (coluna `cep` ou `extras.cep`) entra sozinho. Hoje nenhum imóvel tem CEP: a coleta das fichas é do item 4 da rodada.
- `--limite N` e `--ids a,b` para testar; `--depurar arquivo.jsonl` grava o caminho de cada imóvel (local, não publicar).
- `raios.py` regrava `base/geo/raios-cnefe.csv` (ver "Raio dos municípios" abaixo).
- Memória: o DuckDB do geocodebr usa até 80% da RAM como cache (pico de 11 GB num contêiner de 15 GB);
  `LUNETA_DUCKDB_MEMORIA=4GB` limita o DuckDB (pico de 9 GB, 120 s). Disco: cerca de 2,4 GB de entradas.

**No Actions:** `gh workflow run base-localizacao.yml --ref <branch> -f etapa=<etapas>`. Desde 29/10/2026 o workflow
também roda sozinho todo domingo às 06:00 de Brasília, com `geocode,nota` no main; o PC do dono aplica o geocode e copia
os `localizacao*.json.gz` mais novos que os do site (`node base/atualizar-site.mjs`, etapa `localizacao`; guia em
`base/ATUALIZAR-SITE.md`). O workflow roda `actions.sh` do
ref escolhido e publica `base/fontes/localizacao/saida/` e o log no branch `coletas-dados`, pasta `localizacao/<run_id>/`
(artefatos e logs do Actions não abrem do contêiner de desenvolvimento). Etapas:

| Etapa | O que faz | Publica | Tempo |
|---|---|---|---|
| `geocode` | geocode completo; usa o CEP das fichas publicadas em `coletas-dados/fichas/` | geocode.json, medicao-geocode.md, manifesto-entradas.json | cerca de 10 min |
| `osm` | instala o osmium-tool, baixa o brazil-latest.osm.pbf (2 GB), filtra transporte e lazer, exporta e reduz às cidades da base (`osm.py`) | osm-pois.csv.gz (ODbL, aviso no cabeçalho), osm-LEIA-ME.txt, osm-cobertura.csv | cerca de 14 min (12 de download) |
| `ibge` | ZIP de renda por setor do FTP do IBGE: cabeçalho do CSV e a linha do dicionário que descreve a V06006 (`ibge.py`) | ibge-renda.txt, ibge-renda.json | 1 min |
| `nota` | entradas da nota, `pois.py`, `nota.py` e `estacoes.py` (com o OSM desta execução ou o último publicado) | localizacao*.json.gz, medicao-nota.md | cerca de 15 min (10 antes da malha de setores; não medido de novo no Actions) |
| `tudo` | as quatro, nesta ordem (a atualização semanal) | tudo acima | cerca de 40 min |

Para aplicar o resultado do Actions no repositório: copiar de `coletas-dados` o geocode.json (e rodar
`npm run base:geocode` e o exportar) e os `localizacao*.json.gz` para `base/saida/site/`. O `node base/atualizar-site.mjs`
faz isso sozinho: aplica o geocode quando o `gerado_em` dele é mais novo que o maior `extras.geo.gerado_em` do banco e
copia cada arquivo da nota só quando o `gerado_em` é mais novo que o do site (empate não copia: o do site pode ter
colunas a mais com a mesma data, como as estações da rodada 5).

## O que cada arquivo faz

| Arquivo | O que é |
|---|---|
| `entradas.py` | baixa os arquivos dos releases do IPEA e grava o manifesto (URL, tamanho, `Last-Modified`, sha256); sai com código 3 e aviso alto se o sha256 mudar em relação a `manifesto.json` (C1: os assets já foram trocados sem mudar a tag). `--aceitar` regrava a referência depois de conferir. |
| `manifesto.json` | a referência commitada das 18 entradas (geocode e nota) |
| `endereco.py` | parser do endereço da Caixa (C5): logradouro, número, quadra, lote, conjunto, nome antigo, variantes (por extenso, algarismo, romano), rural, rodovia com km, padrão de Bauru |
| `casos-endereco.json` | 87 endereços do instantâneo com o resultado esperado (Goiás, DF, nome antigo, "Rua 13", número repetido, S/N, Apto/Bl, rodovia, rural, Bauru, faixa de lotes) |
| `geocodificar.py` | o pipeline (abaixo) |
| `medicao.py` | a medição e a validação (medicao-geocode.md) |
| `testar.py` | os casos de endereço e as regras puras (bairro aproximado, empates, rebaixamentos, interpolação, limites), sem rede |
| `aplicar.ts` | `npm run base:geocode`: grava no banco (padrão de `base/fontes/caixa/aplicar-fichas.ts`) |
| `raios.py` | o raio de cada município medido no CNEFE, onde a malha fica curta |
| `cidades.py` | as cidades da base (código IBGE de cada imóvel), a caixa de cada uma (endereços do CNEFE, percentis 0,1 e 99,9, mais 3 km) e as vizinhas (caixa que cruza) → `base/saida/localizacao/cidades-base.csv`, que o Actions usa para recortar o OSM |
| `osm.py` | (Actions) reduz o extrato do OSM a `categoria,lat,lon,raio_m,nome,rede` nas caixas das cidades; as regras das categorias estão no topo do arquivo. Desde a rodada 5 os trilhos vêm separados em `metro`, `trem`, `vlt` e `monotrilho` (antes, `trilho`), com o nome e a rede da estação |
| `estacoes.py` | a estação de metrô, trem e VLT mais perto de cada imóvel com endereço no número ou na rua (colunas `metro_m`, `trem_m`, `vlt_m`, com o nome, no `localizacao-osm.json.gz`) e a seção "Estação de metrô, trem e VLT perto" do `medicao-nota.md`; ver "Estação de metrô, trem e VLT perto" abaixo |
| `ibge.py` | (Actions) confere a V06006 no ZIP e no dicionário do IBGE (C6) |
| `pois.py` | pontos de serviço por categoria (CNEFE pelo nome, Inep, CNES, OSM) → `pois.parquet` no cache; nenhum nome sai (C7, C8) |
| `metricas.py` | os indicadores de cada ponto (contagens com árvore k-d, distâncias e as somas dos domicílios por setor agregadas antes em quadradinhos de 0,001°, C12; o setor que falta nos resultados sai do polígono da malha 2022) |
| `nota.py` | o percentil ponderado, os pesos, a cidade pequena, a faixa do aproximado, o alerta do BATER, os arquivos do site e a validação com o ITBI |
| `medicao_nota.py` | grava `medicao-nota.md` |
| `actions.sh` | as etapas do workflow (`geocode`, `osm`, `ibge`, `nota`, `tudo`) |

## O pipeline (geocodificar.py)

1. **Endereço** (`endereco.py`, C5). O que vem antes de `, N.` é o logradouro, o número vem depois e o resto é
   complemento. Goiás: `Quadra 249, N. Sn, Lt 11B Rua 86` vira rua "Rua 86", quadra 249, lote 11B. DF:
   `Qnp 30, N. S/N, Conj Q Lt 06` vira "QNP 30 CONJUNTO Q" (é assim que o CNEFE grava). `(Antiga Rua Projetada 1)` vira
   variante. `Rua 13` também é tentada como `RUA TREZE` (o CNEFE usa as duas formas).
2. **Município**: código IBGE pela tabela do geocodebr (e pelos apelidos de `base/geo/apelidos.csv`: "Assu" é Açu); no DF,
   toda região administrativa é Brasília.
3. **Bairro** (C3): o bairro da Caixa é casado com a localidade do CNEFE antes do geocode, com resposta única e limiar
   alto: sem o tipo na frente ("Lot Esplanada" → "ESPLANADA", mas "Parque Colonial" não vira "JARDIM COLONIAL"), sufixo
   ("Parque Industrial I" → "PARQUE INDUSTRIAL" se não houver "II"), nome cortado em 20 ou 40 letras e similaridade ≥ 0,92
   (nunca "ALTA VISTA I" com "ALTA VISTA II", nunca o nome da própria cidade). Em 18/10: 17.325 exatos e 1.068 aproximados (792 sem o tipo, 140 por similaridade, 99 por sufixo, 37 cortados).
4. **geocodebr** com `resolver_empates=False`, uma linha por (imóvel, variante do nome).
5. **Interpolação refeita**: o geocodebr 0.2.0 calcula o número interpolado como a média de todos os números da rua
   pesada por 1/|diferença| e devolve a média dos desvios (6 m). Para um número além do fim da rua, o ponto caía perto do
   meio dela. Aqui o ponto é refeito entre o vizinho menor e o maior do mesmo lado da rua, e o desvio passa a ser o do
   vizinho mais a distância até ele (além do último número: o ponto dele, somando a diferença de numeração).
6. **Regras (C2)**, por variante: empate com candidatos a mais de 1 km entre si → bairro ou cidade; casamento sem a
   localidade (níveis \*04) com nome genérico ("Rua 06", "Quadra 17") → rebaixa; \*04 a mais de max(2 km, 1,5 × desvio)
   do bairro informado → rebaixa; nome parecido (níveis p\*, Jaro ≥ 0,9) só vale se cada palavra tiver uma parecida no
   nome achado ("RUA ITATINGA" não casa com "RUA IPATINGA"); o ponto precisa ficar no município. Vence a melhor variante.
7. **Degraus no CNEFE completo** (C4): quadra e lote com a localidade casada ou o logradouro, zeros à esquerda tirados
   ("Qd 08" = "8"), aceito só se todos os pontos ficarem a até 60 m da mediana, faixas de lotes fora (1.094 imóveis em
   18/10); quadra e número de Bauru ("N. 8-45": QUADRA 8, número 45; 19); rua interna de condomínio (o CNEFE grava a rua
   externa e põe "RUA INTERNA X" no complemento; 4).
8. **Polígono do bairro** (IBGE, bairros 2022): casamento sem a localidade, de quadra e lote ou de rua interna que cai a
   mais de 1 km fora do bairro informado é rebaixado (59). Os outros são só medidos.
9. **Limites**: rural (gleba, fazenda, sítio, chácara como logradouro, bairro "Zona Rural", tipo "rural"; não vale para
   apartamento) → cidade com motivo "rural"; rodovia com km → no máximo rua.
10. **Precisão final**: numero (número exato, interpolado ou quadra e lote, desvio até 150 m) · rua (rua ou CEP até 500 m,
    ou número com desvio maior) · bairro (centro da localidade do CNEFE, até 2,5 km) · cidade (o resto: fica a sede).

## O que sai

`base/saida/localizacao/geocode.json`: um registro por id do site, um por linha:

```json
"caixa-1444419640129": {"precisao":"numero","lat":-22.859741,"lon":-43.032906,"desvio_m":6,"setor":"330490425000112","motivo":null,"degrau":"pn03"}
```

- `desvio_m`: raio que contém 95% dos endereços do CNEFE que casaram (para o número interpolado, o calculado no passo 5);
- `setor`: setor censitário, quando todos os pontos caem num só (a A2 usa para a renda e o entorno);
- `motivo`: por que foi rebaixado (`empate_longe`, `nome_generico_sem_bairro`, `longe_do_bairro`, `nome_parecido`,
  `fora_do_bairro_ibge`, `desvio_alto`, `so_municipio`, `fora_do_municipio`, `rural`, `rodovia_km`,
  `municipio_desconhecido`, `sem_resultado`);
- `degrau`: o nível do geocodebr (`dn03`, `da04`...), `qdlt`, `quadra_numero`, `rua_interna`, `bairro` ou `municipio`;
- `variante`: quando venceu outra forma do nome (1 = a primeira variante).

Só sai o que o instantâneo já publica (o id) mais coordenada, precisão e setor; nenhum nome de estabelecimento do CNEFE.

## No banco (`npm run base:geocode`)

- numero → `precisao_geo` "exata", rua → "rua", bairro → "bairro"; cidade mantém a sede do município;
- o ponto passa de novo pela conferência de `base/geo` (dentro do município); se não passar, fica a sede;
- nunca piora a coordenada que a fonte trouxe (a Leilões Judiciais "exata", do Street View): o geocode só entra se for de
  precisão melhor;
- o resto vai para `extras.geo` (precisão do geocode, desvio, setor, motivo, degrau, data do geocode e uma assinatura do
  endereço). A coleta seguinte do CSV mantém o ponto enquanto o endereço for o mesmo (`base/geo/aplicado.ts`, usado por
  `gravar.ts`); endereço mudou → volta a sede até o próximo geocode;
- idempotente; não mexe no hash do conteúdo nem em `atualizado_em`.

## Raio dos municípios (base/geo/raios-cnefe.csv)

A conferência "o ponto caiu no município?" usa `raio_km` (sede até a divisa, medido na malha simplificada). Em 24
municípios a malha fica curta: o Rio de Janeiro tinha 19 km, mas Santa Cruz e Sepetiba ficam a mais de 50 km do Centro
(737 mil endereços do CNEFE estavam além do limite). `raios.py` mede a distância da sede até cada trecho de rua do CNEFE e
grava o percentil 99,9 onde ele passa de `raio_km` + 10 km com pelo menos 50 endereços além. `base/geo/municipios.ts` usa
o maior dos dois, também na exportação (sem isso, o exportar devolveria esses imóveis para a sede).

## Fontes e licenças

| Fonte | Para quê | Onde | Licença e atribuição |
|---|---|---|---|
| CNEFE 2022 (IBGE), tabelas do geocodebr | casamento do endereço | `ipea/padronizacao_cnefe` release v0.5.0 (8 tabelas, 1,14 GB) | dados do IBGE ("Fonte: IBGE, CNEFE 2022"); o repositório não tem arquivo de licença; o MIT é do pacote |
| geocodebr 0.2.0 e enderecobr 0.3.0 (IPEA) | geocodificação e padronização | PyPI | MIT ("IPEA, geocodebr") |
| CNEFE 2022 completo, Parquet do geobr | quadra e lote, rua interna, Bauru | `ipea/geobr_prep_data` v2.0.0, `cnefe_2022.parquet` (1,26 GB) | "Fonte: IBGE, CNEFE 2022" |
| Bairros 2022 (IBGE, via geobr) | o ponto caiu no bairro informado? | `neighborhoods_2022.parquet` (41,5 MB) | "Fonte: IBGE" |
| Censo 2022 por setor, básico (IBGE, via censobr) | moradores por município (porte, na medição) e bairro de cada setor | `ipea/censobr_prep_data` v1.0.0, `2022_tracts_basico_v1.0.0.parquet` | "Fonte: IBGE, Censo Demográfico 2022" |
| Censo 2022 por setor: renda do responsável, entorno, domicílio (IBGE, via censobr) | renda (V06006), pavimentação, calçada, iluminação, ponto de ônibus na face, esgoto | `2022_tracts_{responsavelrenda,entorno,domicilio}_v1.0.0.parquet` | "Fonte: IBGE, Censo Demográfico 2022, agregados por setor"; V06006 conferida no `dicionario_de_dados_renda_responsavel_20260508.xlsx` do FTP do IBGE |
| Grade Estatística 2022 (IBGE, via geobr) | os moradores de referência da nota | `statsgrid_2022.parquet` (619 MB) | "Fonte: IBGE, Grade Estatística 2022" |
| Malha de Setores Censitários 2022, simplificada (IBGE, via geobr) | o setor dos domicílios do CNEFE com código fora dos resultados por setor (6,9%) | `censustracts_2022_simplified.parquet` (381 MB) | "Fonte: IBGE, Malha de Setores Censitários 2022" |
| Escolas (Inep, via geobr) | escolas em atividade a 1 km | `schools_2025.parquet` | CC BY 4.0: "Fonte: Inep, Censo Escolar e Catálogo de Escolas" |
| CNES (Ministério da Saúde, via geobr) | unidades de saúde a 1 km | `healthfacilities_202604.parquet` (só tipo, motivo de desativação, município e coordenada) | "Fonte: Ministério da Saúde, CNES"; o arquivo tem CPF e razão social de pessoa física: nunca lidos |
| BATER (IBGE e Cemaden, via geobr) | alerta de área de risco | `disasterriskareas_2010.parquet` | "Fonte: IBGE e Cemaden, População em Áreas de Risco no Brasil (2018)" |
| OpenStreetMap (Geofabrik) | estações (e, desde a rodada 5, o nome e a rede das de metrô, trem e VLT), pontos de ônibus, parques, praças, parquinhos | `brazil-latest.osm.pbf`, só no Actions | ODbL 1.0, "© contribuidores do OpenStreetMap"; o extrato e as colunas derivadas (`localizacao-osm.json.gz`) saem sob a ODbL, com o aviso no arquivo (C9) |
| ITBI das prefeituras (base/fontes/itbi) | só a validação dos pesos | `base/saida/site/itbi/*.json.gz` | as de `base/FONTES.md`; fora da nota |

Os arquivos dos releases mudam sem mudar a tag (o `cnefe_2022.parquet` da v2.0.0, de maio, tem `Last-Modified` de
15/09/2026): por isso o sha256 de cada um está em `manifesto.json`. Plano B, a partir do Actions: o FTP do IBGE
(`ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/`).

## Limites conhecidos

- **Validação de verdade** só no mapa ou no Street View: a medição lista os suspeitos da amostra para conferir à mão.
- **Cidade pequena** geocodifica pior (44,5% em número ou rua abaixo de 20 mil moradores, 77,4% acima de 500 mil): menos
  rua com nome no CNEFE e mais endereço por quadra e lote.
- **Bairro grande** (Santa Cruz, Campo Grande e Guaratiba no Rio, com desvio acima de 2,5 km) fica "cidade" quando a rua
  não casa: o centro do bairro está mais perto que a sede, mas a precisão diria mais do que sabemos. Decisão em aberto
  (PENDENCIAS.md).
- **CEP**: nenhum imóvel tem ainda (fichas da Caixa pendentes); com ele entram os níveis 01 e 02 do geocodebr.
- **DF**: "Quadra 312" sem o tipo (QR, QS...) não casa; quadras com conjunto ("QNP 30 CONJUNTO Q") casam.

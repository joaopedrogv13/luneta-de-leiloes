# ITBI das prefeituras: preço de transações reais

O ITBI é o imposto pago na compra de um imóvel. Algumas prefeituras publicam, em dados abertos, as transações com o
valor e a área: é o preço que **foi pago** (ou a base de cálculo da prefeitura), não o preço anunciado. A Luneta usa
isso como referência de R$/m² na página do imóvel ("Preço do m² na região"), por rua, bairro e cidade, ao lado das
referências entre imóveis em leilão da base.

Nada aqui guarda dado pessoal: os conectores leem os arquivos, calculam **só agregados** (quantidade, média, mediana
e quartis de R$/m² por tipo) e descartam as linhas. Nenhum número de imóvel, matrícula, inscrição ou nome sai daqui.

## Situação (17/10/2026)

| Cidade | Situação | Transações (12 meses) | Valor | De onde | Licença | Imóveis da base: comparam; casam rua / bairro / cidade |
|---|---|---|---|---|---|---|
| São Paulo/SP | **temos** | 95.084 (set/2025 a set/2026) | declarado | Secretaria da Fazenda, pela biblioteca `dadosimob` (MIT) | não confirmada | 490, só **32** comparam (casas e terrenos: ver "Área" abaixo): 7 / 14 / 32 |
| Rio de Janeiro/RJ | **temos** | 47.173 (out/2025 a set/2026) | declarado | Fazenda: planilha de transações (`ITBI_TRANSACOES_2025_diante.xlsx`); MapServer de reserva | não confirmada | 3.225, 3.224 comparam: 1.717 / 3.087 / 3.224 |
| Porto Alegre/RS | **temos** | 20.396 (out/2025 a out/2026) | base de cálculo | portal CKAN, um ZIP por ano | CC-BY no portal (a confirmar) | 233, 227 comparam: 178 / 191 / 227 |
| Fortaleza/CE | **temos** | 23.635 (fev/2025 a fev/2026: o arquivo do portal é de fev/2026) | base de cálculo | portal CKAN, um CSV único | CC-BY | 94, só **22** comparam (casas e terrenos): 0 / 18 / 22 |
| Recife/PE | **temos** | 16.952 (out/2025 a out/2026) | avaliação da prefeitura | portal CKAN, um CSV por ano | ODbL | 26, 26 comparam: 22 / 25 / 26 |
| Belo Horizonte/MG | coleta pendente | — | portal CKAN da PBH: **HTTP 403 para o GitHub Actions** na API, nas páginas e no download direto (servidor fora do Brasil); não contornamos. O conector está pronto para rodar de uma rede no Brasil | CC-BY | 37 |
| FipeZAP | precisa de autorização | — | índice de preço anunciado | uso depende da Fipe | — |
| Salvador, Goiânia, Brasília, Curitiba, Florianópolis, Campinas, Niterói | sem dado aberto | — | pedir pela Lei de Acesso à Informação | — | — |

"Comparam": imóveis da base dos tipos que o arquivo compara. "Casam": quantos deles têm referência de preço pago na
mesma rua, no mesmo bairro e na cidade (do mesmo tipo; medido pelo teste de `src/lib/catalogo/itbi.test.ts` com o
instantâneo de 14/10/2026). Os 5 arquivos somam 418 KB.

### Área: privativa na base, com a parte comum em SP e Fortaleza

A base usa a área **privativa** do anúncio. A prefeitura de São Paulo publica a área construída do IPTU, que nos
apartamentos e salas inclui a parte comum do prédio (e a vaga); a de Fortaleza (`AREA_EDIFICADA`) também. Com ela, o
R$/m² pago sai muito abaixo do da área privativa. Medido com o instantâneo de 14/10/2026 (mediana, por imóvel, da
avaliação/m² da fonte ÷ preço pago/m² da mesma rua ou do mesmo bairro):

| | Apartamento | Casa |
|---|---|---|
| São Paulo | **2,0** (n = 346) | 1,2 |
| Fortaleza | **1,6** (n = 68) | 1,1 |
| Rio de Janeiro | 0,9 | 1,2 |
| Porto Alegre (área privativa) | 1,1 | 1,2 |
| Recife | 1,05 | — |

Comparar o apartamento de SP com isso diria "a avaliação está o dobro do preço pago na rua", o que é efeito da área,
não do preço. Por isso `src/lib/catalogo/itbi.ts` (`CIDADES_ITBI[].areaComComum`) deixa **apartamentos e imóveis
comerciais de São Paulo e de Fortaleza sem a referência de ITBI**; a página recebe o motivo em
`vizinhanca.cobertura.semComparacao` e a tabela de cobertura diz o mesmo. Casas e terrenos comparam. O teste dos
arquivos reais confere essa razão (0,6 a 1,5) em cada cidade e tipo que entra: uma cidade nova com a área comum (BH,
por exemplo) faz o teste falhar até ser marcada.

A tabela que o site mostra sai de `src/lib/catalogo/itbi.ts` (`CIDADES_ITBI`, `coberturaPrecos`): "temos" para quem
tem arquivo em `base/saida/site/itbi/`, com o período e o total de transações.

## Como rodar

O workflow `.github/workflows/base-itbi.yml` só roda quando acionado (botão "Run workflow" ou
`gh workflow run base-itbi.yml -f etapa=tudo`). `etapa` aceita "tudo" ou uma lista: `explorar,sp,rio,recife,
fortaleza,poa,bh`. Cada cidade é uma etapa à parte (uma falha não derruba as outras). O resultado e os logs vão para o
branch `coletas-dados`, pasta `itbi/` (`itbi-<cidade>.json`, `log-<cidade>.txt`, `explorar*.json`).

Para levar ao site:

```bash
git fetch origin coletas-dados
mkdir -p /tmp/coletas && git archive origin/coletas-dados itbi | tar -x -C /tmp/coletas
python3 base/fontes/itbi/para_site.py --de /tmp/coletas/itbi      # grava base/saida/site/itbi/<uf>-<cidade>.json.gz
npm run test:site                                                  # confere os arquivos e quantos imóveis casam
```

Localmente (com rede para as prefeituras): `cd base/fontes/itbi && pip install dadosimob pandas numpy requests
openpyxl && python sp.py saida/itbi-sp.json` (e `rio.py`, `recife.py`, `fortaleza.py`, `poa.py`, `bh.py`).

## Arquivos

- `normalizar.py`: chaves de rua e bairro (minúsculas, sem acento, sem o tipo de logradouro, títulos por extenso). A
  **mesma regra** está em `src/lib/catalogo/lugar.ts`; `casos-normalizacao.json` é conferido pelos dois lados
  (`testar_normalizacao.py`, `normalizacao.test.ts` em `npm run base:testar`, e `lugar.test.ts` em `npm run test:site`).
  Para mudar a regra: mude os dois, rode `python3 base/fontes/itbi/testar_normalizacao.py --gerar` e revise o diff.
  Também tem `bairro_valido` (o "bairro" que é torre, bloco ou edifício fica de fora: o arquivo de SP mistura o
  complemento no bairro).
- `agregar.py`: transações (tipo, R$/m², data, bairro, rua e, opcionalmente, peso) → estatísticas dos **últimos 12
  meses** do arquivo, por cidade, bairro (n ≥ 5) e rua (n ≥ 3), por tipo. Corta R$/m² abaixo de 50 e acima de 200 mil.
  Arquivo só com ano e mês (o Rio): os 12 últimos meses inteiros, e o período do 1º dia do primeiro mês ao último dia
  do último (o arquivo do Rio de 17/10/2026 foi corrigido assim: as estatísticas não mudam, só o período, que dizia
  "set/2025" para dados que começam em out/2025).
- `comum.py`, `transacoes.py`, `ckan.py`: leitura (CSV, ZIP, planilha), colunas pelo nome, tipo do imóvel pelo texto da
  prefeitura (garagem, hotel, hospital, "proletário casa/apto" ficam de fora), fluxo dos portais CKAN.
- `sp.py`, `rio.py`, `recife.py`, `fortaleza.py`, `poa.py`, `bh.py`: um conector por cidade. `explorar.py`: só lista os
  arquivos de cada portal.
- `para_site.py`: confere e converte o resultado no arquivo do site.

### O que cada cidade publica e o que a Luneta usa

- **São Paulo:** transações de compra e venda do imóvel inteiro, valor da transação e área construída do IPTU (não a
  área útil: o R$/m² sai mais baixo que o de anúncio). O campo "bairro" do arquivo mistura torre e bloco.
- **Rio de Janeiro:** a planilha da Fazenda tem uma linha por transação (ano, mês, bairro, logradouro, tipologia,
  parte transferida, valor declarado, área). Só entra a transmissão de 100% do imóvel; "PROLETARIO CASA/APTO" fica de
  fora (não diz se é casa ou apartamento). Os textos vêm com o escape do Excel (`Rua_x0020_Nova`), desfeito na leitura.
  **Diferença:** se a planilha falhar, a reserva é o MapServer, que só tem a MÉDIA de cada trecho de rua por mês; aí o
  R$/m² do trecho é valor médio ÷ área média, a média da rua/bairro/cidade é ponderada pelo total de transações e a
  mediana e os quartis são ponderados **entre trechos**, não entre transações (o `fonte.via` do arquivo diz qual foi).
- **Recife:** `valor_avaliacao` (a avaliação da prefeitura, base do ITBI; o arquivo não traz o preço declarado) e
  `area_construida`; tipo por `tipo_imovel`.
- **Fortaleza:** `VL_BASE_CALCULO` e `AREA_EDIFICADA`. O arquivo só diz residencial/comercial: residencial com fração
  ideal abaixo de 1 (unidade em condomínio) conta como apartamento, inteira como casa; uso "Sem" é terreno. Data: a do
  cadastro da guia (a da transação vem em 11% das linhas). O arquivo do portal foi atualizado em fev/2026.
- **Porto Alegre:** `finalidade_construcao`, `base_de_calculo` (estimativa fiscal), área construída privativa, só
  guias pagas (`data_pagamento`) e 100% transmitido.
- **Belo Horizonte:** o portal recusa o GitHub Actions (HTTP 403). O conector está pronto; precisa rodar de uma rede
  no Brasil.

## Formato do arquivo do site (`base/saida/site/itbi/<uf>-<cidade>.json.gz`)

```
{ formato: "luneta-itbi", versao: 1, cidade, uf,
  fonte: { nome, url, via, observacao, atribuicao?, licenca?, arquivos?, valor_usado?, area_usada?,
           periodo: [de, até] (AAAA-MM-DD), transacoes },
  cidade_tipos: { <tipo>: { n, media, mediana, p25, p75 } },
  bairros: { <bairro normalizado>: { nome, tipos: { <tipo>: {...} } } },
  ruas:    { <rua normalizada>:    { nome, tipos: { <tipo>: {...} } } } }
```

`tipo` ∈ apartamento, casa, terreno, comercial. `media` é a média sem os 10% mais baixos e os 10% mais altos (a mesma
conta da base em `src/lib/catalogo/vizinhanca.ts`, `mediaAparada`). gzip nível 9 com mtime zero (mesmo conteúdo,
mesmos bytes). O site lê com `src/lib/catalogo/itbi.ts` (confere tudo; arquivo inválido fica de fora com o motivo no
log, sem derrubar a página) e devolve `ReferenciaM2` com `fonte: "itbi"`: `media` e `avaliacaoM2` (mediana e quartis)
são do preço pago; `lanceM2` e `percentilLance` ficam `null`.

Rua: casa pelo nome normalizado na cidade inteira (o ITBI não tem o bairro da rua). Nome que se repete na cidade
("Rua Projetada C", "Rua Três", "Rua Nova", "Rua Principal": `ruaGenerica` em `lugar.ts`) não casa. Um nome próprio
repetido em bairros diferentes da mesma cidade (duas "Rua São José" em São Paulo) ainda casa com a soma das duas:
limite conhecido.

Atribuição: o campo `fonte` de cada arquivo leva o nome do órgão, a URL e a licença quando conhecida; o site mostra.

# Geocodificação (base/geo)

Põe cada imóvel num ponto do mapa. A Caixa não publica coordenadas: na coleta, o ponto vem da cidade (a sede do município do IBGE) e, depois, da **geocodificação por endereço** (`base/fontes/localizacao`, geocodebr do IPEA sobre o CNEFE 2022), aplicada com `npm run base:geocode`. Quando a fonte traz coordenada (a Leilões Judiciais traz em 3 de 10 lotes, no `iframe_streetview`), ela vale, depois de conferida, e o geocode só a troca se for de precisão melhor.

## O que fica gravado

| Situação | `lat`/`lon` | `precisao_geo` |
|---|---|---|
| A fonte traz coordenada e ela cai no município | a da fonte (6 casas) | a que o conector declarou; `exata` se ele não declarou |
| A fonte traz lat/lon invertidas | desinvertidas, com aviso na coleta | idem |
| A fonte traz coordenada fora do Brasil ou longe do município | sede do município, com aviso | `cidade` |
| Sem coordenada (Caixa), antes do geocode | sede do município | `cidade` |
| Geocode por endereço: número exato, interpolado ou quadra e lote, desvio até 150 m | o ponto do CNEFE | `exata` |
| Geocode: rua (ou CEP) até 500 m, ou número com desvio maior | o ponto da rua | `rua` |
| Geocode: só o bairro (localidade do CNEFE até 2,5 km), ou casamento arriscado rebaixado | o centro da localidade | `bairro` |
| Geocode sem ponto melhor (rural, só município, bairro espalhado, fora do município) | sede do município | `cidade` |
| Cidade não reconhecida | `null` (fica fora do mapa), com aviso | `null` |

`exata` passa a ter duas origens: a coordenada da fonte e o número achado no CNEFE. O que distingue é `extras.geo` (precisão do geocode, desvio em metros, setor censitário, motivo do rebaixamento, degrau, data e a assinatura do endereço), gravado só pelo geocode. A coleta seguinte mantém o ponto do geocode enquanto o endereço for o mesmo (`aplicado.ts`, usado por `gravar.ts`). Distribuição em 18/10/2026 (21.230 imóveis): `exata` 49,4%, `rua` 15,1%, `bairro` 21,9%, `cidade` 13,6% (detalhe em `base/saida/localizacao/medicao-geocode.md`).

`cidade` é o nível de município: o contrato da base (`PRECISOES_GEO` em `tipos.ts`, `CHECK` em `esquema.sql`) já tinha esse nome para "centro da cidade", e trocar para `municipio` (o nome do pedido original) exigiria refazer a tabela `imovel` numa migração. Para o site, `precisao_geo = "cidade"` quer dizer "o ponto é a sede do município, não o imóvel". A decisão entre manter `cidade`, migrar ou trocar só na exportação está em `PENDENCIAS.md` (Base de dados: geocodificação).

"Longe do município" = mais que `raio_km + 10 km` da sede, onde `raio_km` é a maior distância da sede até a divisa do município, medida na malha do IBGE (São Caetano do Sul: 4 km; São Paulo: 55 km; Altamira/PA: 753 km). Município sem malha (criado depois de 2013) usa 100 km. Em 24 municípios a malha simplificada fica curta (Rio de Janeiro: 19 km, mas Santa Cruz fica a mais de 50 km do Centro); `raios-cnefe.csv` traz o raio medido nas ruas do CNEFE 2022 e vale o maior dos dois.

A gravação (`gravar.ts`) chama `geocodificar` em todo imóvel; a coleta registra num aviso os imóveis com alerta. A exportação traz `lat`, `lon`, `precisao_geo`, `codigo_ibge` e `mapa` = `[x, y]` no viewBox 400×400 do mapa do site, e geocodifica na hora o que foi gravado sem coordenada.

## Arquivos

| Arquivo | O que é | Origem e licença |
|---|---|---|
| `municipios.csv` | 5.571 municípios: `codigo_ibge, uf, nome, lat, lon, capital, raio_km` | [kelvins/Municipios-Brasileiros](https://github.com/kelvins/Municipios-Brasileiros) (commit `503e2f7`), **MIT**, Kelvin S. do Prado; nota de licença em `municipios.LICENSE.txt`. `raio_km` calculado na malha municipal do IBGE de [tbrugz/geodata-br](https://github.com/tbrugz/geodata-br) (commit `c39dfb0`, **CC0 1.0**) |
| `distritos.csv` | 4.743 distritos com nome diferente do município (dos 10.302 da DTB) | [paulofreitas/dtb-ibge](https://github.com/paulofreitas/dtb-ibge) (geodata-br, commit `3a44b74`), **PDDL 1.0** (domínio público), compilado da DTB do IBGE |
| `raios-cnefe.csv` | 24 municípios em que o raio da malha fica curto: `raio_km` medido no CNEFE 2022 (percentil 99,9 da distância da sede até cada trecho de rua), `raio_malha_km` e quantos endereços ficavam além | gerado por `base/fontes/localizacao/raios.py` sobre as tabelas do geocodebr (IPEA; dados do IBGE). Separado de `municipios.csv` para o `atualizar.ts` não apagar a correção |
| `aplicado.ts` | o geocode por endereço no banco: `extras.geo`, a assinatura do endereço e `manterGeocode` (a coleta não apaga o ponto) | nosso |
| `apelidos.csv` | 35 grafias e nomes antigos curados (`ASSU` → Açu, `Embu` → Embu das Artes, `Governador Edson Lobão`) | nossos; cada linha diz de onde veio (malha IBGE 2010, DTB 2017, grafia usual) |
| `correcoes.csv` | 4 sedes erradas no kelvins, corrigidas | centroide da malha do IBGE (tbrugz/geodata-br, CC0) |
| `fixtures/cidades_caixa_2026-10-08.csv` | contagem de linhas por UF + cidade do CSV da Caixa de 08/10/2026 (só nomes de cidade e números) | derivado; o CSV em si não é commitado |

### Sedes erradas no kelvins (conferidas contra a malha do IBGE)

Ponto a ponto, 5.507 das 5.564 sedes com polígono caem dentro do próprio município; 53 caem até 17 km fora, todas no litoral, em margem de rio ou em município pequeno (efeito da malha simplificada). Quatro estavam em outro lugar do estado e foram corrigidas em `correcoes.csv` com o centroide da malha:

| Município | Distância do kelvins até o município |
|---|---|
| Pau d'Arco/PA (1505551) | 750 km (estava perto de Capanema) |
| Cerro Azul/PR (4105201) | 360 km (oeste do PR) |
| Alto Paraíso/PR (4128625) | 288 km (sudoeste do PR) |
| São Sebastião da Vargem Alegre/MG (3164431) | 157 km |

## Como a cidade casa com o município (`municipios.ts`)

Ordem, parando no primeiro que casar; uma chave que aponta para dois municípios da mesma UF nunca casa:

1. **nome**: sem acento, caixa ou pontuação; apóstrofo colado (`MIRASSOL D'OESTE`, `D OESTE`, `DOESTE` e `do Oeste` dão a mesma chave); `S.` → São, `STA` → Santa, `N. SRA` → Nossa Senhora; UF no fim do texto (`São Paulo/SP`, e `NITEROI RJ` quando a UF informada é RJ), `(CAPITAL)`/`- Capital` no fim e "Município de"/"Comarca de" no começo saem. Nomes com parênteses no IBGE valem pelos dois (`Augusto Severo (Campo Grande)`).
2. **apelido**: `apelidos.csv`.
3. **grafia**: sem partículas (`Barão de/do Monte Alto`) e fonética (ç/ss/s/z, y/i, th/t, ge/je, ce/se, letras dobradas, "h" mudo no começo da palavra e, no fim da palavra, "aes"/"ais" e "eia"/"ea": `ASSU` = Açu, `SANTA ISABEL` = Santa Izabel, `ERVAL D OESTE` = Herval d'Oeste, `TRAJANO DE MORAIS` = Trajano de Moraes, `GOUVEA` = Gouveia). Abreviação ambígua vale se só uma leitura casar: `S J DOS CAMPOS` → São José dos Campos, `S J DEL REI` → São João del-Rei; `S J DO PIAUI` (há São José e São João do Piauí) não casa.
4. **distrito**: nome de distrito do IBGE, só se for único na UF e não colidir com município (`ALEXANDRA`/PR → Paranaguá).
5. **df**: qualquer cidade do DF (as regiões administrativas da Caixa: `CEILANDIA`, `TAGUATINGA`...) é Brasília.

Erro de digitação **não** casa sozinho. Medido com os nomes de todos os municípios consultados nas UFs onde eles não existem (132.212 consultas), a distância de 1 letra casava 974 vezes, quase sempre errado (`Gurupá`/RO → Urupá, `Brasília`/AC → Brasiléia, `Taquaral`/RS → Taquara). Ela só aparece como sugestão em `medir.ts`, para alguém conferir e criar o apelido. Nas mesmas 132.212 consultas, a chave fonética casou 22 nomes, todos variações reais do mesmo nome (`Lages`/`Lajes`, `Santa Teresa`/`Santa Tereza`, `Presidente Castelo/Castello Branco`).

As regras de "h" mudo, "aes"/"ais" e "eia"/"ea" (13/10/2026) foram medidas do mesmo jeito, consultando cada nome de município em cada UF onde não há município com o mesmo nome (144.182 consultas, contando também as variantes com parênteses): os casamentos por grafia passaram de 37 para 43, e os 6 novos são `Novo Horizonte` ↔ `Novorizonte`/MG (o mesmo nome contraído). Nenhuma chave fonética passou a apontar para dois municípios da mesma UF. Aplicadas no meio da palavra, "eia"/"ea" juntava `Areial`/PB e `Areal`/RJ; por isso só valem no fim.

### Medição com o CSV completo da Caixa (08/10/2026, 21.226 linhas, 1.161 cidades)

| | Linhas | Cidades |
|---|---|---|
| Casaram | 21.223 (99,99%) | 1.158 (99,74%) |
| pelo nome | 21.176 | |
| por apelido | 24 (`ASSU`/RN 21, `SANTA ISABEL DO PARA`/PA 3) | |
| por grafia | 1 (`SANT' ANA DO LIVRAMENTO`/RS) | |
| por distrito | 1 (`ALEXANDRA`/PR → Paranaguá) | |
| DF → Brasília | 21 (Ceilândia 6, Samambaia 6, Recanto das Emas 3, Taguatinga 3, Gama 2, Candangolândia 1) | |
| **Não casaram** | 3 | 3 |

As três que não casam não estão no IBGE como município nem como distrito (nem na DTB de subdistritos), e nenhuma fonte disponível aqui confirma a qual município pertencem, então ficam sem coordenada em vez de ganhar um palpite: `QUEIMADAS`/CE (bairro "ALTO D B VISTA"; há Queimadas na PB e na BA, não no CE), `TERRA VERMELHA`/PE (bairro "RENDEIRAS") e `SAO LUIZ DO TAPAJOS`/PA (provável localidade de Itaituba, não confirmada). O caminho é abrir a ficha de cada imóvel na Caixa, ler o CEP e criar o apelido; isso precisa de rede para o site da Caixa e ficou em `PENDENCIAS.md`. Só com o nome sem acento, sem apelidos, grafias e distritos, casavam 21.177 linhas (99,77%).

Grafias que não aparecem no CSV da Caixa, mas são comuns em editais e leiloeiros, estão em `municipios.test.ts` ("grafias usuais"): `GOVERNADOR EDSON LOBAO`/MA (apelido; o nome oficial é Edison), `TRAJANO DE MORAIS`/RJ, `GOUVEA`/MG, `ERVAL D OESTE`/SC, `S J DOS CAMPOS`/SP, `SAO PAULO (CAPITAL)`/SP e `NITEROI RJ`/RJ.

Para medir outra lista: `node --experimental-strip-types base/geo/medir.ts --arquivo Lista_imoveis_geral.csv` (qualquer CSV com colunas UF e Cidade, CP1252 ou UTF-8).

## Mapa do site (`mapa.ts`)

`latLonParaMapa` é a mesma conta de `latLonToMap` em `src/lib/brazil.ts` (Mercator calibrado nas capitais, viewBox 400×400). Está copiada para a base não depender do código do site em tempo de execução (importar `src/` faria o Node reclamar do `package.json` sem `"type"` a cada comando), e `mapa.test.ts` carrega o arquivo do site e compara as duas nas 5.571 sedes: se o site mudar os coeficientes, o teste quebra. Das 5.571 sedes, 99,03% caem dentro do contorno `BRAZIL_PATH`; as outras 54 são do litoral ou da fronteira (São Luís, Olinda, Fernando de Noronha, Tabatinga...), por causa do contorno simplificado. Vale para quem desenha os pinos: um imóvel em São Luís aparece um pouco fora do desenho.

## Atualização (`atualizar.ts`)

```bash
node --experimental-strip-types base/geo/atualizar.ts --simular   # baixa, confere e só relata
node --experimental-strip-types base/geo/atualizar.ts             # grava municipios.csv e distritos.csv
# sem rede: --arquivo-municipios municipios.csv --arquivo-distritos brasil-distritos.csv [--arquivo-malha geojs-100-mun.json | --sem-malha]
# outra versão das fontes: --ref-municipios main (padrão: o commit fixado em FONTES_GEO)
```

Baixa de `raw.githubusercontent.com` pelo cliente educado da base (`util/http.ts`: User-Agent `LunetaDeLeiloes/0.1 (+contato)`, timeout, retentativas, robots.txt), confere a assinatura de cada arquivo, o volume (5.550 a 5.700 municípios, mais de 9 mil distritos), as 27 capitais, códigos e UF, sedes dentro do Brasil e, com a malha, cada sede dentro do próprio município. Sede a mais de 50 km do município bloqueia a gravação e o relatório sugere a linha de `correcoes.csv`. Sede que muda mais de 50 km ou mais de 10 municípios sumindo também bloqueiam (passa com `--forcar`). Código citado em `apelidos.csv` ou `correcoes.csv` que some da fonte (ou apelido apontando para outra UF) bloqueia sempre, mesmo com `--forcar`: a tabela não carregaria e toda coleta e exportação parariam. Se qualquer coisa falhar, nada é gravado. Os dois arquivos são gravados juntos: primeiro os dois temporários, depois os dois renames (`gravarJuntos`); se uma escrita falhar, nenhum é trocado. Rodado de verdade em 13/10/2026 (rede liberada para o GitHub): 5.571 municípios, 4 sedes corrigidas, 4.743 distritos.

Depois de atualizar: `npm run base:testar` (os testes conferem contagens, capitais, apelidos e a taxa de casamento da Caixa) e olhe o diff. Município renomeado aparece no relatório; o nome antigo vira linha em `apelidos.csv`.

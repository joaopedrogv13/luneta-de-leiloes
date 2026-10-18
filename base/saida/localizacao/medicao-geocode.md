# Medição da geocodificação (base/fontes/localizacao)

Gerado em 18/10/2026 por `geocodificar.py`, com o instantâneo do site (21.230 imóveis) e 0 CEPs de ficha. Tempo: 106 s (geocodebr, regras, degraus no CNEFE e esta medição). Fonte: IBGE, CNEFE 2022; IPEA, geocodebr 0.2.0 (MIT).

A precisão diz quão perto o ponto deve estar do imóvel, não garante que esteja certo: o desvio mede a dispersão dos endereços do CNEFE que casaram, e um casamento errado pode ter desvio pequeno. As regras abaixo existem para rebaixar os casamentos arriscados.

## Precisão final

| Precisão | Imóveis | % | Verificação (C2) | Pesquisa (sem C2) | No site |
|---|---|---|---|---|---|
| numero | 10.481 | 49,4% | 51,1% | 54,7% | exata |
| rua | 3.211 | 15,1% | 7,9% | 12,2% | rua |
| bairro | 4.655 | 21,9% | 24,0% | 18,5% | bairro |
| cidade | 2.883 | 13,6% | 16,8% | 14,5% | cidade (sede) |

Número ou rua: **64,5%** (13.692), contra 59,0% na verificação. Na pesquisa, sem as regras C2, era 66,9%; a diferença para cima vem dos degraus novos (bairro aproximado, variantes do nome, quadra e lote, raio dos municípios), não de regra mais frouxa.

Pesquisa: "sem resultado" (0,2%) entra em cidade.

## Por degrau e motivo

| Precisão | Degrau | Motivo do rebaixamento | Imóveis | % |
|---|---|---|---|---|
| numero | `dn03` | - | 4.551 | 21,4% |
| numero | `da03` | - | 2.617 | 12,3% |
| numero | `dn04` | - | 1.421 | 6,7% |
| numero | `qdlt` | - | 1.094 | 5,2% |
| numero | `da04` | - | 545 | 2,6% |
| numero | `pn03` | - | 142 | 0,7% |
| numero | `pa03` | - | 92 | 0,4% |
| numero | `quadra_numero` | - | 19 | 0,1% |
| rua | `dl03` | - | 1.343 | 6,3% |
| rua | `da03` | desvio_alto | 919 | 4,3% |
| rua | `dl04` | - | 377 | 1,8% |
| rua | `dn03` | desvio_alto | 219 | 1,0% |
| rua | `da04` | desvio_alto | 175 | 0,8% |
| rua | `pl03` | - | 78 | 0,4% |
| rua | `pn03` | desvio_alto | 51 | 0,2% |
| rua | `pa03` | desvio_alto | 24 | 0,1% |
| rua | `dn04` | desvio_alto | 17 | 0,1% |
| rua | `rua_interna` | - | 4 | 0,0% |
| rua | `da03` | rodovia_km | 2 | 0,0% |
| rua | `da04` | rodovia_km | 1 | 0,0% |
| rua | `pa03` | rodovia_km | 1 | 0,0% |
| bairro | `db01` | - | 2.666 | 12,6% |
| bairro | `bairro` | longe_do_bairro | 377 | 1,8% |
| bairro | `da03` | desvio_alto | 359 | 1,7% |
| bairro | `bairro` | empate_longe | 332 | 1,6% |
| bairro | `bairro` | nome_generico_sem_bairro | 281 | 1,3% |
| bairro | `bairro` | nome_parecido | 183 | 0,9% |
| bairro | `dl03` | desvio_alto | 180 | 0,8% |
| bairro | `dl04` | desvio_alto | 161 | 0,8% |
| bairro | `da04` | desvio_alto | 60 | 0,3% |
| bairro | `bairro` | fora_do_bairro_ibge | 21 | 0,1% |
| bairro | `pa03` | desvio_alto | 19 | 0,1% |
| bairro | `pl03` | desvio_alto | 8 | 0,0% |
| bairro | `dn03` | desvio_alto | 7 | 0,0% |
| bairro | `dn04` | desvio_alto | 1 | 0,0% |
| cidade | `municipio` | so_municipio | 1.265 | 6,0% |
| cidade | `municipio` | desvio_alto | 1.101 | 5,2% |
| cidade | `municipio` | empate_longe | 204 | 1,0% |
| cidade | `municipio` | nome_generico_sem_bairro | 151 | 0,7% |
| cidade | `municipio` | nome_parecido | 47 | 0,2% |
| cidade | `municipio` | rural | 45 | 0,2% |
| cidade | `municipio` | fora_do_bairro_ibge | 38 | 0,2% |
| cidade | `municipio` | longe_do_bairro | 28 | 0,1% |
| cidade | `municipio` | municipio_desconhecido | 4 | 0,0% |

Degraus: `dn`/`pn` número exato, `da`/`pa` número interpolado, `dl`/`pl` rua, `dc` CEP, `db01` bairro, `dm01` município (geocodebr; `01` com CEP e localidade, `02` com CEP, `03` com localidade, `04` sem localidade; `p` = nome parecido pela similaridade de Jaro). `qdlt` quadra e lote no CNEFE, `quadra_numero` o padrão de Bauru, `rua_interna` rua interna de condomínio, `bairro` rebaixado para o centro da localidade, `municipio` sem ponto melhor que a sede.

Motivos: `empate_longe` (candidatos a mais de 1 km entre si), `nome_generico_sem_bairro` (casou sem a localidade com nome como "Rua 06"), `longe_do_bairro` (casou sem a localidade e caiu a mais de max(2 km, 1,5 × desvio) do bairro informado), `desvio_alto` (dispersão acima do limite da precisão), `so_municipio` (nem rua nem bairro no CNEFE), `fora_do_municipio`, `rural`, `rodovia_km`, `municipio_desconhecido`.

Variante do nome que venceu (numero e rua): principal 13.094, outra forma (nome antigo, por extenso, algarismo, quadra) 598.

Números interpolados refeitos (o vencedor de cada imóvel): entre dois vizinhos 2.972 (ficaram em numero 2.387); além do último número (ponto do mais perto) 1.842 (ficaram em numero 867).

Bairro casado com a localidade do CNEFE antes do geocode (C3): exata 17.325, nenhuma 2.837, sem_tipo 792, aproximada 140, sufixo 99, cortado 37.

## Por UF

| UF | Imóveis | numero | rua | bairro | cidade | numero ou rua |
|---|---|---|---|---|---|---|
| RJ | 7.193 | 62,7% | 12,4% | 10,9% | 13,9% | 75,1% |
| GO | 2.897 | 30,5% | 27,4% | 30,1% | 12,0% | 57,9% |
| SP | 2.842 | 52,5% | 16,6% | 19,0% | 11,9% | 69,1% |
| PE | 1.158 | 44,5% | 11,7% | 28,4% | 15,5% | 56,1% |
| RS | 833 | 61,6% | 12,5% | 18,7% | 7,2% | 74,1% |
| MG | 747 | 62,5% | 11,1% | 15,3% | 11,1% | 73,6% |
| PI | 724 | 31,4% | 8,4% | 45,6% | 14,6% | 39,8% |
| BA | 717 | 30,8% | 17,7% | 44,4% | 7,1% | 48,5% |
| PB | 691 | 44,9% | 11,6% | 20,7% | 22,9% | 56,4% |
| RN | 644 | 48,9% | 8,4% | 25,5% | 17,2% | 57,3% |
| CE | 620 | 33,5% | 6,5% | 52,9% | 7,1% | 40,0% |
| PR | 391 | 51,7% | 11,3% | 27,6% | 9,5% | 62,9% |
| SE | 389 | 37,8% | 11,3% | 27,0% | 23,9% | 49,1% |
| PA | 227 | 29,5% | 17,2% | 33,5% | 19,8% | 46,7% |
| MA | 221 | 28,1% | 12,7% | 33,9% | 25,3% | 40,7% |
| AM | 216 | 28,7% | 31,5% | 19,9% | 19,9% | 60,2% |
| MS | 169 | 72,8% | 9,5% | 14,2% | 3,6% | 82,2% |
| MT | 156 | 22,4% | 26,3% | 31,4% | 19,9% | 48,7% |
| SC | 130 | 53,8% | 14,6% | 26,2% | 5,4% | 68,5% |
| AL | 95 | 21,1% | 12,6% | 30,5% | 35,8% | 33,7% |
| DF | 63 | 0,0% | 30,2% | 12,7% | 57,1% | 30,2% |
| ES | 44 | 34,1% | 36,4% | 27,3% | 2,3% | 70,5% |
| AC | 21 | 28,6% | 38,1% | 19,0% | 14,3% | 66,7% |
| RO | 20 | 30,0% | 35,0% | 15,0% | 20,0% | 65,0% |
| TO | 18 | 5,6% | 38,9% | 27,8% | 27,8% | 44,4% |
| AP | 2 | 50,0% | 0,0% | 50,0% | 0,0% | 50,0% |
| RR | 2 | 0,0% | 100,0% | 0,0% | 0,0% | 100,0% |

## Por porte da cidade (moradores no Censo 2022)

| Porte | Imóveis | numero | rua | bairro | cidade | numero ou rua | Verificação (rua ou número) |
|---|---|---|---|---|---|---|---|
| menos de 20 mil | 919 | 32,9% | 10,6% | 28,9% | 27,6% | 43,4% | 46,5% |
| 20 a 50 mil | 1.285 | 33,4% | 10,4% | 30,7% | 25,5% | 43,8% | 47,2% |
| 50 a 100 mil | 2.807 | 39,0% | 14,3% | 35,9% | 10,8% | 53,3% | 51,3% |
| 100 a 500 mil | 6.992 | 44,5% | 19,2% | 24,3% | 12,0% | 63,7% | 73,0% |
| mais de 500 mil | 9.223 | 60,1% | 13,4% | 14,0% | 12,5% | 73,5% | 80,3% |
| desconhecido | 4 | 0,0% | 0,0% | 0,0% | 100,0% | 0,0% | — |

O viés continua: cidade pequena tem menos rua com nome no CNEFE e mais endereço por quadra e lote. A nota de localização some justamente no interior; o painel de cobertura precisa dizer isso.

## Validação

Sem ir à rua, dá para conferir três coisas. O polígono do bairro e o setor dizem se o ponto caiu no bairro certo; não dizem se caiu na casa certa. Onde o nome do bairro da Caixa não bate com o do IBGE, a conferência fica "sem bairro do IBGE".

### 1. Ponto dentro do polígono do bairro informado (IBGE, bairros 2022), todos os imóveis

| Precisão | Imóveis | Com bairro do IBGE | Dentro | Fora até 300 m | Fora 300 m a 1 km | Fora mais de 1 km |
|---|---|---|---|---|---|---|
| numero | 10.481 | 6.443 | 89,7% | 5,9% | 3,9% | 0,5% |
| rua | 3.211 | 1.418 | 85,1% | 6,2% | 7,7% | 1,0% |
| bairro | 4.655 | 1.939 | 89,2% | 5,2% | 4,0% | 1,5% |

Por degrau (numero e rua). Vários imóveis podem ser apartamentos do mesmo prédio: a coluna "endereços" conta rua, número e bairro distintos.

| Degrau | Imóveis | Endereços | Com bairro do IBGE | Dentro | Fora até 300 m | Fora mais de 300 m |
|---|---|---|---|---|---|---|
| `dn` | 6.208 | 3.590 | 4.197 | 89,7% | 5,3% | 4,9% |
| `da` | 4.259 | 2.315 | 2.790 | 88,7% | 6,5% | 4,8% |
| `dl` | 1.720 | 1.020 | 436 | 90,6% | 4,8% | 4,6% |
| `qdlt` | 1.094 | 559 | 209 | 95,2% | 2,4% | 2,4% |
| `pn` | 193 | 112 | 139 | 54,0% | 20,1% | 25,9% |
| `pa` | 117 | 96 | 72 | 83,3% | 11,1% | 5,6% |
| `pl` | 78 | 51 | 17 | 100,0% | 0,0% | 0,0% |

"Fora até 300 m" é quase sempre divisa de bairro (o imóvel do outro lado da rua) ou bairro da Caixa com nome de loteamento que o IBGE juntou a outro.

### 2. Amostra sorteada: 60 "numero" e 60 "rua"

Semente 20261018. Para cada imóvel: o polígono do bairro (1), o bairro do setor censitário do ponto no Censo 2022 (2) e, nos números interpolados, os vizinhos do CNEFE (3).

**numero** (60 imóveis, 37 cidades):

- polígono do bairro: dentro 32, sem bairro do IBGE 25, fora, até 300 m 2, fora, 300 m a 1 km 1
- bairro do setor: mesmo bairro 29, setor sem bairro 20, outro bairro 6, sem setor ou sem bairro 5
- número interpolado (15 na amostra): entre vizinhos a até 200 números 8, entre vizinhos a mais de 200 números 4, além do último número da rua 3

Suspeitos para conferir à mão (id, cidade, degrau, conferências):

- `caixa-8787706298040` Uberaba/MG, `dn03`, desvio 6 m; polígono: sem bairro do IBGE; setor: outro bairro
- `caixa-1787701491219` Jaboatão dos Guararapes/PE, `da03`, desvio 34 m; polígono: dentro; setor: outro bairro
- `caixa-8787708664907` São Gonçalo/RJ, `dn03`, desvio 115 m; polígono: fora, 300 m a 1 km (913 m); setor: —
- `caixa-8787713701459` Piracicaba/SP, `dn03`, desvio 9 m; polígono: fora, até 300 m (109 m); setor: outro bairro
- `caixa-8555517671789` Tauá/CE, `dn04`, desvio 6 m; polígono: fora, até 300 m (90 m); setor: outro bairro
- `caixa-8787707820506` Ribeirão Preto/SP, `dn04`, desvio 6 m; polígono: sem bairro do IBGE; setor: outro bairro
- `caixa-8787703705435` Ribeirão Preto/SP, `da04`, desvio 19 m; polígono: sem bairro do IBGE; setor: outro bairro

**rua** (60 imóveis, 35 cidades):

- polígono do bairro: sem bairro do IBGE 29, dentro 26, fora, até 300 m 4, fora, 300 m a 1 km 1
- bairro do setor: mesmo bairro 23, sem setor ou sem bairro 21, setor sem bairro 13, outro bairro 3

Suspeitos para conferir à mão (id, cidade, degrau, conferências):

- `caixa-8444411289790` Duque de Caxias/RJ, `da04`, desvio 435 m; polígono: fora, 300 m a 1 km (589 m); setor: outro bairro
- `caixa-1555528726026` Piracuruca/PI, `da04`, desvio 264 m; polígono: sem bairro do IBGE; setor: outro bairro
- `caixa-8444439030669` Bauru/SP, `dl03`, desvio 344 m; polígono: sem bairro do IBGE; setor: outro bairro

### 3. Números interpolados, todos os "numero"

| Conferência | Imóveis |
|---|---|
| entre vizinhos a até 200 números | 1.552 |
| além do último número da rua | 867 |
| entre vizinhos a mais de 200 números | 644 |
| fora do trecho entre os vizinhos | 191 |

Conferência independente do cálculo: há número menor e maior na mesma rua (e localidade, quando o casamento foi com ela) do CNEFE, e o ponto fica no trecho entre os dois (folga de 60 m)? O geocodebr 0.2.0 faz a média de todos os números da rua pesada por 1/|diferença|, e o ponto de um número além do fim da rua caía perto do meio dela com desvio de 6 m; geocodificar.py refaz o ponto entre os dois vizinhos (ou no último número, somando a diferença de numeração ao desvio) e só mantém "numero" se o desvio ficar em até 150 m.

## Ajustes feitos com esta validação (medidos em 18/10/2026)

| Passo | numero | rua | bairro | cidade | O que mudou |
|---|---|---|---|---|---|
| C2 + C3 + quadra e lote, raio da malha | 50,8% | 10,7% | 19,0% | 19,4% | 2.038 imóveis caíam em `fora_do_municipio`: a malha dá 19 km de raio ao Rio de Janeiro (Santa Cruz fica a 50 km da sede) |
| + raio medido no CNEFE (base/geo/raios-cnefe.csv, 24 municípios) | 56,8% | 10,9% | 19,0% | 13,3% | o Rio, Macaé, Bertioga, São Sebastião, Guarapari e mais 19 passam a aceitar o ponto certo; o mesmo raio vale na exportação |
| + interpolação refeita entre os vizinhos do CNEFE | 50,2% | 15,7% | 20,9% | 13,2% | o geocodebr punha o número além do fim da rua perto do meio dela, com desvio de 6 m; 1,4 mil saem de numero |
| + nome parecido conferido palavra a palavra e polígono do bairro nos casamentos sem localidade | 49,4% | 15,1% | 21,9% | 13,6% | "RUA ITATINGA" deixa de casar com "RUA IPATINGA"; 59 pontos a mais de 1 km do bairro informado são rebaixados |

Os dois últimos passos rebaixam, não sobem: a validação mostrou que o geocodebr estava otimista no número interpolado e no nome parecido. Fora deles, os degraus de número e rua ficam 88% a 90% dentro do polígono do bairro informado; o que sobra fora a mais de 300 m (cerca de 5%) é sobretudo divisa de bairro e nome de loteamento que o IBGE juntou a outro bairro. Conferir à mão os suspeitos listados acima é o próximo passo.

(Medição em 4 s.)

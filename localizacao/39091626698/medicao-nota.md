# Medição da nota de localização

Gerado em 18/10/2026 02:59 UTC por `base/fontes/localizacao/nota.py`, em 182 s. 21.230 imóveis do instantâneo, 1.153 cidades. Método: README desta pasta (base/fontes/localizacao/README.md).

- Renda: **V06006 (mediana por setor, confirmada no dicionário do IBGE)**, valores de 2022.
- OpenStreetMap: sim, dados de 2026-10-17T20:20:51Z.
- Arquivos do site: `localizacao.json.gz` 617 KB, `localizacao-osm.json.gz` 216 KB, `localizacao-cidades.json.gz` 49 KB.

## Situação dos imóveis

| Situação | Imóveis | % |
|---|---|---|
| calculada | 13.293 | 62,6% |
| aproximada | 4.388 | 20,7% |
| sem_nota | 3.549 | 16,7% |
| · sem nota: endereço só na cidade | 2.834 | 13,3% |
| · sem nota: cidade pequena (terços) | 666 | 3,1% |
| · sem nota: imóvel rural | 45 | 0,2% |
| · sem nota: cidade fora da base de cálculo | 4 | 0,0% |

Por precisão do ponto:

| Precisão | Imóveis | Calculada | Aproximada | Sem nota |
|---|---|---|---|---|
| numero | 10.481 | 10.179 | 0 | 302 |
| rua | 3.211 | 3.114 | 0 | 97 |
| bairro | 4.655 | 0 | 4.388 | 267 |
| cidade | 2.883 | 0 | 0 | 2.883 |

Por porte da cidade (moradores na grade 2022):

| Porte | Cidades | Imóveis | Com nota (calculada ou aproximada) |
|---|---|---|---|
| menos de 20 mil | 331 | 920 | 0 (0,0%) |
| 20 a 50 mil | 330 | 1.280 | 957 (74,8%) |
| 50 a 100 mil | 207 | 2.811 | 2.503 (89,0%) |
| 100 a 500 mil | 244 | 6.992 | 6.154 (88,0%) |
| mais de 500 mil | 41 | 9.223 | 8.067 (87,5%) |

## Distribuição das notas

Imóveis com nota calculada (13.293): média 40,4; p10 9, p25 19, mediana 37, p75 59, p90 78.

| Faixa | 0–9 | 10–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60–69 | 70–79 | 80–89 | 90–100 |
|---|---|---|---|---|---|---|---|---|---|---|
| Imóveis | 1.647 | 1.800 | 1.757 | 1.848 | 1.667 | 1.423 | 1.146 | 865 | 548 | 592 |

Aproximadas (4.388): meio da faixa com mediana 42; largura da faixa mediana de 16 pontos (p90 35).

Conferência: a nota média das células, pesada pelos moradores, fica em 50,0 na cidade típica (o percentil com ranking médio dá 50 por construção).

## Cobertura por cidade

- Cidades: 1.153; pequenas (menos de 20 mil moradores ou 50 células habitadas, só terços): 331 (28,7%).
- Pontos de ônibus do OSM usados (OSM com pelo menos 10% das faces com ponto de ônibus do Censo): 501 cidades (43,5%); nas outras, só o Censo.
- Com estação, barca ou terminal mapeado no OSM: 968 (84,0%). Com parque, praça ou parquinho: 1.147 (99,5%).
- Com mapeamento de risco do BATER: 287 (24,9%); nas outras, "sem mapeamento de risco para esta cidade" (nunca "sem risco").
- Componentes fora da nota (peso redistribuído): Lazer (sem_parque): 6 cidades.
- Imóveis com alerta de área de risco mapeada perto (BATER): 1.548.
- Imóveis com mais de 30% dos domicílios do raio sem setor nos agregados (renda incompleta): 1.172.

Maiores cidades da base (cobertura do OSM: pontos de ônibus do OSM ÷ faces com ponto de ônibus no Censo):

| Cidade | Moradores | Células | Imóveis | Ônibus OSM/Censo | Estações | Lazer | BATER | Fora |
|---|---|---|---|---|---|---|---|---|
| Rio de Janeiro/RJ | 6.193.495 | 15.882 | 3.225 | 0,15 | 854 | 4.537 | sim | — |
| São Gonçalo/RJ | 895.560 | 3.920 | 1.527 | 0,25 | 36 | 427 | não | — |
| Nova Iguaçu/RJ | 787.179 | 4.024 | 870 | 0,31 | 63 | 674 | não | — |
| Luziânia/GO | 209.829 | 3.660 | 689 | 0,01 | 5 | 86 | não | — |
| Cidade Ocidental/GO | 91.703 | 914 | 581 | 0,16 | 1 | 61 | não | — |
| São Paulo/SP | 11.437.655 | 23.601 | 490 | 0,62 | 777 | 10.428 | sim | — |
| Santo Antônio do Descoberto/GO | 71.989 | 1.159 | 485 | 1,95 | 43 | 1.012 | não | — |
| Itaboraí/RJ | 223.854 | 2.884 | 460 | 0,24 | 2 | 71 | não | — |
| Ribeirão Preto/SP | 698.417 | 3.950 | 436 | 0,54 | 22 | 744 | não | — |
| João Pessoa/PB | 832.386 | 3.054 | 320 | 0,62 | 45 | 490 | sim | — |
| Valparaíso de Goiás/GO | 198.698 | 892 | 308 | 0,20 | 4 | 131 | não | — |
| Belford Roxo/RJ | 484.069 | 1.545 | 306 | 0,30 | 29 | 396 | sim | — |
| Nossa Senhora do Socorro/SE | 192.007 | 1.046 | 305 | 1,15 | 32 | 492 | não | — |
| Horizonte/CE | 74.738 | 850 | 304 | 0,01 | 2 | 14 | não | — |
| Águas Lindas de Goiás/GO | 225.690 | 1.842 | 301 | 0,02 | 2 | 29 | não | — |
| Salvador/BA | 2.416.356 | 5.242 | 278 | 0,20 | 205 | 1.268 | sim | — |
| Porto Alegre/RS | 1.332.254 | 6.114 | 233 | 0,22 | 92 | 1.963 | sim | — |
| Jaboatão dos Guararapes/PE | 644.201 | 2.416 | 220 | 1,57 | 217 | 892 | sim | — |
| Santa Rita/PB | 148.951 | 780 | 217 | 4,01 | 46 | 350 | não | — |
| Demerval Lobão/PI | 16.303 | 302 | 196 | 0,00 | 0 | 3 | não | — |
| Ceará-Mirim/RN | 79.575 | 778 | 186 | 7,80 | 41 | 127 | sim | — |
| Altos/PI | 47.416 | 948 | 184 | 0,00 | 4 | 5 | não | — |
| Cocalzinho de Goiás/GO | 25.011 | 1.066 | 157 | 0,21 | 4 | 34 | não | — |
| Manaus/AM | 2.063.910 | 8.511 | 153 | 0,06 | 87 | 759 | sim | — |
| Paulista/PE | 341.519 | 1.285 | 153 | 1,56 | 56 | 265 | sim | — |

Pontos de serviço lidos (cidades da base e vizinhas): cnefe:ensino_cnefe 231.171, cnefe:estab 10.580.593, cnefe:farmacia 75.426, cnefe:mercado 429.291, cnefe:padaria 101.163, cnefe:religioso 515.389, cnefe:saude_cnefe 222.637, cnes:saude 147.980, inep:escola_privada 40.499, inep:escola_publica 117.966, osm:barca 985, osm:brt 851, osm:onibus 114.485, osm:parque 85.407, osm:playground 6.710, osm:praca 30.402, osm:terminal 5.198, osm:trilho 2.094.

## Validação com o ITBI (Spearman)

Para cada rua do ITBI com ponto no CNEFE (nome casado pela mesma normalização do site; nome que se repete a mais de 1,5 km fica fora), a nota foi calculada no ponto da rua como se fosse um imóvel e comparada com o preço mediano pago por m² na rua (ruas com pelo menos 5 transações do tipo). Correlação de postos de Spearman: 1 = a ordem da nota é a mesma do preço; 0 = sem relação; negativo = puxa contra o preço. O preço NÃO entra na nota (é circular): serve só para ver se os pesos fazem sentido. **Isso vale para as 5 capitais e não valida a nota no interior (C11).**

| Cidade | Tipo | Ruas | Nota | Serviços | Transporte | Renda | Infraestrutura | Comércio | Lazer |
|---|---|---|---|---|---|---|---|---|---|
| Fortaleza | apartamento | 364 | 0,06 | -0,23 | -0,02 | 0,41 | 0,20 | -0,24 | 0,02 |
| Recife | apartamento | 409 | 0,01 | -0,06 | -0,26 | 0,42 | 0,28 | -0,22 | 0,15 |
| Rio de Janeiro | apartamento | 813 | 0,32 | -0,03 | 0,30 | 0,80 | 0,31 | -0,18 | 0,37 |
| Rio de Janeiro | casa | 97 | -0,10 | -0,31 | 0,02 | 0,48 | -0,01 | -0,38 | -0,28 |
| São Paulo | apartamento | 2.333 | 0,55 | 0,24 | 0,21 | 0,69 | 0,54 | 0,21 | 0,06 |
| São Paulo | casa | 455 | 0,32 | 0,03 | 0,17 | 0,49 | 0,35 | 0,03 | 0,02 |
| Porto Alegre | apartamento | 561 | 0,39 | 0,19 | 0,19 | 0,71 | 0,38 | 0,17 | -0,06 |
| Porto Alegre | casa | 76 | 0,32 | 0,12 | 0,34 | 0,50 | 0,20 | 0,04 | -0,03 |

Mediana entre as linhas: nota 0,32; Serviços -0,00; Transporte 0,18; Renda 0,49; Infraestrutura 0,29; Comércio -0,07; Lazer 0,02.

### Sensibilidade dos pesos

A mesma validação com a nota recalculada com outros pesos (cada linha é uma cidade e um tipo, como acima). "Renda 30" e "sem renda" só servem de comparação: a renda acompanha o preço por definição e pesar mais nela transformaria a nota numa medida de renda.

| Pesos (serviços/transporte/renda/infra/comércio/lazer) | Mediana | Mínimo | Linhas negativas |
|---|---|---|---|
| 1. pesos da decisão (30/20/20/15/10/5) | 0,24 | -0,14 | 3 de 8 |
| 2. sem comércio (30/20/20/15/0/5) | 0,29 | -0,09 | 2 de 8 |
| 3. comércio 5, infraestrutura 20 (30/20/20/20/5/5) | 0,28 | -0,12 | 2 de 8 |
| 4. comércio 5, serviços 25, infraestrutura 25 (os usados) (25/20/20/25/5/5) | 0,32 | -0,10 | 1 de 8 |
| 5. renda 30 (só para comparar) (25/15/30/15/10/5) | 0,32 | -0,07 | 1 de 8 |
| 6. sem renda (só para comparar) (35/25/0/20/12/8) | 0,15 | -0,24 | 3 de 8 |


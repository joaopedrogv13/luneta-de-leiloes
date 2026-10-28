# Ranking dos leiloeiros do PBCV para a Luneta

Base: `leiloes.db` do PBCV (última rodada em 01/10/2026), lido só para leitura. Gerado em 28/10/2026. Todos os números contam **imóveis**, pela regra "imóvel de verdade" (`pbcv-ANALISE.md`, seção 1), e **à venda de verdade**: visto na última coleta da fonte que trouxe lotes, com situação aberto ou agendado (suspenso só com data futura). O mesmo critério está em `relatorio-leiloeiros.json` (formato da Luneta). Nada aqui é garantia sobre o imóvel.

## 1. O funil: do "ativo" do PBCV ao que vai para o site

| Etapa | Imóveis | Fontes | O que sai |
| --- | ---: | ---: | --- |
| "Ativo" bruto no PBCV (tipo_bem imovel ou rural, ativo=1) | 35.333 | 566 | |
| Corrigido pela regra de imóvel | 34.728 | 558 | saem 1.891 que não são imóvel (tratores, implementos, gado, móveis, lotes de teste); entram 1.286 que estavam em desconhecido, diversos ou veículo |
| Vistos na última coleta da fonte | 32.757 | | saem 1.971 "zumbis": presos pela trava de queda (ex.: fidalgoleiloes) ou de fonte sem coleta boa |
| **À venda de verdade** | **24.118** | **531** | saem 5.814 suspensos sem data futura (5.678 da família ApiEngine, com praça já passada entre 2018 e 2026), 1.773 encerrados ou vendidos e 1.052 sem situação |
| Importáveis (com cidade e UF, que o contrato exige) | 22.001 | 486 | saem 2.117 sem cidade ou UF |
| No site em 01/10 (lance maior que zero e praça não vencida) | 16.017 | 433 | saem os de praça vencida entre a coleta (quase toda em 24/09) e 01/10, e 389 sem lance |
| Ainda no site hoje (28/10), sem nova coleta | 4.468 | | a base envelhece rápido: 72% dos que estavam no site em 01/10 já tiveram a praça |

Conferência com o exportador da outra frente (`saida/resumo.json`): 24.136 à venda e 21.630 importáveis. A diferença (0,1% e 1,7%) vem da classificação de imóvel (a regra daqui tira mais máquinas e móveis) e da validação de cidade (lá, 292 cidades descartadas).

**O que isso diz:** o número para o site não é 35 mil. É cerca de 22 mil imóveis à venda com cidade, e só ~16 mil aparecem se a coleta tiver no máximo uma semana. Sem atualização frequente, o número cai para menos de 5 mil em um mês.

## 2. Curva de Pareto (imóveis à venda por fonte)

| Maiores fontes | Imóveis à venda | % do total |
| ---: | ---: | ---: |
| 5 | 3.610 | 15,0% |
| 10 | 6.592 | 27,3% |
| 20 | 11.141 | 46,2% |
| 30 | 13.812 | 57,3% |
| 50 | 16.807 | 69,7% |
| 100 | 20.030 | 83,1% |
| 150 | 21.581 | 89,5% |
| 200 | 22.481 | 93,2% |
| 300 | 23.467 | 97,3% |
| 531 | 24.118 | 100,0% |

- 50% dos imóveis estão em **24 fontes**; 80% em **85**; 90% em **156**; 95% em **235**.
- 531 fontes têm ao menos 1 imóvel à venda; 281 delas têm menos de 10 (somam 1.051); 370 têm menos de 20 (somam 2.301).
- 139 das 670 fontes do PBCV não têm nenhum imóvel à venda (vendem veículos e bens, ou estão paradas).

```
top  10 ██████████████                                     27,3%
top  20 ███████████████████████                            46,2%
top  50 ███████████████████████████████████                69,7%
top 100 ██████████████████████████████████████████         83,1%
top 200 ███████████████████████████████████████████████    93,2%
top 300 █████████████████████████████████████████████████  97,3%
```

## 3. Classificação A, B e C

Critério (sobre os imóveis à venda de cada fonte):

- **Q (qualidade)** = média de 7 percentuais: com foto, com edital ou documento, com avaliação, com área, com endereço com número (chave de endereço da Luneta), com data de praça e com cidade e UF.
- **Vivo** = à venda ÷ imóveis ativos no PBCV (mede o "quase tudo encerrado ou suspenso").
- **A, vale atualizar todo dia:** 100 ou mais à venda, Q de 50 ou mais e vivo de 50% ou mais.
- **B, semanal:** 20 ou mais à venda, Q de 35 ou mais e vivo de 30% ou mais; ou 100 ou mais à venda com Q de 35 ou mais.
- **C, não vale agora:** menos de 20 à venda (volume baixo), Q abaixo de 35 (dado ruim) ou vivo abaixo de 30% (quase tudo encerrado).
- **Consertar antes:** fonte com 100 ou mais à venda que é B ou C por dado ruim ou que está bloqueada, quebrada ou desatualizada. Vale mais consertar o adapter do que aumentar a frequência.

| Classe | Fontes | À venda | % | Acumulado | Importáveis | No site 01/10 | Repetidos da Caixa |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 34 | 12.906 | 53,5% | 53,5% | 12.574 | 9.632 | 2.940 |
| B | 90 | 5.320 | 22,1% | 75,6% | 4.596 | 3.673 | 44 |
| C | 546 | 5.892 | 24,4% | 100,0% | 4.831 | 2.712 | 0 |

- **Só A:** 12.906 imóveis à venda (53,5%), 12.574 importáveis, em 34 fontes.
- **A + B:** 18.226 imóveis à venda (75,6%), 17.170 importáveis, em 124 fontes.
- **Tudo:** 24.118 imóveis à venda, 22.001 importáveis, em 531 fontes.
- Motivos de C: dado ruim: 28 fontes, 3.165 imóveis; volume baixo: 509 fontes, 2.301 imóveis; quase tudo encerrado: 9 fontes, 426 imóveis.
- **Consertar antes (11 fontes, 3.047 imóveis à venda):** kleiloes.com.br (676, Q 28, ok), trileiloes.com.br (640, Q 29, ok), jmleiloes.com.br (315, Q 29, bloqueada), tabaleiloes.com.br (242, Q 45, ok), jmleiloes.leilao.br (217, Q 43, bloqueada), jeleiloes.com.br (201, Q 28, ok), faroonline.com.br (187, Q 29, ok), viannaleiloes.com.br (168, Q 49, ok), kronleiloes.com.br (135, Q 29, bloqueada), albertomacedoleiloes.com.br (134, Q 38, ok), webleiloes.com.br (132, Q 28, ok).

Leitura: um robô diário em 34 fontes cobre mais da metade do que está à venda. Somando as 90 semanais, chega a três quartos. O último quarto está espalhado em mais de 500 fontes pequenas: a rodada mensal do PBCV basta para elas. Entre as A, as que mais precisam de atualização diária são as de praça curta (coluna "Vence 7d" na tabela: % das praças que vencem até 08/10).

## 4. Top 50 por imóveis à venda

Bruto = "ativo" do PBCV (tipo_bem imovel/rural). Δ = bruto − à venda. No site = em 01/10. Caixa = à venda que já estão na base da Caixa na Luneta (seção 2 de `pbcv-ANALISE.md`). Foto, Aval., Área, End., Praça = % dos à venda. Coleta = última coleta da fonte que trouxe lotes.

| # | Fonte | Leiloeiro | Plataforma (adapter) | Bruto | À venda | Δ | No site | Caixa | Q | Foto | Aval. | Área | End. | Praça | Vence 7d | Saúde | Coleta | Classe |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | leiloesjudiciaismg.com.br | Álvaro Sérgio Fuzo | vlance | 997 | 998 | -1 | 651 | 0 | 75 | 70 | 99 | 59 | 0 | 100 | 64 | ok | 24/09 | A |
| 2 | kleiloes.com.br | Werno Klöckner Júnior | suporteleiloes_boxresultado | 676 | 676 | 0 | 23 | 0 | 28 | 0 | 0 | 0 | 0 | 100 | 99 | ok | 24/09 | C |
| 3 | megaleiloes.com.br | Fernando José Cerello G. Pereira | megaleiloes | 680 | 665 | 15 | 489 | 0 | 78 | 100 | 56 | 0 | 91 | 100 | 51 | ok | 24/09 | A |
| 4 | trileiloes.com.br | Cristiano da Rosa Schontag | suporteleiloes | 567 | 640 | -73 | 215 | 0 | 29 | 0 | 0 | 0 | 0 | 100 | 80 | ok | 24/09 | C |
| 5 | globoleiloes.com.br | Cassia Negrete Nunes Balbino | globoleiloes | 634 | 631 | 3 | 625 | 564 | 100 | 100 | 100 | 100 | 98 | 100 | 3 | ok | 24/09 | A |
| 6 | tonialleiloes.com.br | Andressa Sedrez Terres Tonial Ferreira | leilaopro | 617 | 615 | 2 | 611 | 495 | 71 | 100 | 0 | 99 | 0 | 99 | 97 | ok | 24/09 | A |
| 7 | leiloeiropublico.com.br | Rodolfo da Rosa Schöntag | leiloeiropublico | 605 | 600 | 5 | 65 | 0 | 80 | 100 | 86 | 73 | 0 | 100 | 92 | ok | 24/09 | A |
| 8 | lancecertoleiloes.com.br | Luciano Rodrigues | lancecertoleiloes | 596 | 595 | 1 | 595 | 350 | 84 | 100 | 2 | 92 | 97 | 100 | 98 | parcial | 24/09 | A |
| 9 | clicleiloes.com.br | Eduardo Schmitz | laravel_lotes | 593 | 593 | 0 | 593 | 573 | 83 | 0 | 82 | 100 | 98 | 100 | 0 | ok | 24/09 | A |
| 10 | 3torresleiloes.com.br | Marcos Roberto Torres | laravel_lotes | 584 | 579 | 5 | 579 | 508 | 83 | 0 | 84 | 100 | 99 | 100 | 99 | ok | 01/10 | A |
| 11 | luisleiloeiro.com.br | Luis Otavio Marcolino Shinkawa | leilaopro | 479 | 570 | -91 | 563 | 0 | 75 | 100 | 99 | 80 | 47 | 100 | 0 | ok | 24/09 | A |
| 12 | flexleiloes.com.br | José Luiz Pereira Vizeu | flexleiloes | 504 | 504 | 0 | 11 | 144 | 72 | 99 | 2 | 99 | 0 | 100 | 99 | ok | 24/09 | A |
| 13 | portalzuk.com.br | Alessandra Cavalcanti Antunes | portalzuk | 624 | 503 | 121 | 327 | 0 | 62 | 100 | 82 | 66 | 0 | 88 | 59 | ok | 24/09 | A |
| 14 | pestanaleiloes.com.br | Liliamar Pestana Gomes | pestanaleiloes | 486 | 485 | 1 | 152 | 0 | 83 | 96 | 0 | 98 | 88 | 100 | 78 | ok | 24/09 | A |
| 15 | lucasleiloeiro.com.br | Lucas Rafael Antunes Moreira | apiengine | 619 | 473 | 146 | 472 | 306 | 71 | 100 | 100 | 2 | 97 | 100 | 98 | ok | 24/09 | A |
| 16 | destakleiloes.com.br | Marcus Vinicius Yoshimi Uebara | apiengine | 940 | 448 | 492 | 308 | 43 | 56 | 98 | 100 | 1 | 1 | 98 | 49 | ok | 24/09 | B |
| 17 | anabrasilleiloes.com.br | Ana Carolina Brasil de Oliveira Maia | bomvalor | 433 | 432 | 1 | 432 | 0 | 56 | 100 | 0 | 0 | 94 | 100 | 3 | ok | 01/10 | A |
| 18 | costanetoleiloeiro.com.br | Sebastiao Felix da Costa Neto | bomvalor | 433 | 432 | 1 | 432 | 0 | 56 | 100 | 0 | 0 | 94 | 100 | 3 | ok | 01/10 | A |
| 19 | grupolance.com.br | Adriano Piovezan Fonte | grupolance | 0 | 364 | -364 | 357 | 0 | 82 | 100 | 100 | 76 | 0 | 100 | 11 | ok | 24/09 | A |
| 20 | mercado.bomvalor.com.br | Sostenes de Almeida Rabelo | bomvalor | 346 | 338 | 8 | 275 | 0 | 53 | 100 | 0 | 0 | 71 | 100 | 22 | parcial | 24/09 | A |
| 21 | jmleiloes.com.br | Joney Marcelo Lopes Ferreira | superbid_lojas | 369 | 315 | 54 | 54 | 0 | 29 | 0 | 0 | 0 | 0 | 100 | 96 | bloqueada | 17/09 | C |
| 22 | turanileiloes.com.br | Gustavo Turani | turani | 305 | 310 | -5 | 108 | 0 | 54 | 46 | 100 | 45 | 0 | 100 | 5 | ok | 24/09 | A |
| 23 | leiloei.com | Felipe Nunes Gomes Teixeira Bignardi | bomvalor | 297 | 289 | 8 | 260 | 0 | 52 | 100 | 0 | 0 | 68 | 100 | 15 | ok | 24/09 | A |
| 24 | biasileiloes.com.br | Eduardo Consentino | blueintra_biasi | 285 | 285 | 0 | 283 | 0 | 57 | 100 | 0 | 0 | 2 | 100 | 87 | ok | 01/10 | A |
| 25 | leilaovip.com.br | Vicente Paulo | leilaovip_com | 277 | 277 | 0 | 130 | 0 | 85 | 100 | 28 | 92 | 82 | 93 | 76 | ok | 24/09 | A |
| 26 | hastapublica.com.br | Euclides Maraschi Junior | hastapublica_ci | 246 | 246 | 0 | 220 | 0 | 71 | 100 | 100 | 0 | 0 | 100 | 34 | ok | 24/09 | A |
| 27 | jrleiloes.com.br | Joyce Ribeiro | container | 278 | 243 | 35 | 173 | 0 | 64 | 67 | 91 | 97 | 0 | 100 | 51 | ok | 24/09 | A |
| 28 | frazaoleiloes.com.br | Ana Claudia Carolina Campos Frazão | blueintra_frazao | 254 | 243 | 11 | 43 | 0 | 85 | 100 | 5 | 98 | 95 | 100 | 90 | ok | 24/09 | A |
| 29 | tabaleiloes.com.br | Wesley Oliveira Ascanio | apiengine | 325 | 242 | 83 | 150 | 0 | 45 | 100 | 9 | 8 | 7 | 100 | 59 | ok | 24/09 | B |
| 30 | leilaobrasil.com.br | Irani Flores | suporteleiloes | 220 | 221 | -1 | 203 | 0 | 51 | 0 | 0 | 0 | 59 | 100 | 24 | ok | 24/09 | A |
| 31 | centralsuldeleiloes.com.br | Lúcio Ubialli | centralsul | 227 | 218 | 9 | 164 | 0 | 53 | 100 | 0 | 0 | 0 | 100 | 21 | ok | 01/10 | A |
| 32 | jmleiloes.leilao.br | Joney Marcelo Lopes Ferreira | superbid | 262 | 217 | 45 | 32 | 0 | 43 | 0 | 0 | 0 | 100 | 100 | 96 | bloqueada | 18/09 | B |
| 33 | jeleiloes.com.br | Jorge Vitorio Espolador | suporteleiloes_boxresultado | 201 | 201 | 0 | 153 | 0 | 28 | 0 | 0 | 0 | 0 | 100 | 39 | ok | 24/09 | C |
| 34 | dhleiloes.com.br | Daniel Hamoui | dhleiloes | 191 | 191 | 0 | 190 | 0 | 70 | 99 | 11 | 88 | 0 | 100 | 18 | ok | 01/10 | A |
| 35 | faroonline.com.br | Ronaldo Sérgio M. R. Faro | ares | 105 | 187 | -82 | 1 | 0 | 29 | 93 | 0 | 0 | 1 | 100 | 8 | ok | 24/09 | C |
| 36 | doleiloes.com.br | Daniel Oliveira Junior | container | 193 | 181 | 12 | 181 | 0 | 57 | 7 | 97 | 96 | 0 | 100 | 1 | ok | 01/10 | A |
| 37 | vincoleiloes.com.br | Antonio Carlos Celso Santos Frazao | vinco_sishp | 172 | 168 | 4 | 160 | 0 | 97 | 92 | 100 | 99 | 90 | 99 | 6 | ok | 24/09 | A |
| 38 | viannaleiloes.com.br | Priscila Louzada Vianna da Silva da Fonseca | msis | 168 | 168 | 0 | 149 | 0 | 49 | 55 | 0 | 0 | 1 | 100 | 1 | ok | 24/09 | B |
| 39 | leje.com.br | Denys Pyerre de Oliveira | leje | 158 | 158 | 0 | 147 | 0 | 94 | 100 | 99 | 66 | 94 | 100 | 27 | ok | 24/09 | A |
| 40 | mnleilao.com.br | Marcus Dantas Nepomuceno | mnleilao | 158 | 156 | 2 | 0 | 0 | 58 | 12 | 100 | 0 | 0 | 100 | 100 | ok | 24/09 | A |
| 41 | kronleiloes.com.br | Helcio Kronberg | superbid_lojas | 147 | 135 | 12 | 84 | 0 | 29 | 0 | 0 | 0 | 0 | 100 | 46 | bloqueada | 17/09 | C |
| 42 | albertomacedoleiloes.com.br | Alberto José Marchi Macedo | ares | 134 | 134 | 0 | 66 | 0 | 38 | 84 | 1 | 0 | 9 | 100 | 48 | ok | 01/10 | B |
| 43 | webleiloes.com.br | Tiago Tessler | suporteleiloes_oferta | 132 | 132 | 0 | 103 | 0 | 28 | 0 | 0 | 0 | 0 | 99 | 27 | ok | 24/09 | C |
| 44 | d1lance.com.br | José Roberto Neves Amorim | d1lance | 127 | 128 | -1 | 89 | 0 | 94 | 97 | 70 | 99 | 92 | 100 | 63 | ok | 24/09 | A |
| 45 | legisleiloes.com.br | Camila Tiemi Sanches Pereira | apiengine | 1.084 | 117 | 967 | 88 | 0 | 57 | 100 | 100 | 12 | 0 | 100 | 36 | ok | 24/09 | B |
| 46 | inovaleilao.com.br | Diogo Mattos Dias Martins | apiengine | 197 | 114 | 83 | 17 | 0 | 61 | 99 | 100 | 68 | 4 | 100 | 65 | ok | 24/09 | A |
| 47 | freitasleiloeiro.com.br | Sérgio Villa Nova de Freitas | freitas | 106 | 101 | 5 | 35 | 0 | 82 | 100 | 0 | 91 | 84 | 100 | 92 | ok | 24/09 | A |
| 48 | lancenoleilao.com.br | Carla Sobreira Umino | gestaoleiloes | 100 | 98 | 2 | 95 | 0 | 29 | 100 | 3 | 6 | 0 | 0 | 0 | parcial | 24/09 | C |
| 49 | grandesleiloes.com.br | Norton Jochims Fernandes | leilaopro | 103 | 96 | 7 | 42 | 0 | 49 | 26 | 16 | 51 | 0 | 100 | 11 | ok | 24/09 | B |
| 50 | leiloesgold.com.br | Uilian Aparecido da Silva | soleon | 95 | 95 | 0 | 94 | 0 | 93 | 97 | 100 | 75 | 78 | 100 | 28 | ok | 24/09 | B |

O nome do leiloeiro vem do campo `leiloeiro` dos lotes, quando a fonte informa, ou das juntas comerciais (`expansao_br/leiloeiros_br.json`). Numa casa com vários leiloeiros aparece o mais citado. É nome de profissional público, que o contrato permite mostrar.

## 5. Por que o "ativo" bruto engana: as 25 fontes com maior diferença

| Fonte | Bruto | Fora da regra de imóvel | Zumbis | Suspensos sem data futura | Encerrados/vendidos | Sem situação | À venda | À venda / bruto |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fidalgoleiloes.com.br | 1.339 | 286 | 1.028 | 0 | 0 | 0 | 25 | 1,9% |
| soleiloes.com.br | 1.137 | 1 | 0 | 0 | 1.120 | 0 | 16 | 1,4% |
| legisleiloes.com.br | 1.084 | 15 | 0 | 952 | 0 | 0 | 117 | 10,8% |
| joaoemilio.com.br | 542 | 11 | 531 | 0 | 0 | 0 | 0 | 0,0% |
| sublimeleiloes.com.br | 587 | -4 | 0 | 506 | 0 | 0 | 85 | 14,5% |
| destakleiloes.com.br | 940 | 8 | 0 | 484 | 0 | 0 | 448 | 47,7% |
| francoleiloes.com.br | 438 | 0 | 0 | 378 | 0 | 0 | 60 | 13,7% |
| pecinileiloes.com.br | 355 | -17 | 9 | 332 | 0 | 0 | 31 | 8,7% |
| vivaleiloes.com.br | 349 | 1 | 0 | 310 | 0 | 0 | 38 | 10,9% |
| fernandoleiloeiro.com.br | 386 | 19 | 0 | 281 | 0 | 0 | 86 | 22,3% |
| projudleiloes.com.br | 287 | -8 | 0 | 281 | 0 | 0 | 14 | 4,9% |
| leilaooficialonline.com.br | 260 | 18 | 0 | 203 | 0 | 0 | 39 | 15,0% |
| purcenaleiloes.com.br | 208 | -23 | 0 | 0 | 0 | 216 | 15 | 7,2% |
| multipliqueleiloes.com.br | 197 | 0 | 0 | 186 | 0 | 0 | 11 | 5,6% |
| ferreiraleiloes.com.br | 191 | -1 | 0 | 0 | 0 | 184 | 8 | 4,2% |
| alienajud.com.br | 183 | 12 | 0 | 152 | 0 | 0 | 19 | 10,4% |
| amazonasleiloes.com.br | 174 | 15 | 0 | 144 | 0 | 0 | 15 | 8,6% |
| andreluizleiloes.com.br | 170 | 149 | 0 | 0 | 0 | 0 | 21 | 12,4% |
| lucasleiloeiro.com.br | 619 | 9 | 0 | 137 | 0 | 0 | 473 | 76,4% |
| rossileiloes.com.br | 153 | 144 | 0 | 0 | 0 | 0 | 9 | 5,9% |
| faleiloes.com.br | 146 | -338 | 0 | 0 | 476 | 1 | 7 | 4,8% |
| rigolonleiloes.com.br | 191 | 89 | 45 | 0 | 0 | 0 | 57 | 29,8% |
| jonasleiloeiro.com.br | 163 | 11 | 0 | 113 | 0 | 0 | 39 | 23,9% |
| portalzuk.com.br | 624 | -16 | 0 | 0 | 0 | 137 | 503 | 80,6% |
| lancetotal.com.br | 120 | 116 | 0 | 0 | 0 | 0 | 4 | 3,3% |

"Fora da regra de imóvel" negativo = a regra achou imóveis que o PBCV tinha posto em desconhecido ou diversos (ex.: grupolance, faroonline, trileiloes).

## 6. Saúde das fontes

Pela última linha de `coleta_fonte` de cada fonte. "Desatualizada" = a última coleta que trouxe lotes é anterior a 23/09 (não entrou nas duas últimas rodadas). No `relatorio-leiloeiros.json` a saúde segue o enum da Luneta (ok, parcial, quebrado, bloqueado); a desatualização aparece em `dias_sem_coleta_valida`.

| Saúde | Fontes | Imóveis à venda | Classe A | Classe B |
| --- | ---: | ---: | ---: | ---: |
| ok | 514 | 21.265 | 32 | 82 |
| parcial | 74 | 1.786 | 2 | 6 |
| desatualizada | 20 | 4 | 0 | 0 |
| bloqueada | 59 | 1.063 | 0 | 2 |
| quebrada | 3 | 0 | 0 | 0 |

Fontes com 20 ou mais imóveis à venda e coleta com problema: jmleiloes.com.br (315, bloqueada), jmleiloes.leilao.br (217, bloqueada), kronleiloes.com.br (135, bloqueada), rmoyses.com.br (92, bloqueada), argonetworkleiloes.com.br (40, bloqueada), duarteleiloes.com.br (27, bloqueada), andreluizleiloes.com.br (21, bloqueada).

A rodada de 01/10 parou em 246 dos 823 sites; para 577 a última coleta é de 24/09. Causas: desafio Cloudflare em 55 fontes (a família Superbid de lojas próprias), 403 do filtro de robôs em 4, layout mudado em 2.

## 7. Plataformas (adapters) que carregam o volume

| Adapter | Fontes com imóvel à venda | Imóveis à venda | % | Fontes A |
| --- | ---: | ---: | ---: | ---: |
| apiengine | 56 | 2.407 | 10,0% | 2 |
| leilaopro | 77 | 2.336 | 9,7% | 2 |
| laravel_lotes | 21 | 1.555 | 6,4% | 2 |
| bomvalor | 4 | 1.491 | 6,2% | 4 |
| suporteleiloes | 29 | 1.290 | 5,3% | 1 |
| vlance | 1 | 998 | 4,1% | 1 |
| soleon | 57 | 923 | 3,8% | 0 |
| suporteleiloes_boxresultado | 2 | 877 | 3,6% | 0 |
| container | 17 | 779 | 3,2% | 2 |
| megaleiloes | 1 | 665 | 2,8% | 1 |
| superbid_lojas | 15 | 644 | 2,7% | 0 |
| globoleiloes | 1 | 631 | 2,6% | 1 |
| leiloeiropublico | 1 | 600 | 2,5% | 1 |
| lancecertoleiloes | 1 | 595 | 2,5% | 1 |
| flexleiloes | 1 | 504 | 2,1% | 1 |

Consertar ou acelerar um adapter de família (apiengine, leilaopro, laravel_lotes, bomvalor, suporteleiloes) mexe em muitas fontes de uma vez.

## 8. Lista das fontes B (semanal)

destakleiloes.com.br (448), tabaleiloes.com.br (242), jmleiloes.leilao.br (217), viannaleiloes.com.br (168), albertomacedoleiloes.com.br (134), legisleiloes.com.br (117), grandesleiloes.com.br (96), leiloesgold.com.br (95), satoleiloes.com.br (94), leiloesrn.com.br (90), giordanoleiloes.com.br (90), renovarleiloes.com.br (89), danielgarcialeiloes.com.br (89), mullerleiloes.com.br (88), alemaoleiloeiro.com.br (86), hastapublica.lel.br (84), portalbayit.com.br (84), danielleiloes.com.br (82), alvaroleiloes.com.br (81), picellileiloes.com.br (80), bastonleiloes.leilao.br (80), mercadoleiloes.com.br (75), vegasleiloes.com.br (70), leilopar.com.br (63), jacleiloes.com.br (62), peterlongo.leilao.br (59), montenegroleiloes.com.br (59), peterlongoleiloes.com.br (59), mpleilao.com.br (58), baldisseraleiloeiros.com.br (57), nakakogueleiloes.com.br (57), pietosoleiloes.com.br (57), rigolonleiloes.com.br (57), hammer.lel.br (56), marcoantonioleiloeiro.com.br (55), szortykaleiloes.com.br (51), apiceleiloes.com.br (51), nasarleiloes.com.br (50), rochaleiloes.com.br (49), lutheroleiloes.com.br (49), oesteleiloes.com.br (48), leiloesceruli.com.br (48), balbinoleiloes.com.br (48), gtleiloes.com.br (46), positivoleiloes.com.br (46), rauppleiloes.com.br (46), alfaleiloes.com (45), cristianoescolaleiloes.com.br (45), isaiasleiloes.com.br (44), nsleiloes.leilao.br (44), alexandrepedrosaleiloeiro.com.br (44), santoseborinleiloes.com.br (43), zallileiloes.com.br (42), damianileiloes.com.br (40), argonetworkleiloes.com.br (40), extrajustleiloes.com.br (37), leiloeiro.lel.br (35), casareisleiloes.com.br (35), lucianleiloes.com.br (34), baldisseraleiloes.com.br (32), valland.com.br (31), gustavoleiloeiro.com.br (31), silvaleiloes.com.br (29), cunhaleiloeiro.com.br (29), santamarialeiloes.com.br (29), alinemarquesleiloeira.lel.br (28), monago.com.br (27), italoleiloes.com (27), bspleiloes.com.br (27), mazzollileiloes.com.br (26), alexandrecostaleiloes.com.br (26), regionalleiloes.com.br (25), silveiraleiloes.com.br (25), rogeriomenezes.com.br (25), onildobastos.com.br (25), raicherleiloes.com.br (25), leiloariasmart.com.br (24), gfleiloes.com.br (24), atrioleiloes.com.br (24), cargneluttileiloes.com.br (24), chbarbosaleiloes.com.br (23), alessandroteixeiraleiloes.com.br (23), oroleiloes.lel.br (23), arremate.lel.br (22), victordortaleiloes.com.br (22), jorgebrasil.lel.br (22), simonleiloes.com.br (22), calilleiloes.com.br (21), marceloleiloeiro.com.br (21), wspleiloes.com.br (20).

## 9. Arquivos

- `relatorio-leiloeiros.json`: o relatório por leiloeiro no formato da Luneta (`base/leiloeiros/relatorio-leiloeiros.schema.json`), conferido com o validador da Luneta e com jsonschema. Traz as 670 fontes; `ativos` = no site em 01/10.
- `pbcv-ANALISE.md`: a regra de imóvel, a repetição com a Caixa, as tags e a LGPD.
- `pbcv-matriz-tags.csv`: a matriz das 26 tags.

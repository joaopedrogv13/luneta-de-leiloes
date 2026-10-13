# Deduplicação (base/dedup)

O mesmo imóvel aparece no portal do banco, no do leiloeiro e em agregadores, às vezes duas vezes na mesma fonte (a Caixa lista o mesmo apartamento em Venda Online e em Leilão SFI). Cada imóvel gravado leva duas chaves, calculadas em `gravar.ts`, e o site agrupa por elas:

- `chave_dedup`: matrícula + cartório quando o conector informa (`mat:3550308:6:147300`); senão, a de endereço.
- `chave_endereco`: logradouro + número + unidades no município (`end:1200203:rua purus:sn:lt 10 qd 272`), mais o bairro quando o endereço é fraco.

## Regras

**Município** é o código IBGE (`base/geo`), não o texto da cidade: `SANT' ANA DO LIVRAMENTO` e `Santana do Livramento` dão a mesma chave. No DF, que é um município só, a chave de endereço usa a região administrativa escrita na cidade (`df-ceilandia`), porque `QR 01 CJ A LT 7 CASA 7` existe em várias regiões; a de matrícula usa o DF inteiro (os ofícios de registro valem para o DF todo). Cidade fora da tabela vira `uf-slug` (`pe-terra-vermelha`).

**Endereço em partes** (`endereco.ts`):

- tipo do logradouro por extenso (`R.`/`RUA` → rua, `AV.`/`AVENIDA` → avenida, `TV.`, `ROD.`, `EST.`...), nome sem partículas, títulos por extenso (`DR.` → doutor, `PRES.` → presidente), romanos em arábicos (`PIO XII` = `PIO 12`, `XV DE NOVEMBRO` = `15 DE NOVEMBRO`), código de rodovia preservado (`BR-316`, `PE-060` não vira "padre");
- número: o que vem depois de `N.`/`nº`/`número`; sem marcador, o número no fim do logradouro (`Av Paulista 1000`); `S/N`, `SN`, `s/nº`, `sem número` e `0` são "sn"; `221-B` = `221B`;
- unidades, em ordem alfabética (a ordem muda entre fontes): apartamento, bloco, torre, casa (e sobrado), sala, loja, box, vaga, unidade, lote, quadra (e quarteirão), km, conjunto, setor, área, gleba, chácara, zona, pavimento; listas de lotes (`LTS 4 5 13 E 14`, `LOTES 01 AO 20`); `fundos`/`frente`; valor solto depois do número vira `u <valor>` (`N. 725, 02`);
- formatos sem rua: `QUADRA 10, N. SN, Apto 201, LT 25` (entorno do DF), `LOTE 02, N. SN, QD 16` (a quadra vira o logradouro), `LT 02 QD 01, N. 53D, RUA CROACIA` (rua no fim), `QR-01` (designação do DF).

**Quando não há chave de endereço** (melhor não juntar do que juntar errado):

- sem número e sem unidade (`RUA BOA VISTA, N. SN,`; os 4 terrenos de Chapadinha/MA com `AVENIDA PRINCIPAL, N. 00` são imóveis diferentes);
- fração (`LT 02 PARTE`, `fração ideal`, `remanescente`): três partes do mesmo lote em Votuporanga/SP têm o mesmo texto;
- logradouro vazio ou curto demais.

**Bairro** entra quando o logradouro é genérico (`Rua A`, `Rua 10`, `Rua Oito`, `Rua Projetada`, `Avenida Principal`, `Quadra 28`) **e** o resto é pouco específico (menos de 3 entre número e unidades). Bairro sempre na chave separaria duplicatas reais, porque as fontes escrevem o bairro de jeitos diferentes; bairro nunca juntaria loteamentos vizinhos com a mesma numeração. As duas coisas aparecem no CSV da Caixa (abaixo).

## Precisão medida

`node --experimental-strip-types base/dedup/medir.ts --arquivo Lista_imoveis_geral.csv` mede os três modos de bairro (`quando_fraco`, o gravado; `nunca`; `sempre`). Números com o CSV completo da Caixa de 08/10/2026 (21.226 imóveis):

**Cobertura.** 20.997 imóveis (98,92%) ganham chave de endereço. Sem chave: 111 sem número nem unidade, 111 frações, 7 sem logradouro reconhecível.

**Grupos dentro da Caixa** (mesma chave, N° de imóvel diferente). Não há gabarito; um grupo é "consistente" quando todos têm o mesmo tipo e a mesma área (privativa ou do terreno, 2% de tolerância), o que é um limite superior da precisão (dois apartamentos iguais sem número de apartamento pareceriam consistentes).

| Modo do bairro | Grupos | Anúncios | Consistentes | O que muda |
|---|---|---|---|---|
| **quando_fraco** (gravado) | 10 | 20 | 9 (90%) | |
| nunca | 12 | 24 | 10 (83%) | junta `QUADRA 28, LT 05A` de dois bairros de Santo Antônio do Descoberto/GO (casas de 65,57 e 67,6 m²) e `RUA 18, QD 17, LT 12` de dois loteamentos de Cocalzinho de Goiás/GO |
| sempre | 7 | 14 | 6 (86%) | separa três pares que são o mesmo imóvel com bairro escrito diferente |

Os 10 grupos do modo gravado, um a um:

- 9 são o mesmo imóvel listado duas vezes (mesmo tipo e mesma área): Santa Rita/PB, casa em Venda Direta Online e em Leilão SFI; Rio de Janeiro/RJ, Rua Itatinga 140 ap 404, em Venda Direta Online e Venda Online; Itaboraí/RJ, Rua Dona Bela ap 105, em Venda Online (bairro BELA VISTA) e Leilão SFI (TRES PONTES); Nova Iguaçu/RJ, Rua Oito 454 casa 2 (bairros LAGOINHA e JARDIM SANTA MARIA); Bayeux/PB, Rua Natividade 37 (COMERCIAL NORTE e CENTRO); e quatro apartamentos repetidos em Jaboatão/PE, Belford Roxo/RJ e Itaboraí/RJ (2).
- 1 é indecidível pelo texto: `RUA ARAGUAIA, N. SN, Apto 201, BL 26, GLEBA GA2`, Luziânia/GO, dois anúncios com 57,96 e 56,62 m² (provavelmente condomínios vizinhos com a mesma numeração). Só a matrícula separa.

**Robustez a formato** (o mesmo endereço escrito por outra fonte). Cada endereço da Caixa foi reescrito como um leiloeiro escreveria (`RUA` → `R.`, `AVENIDA` → `Av.`, `N. S/N` → `s/nº`, `N. 62` → `nº 62`, `LT 10 QD 272` → `Quadra 272, Lote 10`, `Apto` → `apartamento`, `BL` → `Bloco`, caixa de título, bairro `JARDIM X` → `Jd. X`):

| | Mesma chave | Caiu na chave de outro imóvel |
|---|---|---|
| chave nova | 20.994 de 20.997 (99,99%) | 0 |
| chave antiga do núcleo (`a8e67c3`, endereço achatado, sem bairro) | 17.204 de 21.024 (81,83%) | 0 |

As 3 reescritas que mudam de chave são ambíguas de verdade (`RUA EM PROJETO N, N. SN` reescrito como `R. Em Projeto N, S/Nº`: o "N" vira marcador de número).

**Comparação com a chave antiga** no mesmo CSV: ela gerava 12 grupos com 28 anúncios, entre eles os 4 terrenos de Chapadinha, os 3 de Capitão Poço (80 m² e 8.000 m²) e as 3 frações de Votuporanga, todos imóveis diferentes; e trocava de chave quando a ordem de lote e quadra mudava.

## Limites conhecidos

- Não há gabarito entre fontes: as medições acima são dentro da Caixa e com reescrita sintética. Quando os conectores de leiloeiro estiverem gravando, `npm run base:status` mostra quantos grupos cruzam fontes (`Duplicatas (mesma chave_dedup)`), e vale conferir uma amostra à mão.
- Endereço com o mesmo texto e imóveis diferentes (o caso de Luziânia) só se separa pela matrícula. A Caixa só dá a matrícula na ficha (`--detalhes`).
- Matrícula sem cartório vira cartório `u`: numa cidade com vários registros de imóveis, duas matrículas de mesmo número em cartórios diferentes cairiam juntas se nenhuma das fontes informasse o cartório.
- Leiloeiro que escreve só o bairro, sem a rua, ou o endereço dentro da descrição (`situado à Rua X, nº 67, no 26º Subdistrito`), precisa que o conector extraia o endereço antes.

# Deduplicação (base/dedup)

O mesmo imóvel aparece no portal do banco, no do leiloeiro e em agregadores, às vezes duas vezes na mesma fonte (a Caixa lista o mesmo apartamento em Venda Online e em Leilão SFI). Cada imóvel gravado leva duas chaves, calculadas em `gravar.ts`:

- `chave_dedup`: matrícula + cartório quando o conector informa (`mat:3550308:6:147300`); senão, a de endereço.
- `chave_endereco`: logradouro + número + unidades no município (`end:1200203:rua purus:sn:lt 10 qd 272`), mais o bairro quando o endereço é fraco.

**Como agrupar.** Dois anúncios são o mesmo imóvel quando dividem a `chave_dedup`, ou quando dividem a `chave_endereco` e não têm matrículas diferentes (`mesmoImovel` e `agruparDuplicatas` em `index.ts`). A `chave_dedup` sozinha não basta: a Caixa só dá a matrícula na ficha (`--detalhes`) e a Leilões Judiciais quase sempre dá, então o mesmo apartamento fica com `mat:...` numa fonte e `end:...` na outra. Endereço com duas matrículas diferentes não junta ninguém (só a matrícula separa). `npm run base:status` mostra as duas contagens: "Duplicatas (mesma chave_dedup)" e "Mesmo imóvel (chave_dedup ou chave_endereco)", com os grupos entre fontes e os endereços com matrículas diferentes. A exportação leva as duas chaves (`chave_dedup` e `chave_endereco`) para o site aplicar a mesma regra.

## Regras

**Município** é o código IBGE (`base/geo`), não o texto da cidade: `SANT' ANA DO LIVRAMENTO` e `Santana do Livramento` dão a mesma chave. No DF, que é um município só, a chave de endereço usa a região administrativa escrita na cidade (`df-ceilandia`), porque `QR 01 CJ A LT 7 CASA 7` existe em várias regiões; a de matrícula usa o DF inteiro (os ofícios de registro valem para o DF todo). Cidade fora da tabela vira `uf-slug` (`pe-terra-vermelha`).

**Matrícula**: a primeira do texto, só com dígitos; o ponto é o único separador de milhar (`147.300` = `147300`). Espaço, hífen, vírgula, barra e "e" separam matrículas: `9740 9741` e `9740 - 9741` dão `9740`, nunca `97409741`.

**Endereço em partes** (`endereco.ts`). O texto é dividido em campos (vírgula, ponto e vírgula e hífen entre espaços) antes de virar palavras:

- logradouro: vai até a primeira vírgula (ou até o primeiro número com marcador, unidade com valor ou fração). Tipo por extenso (`R.`/`RUA` → rua, `AV.`/`AVENIDA` → avenida, `TV.`, `ROD.`, `EST.`...), nome sem partículas, títulos por extenso (`DR.` → doutor), romanos em arábicos (`PIO XII` = `PIO 12`), código de rodovia preservado (`BR-316`, `PE-060` e `PB - 356`). "d" e "e" só são partícula antes de outra palavra (`D'Ávila`, `Santos e Silva`): `RUA D`, `RUA E` e `RUA PROJETADA D/E` mantêm a letra. Marcador logo depois do tipo é parte do nome: `RUA N-1` e `RUA Nº 06` são as ruas "n 1" e "n 6", e o número da casa vem do marcador seguinte (`RUA N-1, N. 50`);
- número, nesta ordem: o do marcador no primeiro campo depois do logradouro (`N. 62`, `nº 62`, `s/nº`); sem marcador ali, o primeiro campo que começa por número (`Rua X, 493, Vila Industrial`; `Rua Dardanelos, 411 - Apto 162`); senão um marcador mais adiante; senão um campo que é só número; senão o número no fim do logradouro (`Av Paulista 1000`). `S/N`, `SN`, `sem número` e `0` são "sn"; `221-B` = `221B`; `N. 540, A` = `540A`; `nº 18 e Rua Monte Alegre nº 270` dá 18;
- unidades, em ordem alfabética (a ordem muda entre fontes): apartamento, bloco, torre, casa (e sobrado), sala, loja, box, vaga, unidade, lote (e `LOT 14`), quadra (e quarteirão), km, conjunto, setor, área, gleba, chácara, zona, pavimento. O "nº" entre o rótulo e o valor é pulado: `apartamento nº 91` = `Apto 91`, `CASA Nº 08`, `LOTE N.17`, `VAGA N 52`. Listas de lotes (`LTS 4 5 13 E 14`, `LT 02, 03 E 04`, `LOTES 15, 16, 17`). Valor solto num campo próprio vira `u <valor>` (`N. 725, 02`);
- cidade e bairro escritos no texto saem: campo `Cidade/UF`, `UF` no fim, o nome da cidade informada (menos quando vem antes de `Cidade/UF`, aí é bairro de mesmo nome) e o bairro informado (inclusive escrito com hífen, `Cidade Jardins - Etapa B`). O bairro escrito logo antes da cidade (`..., apto 21, Vila Prudente, São Paulo/SP`) não dá unidade (`Jardim América II` não vira `u 2`) e, se a fonte não informa o bairro à parte, é ele que entra na chave quando o bairro é preciso. Complemento que começa como nome de bairro (`PARQUE HUMAITA III`, `LOTEAMENTO VALE DE SANTA RITA I`) também não dá unidade;
- formatos sem rua: `QUADRA 10, N. SN, Apto 201, LT 25` (entorno do DF), `LOTE 02, N. SN, QD 16` (a quadra vira o logradouro), `LT 02 QD 01, N. 53D, RUA CROACIA` (rua no fim), `QR-01` (designação do DF).

**Quando não há chave de endereço** (melhor não juntar do que juntar errado):

- sem número e sem unidade (`RUA BOA VISTA, N. SN,`; os 4 terrenos de Chapadinha/MA com `AVENIDA PRINCIPAL, N. 00` são imóveis diferentes);
- fração (`LT 02 PARTE`, `fração ideal`, `remanescente`): três partes do mesmo lote em Votuporanga/SP têm o mesmo texto;
- logradouro vazio ou curto demais (`apto. nº 21` sozinho). Rua sem nome (`RUA, N. SN, CS 03 LT 20A QD 20`) só vira chave com o bairro, que então entra sempre.

**Bairro** entra quando o logradouro é genérico (`Rua A`, `Rua D`, `Rua 10`, `Rua Oito`, `Rua N-1`, `Rua Projetada`, `Avenida Principal`, `Quadra 28`) **e** o resto é pouco específico (menos de 3 entre número e unidades), ou quando a rua não tem nome. Bairro sempre na chave separaria duplicatas reais, porque as fontes escrevem o bairro de jeitos diferentes; bairro nunca juntaria loteamentos vizinhos com a mesma numeração. As duas coisas aparecem no CSV da Caixa (abaixo).

## Precisão medida

`node --experimental-strip-types base/dedup/medir.ts --arquivo Lista_imoveis_geral.csv` mede cobertura, grupos e as reescritas nos três modos de bairro (`quando_fraco`, o gravado; `nunca`; `sempre`). Números com o CSV completo da Caixa de 08/10/2026 (21.226 imóveis):

**Cobertura.** 20.999 imóveis (98,93%) ganham chave de endereço. Sem chave: 109 sem número nem unidade, 111 frações, 7 sem logradouro reconhecível.

**Grupos dentro da Caixa** (mesma chave, N° de imóvel diferente). Não há gabarito; um grupo é "consistente" quando todos têm o mesmo tipo e a mesma área (privativa ou do terreno, 2% de tolerância), o que é um limite superior da precisão (dois apartamentos iguais sem número de apartamento pareceriam consistentes).

| Modo do bairro | Grupos | Anúncios | Consistentes | O que muda |
|---|---|---|---|---|
| **quando_fraco** (gravado) | 10 | 20 | 9 (90%) | |
| nunca | 12 | 24 | 10 (83%) | junta `QUADRA 28, LT 05A` de dois bairros de Santo Antônio do Descoberto/GO (casas de 65,57 e 67,6 m²) e `RUA 18, QD 17, LT 12` de dois loteamentos de Cocalzinho de Goiás/GO |
| sempre | 7 | 14 | 6 (86%) | separa três pares que são o mesmo imóvel com bairro escrito diferente |

Os 10 grupos do modo gravado, um a um:

- 9 são o mesmo imóvel listado duas vezes (mesmo tipo e mesma área): Santa Rita/PB, casa em Venda Direta Online e em Leilão SFI; Rio de Janeiro/RJ, Rua Itatinga 140 ap 404, em Venda Direta Online e Venda Online; Itaboraí/RJ, Rua Dona Bela ap 105, em Venda Online (bairro BELA VISTA) e Leilão SFI (TRES PONTES); Nova Iguaçu/RJ, Rua Oito 454 casa 2 (bairros LAGOINHA e JARDIM SANTA MARIA); Bayeux/PB, Rua Natividade 37 (COMERCIAL NORTE e CENTRO); e quatro apartamentos repetidos em Jaboatão/PE, Belford Roxo/RJ e Itaboraí/RJ (2).
- 1 é indecidível pelo texto: `RUA ARAGUAIA, N. SN, Apto 201, BL 26, GLEBA GA2`, Luziânia/GO, dois anúncios com 57,96 e 56,62 m² (provavelmente condomínios vizinhos com a mesma numeração). Só a matrícula separa.

Comparado com a versão anterior desta chave (`b0be063`), 524 chaves da Caixa mudaram e os grupos são os mesmos 10. As mudanças principais: 56 endereços que perdiam uma unidade escrita com "nº" no meio (`CASA Nº 08`, `VAGA N 52`, `LOTE Nº 05`), 96 ruas D e E que perdiam o nome, 52 com `N. LT 20`, `N. .` ou `N. Nº 47`, em que o "n" ia para o nome da rua, `RUA N-1`/`RUA Nº 06` com o número certo, e valores que grudavam no rótulo errado (`BL B, 1º PAV` dava `bl b1`; `Apto 406, T 03` dava `ap 406t`).

**Robustez a formato** (o mesmo endereço escrito por outra fonte). Cada endereço da Caixa com chave foi reescrito em cinco estilos (`ESTILOS` em `medir.ts`); "outro imóvel" é a reescrita cair na chave original de outro imóvel da Caixa, e "grupos com área diferente" conta os grupos que as reescritas formam entre si com tipo ou área diferente (no original há 1, o de Luziânia):

| Estilo | Mesma chave | Sem chave | Outro imóvel | Grupos com área diferente | Antes (`b0be063`): mesma chave · sem chave · outro imóvel · grupos com área diferente |
|---|---|---|---|---|---|
| leiloeiro (`R.`, `Av.`, `nº 62`, `s/nº`, `Quadra 272, Lote 10`, `Jd.`) | 20.999 (100%) | 0 | 0 | 1 | 99,99% · 1 · 0 · 1 |
| unidade com "nº" (`apartamento nº 91`, `casa nº 2`, `lote nº 5`, `quadra nº 3`, `vaga nº 10`) | 20.999 (100%) | 0 | 0 | 1 | **10,39% · 2.686 · 67 · 516** |
| sem marcador, bairro só no texto (`Rua X, 62, Apto 1, Jardim Y, Cidade/UF`) | 20.957 (99,80%) | 0 | 0 | 1 | 77,35% · 1.405 · 0 · 1 |
| sem marcador, bairro também em campo | 20.969 (99,86%) | 0 | 0 | 1 | 82,84% · 1.405 · 0 · 1 |
| sem marcador, com hífens (`Rua X, 62 - Apto 1 - Jardim Y - Cidade/UF`) | 20.929 (99,67%) | 1 | 0 | 1 | 77,35% · 1.405 · 0 · 1 |

As reescritas que ainda mudam de chave são ambíguas no texto: complemento da Caixa que já tem um "número" escrito (`RUA SDO 01 N 89 CASA B, N. 89`, `CAMINHO 3, N. 39, LT 11 ANTIGO NR 11`), bairro com unidade dentro (`Km 08`, `Centro Km 80`) ou complemento que vira bairro no formato com hífens (`Apto 307 - Tipo B - Tomba` mantém o "B"; `2ª Etapa - Mangabeira` não).

**Entre fontes, com endereços reais.** Dos 10 lotes da sonda da Leilões Judiciais (11/10/2026), o conector extrai endereço de 7 (os outros são lotes múltiplos ou sem frase de localização). Os 7 dão logradouro, número e unidade certos, conferidos à mão e fixados em `endereco.test.ts` (`Rua Dardanelos, 411 - Apto 162 - Alto da Lapa - São Paulo/SP` → `rua dardanelos:411:ap 162`; `Rua Antônio Furtado de Miranda, 493, Vila Industrial, Presidente Prudente/SP` → mesma chave que `RUA ANTONIO FURTADO DE MIRANDA, N. 493,` da Caixa). Nenhum desses 7 está no CSV da Caixa, então não há par real entre fontes para medir; a cobertura entre fontes acima vem das reescritas.

## Limites conhecidos

- Não há gabarito entre fontes: as medições acima são dentro da Caixa e com reescrita sintética. Quando os conectores de leiloeiro estiverem gravando, `npm run base:status` mostra quantos grupos cruzam fontes, e vale conferir uma amostra à mão.
- Endereço com o mesmo texto e imóveis diferentes (o caso de Luziânia) só se separa pela matrícula. A Caixa só dá a matrícula na ficha (`--detalhes`).
- Matrícula sem cartório vira cartório `u`: numa cidade com vários registros de imóveis, duas matrículas de mesmo número em cartórios diferentes cairiam juntas se nenhuma das fontes informasse o cartório.
- Leiloeiro que escreve só o bairro, sem a rua, ou o endereço dentro da descrição (`situado à Rua X, nº 67, no 26º Subdistrito`), precisa que o conector extraia o endereço antes.
- Bairro só no texto e sem a cidade depois dele (`Rua X Souza, 100, Jardim 2`) não é reconhecido como bairro: o "2" vira unidade e a chave não casa com a da Caixa (sem junção errada; só deixa de juntar).

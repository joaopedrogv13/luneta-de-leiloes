# Análise da base do PBCV para a Luneta

Base: `leiloes.db` do PBCV (161.741 lotes, 670 fontes, última rodada em 01/10/2026), aberta só para leitura. Medido em 28/10/2026.
Todos os números de "à venda" usam o critério da auditoria: imóvel visto na última coleta da fonte que trouxe lotes, com situação
aberto ou agendado (suspenso só com data futura). O ranking por leiloeiro e a classificação A/B/C estão em `pbcv-RANKING.md`.
Nada aqui é garantia sobre um imóvel: são medidas da base.

## 1. Imóveis de verdade

### O problema

O PBCV classifica o lote em `tipo_bem` por palavras soltas. Nos ativos (`ativo=1`):

| tipo_bem | Ativos | Imóveis pela regra nova | Diferença |
| --- | ---: | ---: | --- |
| imovel | 31.159 | 30.371 | saem 788 (móveis de "LOC. SALA", "Item: mesa", motos, caixas de mercadoria) |
| rural | 4.174 | 3.071 | saem 1.103 (26%): tratores, plantadeiras, colheitadeiras, implementos, gado, peças |
| desconhecido | 12.208 | 1.263 | entram 1.263 (10,3%) |
| diversos | 20.565 | 12 | entram 12 (0,06%) |
| veiculo | 29.025 | 11 | entram 11 (terrenos e áreas de terra em leiloeiro de veículos) |
| **Total** | **35.333** (imovel + rural) | **34.728** | |

Os 1.263 "desconhecido" que são imóveis vêm quase todos de 5 fontes: grupolance (364, imóveis da PGFN/Comprei com a cidade na
categoria), faleiloes (339, endereço no formato da Caixa no título), luisleiloeiro (92), faroonline (82, "QUADRA 26 LOTE Nº06") e
trileiloes (74, "Lote de Área 843,96m²"). Dos 1.286 imóveis novos, 806 estão à venda de verdade.

Os rurais que saem são o maior erro do PBCV: a palavra "agrícola", "gado" ou "pecuária" basta para virar `rural`. As palavras que mais
tiram lotes de imovel/rural: trator (136), "Item:" de lote montado (79), Honda (60), itens (59), unidades (49), escavadeira (44),
plantadeira (41), VW (39), retroescavadeira (39), pulverizador (35), carreta (34). Treze lotes eram de teste ("apenas para fins de treinamento").

### A regra (arquivo `pbcv-regra-imovel.py`, função `classificar`)

Lê título, categoria e os 700 primeiros caracteres da descrição, sem acento e em minúsculas, nesta ordem:

1. lote de teste sai;
2. **negativo no título** veta: veículo (placa, chassi, Renavam, ano/modelo "2010/2011", marcas), máquina e implemento, animal,
   mercadoria (mesa, cadeira, itens, unidades, kit, roupa, joia), arte e antiguidade, conteúdo de box ("BENS:", "m3"), "LOC. SALA",
   "MED. APROX.". O veto cai se o título tem um **positivo forte** (apartamento, terreno, imóvel rural/urbano, fazenda, chácara, gleba,
   hectares, alqueires, matrícula nº, registro de imóveis, galpão, prédio comercial, casa térrea/de alvenaria). Palavra que também é
   nome de lugar ("Lagoa do Carro", "Mercedes/PR", "Quadra Fiat", "Fazenda Cabeça da Vaca", "antiga rua") não veta quando há positivo;
3. **positivo no título** entra: os fortes, mais apto (com número), casa (no começo, depois de separador ou com complemento), sala e
   loja (no começo ou com área/número), sítio, área de X m²/ha, terras, fração ideal, direitos sobre, box ou vaga de garagem,
   residencial, conjunto habitacional e endereço com número ("Rua X, 116");
4. **categoria** de imóvel entra (Imóveis, Apartamento, Casas, Terrenos, Fazendas, Rural, Alienação, Residenciais);
5. título genérico ("LOTE 019", "CONSERVADO"): entra se a descrição tem positivo forte e nenhum negativo;
6. sem sinal nenhum: `tipo_bem=imovel` do PBCV fica imóvel (o PBCV acerta quase sempre nesse caso); `rural` sem sinal sai.

"Lote" sozinho nunca conta, porque é também lote de leilão. Conta só "lote de terreno", "lote urbano/rural", "lote N da quadra M",
"lote de área", "loteamento" e "Lote, Residencial".

### Precisão (lida à mão)

- **Amostra de 200** imóveis novos (desconhecido, diversos e veículo que a regra marcou como imóvel): **195 certos (97,5%)**. Os 5 erros
  (moto Honda em "Conjunto Habitacional", furadeira, cancela de estacionamento, abajur "casa 220V" e "flat die" de extrusora) viraram
  ajustes da regra.
- **Validação com outros 100**, depois dos ajustes: 99 certos (o erro, "AP. SOM", também foi corrigido).
- **Saídas:** de 70 imovel→não lidos, 66 certos (94%); de 40 rural→não lidos, 40 certos.
- **O que a regra deixa passar:** em 60 lotes desconhecido/diversos não marcados que tinham palavra suspeita (m², casa, quadra, matrícula),
  nenhum era imóvel. Ficam indeterminados 508 lotes com título só "LOTE 004" e sem descrição (isabelleiloes 164, bronzatto 61,
  leiloesrn 53, joaoemilio 47, snleiloes 43): só a página do lote diz o que são.

### Total corrigido

- **Imóveis ativos (`ativo=1`) pela regra: 34.728** (contra 35.333 do `tipo_bem`).
- **À venda de verdade: 24.118** em 531 fontes; com cidade e UF (importáveis): 22.001; no site em 01/10 (com lance e praça não vencida): 16.017.
- O exportador da outra frente chegou a 24.136 e 21.630 com regra própria: a diferença é de 0,1% e 1,7%.

## 2. Repetição com a Caixa

Base: os 24.118 imóveis à venda do PBCV contra os 21.226 ativos da Caixa na base da Luneta (`base/dados/luneta.db`, CSV de 08/10).

| Critério | À venda que batem | Observação |
| --- | ---: | --- |
| Comitente "Caixa" | 1.940 | campo `comitente` |
| Título, categoria ou título do leilão citam a Caixa | 2.539 | |
| Comitente ou título | 3.139 (13,0%) | |
| Qualquer menção, inclusive descrição | 3.869 (16,0%) | 16 são a Caixa como exequente em leilão judicial: não é venda da Caixa |
| Número do imóvel da Caixa (13 dígitos) no título, URL ou descrição | 847 | 1.194 têm um número de 13 dígitos; clicleiloes (564) e lucasleiloeiro (283) |
| Matrícula | não dá | a Caixa na Luneta tem matrícula em 1 de 21.226 (o CSV não traz; as fichas não foram aplicadas) |
| Endereço com número e cidade (`chave_endereco` da Luneta, `base/dedup`) | 1.816 | só 8.413 à venda têm chave de endereço; 25 lidos, 25 eram o mesmo imóvel |
| Mesma cidade, mesmo valor com centavos e mesmo tipo | 1.843 | valor redondo (múltiplo de R$ 100) não conta; 22 lidos, 22 consistentes |
| **Já na Caixa (número, endereço ou cidade+valor)** | **2.984 (12,4%)** | 1.759 entre os que citam a Caixa e 1.225 que não citam |

- **Onde estão:** clicleiloes 573, globoleiloes 564, 3torresleiloes 508, tonialleiloes 495, lancecertoleiloes 350, lucasleiloeiro 306,
  flexleiloes 144, destakleiloes 43, nasarleiloes 1. São leiloeiros que vendem imóveis da Caixa; três deles (clic, 3torres, flex) não
  escrevem "Caixa" em lugar nenhum.
- **No site em 01/10:** 2.812 repetidos (campo `repetidos_caixa` do relatório).
- **Teto:** dos 3.139 que citam a Caixa, 1.380 não bateram em nada (kleiloes 575, sem endereço nem valor que case; o resto vem de
  lancecerto, pestana, tonial e destak). Somando esses e a Caixa já vendida entre 24/09 e 08/10, a repetição provável fica entre **3.000 e 4.400
  (12% a 18%)** dos à venda. A chave de endereço sem unidade junta mais 369, mas erra (apartamentos diferentes do mesmo prédio): é teto, não estimativa.
- **Para a importação:** a deduplicação atual da Luneta (chave de endereço) acharia só 1.816 dos 2.984 (61%). Vale o exportador mandar o
  número do imóvel da Caixa quando houver (em `extras`, ex.: `caixa_imovel`) e o endereço com número em campo próprio: o PBCV tem
  logradouro com número em só 35% dos à venda.

## 3. Matriz de tags (detalhe em `pbcv-matriz-tags.csv`)

Como foi medido: o exportador da outra frente importou o PBCV numa cópia da Luneta (`luneta-copia/luneta.db`). Copiei essa base e rodei
o **motor de riscos da Luneta, sem mudar nada** (`avaliarImovel` e `consolidarTags`, as mesmas 26 regras de `base/riscos/regras`), em
memória e só para leitura, nos 24.799 imóveis ativos importados, com data de referência 01/10/2026. Depois li 20 casos "sim" de cada tag
de texto (12 nas de campo) para estimar a precisão.

**Mapear agora (sai de campo estruturado, só depende de o exportador mandar o campo):**
deságio alto (19,6%) e baixo (10,2%), lance acima da avaliação (0,5%), sem fotos (7,0%), 1ª praça (41,1%), 2ª praça (32,0%) e praça
única (22,8%). Precisam de avaliação, lance, praças com data e fotos. As de praça envelhecem com a base: exigem coleta frequente.

**Mapear agora (texto, precisão de 80% ou mais):** ocupado (5,4%, 95%), desocupado (3,5%, 100%), condomínio em atraso (0,6%, 100%),
IPTU em atraso (1,6%, 90%), construção irregular (1,7%, 95%), só direitos (3,7%, 85%), ação judicial (0,8%, 80%), custos extras altos
(5,1%, 80%; mandar `comissao_pct`), sem vistoria (0,1%, 85%), aceita financiamento (0,2%, 100%), cota-parte só pelo título (pelo título
~100%; pela descrição confunde "fração ideal no terreno" de condomínio). Penhora de outros credores (2,3%, 75%) entra com revisão.
Ocupação não informada (93,6%) e imóvel inteiro (60,8%) saem por ausência de sinal, como na Caixa.

**Não vale agora:**
- dívida passa ao arrematante (2,8%, 50%): confunde despesa de desocupação e IPTU depois da escritura com dívida;
- leilão com recurso (0,2%, 50%): "Recursos pendentes: não há" vira sim;
- direito de preferência (3,5%, 35% no sentido de "devedor"): mistura a cota do coproprietário (art. 843 do CPC) com a preferência do
  devedor fiduciante; para o devedor, dá para tirar do campo (extrajudicial + banco + alienação fiduciária);
- área divergente (1,3%, 20%): o PBCV tem uma área só, que mistura terreno, construída e privativa; desligar a comparação título×campo
  para o PBCV;
- matrícula com pendência (3,7%, 65%): só depois de tirar o texto padrão do Comprei/PGFN ("O que acontece com hipotecas, penhoras...").

**Só lendo o edital:** ocupação (94% sem informação), dívidas (98% a 99% desconhecido), ação judicial, penhora, recurso e pendência de
matrícula. 42,7% dos à venda têm link do edital, 29,9% o PDF da matrícula e 10,7% o laudo. O próximo ganho grande vem de ler esses
documentos, não de mais expressão regular na descrição (que está vazia em 22,7% dos à venda e passa de 1.000 caracteres em 27,3%).

**Não dá:** nenhuma tag é impossível. Mas dois campos do PBCV não servem: `subjudice` (vazio em 95%, "1" em 7 casos) e `penhorado`
(vazio em 96%, nunca "1").

## 4. LGPD

Base: os 24.118 imóveis à venda (entre parênteses, os 34.728 ativos). Nomes não são reproduzidos aqui.

| O que | Imóveis | % |
| --- | ---: | ---: |
| Campo `executado` preenchido | 3.354 (3.523) | 13,9% |
| ... e parece pessoa física (sem Ltda, S/A, banco, condomínio, município...) | 1.846 (1.926) | 7,7% |
| Campo `exequente` preenchido | 3.684 (4.101) | 15,3% |
| ... e parece pessoa física | 1.668 (1.797) | 6,9% |
| Descrição com nome depois de papel (máscara da Luneta, `mascararNomes`) | 2.825 (3.235) | 11,7% |
| Título com nome depois de papel | 63 (150) | 0,3% |
| CPF na descrição (com o rótulo "CPF" em 213) | 254 (265) | 1,1% |
| RG na descrição | 115 | 0,5% |
| E-mail na descrição (muitos são do próprio leiloeiro) | 478 | 2,0% |
| CNPJ na descrição (empresa) | 740 | 3,1% |
| **Algum dado pessoal em campo ou texto** | **5.471 (6.064)** | **22,7%** |
| **Algum dado pessoal no texto (título, descrição, título do leilão)** | **3.726 (4.164)** | **15,4%** |

- **Precisão da máscara:** em 24 descrições mascaradas lidas, 16 eram nome de pessoa (exequente, executado, depositário, proprietário,
  confrontante, prefeito) e 8 eram excesso (Caixa, Banco do Brasil, condomínio, irmandade, "Código Civil"). A máscara erra para mais em
  cerca de um terço: aceitável, porque esconder um banco custa menos que mostrar um nome.
- **Padrões que mais aparecem:** "EXEQUENTE: NOME EXECUTADO: NOME" no começo da descrição (doleiloes, sabrinaleiloes, baldisseraleiloeiros),
  "Depositário: NOME", "de propriedade de NOME" nas confrontações e título que é só o nome do executado (m7leiloes).
- **Onde mais:** flexleiloes (492 à venda com dado pessoal no texto), megaleiloes (234), centralsuldeleiloes (194), doleiloes (174),
  tonialleiloes (171).

**O que isso define no exportador:**
1. `executado` e `exequente` **nunca** vão para o JSONL (o contrato proíbe).
2. Título, descrição e título do leilão passam pela máscara da Luneta (`mascararDocumentos` + `mascararNomes`) antes de gravar; a importação
   mascara de novo e a máscara é idempotente. O exportador atual mascara 1.134 nomes em 479 lotes (`saida/resumo.json`), a partir dos campos executado/exequente: a
   máscara da Luneta acha nome em 2.825 descrições à venda.
3. E-mail e telefone de pessoa saem do texto; fica só o contato do leiloeiro.
4. Título que é só um nome de pessoa vira "tipo + cidade".
5. Endereço, bairro e matrícula vão sem "de propriedade de"; a importação já corta isso (`campoSemPessoa`), mas o certo é não mandar.

## 5. Como foi medido e onde estão os arquivos

Tudo em `/tmp/claude-0/-home-claude/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/`:

- `relatorio-leiloeiros.json`: relatório por leiloeiro no formato da Luneta, conferido com `base/leiloeiros/esquema.ts` e com jsonschema;
- `pbcv-RANKING.md`: funil, Pareto, A/B/C, top 50, saúde e plataformas;
- `pbcv-matriz-tags.csv`: as 26 tags;
- `pbcv-regra-imovel.py`: a regra de imóvel;
- `work/`: os scripts (`regra_imovel.py`, `exportar_imoveis.py`, `chaves.ts` e `chaves_caixa.ts` com a deduplicação e a classificação de tipo e
  modalidade da Luneta, `agregar.py`, `ranking.py`, `caixa_repeticao.py`, `tags_pbcv.ts`, `lgpd.ts`) e as amostras lidas
  (`amostra200.txt`, `caixa_amostra.txt`, `caixa_amostra_valor.txt`).

O código da Luneta foi só importado (TypeScript, `node --experimental-strip-types`), sem alterar nada nos dois repositórios. A plataforma
de cada domínio veio do registro de adapters do PBCV (`adapters` + `adapters_uf`: 192 plataformas, 823 domínios).

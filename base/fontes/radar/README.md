# Radar de editais

Quatro conectores que descobrem **avisos e editais de leilão de imóveis** em fontes oficiais e gravam na tabela `edital` (finalidade `radar`). Eles não alimentam a vitrine: nenhuma dessas fontes traz o imóvel com endereço, preço por praça e fotos em campos estruturados, então nada vai para a tabela `imovel`. O edital guarda título, órgão, UF, cidade, data de publicação, data do leilão (quando o texto diz), dois links (`url`, o documento oficial, e `site_leilao`, onde se dá o lance; ver "Os dois links"), um resumo mascarado e, no PNCP com `--detalhes`, os links dos arquivos do edital (`documentos`).

## Os dois links

| Fonte | `url` (documento oficial) | `site_leilao` (onde se dá o lance) |
|---|---|---|
| PNCP | página da compra no PNCP | `linkSistemaOrigem` (o sistema onde a disputa corre); sem ele, o site citado no objeto ou no complemento |
| DJEN | `link` da comunicação (validação do documento no PJe, eSAJ, Projudi...) | site citado no texto; depois, os `href` do HTML |
| DOU | página da matéria (`pdfPage`) ou a leitura do dia | site citado no texto; depois, os `href` do HTML |
| Querido Diário | PDF do diário oficial do município | site citado nos trechos que a API devolve (um site longe da palavra "leilão" não vem nos trechos) |

`extrairSiteLeilao` (em `texto.ts`) lê URLs com protocolo, endereços com "www." e domínios soltos com sufixo comum de leiloeiro (.com, .net, .lel, .org, .adv, com ou sem .br). Ficam de fora tribunais (.jus.br), DOU (in.gov.br), legislativo, MP, Defensoria, Querido Diário, OAB e provedores de e-mail, e nunca se lê domínio depois de "@". Vence o domínio com cara de leilão ou de plataforma (leil, lance, hasta, arremat, bid, licita, compras, pregão, bll); depois, o que vem até 150 caracteres após "leilão", "lances", "site", "portal", "plataforma" ou "endereço eletrônico". Endereço sem nenhum dos dois não conta, porque pode ser o site da prefeitura. O link costuma levar à página do leiloeiro ou do leilão, nem sempre ao lote exato: casar com o lote é trabalho da opção 2 (leitura do site do leiloeiro).

| id | Fonte | Acesso | O que consulta | Entrada local (`--arquivo`/`--fixture`) |
|---|---|---|---|---|
| `pncp` | PNCP | API documentada | `/api/consulta/v1/contratacoes/publicacao` e `/proposta`, modalidades 1 e 13; com `--detalhes`, `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos` | JSON: envelope `{data: [...]}`, lista de envelopes ou `{paginas, arquivos}` |
| `djen` | DJEN / Comunica PJe | API documentada | `GET /api/v1/comunicacao?meio=E&texto=...&dataDisponibilizacaoInicio/Fim` (um dia por consulta) | JSON da API (`{status, count, items}`) |
| `querido_diario` | Querido Diário (OKBR) | API documentada, de terceiro | `GET /gazettes?querystring=(leilão \| leilao) + (termos de imóvel)&published_since/until` | JSON da API (`{total_gazettes, gazettes}`) |
| `dou_inlabs` | DOU seção 3 (INLABS) | arquivo oficial, com login | `POST /logar.php`; `GET /index.php?p=AAAA-MM-DD&dl=AAAA-MM-DD-DO3.zip` (e DO3E) | `.zip` do INLABS, `.xml` de matéria ou pasta com eles |

## Como rodar

```bash
npm run base:coletar -- pncp                                   # ontem e hoje (Brasília)
LUNETA_RADAR_DESDE=2026-10-01 LUNETA_RADAR_ATE=2026-10-08 npm run base:coletar -- pncp --detalhes
npm run base:coletar -- djen --uf SP                           # TJSP, TRT2, TRT15 e TRF3
npm run base:coletar -- querido_diario
INLABS_EMAIL=... INLABS_SENHA=... npm run base:coletar -- dou_inlabs
npm run base:coletar -- dou_inlabs --fixture base/fontes/radar/fixtures/dou_inlabs/2026-10-09-DO3   # sem rede
```

Variáveis de ambiente (a CLI só repassa `--uf`, `--arquivo`, `--limite` e `--detalhes`):

| Variável | Para quê | Padrão |
|---|---|---|
| `LUNETA_RADAR_DESDE`, `LUNETA_RADAR_ATE` | janela de publicação (`AAAA-MM-DD`) | ontem e hoje em Brasília |
| `LUNETA_RADAR_DIAS` | tamanho da janela quando `DESDE` falta | 1 |
| `LUNETA_DJEN_TRIBUNAIS` | siglas (`TJSP,TRT2`); `--uf` monta a lista sozinho | todos os tribunais |
| `LUNETA_DJEN_TERMOS` | termos do filtro `texto` da API, separados por vírgula | `leilão, hasta pública` |
| `LUNETA_QD_TERRITORIOS` | códigos IBGE de 7 dígitos | todos os municípios cobertos |
| `INLABS_EMAIL`, `INLABS_SENHA` | conta gratuita do INLABS (o dono do projeto precisa criar) | obrigatórias para a rede |
| `LUNETA_INLABS_SECOES` | seções do DOU | `DO3, DO3E` |
| `LUNETA_RADAR_ROBOTS` | `1` liga a checagem de robots.txt também nessas APIs | desligada |

`--uf`, em cada fonte:
- **PNCP:** o servidor filtra pela UF do **órgão**. Depois, o que o texto põe em outra UF sai. Um órgão federal com sede em outra UF que venda imóvel na UF pedida só aparece na coleta sem `--uf`.
- **DJEN:** consulta o TJ, os TRTs e o TRF da UF. Tribunal com várias UFs (o TRF1 cobre 13) devolve comunicações de todas elas, e fica só o que é da UF pedida ou não diz a UF.
- **Querido Diário:** filtra pela UF do diário.
- **DOU:** filtra pela UF do órgão ou do texto.

`--limite` corta registros lidos, inclusive os descartados.

## Filtro "é leilão de imóvel" (`filtro.ts`)

1. **Sinal de leilão:** leilão, leiloeiro, hasta pública, 1ª/2ª praça, praça única ou arrematação. No PNCP, a modalidade já garante.
2. **Concessão de uso, locação e arrendamento** sem venda ou alienação ficam de fora.
3. **Um sinal forte de imóvel basta:** imóvel, terreno, lote urbano, lote/quadra, lotes "de propriedade do Município" / "no Distrito Industrial" / "com área de", loteamento, edificação, apartamento, casa, sobrado, residência, unidade habitacional, sala comercial, galpão, fazenda, gleba, chácara, sítio, prédio, unidade autônoma, vaga de garagem, hectares, domínio útil, área urbana/pública/remanescente/rural/de terras, próprio municipal e bem dominical.
4. **Leilão com bens móveis** (veículo, sucata, mercadorias, máquinas, semoventes...): o sinal forte só conta no **objeto** do leilão. Não conta em frase de local, como "vistoriados no galpão", "que se encontra no imóvel", "no pátio do imóvel da Secretaria", "Endereço: Galpão 3" ou "Local: Edifício Sede". Galpão, prédio, terreno, casa, fazenda, edificação, residência, área pública e lotes também nomeiam lugar, então precisam de uma palavra de objeto antes, na mesma oração: "leilão de", "alienação de", "venda de", "Lote 02 –", "Bem:", "descrição", "direitos sobre". Por isso "Leilão de equipamentos. Galpão de guarda com 200 m²" fica de fora.
5. **Lugar do evento** não conta nem sem bens móveis: "Local: Edifício Sede", "a sessão será realizada no edifício sede", "vistoria no galpão".
6. **Sem sinal forte,** valem dois indícios fracos (área total/privativa, metragem em m², matrícula, benfeitorias, loja, sala nº, IPTU), e só sem bem móvel. **"Área" sozinha nunca conta**, porque "área técnica", "área de atuação", "área do pátio" e "área de vistoria" aparecem em todo tipo de edital. O Querido Diário busca "área" no servidor, para não perder nada, e o filtro local exige o qualificador (urbana, pública, remanescente, rural, de terras, total, privativa...).

Falsos amigos tratados (testes em `filtro.test.ts`):
- **"Fazenda" de órgão,** com "da" ou "de": Ministério/Secretaria da Fazenda, "Secretaria de Estado de Fazenda", "Secretaria Municipal de Fazenda e Planejamento", Vara da Fazenda, Fazenda Nacional/Pública/Estadual. Também "perante a Fazenda" e "débitos com a Fazenda", sem nome próprio depois. "Fazenda" só é imóvel com nome próprio ("Fazenda Santa Rita"), com descrição ("fazenda denominada", "com 120 ha") ou no plural.
- **"Casa" que não é imóvel:** Casa Civil, Casa do Leiloeiro, casa de leilões e nomes de lugar ("bairro Casa Verde", "Rua da Fazenda").
- **Outros:** "sítio eletrônico"; "praça" como logradouro (só conta com ordinal); "lote" de leilão ("30 lotes de veículos"); "leilão eletrônico", que não é bem eletrônico; "vaga para 1 veículo" e "garagem para 2 automóveis", que não são bem móvel; "comprovante de residência".

### Medição (12 e 13/10/2026)

O que cada número mede, e o que não mede:
- **Caixa (CSV de 08/10/2026, 21.226 descrições, com o leilão garantido):** 21.226 aceitas. O número diz pouco, porque toda descrição traz o texto padrão "N de área do terreno" e "terreno" é sinal forte, até em apartamento. Sem esse texto padrão, 21.136 aceitas (99,6%). As 90 recusadas são "Comercial" (46), "Sala" (35) e "Outros" (9), que só trazem "área total/privativa" sem unidade, ou seja, um indício fraco. Isso mede só a cobertura (recall) em descrições de imóvel. Não mede precisão.
- **Leilões Judiciais (sonda arquivada, 10 lotes reais):** 9 aceitos. O décimo não cita leilão, praça nem hasta.
- **DJEN (50 comunicações reais de 30/04/2026):** 0 aceitas. Também mede pouco: só 2 das 50 citam leilão, hasta ou praça, e o único edital de leilão vem truncado antes da descrição do bem.
- **Corpus de avisos (`fixtures/corpus/avisos.json`):** 41 negativos e 26 positivos, com 0 falsos positivos e 0 falsos negativos. Os negativos são leilões de móveis que citam o local dos bens (galpão, prédio, imóvel, terreno, pátio, chácara, sítio), falsos amigos (Secretaria de Fazenda, perante a Fazenda, Casa do Leiloeiro, bairro Casa Verde), leilão de energia e arrendamento portuário. Os positivos vêm de prefeitura, PNCP, SPU/DOU, Compras.gov.br, editais judiciais e lotes reais da Leilões Judiciais.
  - O corpus foi escrito junto com as regras, a partir do formato de avisos reais. Não há aviso real de leilão de móveis no material em disco. Ele funciona como teste de regressão (`filtro.test.ts`), não como medida de precisão em campo.
  - Antes desta revisão, o filtro aceitava 11 de 11 desses avisos de móveis. A precisão real só se mede com coleta ao vivo.

## Avisos que não anunciam leilão futuro

Resultado de leilão não serve ao radar e costuma trazer o nome de quem arrematou. `motivoSemLeilaoFuturo` (em `filtro.ts`) descarta:
- **cabeçalho de resultado:** resultado, homologação, adjudicação, arrematação, ata (de leilão, da sessão), auto ou termo de arrematação/homologação, edital de intimação da arrematação, extrato, revogação, anulação e cancelamento;
- **marcas de resultado no corpo:**
  - título de resultado no começo de frase ou em caixa alta, como "RESULTADO DO LEILÃO", "ATA DA SESSÃO PÚBLICA DE LEILÃO" e "TERMO DE HOMOLOGAÇÃO";
  - fato passado: "foi arrematado", "fica homologado", "HOMOLOGO", "sendo vencedor", "arrematou";
  - quem ganhou seguido de nome próprio: "arrematado por Fulano", "adjudicado a Beltrana", "vencedor CICRANO".

  O texto genérico de edital futuro não conta: "será considerado vencedor o licitante que...", "arrematado por quem oferecer mais", "o resultado será publicado".
- **retificação, errata, adiamento, suspensão, reabertura e leilão deserto/fracassado:** saem só quando o texto **não** traz data de leilão futura. Com data nova, ficam como edital próprio, porque costumam anunciar a data nova. O edital antigo continua com a data dele.

Cada fonte usa o que tem:
- **DOU:** cabeçalho (`Identifica`) e corpo.
- **DJEN:** só o corpo, sem máscara, só para decidir; nada desse texto é gravado.
- **Querido Diário:** trecho a trecho. O trecho de resultado sai, e o resto do diário ainda pode virar edital.
- **PNCP:** não precisa, porque são contratações e não avisos de resultado. A máscara do núcleo vale para todos.

## Data do leilão e local

**Data do leilão** (`extrairDataLeilao`): cada data vale pelo gatilho mais próximo antes dela.
- **Gatilho forte:** "1º leilão:", "praça única", "sessão pública", "abertura das propostas", "o leilão será realizado em".
- **Gatilho fraco:** "leilão", "praça" ou "hasta", a até 160 caracteres.
- **Contexto negativo:** "Edital: 09/10 das 8h", "impugnações até", "esclarecimentos", "entrega das propostas a partir de", "cadastro", "processo ... de", "publicado em", "despacho de". A data com esse contexto é descartada.

Fica a data mais cedo de gatilho forte; sem nenhuma, a mais cedo de gatilho fraco. Datas antes da publicação são descartadas, ou, sem publicação, as anteriores à coleta. A data de assinatura ("Vila Exemplo, 7 de outubro de 2026") também sai. Aceita ano com 2 dígitos e hora depois da data por extenso. No PNCP vale primeiro o encerramento das propostas, depois a abertura e, por fim, o texto.

**Local:**
- **DOU e DJEN:** `extrairLocal` lê, nesta ordem: "Município/Comarca de X", "X/UF", "Estado de", "em Minas Gerais" ou "no Distrito Federal". Rua antes de "/UF" ("Av. Paulista/SP") não vira cidade, e "15ª REGIÃO DE PIRACICABA/SP" dá Piracicaba.
- **PNCP:** primeiro o local do objeto ou da informação complementar. Sem isso, usa o órgão: municipal dá UF e cidade, estadual só a UF, e federal ou sem esfera fica sem UF, porque a sede do ministério não é o lugar do imóvel.
- **DJEN:** a cidade também pode vir do nome do órgão, só nos formatos "Vara ... de X", "X - 3ª Vara" e "SIGLA - X". Siglas (SJMA, TJMG), UF solta, adjetivos (Municipais, Ambiental, Empresarial) e "Gabinete do Des." não viram cidade.

## Decisões

- **robots.txt:** as quatro fontes são APIs documentadas ou o serviço oficial de download do DOU, com scripts de automação publicados pela Imprensa Nacional. robots.txt rege rastreadores de páginas, por isso a checagem fica desligada nelas (`respeitarRobots: false`, como prevê `util/http.ts`). `LUNETA_RADAR_ROBOTS=1` liga a checagem se a revisão jurídica preferir. O resto da coleta educada vale sempre: User-Agent `LunetaDeLeiloes/0.1 (+contato)`, timeout, retentativas com `Retry-After`, 2 s entre requisições ao mesmo host e limite de tamanho.
- **Retentativas próprias:** o 429 do DJEN espera 1 minuto, como a fonte pede, e o DJEN pausa quando `x-ratelimit-remaining` chega a 1. O 400 "For input string" do PNCP, que some na repetição segundo a Base dos Dados, ganha mais uma tentativa depois de 5 s.
- **Login do INLABS:** usa `fetch` direto com `redirect: "manual"`, a única exceção ao cliente do núcleo. O cookie de sessão vem no `Set-Cookie` da própria resposta do `logar.php`, e o cliente educado segue redirecionamentos e perderia o cookie (conferido com servidor local). O login mantém User-Agent identificado, timeout, 3 tentativas e uma pausa de 2 s antes do primeiro download. Senha, e-mail e cookie nunca vão para log.
- **Nada gravado em caso de falha:** o conector valida cada resposta. JSON fora do formato, HTML no lugar de JSON ou de ZIP, ZIP corrompido (CRC), modalidade que não é leilão ou login recusado lançam erro, e o núcleo não grava nada.
- **Janela vazia não é falha:** quando todas as consultas respondem e nada vem, o conector declara `vazioLegitimo` e a coleta fecha como `sucesso` com zero lidos. Isso cobre PNCP com 204 ou páginas vazias, QD com `total_gazettes: 0`, DJEN com `count: 0`, arquivo local válido e vazio, e tudo filtrado por `--uf`.
  - No DOU, cada dia sem edição responde 404 e é pulado. A janela inteira sem edição vale como vazia se no máximo 2 dias úteis ficaram sem a DO3 (fim de semana, feriado ou edição de hoje ainda não publicada), com aviso nos dias úteis.
  - Mais dias úteis sem DO3 é suspeito (URL mudou?), e a coleta fica `invalida`. Isso evita falso alarme em todo domingo com a janela padrão.
- **Sem `geradoEm`:** o radar não informa data de geração. Assim, uma coleta de período antigo (reprocessamento) não é recusada como "arquivo mais antigo". Edital repetido só renova `ultima_vez_em`.
- **Arquivos do edital (PNCP):** os links de `/arquivos` vão em `edital.documentos`, uma coluna JSON criada pela migração `002-edital-documentos.sql`, e não no resumo. Cada arquivo leva tipo (edital, laudo, avaliação, matrícula ou outro), título, URL e data. Uma coleta sem `--detalhes`, ou que pega o edital pela `/proposta`, manda `documentos` nulo (não consultado) e o núcleo mantém os gravados. Só uma consulta real a `/arquivos` troca a lista.
- **Querido Diário:** um diário que casa vira um edital (id = território/data/arquivo), com os trechos como resumo.

## Conflitos e lacunas registrados

- **Modalidades do PNCP:** pncp-cli e pipeworx dizem 1 = Leilão Eletrônico e 13 = Leilão Presencial; o pypncp diz 4 = Leilão, mas na tabela do PNCP 4 é "Concorrência - Eletrônica". Ficamos com 1 e 13. Toda coleta confere `modalidadeId`/`modalidadeNome` e para sem gravar se vier algo que não seja leilão. Falta conferir ao vivo em `/api/pncp/v1/modalidades`.
- **PNCP `/proposta`:** o pncp-cli descreve `dataFinal` como "data final da recepção". Usamos o fim da janela + 120 dias, e a semântica exata não foi confirmada.
- **PNCP `data_leilao`:** é o encerramento do recebimento de propostas, ou a abertura quando não há encerramento. Não está confirmado que seja a hora da disputa em todo sistema de origem.
- **DJEN:** o filtro `texto` vem do juscraper (MIT). Não está confirmado se ignora acento, nem se todo edital de leilão passa pela Plataforma de Editais (`meio=E`). A API limita cada consulta a 10.000 resultados, e a coleta avisa quando chega lá.
- **Querido Diário:** cobre só parte dos municípios e não é a fonte oficial. Código MIT; a licença dos dados aparece como CC BY 4.0 só num resumo de terceiro (mcp-brasil), sem confirmação. O resumo leva a atribuição "Querido Diário – Open Knowledge Brasil".
- **INLABS:** guarda só os últimos 4 meses (janela máxima de 125 dias). Termos de uso não lidos. Feriados não são conhecidos: um feriado no meio de uma janela longa conta como dia útil sem DO3.

## LGPD

- **DJEN:** os nomes que a própria API rotula como partes e advogados (`destinatarios`, `destinatarioadvogados`) nunca são gravados. Servem só para mascarar esses nomes no texto, sem diferenciar maiúsculas e acentos, antes do filtro e do resumo. Depois disso o texto ainda passa pela máscara do núcleo (CPF, CNPJ, RG, e-mail, IP e nomes após papel processual ou de resultado).
- **Resultado de leilão:** avisos e trechos de resultado são descartados antes do resumo. A máscara do núcleo também cobre "arrematado por", "adjudicado a", "adquirido por", "vencedor" e "arrematante" sem dois-pontos.
- **DOU:** o parágrafo de assinatura (`<p class="assina">` e `<p class="cargo">`) sai antes do resumo.
- **Testes:** conferem que nenhum nome rotulado, documento pessoal ou nome de quem arrematou chega ao banco, pela coleta do núcleo e pela CLI, nas três fontes de texto livre.
- **Fixtures:** usam nomes e números fictícios.

## Fixtures (`fixtures/`)

| Arquivo | Origem |
|---|---|
| `pncp/publicacao.json` | Construída a partir do esquema documentado (campos do pncp-cli, pipeworx, pypncp e da arquitetura `br_mgi_pncp.contratacao` da Base dos Dados). Dados fictícios. Não há resposta real no material. |
| `djen/comunicacao.json` | Estrutura copiada das amostras reais arquivadas em `scratchpad/djen/samples` (respostas de 30/04/2026), com ids, processos, textos e nomes fictícios. |
| `querido_diario/gazettes.json` | Construída a partir do modelo `GazetteItem` da qd-api (MIT). Dados fictícios. Não há resposta real no material. |
| `dou_inlabs/2026-10-09-DO3/*.xml` | Construídas a partir do esquema do XML do INLABS (atributos de `<article>` e campos de `<body>`, conforme o Ro-dou, GPL, só como referência). Não há XML real no material. Os testes montam o ZIP em memória. |
| `corpus/avisos.json` | Corpus do filtro: textos construídos no formato de avisos reais e trechos públicos de lotes reais da sonda da Leilões Judiciais, sem dados pessoais. |

## Sem teste ao vivo

A rede para sites de governo e de leilão está bloqueada neste ambiente. Todo o código de rede foi testado com respostas falsas no formato documentado, cobrindo paginação, 204/404, 400, 429, HTML no lugar do conteúdo, ZIP, login e janela vazia. **Nenhuma das quatro fontes foi chamada de verdade.** Antes de ligar em produção:

1. **PNCP:** rodar uma janela curta e conferir os códigos 1 e 13 em `/api/pncp/v1/modalidades`, os nomes de campo de `/arquivos` (`tipoDocumentoNome`, `url`/`uri`, `statusAtivo`), a semântica de `/proposta` e se `esferaId` vem em toda contratação.
2. **DJEN:** conferir `texto` com e sem acento e o volume diário de `meio=E`.
3. **Querido Diário:** conferir o limite de `size` e se a sintaxe `+`/`|` da querystring funciona como a "simple query string" do OpenSearch.
4. **INLABS:** criar a conta e conferir:
   - o login (cookie no 302 ou no 200);
   - o nome dos arquivos XML dentro do ZIP, a codificação e os atributos reais de `<article>`;
   - se o dia sem edição responde mesmo 404;
   - o tamanho do ZIP da DO3: o cliente HTTP do núcleo recusa respostas acima de 100 MiB.
5. **Filtro:** medir a precisão em uma ou duas semanas reais de DOU e Querido Diário (avisos aceitos e recusados, conferidos à mão), já que o corpus é construído.
6. **Domínios a liberar:** `pncp.gov.br`, `comunicaapi.pje.jus.br`, `api.queridodiario.ok.org.br`, `data.queridodiario.ok.org.br` e `inlabs.in.gov.br`.

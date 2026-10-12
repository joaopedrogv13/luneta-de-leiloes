# Radar de editais

Quatro conectores que descobrem **avisos e editais de leilão de imóveis** em fontes oficiais e gravam na tabela `edital` (finalidade `radar`). Eles não alimentam a vitrine: nenhuma dessas fontes traz o imóvel com endereço, preço por praça e fotos em campos estruturados, então nada vai para a tabela `imovel`. O edital guarda título, órgão, UF, cidade, data de publicação, data do leilão (quando o texto diz), link e um resumo mascarado.

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

`--uf`: o PNCP filtra no servidor (UF do órgão); o DJEN consulta os tribunais da UF; o Querido Diário e o DOU filtram depois (UF do diário e UF do órgão ou do texto). `--limite` corta registros lidos, inclusive os descartados.

## Filtro "é leilão de imóvel" (`filtro.ts`)

Precisa de sinal de leilão (leilão, leiloeiro, hasta pública, 1ª/2ª praça, praça única, arrematação; no PNCP a modalidade já garante) e de imóvel. Um sinal forte de imóvel basta (imóvel, terreno, lote urbano, lote/quadra, edificação, apartamento, casa, sala comercial, galpão, fazenda, gleba, chácara, sítio, prédio, unidade autônoma, vaga de garagem, hectares, domínio útil), mesmo em leilão misto com veículos. Sem sinal forte, valem dois indícios fracos (área total/privativa, metragem, matrícula, benfeitorias, loja, sala nº, IPTU) se não houver bem móvel. Concessão de uso, locação e arrendamento sem venda ficam de fora, e avisos de resultado, homologação, extrato, revogação ou leilão deserto também.

Falsos amigos tratados: "Fazenda Nacional/Pública" e "Ministério/Secretaria da Fazenda", "Casa Civil", "casa de leilões", "sítio eletrônico", "praça" como logradouro (só conta com ordinal), "lote" de leilão (só conta lote urbano, de terreno ou com quadra) e "leilão eletrônico" (não é bem eletrônico).

Medição com dados reais do disco (12/10/2026):
- **Caixa:** 21.226 de 21.226 descrições do CSV de 08/10/2026 reconhecidas como imóvel, com o leilão garantido como no PNCP.
- **Leilões Judiciais:** 9 dos 10 lotes da sonda arquivada aceitos. O décimo não tem a palavra "leilão" nos títulos nem na descrição.
- **DJEN:** 0 das 50 comunicações reais arquivadas aceitas. São citações, intimações e sentenças; o único edital de leilão vem truncado antes da descrição do bem.

## Decisões

- **robots.txt:** as quatro fontes são APIs documentadas ou o serviço oficial de download do DOU, com scripts de automação publicados pela Imprensa Nacional. robots.txt rege rastreadores de páginas, por isso a checagem fica desligada nelas (`respeitarRobots: false`, como prevê `util/http.ts`). `LUNETA_RADAR_ROBOTS=1` liga a checagem se a revisão jurídica preferir. O resto da coleta educada vale sempre: User-Agent `LunetaDeLeiloes/0.1 (+contato)`, timeout, retentativas com `Retry-After`, 2 s entre requisições ao mesmo host e limite de tamanho.
- **Retentativas próprias:** o 429 do DJEN espera 1 minuto, como a fonte pede, e o DJEN pausa quando `x-ratelimit-remaining` chega a 1. O 400 "For input string" do PNCP, que some na repetição segundo a Base dos Dados, ganha mais uma tentativa depois de 5 s.
- **Login do INLABS:** usa `fetch` direto com `redirect: "manual"`, a única exceção ao cliente do núcleo. O cookie de sessão vem no `Set-Cookie` da própria resposta do `logar.php`, e o cliente educado segue redirecionamentos e perderia o cookie (conferido com servidor local). O login mantém User-Agent identificado, timeout, 3 tentativas e uma pausa de 2 s antes do primeiro download. Senha, e-mail e cookie nunca vão para log.
- **Nada gravado em caso de falha:** o conector valida cada resposta. JSON fora do formato, HTML no lugar de JSON ou de ZIP, ZIP corrompido (CRC), modalidade que não é leilão ou login recusado lançam erro, e o núcleo não grava nada. Dia sem DOU (404) é pulado.
- **Sem `geradoEm`:** o radar não informa data de geração. Assim, uma coleta de período antigo (reprocessamento) não é recusada como "arquivo mais antigo". Edital repetido só renova `ultima_vez_em`.
- **Arquivos do edital (PNCP):** o contrato `EditalNormalizado` não tem campo para documentos, então os links de `/arquivos` vão no resumo ("Arquivos do edital: ..."). Um campo `documentos` no edital pede mudança no núcleo (tipos + migração 002).
- **Querido Diário:** um diário que casa vira um edital (id = território/data/arquivo), com os trechos como resumo.

## Conflitos e lacunas registrados

- **Modalidades do PNCP:** pncp-cli e pipeworx dizem 1 = Leilão Eletrônico e 13 = Leilão Presencial; o pypncp diz 4 = Leilão, mas na tabela do PNCP 4 é "Concorrência - Eletrônica". Ficamos com 1 e 13. Toda coleta confere `modalidadeId`/`modalidadeNome` e para sem gravar se vier algo que não seja leilão. Falta conferir ao vivo em `/api/pncp/v1/modalidades`.
- **PNCP `/proposta`:** o pncp-cli descreve `dataFinal` como "data final da recepção". Usamos o fim da janela + 120 dias, e a semântica exata não foi confirmada.
- **PNCP `data_leilao`:** é o encerramento do recebimento de propostas, ou a abertura quando não há encerramento. Não está confirmado que seja a hora da disputa em todo sistema de origem.
- **DJEN:** o filtro `texto` vem do juscraper (MIT). Não está confirmado se ignora acento, nem se todo edital de leilão passa pela Plataforma de Editais (`meio=E`). A API limita cada consulta a 10.000 resultados, e a coleta avisa quando chega lá.
- **Querido Diário:** cobre só parte dos municípios e não é a fonte oficial. Código MIT; a licença dos dados aparece como CC BY 4.0 só num resumo de terceiro (mcp-brasil), sem confirmação. O resumo leva a atribuição "Querido Diário – Open Knowledge Brasil".
- **INLABS:** guarda só os últimos 4 meses (janela máxima de 125 dias). Termos de uso não lidos.

## LGPD

- **DJEN:** os nomes que a própria API rotula como partes e advogados (`destinatarios`, `destinatarioadvogados`) nunca são gravados. Servem só para mascarar esses nomes no texto, sem diferenciar maiúsculas e acentos, antes do filtro e do resumo. Depois disso o texto ainda passa pela máscara do núcleo (CPF, CNPJ, RG, e-mail, IP e nomes após papel processual).
- **DOU:** o parágrafo de assinatura (`<p class="assina">` e `<p class="cargo">`) sai antes do resumo.
- **Testes:** conferem que nenhum nome rotulado nem documento pessoal chega ao banco.
- **Fixtures:** usam nomes e números fictícios.

## Fixtures (`fixtures/`)

| Arquivo | Origem |
|---|---|
| `pncp/publicacao.json` | Construída a partir do esquema documentado (campos do pncp-cli, pipeworx, pypncp e da arquitetura `br_mgi_pncp.contratacao` da Base dos Dados). Dados fictícios. Não há resposta real no material. |
| `djen/comunicacao.json` | Estrutura copiada das amostras reais arquivadas em `scratchpad/djen/samples` (respostas de 30/04/2026), com ids, processos, textos e nomes fictícios. |
| `querido_diario/gazettes.json` | Construída a partir do modelo `GazetteItem` da qd-api (MIT). Dados fictícios. Não há resposta real no material. |
| `dou_inlabs/2026-10-09-DO3/*.xml` | Construídas a partir do esquema do XML do INLABS (atributos de `<article>` e campos de `<body>`, conforme o Ro-dou, GPL, só como referência). Não há XML real no material. Os testes montam o ZIP em memória. |

## Sem teste ao vivo

A rede para sites de governo e de leilão está bloqueada neste ambiente. Todo o código de rede foi testado com respostas falsas no formato documentado, cobrindo paginação, 204/404, 400, 429, HTML no lugar do conteúdo, ZIP e login. **Nenhuma das quatro fontes foi chamada de verdade.** Antes de ligar em produção:

1. **PNCP:** rodar uma janela curta e conferir os códigos 1 e 13 em `/api/pncp/v1/modalidades`, os nomes de campo de `/arquivos` e a semântica de `/proposta`.
2. **DJEN:** conferir `texto` com e sem acento e o volume diário de `meio=E`.
3. **Querido Diário:** conferir o limite de `size` e se a sintaxe `+`/`|` da querystring funciona como a "simple query string" do OpenSearch.
4. **INLABS:** criar a conta, conferir o login (cookie no 302 ou no 200), o nome dos arquivos XML dentro do ZIP, a codificação e os atributos reais de `<article>`. Conferir também o tamanho do ZIP da DO3: o cliente HTTP do núcleo recusa respostas acima de 100 MiB.
5. **Domínios a liberar:** `pncp.gov.br`, `comunicaapi.pje.jus.br`, `api.queridodiario.ok.org.br`, `data.queridodiario.ok.org.br` e `inlabs.in.gov.br`.

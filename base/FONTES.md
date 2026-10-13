# Fontes de dados: catálogo (opção 1) e crítica

Pesquisa de 12/10/2026 (painel de agentes: frentes LeilãoMap, Caixa, governo, bancos, leiloeiros, GitHub e dicionário de
risco; verificação e crítica independentes). Guardado aqui como registro: **quando o catálogo e a crítica divergem, vale a
crítica** (ela corrige, por exemplo, a URL da foto da Caixa, a regra de praça da Leilões Judiciais e o tamanho real da
opção 1). Referências a "scratchpad", "sondas" e "V1–V4" apontam para material de trabalho que não está no repositório.
As sondas V3 vieram de branches públicos de um repositório de terceiros (gilcambe/nexia), e valem como indício, não prova.

# Catálogo de fontes: opção 1 (dados estruturados), Luneta de Leilões

Data: 12/10/2026. Material usado: notas das frentes leilaomap, caixa, governo, bancos, leiloeiros e github. As notas da frente github e a lista "sem acesso estruturado" chegaram cortadas: a lista para no item `soleon`.

**Verificações.** A lista "FONTES VERIFICADAS" chegou vazia. Por isso conferi por conta própria o que dava para conferir a partir do disco. Os rótulos V1 a V4 são citados ao longo do texto.
- **V1.** Medi de novo o CSV completo da Caixa (`scratchpad/caixa_utf8.csv`). A origem é xnetinho/caixa-imoveis, arquivo `data/imoveis.csv`, commit 90e7195 de 12/10/2026. O CSV foi gerado pela Caixa em 08/10/2026.
- **V2.** Li a OpenAPI da Suporte Leilões em `suporteleiloes/docs`, arquivo `static/openapi/sl-api-v5.yaml`, commit 396fee0 de 28/08/2026.
- **V3.** Usei sondas HTTP arquivadas em `scratchpad/sondas/`. Elas contêm respostas ao vivo de 11/10/2026, por volta de 01h30 UTC, segundo o carimbo do próprio servidor: `"timestamp":"2026-10-11T01:33:01Z"`. Não identifiquei qual rotina gerou essas sondas e não consegui repeti-las daqui, porque a rede está bloqueada. Valem como evidência arquivada.
- **V4.** Li as amostras reais de ficha e de documentos da Caixa em `scratchpad/amostras_caixa/`.

---

## 1. Resumo

- **Tamanho do catálogo.** São **66 fontes**: **9 na opção 1** e 57 na opção 2 ou fora de escopo (2 fora de escopo e 1 só para monitorar). Há ainda **15 concorrentes** usados só como referência. A lista recebida foi truncada no item `soleon`, então o total da opção 2 pode crescer.
- **Inventário de imóveis com acesso estruturado: só 3 fontes.**
  1. **Caixa, CSV oficial** (`arquivo_oficial`). Tem 21.226 imóveis em 08/10/2026 (V1). É a base do LeilãoMap, o que é uma inferência de confiança média.
  2. **Leilões Judiciais, API/MCP pública** (`api_documentada`). Vários leiloeiros, com **fotos e PDFs** (edital, matrícula, avaliação). Confirmado em V3.
  3. **Suporte Leilões, API REST com OpenAPI** (`api_documentada`). A documentação é escrita para o próprio leiloeiro. Só entra na opção 1 **com autorização de cada leiloeiro** (V2).
- **Descoberta de editais oficiais (sem fotos):** PNCP, DJEN (Comunica PJe), DOU/INLABS e Querido Diário.
- **Enriquecimento:** SPU no dados.gov.br e DataJud. **O DataJud tem restrição de uso comercial.**
- **O que dá para ligar já:**
  - **Caixa CSV:** coletor diário com validação de conteúdo. Exige liberar `venda-imoveis.caixa.gov.br`.
  - **Leilões Judiciais:** em piloto, depois de ler os termos. É a única fonte da opção 1 que já entrega fotos.
  - **PNCP, DJEN, INLABS e Querido Diário:** como "radar de editais", não como vitrine.
- **O que não ligar sem autorização:** Suporte Leilões (parceria por leiloeiro) e DataJud (termo com o CNJ).
- **Fotos da Caixa.** Não estão no CSV. Saem da ficha `detalhe-imovel.asp` pelo padrão `/fotos/F{id13}{nn}.jpg`, que é opção 2 leve. **Não marcar "Sem fotos" por falta de imagem numa fonte que não publica imagem.**

---

## 2. Fontes da opção 1, em ordem de prioridade

| # | id | Nome | Acesso | Endpoints | Formato | Fotos | Documentos | Cobertura | Funciona hoje? | Restrições |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `caixa_csv` | Caixa: Lista de Imóveis | arquivo_oficial | `/listaweb/Lista_imoveis_geral.csv`, `/listaweb/Lista_imoveis_{UF}.csv` | CSV `;` CP1252 | Não (só na ficha, opção 2 leve) | Não (matrícula e edital só na ficha) | Nacional, 27 UFs, 21.226 imóveis em 08/10/2026 (V1) | Sim, mas instável: terceiros baixaram até 12/10/2026. Não testado daqui | Antibot Radware. Termos e robots não lidos |
| 2 | `leiloesjudiciais_api` | Leilões Judiciais & Extrajudiciais API (MCP) | api_documentada | `GET /api/openapi.json`, `GET /api/health`, `POST /api/mcp/messages` | JSON-RPC 2.0, JSON dentro de texto | **Sim** (S3, WebP, 4 tamanhos) | **Sim** (EDITAL, MATRÍCULA, AVALIAÇÃO em PDF) | Vários leiloeiros. Volume não confirmado | Sim em 11/10/2026 (V3) | Busca devolve 10 resultados por chamada. `ai-train=no`. Termos não lidos |
| 3 | `pncp` | Portal Nacional de Contratações Públicas | api_documentada | `/api/consulta/v1/contratacoes/{publicacao\|proposta}?codigoModalidadeContratacao=1\|13`, `/api/search`, `.../compras/{ano}/{seq}/arquivos` | JSON + PDFs | Não | Sim (arquivos do edital) | União, estados e municípios. Volume de imóveis não confirmado | Provável (cliente ativo em 18/08/2026). Não testado | Baixa (publicidade obrigatória, Lei 14.133) |
| 4 | `djen` | DJEN / API Comunica PJe | api_documentada | `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` (`meio=E` = Plataforma de Editais) | JSON (texto em HTML) | Não | Texto do edital | Todos os tribunais do PJe/DJEN. Volume não confirmado | Provável (cliente de 15/09/2026). Não testado | Dados pessoais de partes no texto |
| 5 | `dou_inlabs` | DOU via INLABS (Imprensa Nacional) | arquivo_oficial | `POST /logar.php`, `GET /index.php?p=AAAA-MM-DD&dl=AAAA-MM-DD-DO3.zip` | ZIP com XML | Não | Texto do aviso | Federal (SPU, estatais, FHE) | Provável (repo oficial de 30/09/2026). Não testado | Login gratuito. Termos não lidos |
| 6 | `querido_diario` | Querido Diário (OKBR) | api_documentada (de terceiro) | `GET https://api.queridodiario.ok.org.br/gazettes` | JSON + PDFs | Não | Trecho e PDF do diário | Municípios cobertos pelo projeto (parcial) | Provável (qd-api de 12/09/2026). Não testado | Não é a fonte oficial. Licença dos dados não confirmada (código MIT) |
| 7 | `suporteleiloes_api` | Suporte Leilões (ERP) API v5 | api_documentada (para o leiloeiro) | `https://api-v2.suporteleiloes.com.br/api/public/{lotes,leiloes,estoque,...}` + cabeçalho `Uloc-Mi` | JSON | Sim (estoque traz fotos) | Sim (documentos do leilão, laudo de vistoria) | Cerca de 107 domínios de leiloeiros | **Parcial:** 401 sem `Uloc-Mi` (radar). Com o cabeçalho, não testado | **Precisa de autorização de cada leiloeiro.** Risco LGPD |
| 8 | `spu_dados_abertos` | SPU, Imóveis da União (dados.gov.br) | dados_abertos | Endpoint não confirmado | Não confirmado | Não | Não | Cadastro de imóveis da União, **não é lista de venda** | Não testado (dados.gov.br deu 403 no proxy) | Só para enriquecimento |
| 9 | `datajud` | DataJud (CNJ), API pública | api_documentada | `POST https://api-publica.datajud.cnj.jus.br/api_publica_{tribunal}/_search` | JSON (Elasticsearch) | Não | Não (só metadados e movimentos) | Processos de todos os tribunais | Provável. Não testado | **Termos v1.2: uso "não comercial". Res. CNJ 446/2022 proíbe bases derivadas comerciais sem termo com o CNJ** |

Fora da tabela, mas citado pela frente governo: o SIAPA e o GeoServer da SPU, que serviriam para identificar terreno de marinha e aforamento. Tipo de acesso e endpoint **não confirmados**.

---

## 3. Detalhe de cada fonte da opção 1

### 3.1 `caixa_csv`: lista oficial da Caixa

**Endpoints.** Evidência: ldmaster/simplified-auction, `src/simplified_auction/sources/caixa_csv.py`, commit e07f4f2 de 09/10/2026, e espelhos xnetinho e tazrl.
- `https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_geral.csv`
- `https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_{UF}.csv`

**Formato do arquivo (V1 e amostras).**
- Codificação CP1252 (o `file` identifica como ISO-8859) e separador `;`.
- Linha 1: `Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;`.
- Linha 2: cabeçalho. Linha 3: em branco. Depois vêm os dados.
- Todos os campos têm espaços nas bordas e precisam de `trim`.

**Colunas.** Nomes originais, tipos e o que medi no CSV de 08/10/2026:

| Coluna | Tipo / formato | Observação medida (V1) |
|---|---|---|
| `N° do imóvel` | texto numérico de 4 a 13 dígitos, sem zeros à esquerda | Para montar URLs de foto e matrícula, completar com zeros até 13 dígitos (`10005120` vira `0000010005120`) |
| `UF` | sigla | 27 UFs. RJ tem 7.193 |
| `Cidade`, `Bairro`, `Endereço` | texto | Endereço livre, sem CEP (o CEP só aparece na ficha) |
| `Preço` | decimal pt-BR (`50.074,26`) | Mínimo da modalidade em vigor |
| `Valor de avaliação` | decimal pt-BR | |
| `Desconto` | decimal com **ponto** (`66.62`) | **Fica em `0.00` quando Preço > avaliação** (2.039 linhas). Mediana de 42,08% e máximo de 90,01% |
| `Financiamento` | `Sim` ou `Não` | 2.468 Sim e 18.758 Não |
| `Descrição` | texto semiestruturado | `Tipo, X de área total, Y de área privativa, Z de área do terreno, N qto(s), ...`. **0 linhas** citam ocupação, condomínio, IPTU, penhora, fração ou direitos |
| `Modalidade de venda` | enum | Venda Direta Online 12.143; Leilão SFI - Edital Único 4.567; Venda Online 3.570; Licitação Aberta 946 |
| `Link de acesso` | URL | `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel={N°}` |

- Totais: 21.226 linhas, o que confirma o relato das frentes caixa e github.
- **Preço > avaliação** em 9,6% das linhas, chegando a 44,6% no Leilão SFI. Isso também confirma o relato.

**Fotos e documentos.** Ficam na ficha, ou seja, são opção 2 leve. Mesmo assim descrevo aqui porque completam esta fonte (V4).
- **Fotos:** `https://venda-imoveis.caixa.gov.br/fotos/F{id13}{nn}.jpg`. Amostras:
  - `F000001000512021.jpg`, de 2026;
  - `F144441050595421.jpg` e `...22.jpg`, de 2023.
  - Número máximo de fotos por imóvel: **não confirmado** (as amostras têm 1 e 2).
- **Matrícula:** `/editais/matricula/{UF}/{id13}.pdf`. Não está confirmado se é texto ou imagem escaneada.
- **Editais:** a lista vem de `/sistema/carregaListaDocumentos.asp`, que é AJAX e exige os cabeçalhos `X-Requested-With: XMLHttpRequest` e `Referer`. Os arquivos ficam em `/editais/{código}.PDF`. Exemplo: `EL00500226CPARE.PDF`, "Edital de Publicação do Leilão SFI - Edital Único", publicado em 06/10/2026.
- **Busca AJAX:** `/sistema/carregaPesquisaImoveis.asp` e `/sistema/carregaListaCidades.asp`. Ambas são endpoint interno.
- **Campos da ficha nas amostras:**
  - Valor de avaliação e Valor mínimo de venda (com o desconto);
  - Tipo de imóvel, Quartos, Garagem, Número do imóvel;
  - Matrícula(s), Comarca, Ofício, Inscrição imobiliária;
  - "Averbação dos leilões negativos" (o único valor visto é "Averbado");
  - Área privativa, Área do terreno e Endereço com CEP;
  - Descrição com "FORMAS DE PAGAMENTO ACEITAS", por exemplo "Exclusivamente à vista".
  - "REGRAS PARA PAGAMENTO DAS DESPESAS". Texto da amostra: condomínio "sob responsabilidade do comprador, até o limite de 10% em relação ao valor de avaliação". Tributos: o comprador paga quando o débito for inferior a 10% da avaliação.
  - "Imóvel NÃO aceita financiamento habitacional / parcelamento / consórcio".
- **"Situação: Desocupado" aparece só dentro de um comentário HTML** nas duas amostras, de 2023 e de 2026. **Não usar.**
- Os rótulos "Data do 1º Leilão", "Leiloeiro(a):", "Edital:" e "Data da Licitação Aberta" **não foram confirmados** em HTML real. Vêm de regex de terceiros.

**Cuidados técnicos.**
- **Anti-robô Radware Bot Manager** (ShieldSquare/perfdrive), ativo desde 15/09/2026 segundo a frente leilaomap. Os relatos se contradizem:
  - curl puro passa (xnetinho, 12/10);
  - curl_cffi imitando o Chrome passa (tazrl, 12/10);
  - só o conjunto completo de cabeçalhos de navegador passa (ldmaster);
  - Playwright headless passa (radar, 22/09);
  - só um navegador com janela visível passa (LuizFelipe1989, 12/10);
  - há bloqueio de IP internacional (czeviani).
- O coletor precisa **validar o conteúdo**: a assinatura `Lista de Im`, a data de geração e um volume mínimo. Nunca deve sobrescrever dados bons quando a coleta falhar.
- **Frequência:**
  - a frente caixa diz que o arquivo é gerado em dias úteis e fica disponível no dia seguinte, e que o arquivo geral pode atrasar 1 dia em relação aos arquivos por UF. A base é o histórico do tatimgomes, com 169 commits de 14/06 a 12/10/2026;
  - a frente github diz "mais ou menos semanal", com base nos snapshots do tazrl;
  - fico com a frente caixa, que tem a série mais densa, e registro a divergência.
- **Volume oscila muito:** de 7.113 a 28.219 imóveis entre junho e outubro de 2026. Na frente github: 7.199 (11/09), 14.484 (18/09), 19.717 (25/09), 17.914 (02/10), 18.990 (06/10) e 21.226 (08/10).
- A ficha some quando o imóvel é vendido. O euvitorfx relata defasagem de 1 a 3 dias entre CSV e venda.
- Ritmo usado por terceiros na ficha: 1,5 s (ldmaster), 2 s (tatimgomes) e 700 fichas por execução, 6 vezes ao dia (euvitorfx).

**Termos e licença.** robots.txt e termos de `venda-imoveis.caixa.gov.br` **não lidos** (domínio bloqueado). Direitos das fotos não confirmados.

**Evidências.**
- V1 (CSV de 08/10/2026 via xnetinho 90e7195, 12/10/2026).
- ldmaster/simplified-auction: e07f4f2 (09/10/2026) e fixtures 97abb86/acb38c8 (08/10/2026), licença MIT.
- LeinadAsid/caixa-auction-api fc5ee8a (26/12/2023), licença MIT.
- tatimgomes/imoveis-caixa (histórico de 14/06 a 12/10/2026).
- tazrl/leiloes-caixa-sp (snapshots).
- O espelho xnetinho **não tem licença**: serve só para teste interno, nunca como fonte de produção.

### 3.2 `leiloesjudiciais_api`: Leilões Judiciais & Extrajudiciais API

**Endpoints (V3, respostas de 11/10/2026).**
- `GET https://www.leiloesjudiciais.com.br/api/openapi.json` devolveu 200 com OpenAPI 3.0.3, título "Leilões Judiciais & Extrajudiciais API", versão 1.0.0. A descrição diz: *"API pública para consulta e busca de lotes de leilões no Brasil. Acesso público, sem autenticação."*
- `GET /api/health` devolveu `{"status":"ok","service":"leiloesjudiciais-api",...}`.
- `POST /api/mcp/messages`: JSON-RPC 2.0 com os métodos `initialize`, `tools/list`, `tools/call`, `resources/list` e `prompts/list`. `serverInfo` = "Leilões Judiciais MCP Server" 1.0.0, `protocolVersion` 2025-03-26.

**Ferramentas MCP.**
- `search_leiloes`:
  - `query` (string, **obrigatório**; sem ele volta o erro `-32602`);
  - `estado` (UF);
  - `categoria` (`imoveis`, `veiculos`, `animais`, `maquinas-e-equipamentos`, `joias-e-metais-preciosos`, `informatica-e-eletronicos`, `bicicletas`, `todos-os-leiloes`).
- `get_leilao_details` recebe `leilaoId` (string: "ID do leilão ou lote"). Na sonda, ele aceitou o `lote_id` 218898. A resposta arquivada está truncada, então os campos do detalhe ficam **não confirmados** além de `nu`, `lote_id`, `leilao_id`, `nm_titulo_lote`, `nm_titulo_leilao`, `nm_descricao`, `lote_anterior`/`lote_proximo` e `bn_exibeavaliacao`.
- **Formato da resposta:** `result.content[0].text` é **um JSON dentro de uma string**, então é preciso fazer o parse duas vezes.

**Campos de cada item de `results[]`** (nomes originais e tipos vistos na sonda):
- **Identificação:** `nu` (str), `lote_id` (int), `leilao_id` (int), `imovel_id` (int), `nm_titulo_lote`, `nm_titulo_leilao` (str). Exemplo de título de leilão: "711ª LEILÃO JUDICIAL UNIFICADO DO TRT DA 2ª REGIÃO".
- **Texto:** `nm_descricao` (str, HTML). Traz número do processo, matrícula, cartório, observações e valor de avaliação.
- **Datas:** `dt_fechamento` (str, `2026-09-17 13:05:50-03`) e `dt_fechamento_formatado`.
- **Valores:** `vl_lanceminimo`, `vl_lanceinicial`, `vl_lanceinicialsegundoleilao`, `vl_incremento`, `vl_venda`, `vl_lance` e `vl_ordenacao` (str decimal, como `"1700000.00"`, ou null).
- **Pagamento:** `nu_parcelas` (int), `vl_percentualentrada` (int), `indice_correcao` (str, por exemplo "IPCA (IBGE)").
- **Local:** `nm_cidade`, `nm_estado`.
- **Status:** `nm_statuslote`/`statuslote_id` (por exemplo "Aberto para Lance" ou "Aguardando"), `statusmontagem_id`, `nu_qtdelances`, `nu_visitas`, `nu_ordem`.
- **Leiloeiro:** `nm_leiloeiro`, `nm_url_leiloeiro`. Na amostra aparecem www.doleiloes.com.br, giordanoleiloes, akimotoleiloes e planaltoleiloes, o que confirma que a fonte reúne vários leiloeiros.
- **Classificação:** `nm_segmento`/`nm_categoria`/`nm_subcategoria` e seus ids.
- **Outros:** `bn_exibeavaliacao` (bool), `iframe_streetview`, `s3_path`, `usuariovistorialotexstatusliberacaoextra[]` (alertas de habilitação), `veiculo_id`, `equipamento_id`.
- **Dados pessoais:** `nm_usuario` e `id_usuario` vieram null na amostra. **Não armazenar** (LGPD).
- **Semântica dos valores não documentada.** Na amostra, `vl_lanceminimo` (1.700.000) é igual ao "VALOR DA AVALIAÇÃO" do texto, e `vl_lanceinicial` (1.275.000) equivale a 75% disso. É preciso confirmar com mais casos antes de usar como avaliação.

**Fotos.** `fotos[]` traz:
- `nm_path` (por exemplo `I_28963_951615_A.webp`), `nu_ordem`, `imovel_id`;
- `tamanho` {`thumb` 107x80, `thumb_pequena` 196x146, `thumb_media` 327x244, `thumb_grande` 640x480};
- `nm_path_completo`: `https://s3-sa-east-1.amazonaws.com/906de634c48fb7d34136160b4c353ae4/public/fotos/imoveis/196x146/...webp`;
- `nm_path_incompleto`: o prefixo, ao qual se acrescenta a pasta do tamanho.

Quantidade de fotos nos 10 resultados da amostra: [0, 5, 0, 4, 0, 0, 13, 0, 5, 24]. Ou seja, **6 de 10 lotes vieram sem foto.**

**Documentos.** `anexos[]` traz `id`, `nm` (por exemplo "EDITAL", "MATRÍCULA", "MATRÍCULA 13.942", "AVALIAÇÃO", "LAUDO DE AVALIAÇÃO", "ATUALIZAÇÃO DA AVALIAÇÃO", "CALCULOS ATUALIZADOS - AVALIAÇÃO"), `nm_path` e `nm_path_completo` (PDF no mesmo bucket S3, em `/public/anexo/`). Uma sonda HEAD em um PDF devolveu 200 `application/pdf` pelo AmazonS3.

**Cuidados técnicos.**
- **As duas buscas da sonda devolveram exatamente `totalResults: 10`**, e o schema não tem paginação. Por isso a coleta em massa precisa de muitas consultas (UF × termo × categoria) ou de outro caminho, e a cobertura total fica **não confirmada**.
- Existe `sitemap.xml` (citado no robots) e a página `/imoveis` tem links `/lote/{leilao_id}/{lote_id}`. Uma ideia é combinar a descoberta pelo sitemap com `get_leilao_details`. **Não testado.**
- Há **status desatualizado**: lotes com `dt_fechamento` em 17/09/2026 ainda apareciam como "Aberto para Lance" em 11/10. Validar a data antes de exibir.
- Não está confirmado se o servidor exige sessão MCP (cabeçalho de sessão) entre `initialize` e `tools/call`. O corpo exato das requisições da sonda não foi arquivado. Use o formato padrão do MCP: `params.name` + `params.arguments`.
- O site fica atrás do Cloudflare.
- Plataforma: V-Lance (Serrano), segundo o radar. Os nomes `nm_usuario` e `id_usuario` batem com o V-Lance. A **divergência** com o farol, que rotulava o site como "superbid" a partir do texto da home, se resolve em favor do radar.

**Termos, robots e licença (V3).**
- robots.txt: `Allow: /api/mcp/messages`, `Allow: /api/openapi.json`, `Allow: /auth.md`, `Disallow: /busca`, `Disallow: /*?pagina=`, `Content-Signal: ai-train=no, search=yes, ai-input=yes`.
- O cabeçalho `content-signal` repete esses valores.
- `/auth.md` e `/llms.txt` devolveram 500 com a página "Página não encontrada". `/.well-known/mcp.json` devolveu 404.
- **Termos de uso não lidos.**
- `ai-train=no` significa que esses dados não podem treinar modelos.
- Recomendo pedir autorização por escrito antes de produção.
- Direito de imagem das fotos não confirmado.

**Evidências.**
- V3: `sondas/agreg2-saida.txt`, `agreg3-saida.txt`, `agreg4-r.txt`, `agreg5-saida.txt` e `agreg1-saida.txt`, de 11/10/2026.
- gilcambe/nexia, `netlify/functions/leilao.js`, linhas 77 a 80, último commit do arquivo f594c3a em 11/10/2026 05:14 UTC. **Divergência de data:** a frente github cita 12/10, mas essa é a data do HEAD do repositório, não do arquivo.

### 3.3 `suporteleiloes_api`: Suporte Leilões (ERP), API v5

**Base e autenticação (V2).**
- Base URL: `https://api-v2.suporteleiloes.com.br`.
- O cabeçalho **`Uloc-Mi: {domínio do leiloeiro}`** é obrigatório. A documentação diz: "Obrigatório quando o backend não consegue resolver via `Referer`".
- O esquema global pede `X-API-KEY` ou JWT, mas **as rotas `/api/public/*` não declaram segurança**, isto é, não pedem token.
- A especificação tem 1.366 rotas, 114 delas públicas.
- A documentação se dirige ao "**time de TI do leiloeiro**".

**Rotas relevantes:**
- `GET /api/public/lotes`, com os parâmetros `page, limit, sortBy, descending, id, search, status, categoria, subcategoria, uf, cidade, bairro, judicial, somenteAtivos, valorInicial, valorFinal, destaque, comitentes`.
- `GET /api/public/lotes/{id}`: bem, leilão, lances, propostas, vídeos, taxas, "valor inicial vigente conforme a praça atual" e `_urls` (auditório e edital).
- `GET /api/public/leiloes`, com `page, limit, ..., codigo, ano, tipo, classificacao, leiloeiro, data, data1, data2, tipoEvento, somenteAtivos, totaisPorData`; e `GET /api/public/leiloes/{id}`, que traz documentos e leiloeiro.
- `GET /api/public/estoque`, `/estoque/{id}` e `/estoque/filtros`: fotos, comitente, campos extras e filtros como `processoNumero`.
- `GET /api/public/search/{argumento}`, `/api/public/comitentes`, `/api/public/services/stockMap`.
- `GET /api/public/vistorias/{id}/laudo/download` (laudo de vistoria) e `GET /api/public/documentos/{code}`.

**Campos.** A OpenAPI **não descreve o corpo das respostas**: as rotas acima só dizem 200 "OK". Os nomes de campo conhecidos vêm do JSON embutido no HTML, medido pelo radar: `imovel.ocupado`, `leilao.judicial`, `numeroProcesso`, `valorAvaliacao`, `valorInicial`/`valorInicial2`/`valorInicial3`, `data1`/`data2`/`data3`, `leilao.documentos`.

**Cobertura.** Cerca de 107 domínios: 89 na versão v1 (Laravel) e 2 na v2 (Next.js), segundo o radar.

**Situação atual.** O radar mediu **401 sem `Uloc-Mi`**. Com o cabeçalho, não foi testado.

**Restrições.**
- O uso por terceiros exige autorização de cada leiloeiro. Isso é inferência a partir do público-alvo da documentação e da frente leilaomap.
- LGPD: a v1 expõe o IP de quem dá lance (`lote.lances`) e a v2 traz nomes de exequente e executado em campos estruturados.
- **Divergência registrada:** a frente leilaomap trata a Suporte como opção 1; a frente leiloeiros, como JSON no HTML (opção 2). **Decisão:** é `api_documentada`, mas só entra na opção 1 **com parceria** por leiloeiro. Sem parceria, fica na opção 2.

**Evidência:** suporteleiloes/docs 396fee0 (28/08/2026) e radar-dos-leiloes 29a653c (11/10/2026).

### 3.4 `pncp`: Portal Nacional de Contratações Públicas

**Endpoints.** Fonte: pncp-cli, `src/pncp_cli/constants.py`, `commands/consulta.py` e `commands/compra.py`, commit 7848494 de 18/08/2026.
- Base: `https://pncp.gov.br`.
- Busca:
  - `/api/consulta/v1/contratacoes/publicacao` e `/api/consulta/v1/contratacoes/proposta` (esta só traz editais abertos);
  - filtro `codigoModalidadeContratacao` = **1 (Leilão - Eletrônico)** ou **13 (Leilão - Presencial)**;
  - os nomes dos parâmetros de período não foram conferidos aqui (ver a OpenAPI).
- Paginação: `pagina` e `tamanhoPagina`. O padrão é 10, e o servidor "trunca sem indicar que faltam" (pncp-cli, `pagination.py`).
- Detalhe: `/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}`.
- Itens: `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens`.
- **Arquivos do edital:** `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos`.
- Busca textual: `/api/search` e `/api/search/filters`.
- Documentação: `/api/consulta/v3/api-docs` e `/api/pncp/v3/api-docs`.
- Link público: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}`.

**Fotos:** não há. **Base legal:** a Lei 14.133, art. 54, obriga o edital completo no PNCP. Risco jurídico "Baixo" (mcp-brasil `sources.md`, 2efb258, 18/08/2026). O pncp-cli envia um User-Agent de navegador.

**Lacunas:** o volume real de leilões de imóveis e se as estatais regidas pela Lei 13.303 publicam no PNCP. Ambos **não confirmados**.

### 3.5 `djen`: Comunica PJe

- **Endpoint:** `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao`. A documentação está em `comunicaapi.pje.jus.br/swagger/index.html`. A consulta é pública, sem login.
- **Parâmetros** (vbarcelosbt/API_DJEN, `config.py`, eb469cc, 15/09/2026):
  - `dataDisponibilizacaoInicio` e `dataDisponibilizacaoFim`, no formato `AAAA-MM-DD`, o que resolve a lacuna de formato de data da frente governo;
  - `siglaTribunal`, `numeroOab`, `ufOab`, `nomeAdvogado`, `nomeParte`;
  - **`meio`** = `D` (Diário) ou **`E` (Plataforma de Editais)**.
- **Campos da resposta:** `siglaTribunal`, `meio`/`meiocompleto`, `texto` (HTML).
- **Busca por texto livre:** não aparece entre os parâmetros, então fica **não confirmada**.
- **Também não confirmado:** se todos os editais de leilão judicial passam pela Plataforma de Editais.

### 3.6 `dou_inlabs`: DOU pelo INLABS

- **Acesso:** login com `POST https://inlabs.in.gov.br/logar.php`, que gera o cookie `inlabs_session_cookie`.
- **Download:**
  - XML: `GET https://inlabs.in.gov.br/index.php?p={AAAA-MM-DD}&dl={AAAA-MM-DD}-{SECAO}.zip`;
  - PDF: `...&dl={AAAA}_{MM}_{DD}_ASSINADO_{secao}.pdf`.
- **Seções:** `DO1`, `DO2`, `DO3` e as edições extras `DO1E`, `DO2E` e `DO3E`. A seção 3 traz os avisos de leilão.
- **Evidência:** Imprensa-Nacional/inlabs, `public/python/inlabs-auto-download-xml.py`, ddbc43c (30/09/2026).
- **Termos:** não lidos. O cadastro é gratuito.

### 3.7 `querido_diario`: diários municipais

- **Endpoint:** `GET https://api.queridodiario.ok.org.br/gazettes`, com os parâmetros `territory_ids` (código IBGE), `published_since`, `querystring` e `excerpt_size` (qd-api, `api/api.py`, bca35cb, 12/09/2026).
- **Arquivos:** ficam em `data.queridodiario.ok.org.br`.
- **Licença:** o código é MIT (Open Knowledge Brasil). A licença dos dados **não foi confirmada**.
- **Cobertura:** parcial, só os municípios que o projeto raspa.

### 3.8 `spu_dados_abertos`: Imóveis da União

- **O que é:** um conjunto no dados.gov.br. É **cadastro**, não lista de venda.
- **Para que serve:** identificar terreno de marinha, aforamento e ocupação, que alimentam as tags "Só direitos" e "Custos extras".
- **Endpoint e campos:** não confirmados. `dados.gov.br` e `imoveis.economia.gov.br` deram CONNECT 403 no proxy (frente governo).

### 3.9 `datajud`: CNJ

- **Endpoint:** `POST https://api-publica.datajud.cnj.jus.br/api_publica_{sigla}/_search`, com sigla como tjsp, tjrj, tjpr, trf1, trf3 ou trt15.
- **Cabeçalho:** `Authorization: APIKey {chave pública}` (pydatajud README, 8c0c5c9, 05/08/2026).
- **Uso:** situação e movimentos de um processo a partir do número CNJ extraído do edital.
- **Restrição:**
  - os termos de uso v1.2 (`formularios.cnj.jus.br/.../Termos-de-uso-api-publica-V1.2.pdf`) falam em uso **não comercial**;
  - o `sources.md` do mcp-brasil (18/08/2026) resume que é "**VEDADA** redistribuição em larga escala, mineração extensiva ou criação de bases derivadas comerciais sem termo específico assinado com o CNJ" (Res. CNJ 331/2020 e 446/2022).
  - **Não usar em produto pago sem esse termo.**
- **Lacuna:** códigos TPU de movimentos de leilão, arrematação e penhora não confirmados.

---

## 4. Dicionário de risco (26 tags)

**Siglas das fontes usadas nas tabelas:**
- **CSV** = Caixa CSV;
- **FICHA** = ficha da Caixa (opção 2 leve, citada porque completa a Caixa);
- **LJ** = Leilões Judiciais API;
- **SL** = Suporte Leilões (com parceria);
- **ED** = texto de edital (`nm_descricao` da LJ, PDFs de edital e matrícula, PNCP, DOU, DJEN, Querido Diário);
- **DJ** = DataJud (só com termo do CNJ);
- **SPU** = SPU.

**Regras gerais:**
- Toda regra roda sobre texto normalizado: minúsculas, sem acento e sem HTML.
- Cada tag gravada guarda fonte, trecho, regra e confiança, como sugere a tabela `evidencia_risco` da frente governo.
- **H = exige leitura humana antes de exibir como fato.**

### Ocupação
| Tag | De onde vem | Regra de detecção | Confiança |
|---|---|---|---|
| Ocupado | CSV: **não tem** (0/21.226). FICHA: só em comentário HTML, **não usar**. Caixa: relação de imóveis do edital em PDF (só Leilão SFI e Licitação Aberta). SL: `imovel.ocupado`. LJ/ED: texto | `\bocupad[oa]\b` sem o prefixo `des`; `ocupado pel[oa]`; `desocupacao (por conta\|a cargo) do arrematante`; `imissao na posse` | SL alta. LJ/ED média (H se houver ambiguidade). Caixa via edital média (H) |
| Desocupado | Mesmas fontes | `\bdesocupad[oa]\b`; `livre de pessoas`; `imovel vago` | SL alta. LJ/ED média (H) |
| Ocupação não informada | Padrão quando nenhuma fonte traz sinal. CSV: **sempre**, por ausência | Nenhum dos padrões acima e SL sem `ocupado` | Alta, no sentido de "a fonte não informa" |

### Preço
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Deságio alto | CSV: `Preço` × `Valor de avaliação`. **Não usar a coluna `Desconto`**, que fica em 0 quando o preço passa da avaliação. LJ: valores `vl_*` × avaliação (semântica a confirmar, ver 3.2). SL: `valorAvaliacao` × `valorInicial{,2,3}` da praça em vigor | `1 − preço/avaliação ≥ limiar`. **O limiar não está definido no material** e deve ser parametrizável. Referência: mediana de 42,08% na Caixa em 08/10/2026 | CSV alta. SL alta. LJ média |
| Deságio baixo | Idem | `1 − preço/avaliação < limiar` | Idem |
| Preço acima do mercado | CSV: `Preço > Valor de avaliação` (9,6%; 44,6% no Leilão SFI). Demais fontes: mesma conta | Preço > avaliação. **Avaliação não é preço de mercado.** Não há referência de mercado no material | Média (H para afirmar que está "acima do mercado") |
| Custos extras altos | FICHA: "REGRAS PARA PAGAMENTO DAS DESPESAS" (condomínio até 10% da avaliação; tributos abaixo de 10%). LJ/ED: `despesas cartorarias ... a cargo do arrematante`, `baixa de ... gravames`. SL: "taxas" no detalhe do lote. SPU: terreno de marinha (laudêmio e foro) | Presença dessas cláusulas e de terreno de marinha ou aforamento | Baixa a média (H) |

### Dívidas
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Condomínio em atraso | ED, matrícula e FICHA (a regra dos 10% indica **responsabilidade**, não que a dívida exista). CSV: não | `debitos? condominia(is\|l)`, `cotas? condominia`, `condominio em atraso` + valor | Baixa (H) |
| IPTU em atraso | ED e FICHA ("Tributos"). CSV: não | `iptu`, `debitos? (tributari\|fisca)`, `divida ativa` | Baixa (H) |
| Dívida passa ao arrematante | FICHA: cláusula padrão da Caixa. LJ/ED | Positivo: `(por conta\|a cargo\|sob responsabilidade) do (arrematante\|comprador)`. **Contrassinal:** `sub-?rogar.* no preco`, `isento dos debitos`, `art\.? 130 .*ctn` (o trecho de exemplo da LJ traz o contrassinal) | Caixa alta (é texto padrão). Judicial média (H) |

### Processo
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Ação judicial em curso | ED: número CNJ `\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}` (na LJ: "Proc. 1000818-76.2020.5.02.0090"). SL: `numeroProcesso`. DJ: movimentos. CSV: não | Ação que **questiona o imóvel ou o leilão**: `acao (anulatoria\|revisional)`, `embargos`. O processo da própria execução não conta | Baixa (H) |
| Penhora de outros credores | LJ/ED (exemplo real: "Há outras penhoras."); matrícula em PDF ("PENHORA") | `outras penhoras`, `penhoras? anterior`, `R\.\d+.*penhora` na matrícula | Média no texto do edital; baixa na matrícula (OCR, H) |
| Leilão com recurso | ED e DJ (códigos TPU **não confirmados**) | `agravo`, `recurso pendente`, `efeito suspensivo`, `embargos a arrematacao` | Baixa (H) |
| Devedor com direito de preferência | CSV: `Modalidade de venda` = "Leilão SFI - Edital Único" (Lei 9.514/97, art. 27, válido até o 2º leilão). Bancos privados: toda alienação fiduciária extrajudicial. ED | Modalidade SFI ou `direito de preferencia`, `remicao` | Caixa SFI alta (o momento, 1º ou 2º leilão, depende da ficha ou do edital). Judicial baixa (H) |

### Documentação
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Matrícula com pendência | FICHA: "Averbação dos leilões negativos" (só "Averbado" foi visto) e PDF da matrícula. LJ: anexo "MATRÍCULA" e texto (exemplo real: "Há indisponibilidade") | `indisponibilidade`, `gravame`, `onus`, `pendencia registral` | Baixa (OCR, H) |
| Construção irregular | ED, laudo e matrícula | `nao averbad[ao]`, `construcao irregular`, `benfeitorias? nao averbad` | Baixa (H) |
| Área divergente | CSV: áreas na `Descrição` × FICHA, matrícula ou laudo. LJ: título × texto | `divergencia de area`, `area divergente`, ou diferença numérica acima de uma tolerância (não definida no material) | Baixa (H) |

### O que se compra
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Imóvel inteiro | Padrão quando não há sinal de fração nem de direitos | Ausência dos padrões abaixo | Média |
| Cota-parte | LJ/ED | `fracao ideal`, `parte ideal`, `cota-?parte`, `\d+([.,]\d+)?% (do\|de) imovel`, `meacao` | Média (H se for percentual) |
| Só direitos sobre o imóvel | LJ: título começando com "Direitos -" (exemplo real: "Direitos - Apartamento - 160,780m²"). ED. SPU: aforamento ou ocupação | `^direitos`, `direitos (e acoes\|aquisitivos\|possessorios)`, `dominio util`, `terreno de marinha` | Média a alta no título; média no texto |

### Informação
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| Sem fotos | LJ: `fotos == []` (6 de 10 na amostra). SL: fotos do estoque. FICHA: ausência de `/fotos/F...jpg`. **CSV, PNCP, DOU, DJEN e Querido Diário não publicam foto, então não marcar a tag a partir deles** | Lista de fotos vazia **numa fonte que publica fotos** | Alta (LJ, SL, FICHA) |
| Sem vistoria | SL: há ou não laudo em `/vistorias/{id}/laudo/download`. Sato (opção 2): `vistoria_imobiliaria`. LJ/ED | `nao foi possivel vistoriar`, `vistoria (nao realizada\|externa)`, `sem acesso ao interior` | Baixa a média (H). Anexo de "AVALIAÇÃO" não é vistoria |
| Aceita financiamento | CSV: `Financiamento` = Sim/Não. FICHA: "Imóvel NÃO aceita financiamento habitacional" | Valor da coluna | **Alta** (CSV). Em LJ e SL, `nu_parcelas` e `vl_percentualentrada` indicam **parcelamento judicial, não financiamento**: não confundir |

### Praça
| Tag | De onde vem | Regra | Confiança |
|---|---|---|---|
| 1ª praça | FICHA ou edital da Caixa SFI (rótulo "Data do 1º Leilão" **não confirmado**). SL: `data1`/`valorInicial` + praça em vigor. LJ: `dt_fechamento` + `vl_lanceinicialsegundoleilao` preenchido. ED: `1[ºo] (leilao\|praca)`, `primeira praca` | Data atual antes da data da 1ª praça | SL alta. LJ média. Caixa média |
| 2ª praça | Mesmas fontes | Data atual entre a 1ª e a 2ª praça; `2[ºo] (leilao\|praca)` | Idem |
| Praça única | CSV: "Venda Direta Online", "Venda Online" e "Licitação Aberta" (oferta única). LJ: `vl_lanceinicialsegundoleilao` = null. SL: só `data1` | Regra por modalidade ou ausência de 2ª praça | Média (frente caixa). LJ média |

**Tag extra sugerida (frente bancos):** "Venda condicional / sujeita à aprovação do vendedor". O Santander e outros vendedores podem recusar o lance vencedor (lp.megaleiloes.com.br/santander). Essa tag não está entre as 26.

---

## 5. Opção 2: fontes com endpoint interno ou HTML (próxima etapa)

### A. Plataformas white-label, em que um conector cobre muitos leiloeiros (ordem sugerida)
1. **Superbid offer-query** (`offer-query.superbid.net`): cobre Superbid, Sold (stores 1161 e 1741) e 63 de 937 leiloeiros do catálogo FENALEI (kronberg.lel.br, milanileiloes, ghvmleiloes). Traz o template "situacao" (ocupação), anexos de edital, matrícula e laudo, comissão e parcelas. **Conflito sobre anti-robô:** o radar mediu Cloudflare em 22/09 (1 sucesso em 1.458) e HTTP 403 na auditoria de 03/10; o LuizFelipe diz que não há anti-robô (12/10). No robots de superbid.net, `Allow: /` (V3).
2. **V-Lance (Serrano):** cerca de 30 tenants respondem `POST /core/api/get-lotes` com JSON aberto, entre eles os sites leiloesjudiciais sul/sc/mg/go/bahia (os TLDs exatos não foram confirmados). Atenção LGPD: `nm_usuario` e `id_usuario`.
3. **Suporte Leilões sem parceria:** JSON embutido no HTML em cerca de 107 domínios. Traz ocupação, processo, avaliação, 3 praças e documentos.
4. **SOLEON:** 107 domínios, 63 com lote.
5. **Leilão PRO:** 103 domínios (53 no FENALEI).
6. **Sua Plataforma de Leilão:** 44 domínios, dos quais 28 a 39 respondem. JSON via ApiEngine. Conflito entre GetLotes e GetBusca (radar em 16/09, farol em 06/10). Expõe CPF de fiel depositário (LGPD).
7. **Leiloar:** 20 domínios.
8. **Bom Valor:** 11 domínios; 5 deles cobrem todo o acervo.
9. **SISHP:** 8 domínios.
10. **Ares/Supabase:** 4+2.
11. **Mega Leilões / Grupo Lance (Yii):**
    - volumes do radar em 22/09: Mega 841 imóveis, Grupo Lance 363;
    - sondas: `megaleiloes.com.br/imoveis` devolveu 200 com 48 cards; o robots só bloqueia `/login`;
    - lancejudicial.com.br redireciona para grupolance.com.br, que mostra **desafio Cloudflare**; o robots bloqueia `/ajax/`, `/search/` e `/*.pdf$`.
12. **Leilovia** (3 domínios). 13. **Labasoft** (3). 14. **Leilotech** (volume não confirmado).

### B. Leiloeiros individuais
15. **Portal Zuk:** 884 oportunidades em 22/09. Ocupação no card, matrícula e documentos no detalhe. O robots bloqueia `/ajax-lote*` e `/edital`. zukerman.com.br redireciona para o Portal Zuk. Comitentes: Itaú, Bradesco, Santander, BB, BRB, Sicoob, Daycoval, C6, BTG e Bari.
16. **Frazão:** 505 lotes, cerca de 97% imóveis (15/09). Tem **feed** em `sitemap-lotes.xml` (200 com `lastmod` 2026-10-09, V3) e páginas HTML `/lote/{id}-{slug}`. A plataforma não está confirmada. O radar coloca a Frazão na regex do Zuk, mas as rotas são outras.
17. **Biasi:** sem endpoint. O robots.txt devolveu página de erro (V3).
18. **Sodré Santoro:** volume não medido. Atua em DF, GO, MG, PR e SP.
19. **Lance no Leilão:** leiloeiro do BB. Acesso não confirmado.
20. **Hasta Pública / Valland:** só a home.
21. **Milan Leilões:** 57 lotes em 29/07. Não confundir com Milani, que usa Superbid.
22. **VIP Leilões / Leilão VIP:** foco em veículos; imóveis não confirmados.
23. **Sato:** os campos `vistoria_imobiliaria.desocupado` e `documentos_lote` são a melhor fonte para "Sem vistoria" e ocupação.
24. **Outros conectores do radar:** Freitas, Leilo, Kuss, LeiloesBR e Parque dos Leilões. No Parque dos Leilões há lotes do BRB com 1ª praça em 19/10/2026.
25. **Sem evidência de endpoint:** Pestana, Fidalgo, Leje, Lut e Kronberg. Kronberg também aparece na lista de assinaturas Superbid: conflito não resolvido.

### C. Bancos e credores
26. **Caixa: ficha, fotos, matrícula e editais.** É a **prioridade 1 da opção 2**, porque completa o CSV. Detalhes em 3.1.
27. **Santander Imóveis:** `/wp-json/wp/v2/estate_property` (REST padrão do WordPress). 1.365 imóveis no Mapa Resale de 30/06/2026. O robots devolveu 403 (V3).
28. **Resale:** API `q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod/property/`, que exige `x-api-key` (403 sem chave em 12/10, 15:49 UTC). Usar intervalo de 2 s ou mais. Cobre Santander, BTG, Pan, BRB e BB. O robots tem `Allow: /` (V3). Caminho sugerido: **parceria formal**.
29. **Sicoob:** white-label da Resale.
30. **Vitrine Bradesco:** 0 imóveis em 06/10/2026. O Mapa Resale contava 434 do Bradesco. Host exato não confirmado.
31. **Seu Imóvel BB:** 633 imóveis no Mapa Resale, 776 no Monitor Leilão.
32. **Itaú:** HTML com editais em PDF. Vende pela Zuk, Frazão e Mega.
33. **BRB.** 34. **Banrisul** (81 imóveis em abr/2026). 35. **Banestes.** 36. **Sicredi.** Os quatro são HTML com PDF.
37. **EMGEA:** lista própria não confirmada.
38. **Credores que vendem só por leiloeiro:** Inter, Daycoval, C6, BTG, Pan, Bari, Safra, Domus, securitizadoras, Mercantil, Creditas, BV, ABC, Alfa, RCI, Continental, CHB, Banese, CNP, Disal, Porto Seguro, Embracon, FGC e BNB. **Deduplicar** por matrícula, endereço ou código do lote, porque o mesmo imóvel aparece no portal do banco e no do leiloeiro.

### D. Governo e Justiça (detalhe e fotos)
39. **VendasGov (SPU e INSS):** `/api/public/editais/*.pdf`. JSON interno e fotos não confirmados.
40. **PGFN Comprei:** 8.430 imóveis no lançamento, em 2022.
41. **Correios:** 32 imóveis em 14 estados (jun/2026).
42. **Petrobras.** 43. **Forças Armadas (Exército e FHE/Poupex).**
44. **Estado de SP (SGGD).** 45. **Estado de MG (MGI).** 46. **Estado do RS.** 47. **Estado do RJ** (não confirmado).
48. **Prefeituras.** 49. **TRTs.** 50. **TJs e TRFs.** 51. **BNDES** (esporádico).
52. **PNAJ/CNJ:** só monitorar. O Provimento 255/2026 cria a plataforma; ela vira obrigatória 120 dias depois da homologação, que ainda não tinha ocorrido em 10/09/2026.
53. **Receita/SLE:** fora de escopo (só mercadorias).
54. **DETRANs e Copart:** fora de escopo (veículos).

### E. Cadastros de leiloeiros (lista-mestra para a opção 2)
55. **FENAJU:** 1.947 registros, 1.195 com domínio (baseline de 10/10/2026). Acesso por endpoint interno ou HTML.
56. **Listas das juntas comerciais:** arquivos DOCX de 13 UFs.
57. **Catálogo FENALEI do farol:** 937 linhas, com assinatura de plataforma por domínio.

### Concorrentes (referência, não são fonte)
LeilãoMap, Leilão Imóvel (desafio Cloudflare na sonda), Spot, Deu Lance, Radar Leilão, Leilo.ai/LeilôAI, Arremata.ai, Spy Leilões, Mapa do Leilão, Monitor Leilão, Núcleo, MapaLeilão e Leilão Ninja. Mais o nicho só da Caixa (Imóveis Caixa Leilão, Leilão no Mapa, BidMap, Leilaum, Radar Imóveis de Leilão, Radar Leilões Caixa, Notifica Leilão) e o POC radar-dos-leiloes. **Nenhum deles publica API.**

---

## 6. Lacunas e riscos jurídicos

### Divergências registradas (decisão tomada)

| Tema | Relato A | Relato B / verificação | Decisão |
|---|---|---|---|
| Leilões Judiciais é opção 1? | github e leiloeiros: evidência indireta (comentário no nexia) | V3: openapi.json 200, MCP funcionando, robots permite | Opção 1 confirmada; faltam os termos |
| Plataforma da LJ | farol: "superbid" | radar: V-Lance. Nomes de campo da V3 batem com V-Lance | V-Lance |
| Suporte Leilões | leilaomap: opção 1 | leiloeiros: JSON no HTML. V2: OpenAPI para o leiloeiro | Opção 1 só com parceria |
| Frequência do CSV da Caixa | caixa: dias úteis | github: "mais ou menos semanal" | Dias úteis (série mais densa) |
| Data da evidência nexia | leiloeiros: 11/10 | github: 12/10 | Arquivo em 11/10 (f594c3a); 12/10 é o HEAD |
| Cobertura do LeilãoMap | leilaomap: só Caixa | bancos: "Caixa e Extrajudicial" | Sem evidência de fonte além da Caixa |

### Lacunas
- **Não li ao vivo os termos de uso nem os robots.txt** de Caixa, Suporte, INLABS, Querido Diário e dados.gov.br. O robots da LJ só está na sonda arquivada.
- **LJ:**
  - volume total e paginação;
  - semântica de `vl_lanceminimo` e `vl_lanceinicial`;
  - campos completos de `get_leilao_details`;
  - se o servidor exige sessão MCP.
- **Caixa:**
  - ficha real de Leilão SFI e de Licitação Aberta;
  - número máximo de fotos;
  - outros valores de "Averbação dos leilões negativos";
  - se a matrícula é texto ou imagem;
  - termos de uso;
  - host do desafio Radware.
- **Governo:**
  - volume de imóveis no PNCP;
  - busca por texto livre no DJEN;
  - códigos TPU;
  - endpoint da SPU;
  - Constri-Jud, CNIB, Banco Nacional de Penhoras e ONR (não parecem ter API pública; não verificado).
- **A origem das sondas V3 não foi identificada.** Vale repetir a sonda quando a rede for liberada.

### Riscos jurídicos
- **DataJud:** termos "não comerciais" e proibição de bases derivadas comerciais sem termo com o CNJ. **Bloqueado para o produto pago até haver esse termo.**
- **Suporte Leilões:** a API é do leiloeiro. Usar o cabeçalho `Uloc-Mi`/`Referer` de outro tenant sem autorização equivale a raspagem.
- **Anti-robô** (Radware na Caixa, Cloudflare em Superbid, Grupo Lance e Leilão Imóvel):
  - vários repositórios contornam com Chromium headless ou FlareSolverr;
  - isso é **risco de violar termos** e **não é recomendado**;
  - o mesmo vale para usar a chave da Resale sem contrato.
- **Fotos e PDFs** pertencem a leiloeiros, bancos e comitentes, e o direito de imagem não foi confirmado. Preferir link ou miniatura com atribuição. Não re-hospedar sem autorização.
- **`ai-train=no` na LJ:** não usar os dados para treinar modelos.
- **LGPD, nunca armazenar:**
  - nome e CPF do devedor fiduciante (editais de banco);
  - nomes de exequente e executado;
  - IP de licitantes (Suporte v1);
  - `nm_usuario` e `id_usuario` (V-Lance e LJ);
  - CPF de fiel depositário;
  - placa, chassi e RENAVAM.
  - Mascarar nomes nos trechos guardados em `evidencia_risco`.
- **Repositórios sem licença** (espelho xnetinho, radar, farol e outros) servem só como evidência. Não copiar código e não usar o espelho como fonte de produção. Têm licença MIT: ldmaster, LeinadAsid e qd-api.

---

## 7. Domínios a liberar na rede

**Opção 1, coleta ao vivo:**
```
venda-imoveis.caixa.gov.br
www.leiloesjudiciais.com.br
s3-sa-east-1.amazonaws.com
906de634c48fb7d34136160b4c353ae4.s3.sa-east-1.amazonaws.com
pncp.gov.br
comunicaapi.pje.jus.br
inlabs.in.gov.br
api.queridodiario.ok.org.br
data.queridodiario.ok.org.br
dados.gov.br
imoveis.economia.gov.br
api-v2.suporteleiloes.com.br        # só depois da parceria
api-publica.datajud.cnj.jus.br      # só depois do termo com o CNJ
```

**Para ler termos e documentação (checagem jurídica):**
```
caixa.gov.br
www.caixa.gov.br
formularios.cnj.jus.br
www.cnj.jus.br
docs.queridodiario.ok.org.br
leilaomap.com.br
```
O host do desafio Radware/perfdrive da Caixa **não está confirmado**.

**Opção 2, próxima etapa** (hosts citados no material):
```
offer-query.superbid.net
www.superbid.net
www.sold.com.br
www.portalzuk.com.br
www.zukerman.com.br
www.megaleiloes.com.br
lp.megaleiloes.com.br
www.grupolance.com.br
www.lancejudicial.com.br
www.frazaoleiloes.com.br
www.biasileiloes.com.br
www.sodresantoro.com.br
www.lancenoleilao.com.br
www.hastapublica.com.br
milanleiloes.com.br
www.vipleiloes.com.br
www.leilaovip.com.br
www.globoleiloes.com.br
www.leilaoimovel.com.br
www.santanderimoveis.com.br
www.resale.com.br
q3jhhgksa9.execute-api.us-east-2.amazonaws.com
www.seuimovelbb.com.br
seuimovelbb.com.br
www.itau.com.br
novo.brb.com.br
feiraobrb.com.br
www.banrisul.com.br
www.banestes.com.br
imoveiseveiculos.app.sicredi.com.br
www.emgea.gov.br
comprei.pgfn.gov.br
imovelcorreios.com.br
www.petrobras.com.br
www.poupex.com.br
www.sggd.sp.gov.br
www.mgipar.com.br
estado.rs.gov.br
prefeitura.sp.gov.br
ww2.trt2.jus.br
www.trt4.jus.br
www.tjsp.jus.br
cgj.tjrj.jus.br
```
- Os domínios das plataformas white-label (cerca de 107 da Suporte, 107 da SOLEON, 103 da Leilão PRO, 44 da Sua Plataforma, cerca de 30 da V-Lance) estão nos catálogos do radar-dos-leiloes e do farol. Não estão reproduzidos aqui.
- Hosts **não confirmados:** Vitrine Bradesco, VendasGov, Sato e tenants V-Lance "leiloesjudiciais{uf}".

**Arquivos citados:**
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/sondas/` (sondas V3: `agreg1-saida.txt`, `agreg2-saida.txt`, `agreg3-saida.txt`, `agreg4-r.txt`, `agreg5-saida.txt`)
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/caixa_utf8.csv` (V1)
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/sl-docs/static/openapi/sl-api-v5.yaml` (V2)
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/amostras_caixa/` (V4)

---

# Anexo: crítica de completude do catálogo de fontes da opção 1

Data: 12/10/2026.

**Limitação desta rodada.** A cota de WebSearch da sessão já estava esgotada antes da minha primeira busca, e a busca de código do GitHub (`gh search`) devolveu 403 porque a sessão está presa aos repositórios configurados. Por isso, toda a evidência abaixo vem de material já baixado no disco: os clones em `scratchpad/repos/`, as sondas em `scratchpad/sondas/` e o CSV da Caixa. O que dependia de busca na web aparece como **não verificado**.

## 1. Contradições e erros dentro do catálogo (corrigir antes de usar)

1. **"9 fontes na opção 1" infla o inventário.**
   - Hoje só **2 fontes funcionam como vitrine**: o CSV da Caixa e a Leilões Judiciais (LJ).
   - A Suporte Leilões depende de parceria e o próprio §3.3 diz que, sem ela, é opção 2.
   - A SPU é cadastro, não lista de venda.
   - O DataJud está bloqueado para uso comercial.
   - Sugiro separar em quatro grupos: vitrine (2), radar de editais (4), enriquecimento (2 ou mais) e condicional (1).

2. **Fotos da Caixa: dá para montar a URL da capa só com o CSV.**
   - O padrão é `F{id13}21.jpg`, e o "21" é fixo. Evidências:
     - arremata/leilao-br, `backend/ingestion/adapters/caixa_csv.py` linhas 40 a 48, commit a32afef de 07/10/2026, sem licença. O comentário diz: *"The '21' suffix is a fixed photo slot… The /fotos/ path is NOT behind Radware… validated with a plain HEAD"*;
     - designativa07/leiloes-caixa, `src/lib/format.ts:44`, commit 2377564 de 11/10/2026.
   - As amostras V4 batem: `F000001000512021.jpg`, e `F144441050595421/22.jpg` em 2023. Ou seja, o slot 22 existe às vezes, ao contrário do que diz o arremata.
   - Consequências para o catálogo:
     - trocar `{nn}` por "capa = 21; 22 em diante opcionais, sondar com HEAD";
     - "Sem fotos" da Caixa pode ser calculado por HEAD, sem raspar a ficha;
     - a frase do §1 "LJ é a única da opção 1 que já entrega fotos" deixa de valer.
   - Ainda não confirmado: se `/fotos/` está mesmo fora do Radware, o que só se testa com a rede liberada.

3. **LJ: há caminho para coleta em massa, e o catálogo não cita.**
   - O radar-dos-leiloes usa `POST https://api.leiloesjudiciais.com.br/core/api/get-lotes?tipo=3&qtd_por_pagina=5000`. Fonte: `src/connectors/vlance.ts`, linhas 60, 192 e 271 a 274, commit c6c9a0f de 07/10/2026.
   - O próprio arquivo explica que a API ignora `pagina`, `page` e `offset` e devolve tudo de uma vez, e chama o host de "tenant agregado grande (Serrano)".
   - Classificação: é `endpoint_interno`, logo opção 2. O MCP documentado serve para consulta pontual (10 resultados por chamada); o inventário completo sai desse endpoint.
   - Falta incluir `api.leiloesjudiciais.com.br` no §7.

4. **LJ: o significado dos valores tem conflito e mais dados do que o catálogo usou.**
   - O radar mapeia `appraisal: num(l.vl_venda)` (vlance.ts:190), mas `vl_venda` veio **null em 10 de 10** lotes da sonda `agreg4-r.txt`.
   - Reprocessei os 10 lotes: `vl_lanceminimo` bate com a "avaliação" do texto em 3 de 3 casos sem ambiguidade (218898, 218848, 218901). O catálogo cita só 1 caso.
   - A razão `vl_lanceinicial`/`vl_lanceminimo` varia: 0,75, 0,5, 0,4, 0,5, 0,4, 1,0, 0,593, 0,7, 0,5 e 0,5.
   - **A regra de praça do §4 está errada.** `vl_lanceinicialsegundoleilao` veio preenchido em 3 lotes:
     - em 222141 e 220169, `ini == seg`, ou seja, o lote **já está na 2ª praça**;
     - em 222069 ("Aguardando"), `ini == min`, ou seja, está na 1ª praça.
   - Regra correta:

     | Condição | Praça |
     |---|---|
     | `seg` preenchido e `ini == min` | 1ª praça |
     | `seg` preenchido e `ini == seg` | 2ª praça |
     | `seg` nulo | Praça única ou desconhecida (H) |

5. **LJ: geolocalização que o catálogo ignorou.** Em 3 dos 10 lotes, `iframe_streetview` traz latitude e longitude na URL do embed (`!1d-23.5393…!2d-46.7175…`). Serve de geocódigo gratuito.

6. **Códigos de modalidade do PNCP divergem entre fontes.**

   | Fonte | Leilão |
   |---|---|
   | pncp-cli, `constants.py` linhas 11 e 23 | 1 = eletrônico, 13 = presencial |
   | pipeworx mcp-brazil-pncp, `index.ts` linhas 706 e 718 | 1 = eletrônico, 13 = presencial |
   | gabrielgz0/pypncp, `docs/resources/contratacoes.md` linha 88 (ec8e9a0, 23/06/2026) | **4** |

   - Duas fontes contra uma: fico com 1 e 13, mas é preciso registrar o conflito e conferir na tabela de domínio da API (não testado).
   - **Lacuna que dá para fechar:** os parâmetros de período são `dataInicial` e `dataFinal` no formato AAAAMMDD (pncp-cli, `commands/consulta.py` linhas 24, 203, 204 e 295).

7. **PNCP `/api/search` está mal classificado.** O pncp-cli o descreve como "busca textual/facetada" (`cli.py:130`), separado das OpenAPI `/api/consulta` e `/api/pncp` que o próprio catálogo cita. Deve ser `endpoint_interno` até alguém achar documentação.

8. **DataJud: a restrição comercial se apoia num resumo de terceiro.**
   - Os READMEs citam versões diferentes dos termos: V1.1 em `datajud/README.md:85` (upload de 05/2023) e V1.2 no README do pydatajud.
   - O texto "não comercial" não aparece em nenhum arquivo em disco. Só existe o resumo do mcp-brasil (`SOURCES.md` §3.1).
   - Manter o bloqueio, mas marcar como "termos não lidos".

9. **Inter.** O catálogo diz que o Inter vende só por leiloeiro. O tjoficial-bb/LeiloesBH lista "Imóveis Inter" em `https://imoveis.bancointer.com.br/` (`src/constants/leiloeiros.ts:62`, c8e5e74, 31/03/2026). É preciso conferir.

10. **Suporte: a conta não fecha.** O catálogo diz "cerca de 107 = 89 (v1) + 2 (v2)", o que soma 91.
    - O radar (`suporteleiloes.ts` linhas 4 e 5) confirma 89 de 107 na v1 e 2 na v2. Os outros 16 domínios não têm front identificado, e isso precisa ser dito.
    - Os 107 da SOLEON também estão corretos (`soleon.ts:13`): é coincidência, não erro de cópia.

11. **Classes fora da régua.** Os rótulos "api_documentada (de terceiro)" (Querido Diário) e "(para o leiloeiro)" (Suporte) não existem entre as 6 classes. Use a classe correta mais uma nota.

## 2. Fontes ausentes, com a evidência encontrada

**Radar de editais e enriquecimento (dados públicos):**
- **SPU / SIAPA** (resolve parte da lacuna do §3.8). O mcp-brasil documenta, no README (2efb258, 18/08/2026):
  - `spu_siapa`: cerca de 813 mil imóveis da União, ZIP de cerca de 220 MB, via painel Patrimônio de Todos, download em `https://drive.spu.gestao.gov.br/index.php/s/{token}/download` (`docs/guide/datasets.md:147`);
  - `spu_geo` (linha 183): GeoPortal com terrenos de marinha, acrescidos e marginais. Alimenta "Só direitos" e "Custos extras";
  - `spu_imoveis`;
  - licença "open data; atribuição" (`SOURCES.md` §6.6).
  - O token e o código das features não estão no clone raso. Classe: `dados_abertos`.
- **DOE-SP (diário estadual).** O Ro-dou, do Ministério da Gestão (gestaogovbr/Ro-dou, f642e67, 07/10/2026, **GPL-3.0**), usa `https://do-api-web-search.doe.sp.gov.br/v2/advanced-search/publications` e `/v2/journals` (`src/hooks/doesp_hook.py` linhas 40 e 41).
  - O próprio código chama de "API endpoint discovered in the site", então a classe é `endpoint_interno`.
  - O catálogo não cobre nenhum diário estadual, que é onde saem os leilões da SGGD-SP e da MGI.
  - O Ro-dou já monitora DOU e Querido Diário, mas a GPL impede copiar código para dentro do produto.
- **TCEs.** O mcp-brasil tem 12 features `tce_*`, e o Base dos Dados referencia `dadosabertos.tce.mg.gov.br`, `pit.tce.pr.gov.br` e `api-dados-abertos.tce.ce.gov.br`. Cobrem licitações municipais fora do PNCP. **Não confirmado** se trazem leilão de imóvel.
- **IPTU cadastral.** O Base dos Dados (d3dffe2, 12/10/2026) tem:
  - `br_sp_saopaulo_geosampa_iptu`, com `area_terreno`, `area_construida`, `fracao_ideal`, `valor_terreno`, `valor_construcao` e `ano_construcao_corrigida`;
  - `br_ce_fortaleza_sefin_iptu`, a partir de `ide.sefin.fortaleza.ce.gov.br/downloads`.
  - É a primeira fonte estruturada para "Área divergente" e "Construção irregular" (área construída do cadastro contra o edital).
- **BCB SGS 21340 (IVG-R).** É usado em gilcambe/nexia, `netlify/functions/leilao.js:218`. Dá só a tendência de preço, não o nível, mas é o único dado de mercado aberto achado.

**Caixa (complementos que o catálogo não cita), todos do arremata/leilao-br a32afef:**
- **Anexo II do edital SFI.** O `caixa_edital.py` lê o PDF como texto nativo (PyMuPDF) e extrai, por imóvel: IPTU, matrícula, ofício e frases com `gravame|penhora|indisponibilidade|regularização|demolição|ação judicial|ônus` (linha 109).
  - Isso alimenta "Matrícula com pendência", "Penhora", "Ação judicial" e "Construção irregular" da Caixa. O §4 só cita o edital para Ocupação.
- **Lances da Venda Online.** O `caixa_bids.py:3` diz que *"Caixa publishes Venda Online bids itself"*. Serve como sinal de concorrência; guardar só agregados (LGPD).
- **Rótulos da ficha.** `caixa_detail.py` linhas 45 e 57 trazem as regex "Data do [12]º Leilão" e "Valor mínimo de venda [12]º Leilão". É uma segunda fonte independente, mas os rótulos continuam não confirmados em HTML real.

**Opção 2 (faltam na lista do §5):**
- **Conectores do radar** (HEAD 2e7cb9a, 12/10/2026) que o item 24 omite: MC Leilão (`api.mcleilaoeireli.com.br`, `POST /leilao/listarLeiloes`), Supra (Supabase `api.{host}/rest/v1/public_lots`, talvez o "Ares/Supabase" do catálogo), Mayco Santos (`/api/lotes.json`), Leilões Brasil, Alfa, Benedetto, Casa de Leilões, Celso Cunha, Flex, Grupo Carvalho, Leilões Freire, Lucian, Paulo Botelho, Rocha, Simon e Tableau.
- **namewellz/auction-monitor** (documento revisado em 29/07/2026):
  - plataforma **Degrau** (Insigne, 74 anúncios), que falta na lista de white-labels;
  - **Leiloeiro Público** (`leiloeiropublico.com.br`, 992 imóveis);
  - D1 Lance (127), Calil (343), JR (186) e Giordano (125).
- **Leilão Insights.** Tem API com chave (`api.leilaoinsights.com.br`, rotas `/properties` e `/images`), segundo gabriedo/lfcom-leilao-sallah de 24/04/2025.
  - Contradiz a frase "nenhum concorrente publica API".
  - A situação em 2026 não está confirmada.
  - O repositório expõe uma chave: **não usar**.

**Concorrentes ausentes:** Imovue (imovue.com.br, só Caixa, geocodifica pelo IBGE), Farol do Leilão (faroldoleilao.com.br), Teical (teical.com.br, análise de edital com IA) e Lance Seguro (lanceseguro.app). O repositório arremata/leilao-br parece ser o "Arremata.ai" e compara preços com QuintoAndar, ZAP e VivaReal.

## 3. Afirmações sem data ou sem fonte primária

- **Volumes sem data:**
  - Seu Imóvel BB: 633 e 776;
  - Bradesco: 434 no Mapa Resale;
  - catálogo FENALEI com 937 linhas;
  - V-Lance com cerca de 30 tenants;
  - Leiloar 20, Bom Valor 11, SISHP 8, Ares 4+2, Sua Plataforma 44.
- **Sem evidência citada:**
  - "Itaú vende pela Zuk, Frazão e Mega" e a lista de comitentes da Zuk;
  - "Sodré atua em DF, GO, MG, PR e SP";
  - Radware "desde 15/09/2026", que só tem a frente leilaomap como base;
  - cobertura do Querido Diário (número de municípios);
  - Provimento 255/2026 do PNAJ: nada em disco o confirma.
- **DJEN: ok.** `meio=E` está confirmado em vbarcelosbt/API_DJEN, `config.py` linhas 35 e 122 a 124. Não está confirmado se `tipos_comunicacao: ['Edital']` (linha 38) é filtro do servidor.

## 4. Tags de risco sem fonte estruturada ou sem regra fechada

- **Preço acima do mercado.** Não há referência de mercado. Opções:
  - IVG-R (só tendência);
  - IPTU de SP e Fortaleza (valor venal, que não é preço de mercado);
  - comparáveis de portais (raspagem, risco de violar termos);
  - ITBI-SP (valores de transação): **não verificado**.
- **Limiares não definidos:** deságio alto ou baixo, custos extras e tolerância de área.
- **Sem fonte estruturada** (só texto, com leitura humana): condomínio e IPTU em atraso, ação judicial, leilão com recurso e sem vistoria. Hipóteses para "ação judicial" fora do DataJud: Escavador, Jusbrasil e Digesto (APIs pagas). **Não verificado.**
- **Selos:** o catálogo não define nenhum.
- **Geocodificação:** não está catalogada, e é essencial para um mapa como o do LeilãoMap. O CSV da Caixa não traz CEP nem coordenadas.

## 5. Pedidos do usuário que o catálogo não cobre

- Registrar as pendências: já existe `/home/claude/luneta-de-leiloes/PENDENCIAS.md` ("Pendências em aberto (12/10/2026)"). É preciso acrescentar as lacunas acima.
- Esquema do banco de dados: chave de deduplicação entre Caixa, LJ e bancos, histórico de preço e status, e tabela `evidencia_risco`.
- Como colocar a "fase 1" no site. Hoje é uma landing só de front-end em Next.js 16, e a fase 1 aparece em PENDENCIAS.md como "reservas e e-mails sem cobrar".

## 6. Domínios que faltam no §7

`api.leiloesjudiciais.com.br`, `drive.spu.gestao.gov.br`, `sistema.patrimoniodetodos.gov.br`, `do-api-web-search.doe.sp.gov.br`, `api.bcb.gov.br`, `ide.sefin.fortaleza.ce.gov.br`, `api.mcleilaoeireli.com.br`, `imoveis.bancointer.com.br`

Arquivos usados:
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/sondas/agreg4-r.txt` (reprocessado para o item 1.4)
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/repos/` (radar-dos-leiloes, arremata_leilao-br, mcp-brasil, Ro-dou, basedosdados__pipelines, auction-monitor, pncp-cli, gabrielgz0_pypncp, tjoficial-bb__LeiloesBH, gilcambe_nexia)
- `/tmp/claude-0/-home-claude-luneta-de-leiloes/2af27af1-683c-5bd3-96ea-0c593efe9278/scratchpad/critic/domains.txt` (domínios citados nos clones)
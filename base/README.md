# Base de imóveis da Luneta

Coleta, normaliza e guarda imóveis de leilão (e editais para o radar) num SQLite local, com histórico de preço, tags de risco com evidência e exportação em JSON para o site.

TypeScript executado direto pelo Node 22 (`--experimental-strip-types`), sem build e sem dependências: `node:sqlite`, `fetch`, `node:test`. O site (Next.js, em `src/`) não compila nada daqui e não foi alterado por esta base.

**Estado em 13/10/2026.** As duas fontes de vitrine e as quatro do radar estão ligadas no código, mas **nenhuma foi chamada ao vivo**: a rede para sites de leilão e gov.br estava bloqueada no ambiente em que tudo foi escrito. Tudo foi testado com arquivos reais arquivados (CSV completo da Caixa de 08/10/2026, sonda da Leilões Judiciais de 11/10/2026) e com fixtures. Veja "O que ficou sem teste ao vivo" e "Limites legais" antes de ligar em produção.

## Fontes ligadas

Catálogo de fontes da opção 1 (dados estruturados), com as correções da crítica: só **2 fontes funcionam como vitrine** (imóvel com preço, praça e foto); as outras 4 são **radar de editais** (avisos oficiais, sem foto, gravados na tabela `edital`).

| id (apelido na CLI) | Fonte | Finalidade | Acesso | O que traz | Entrada local | Detalhes |
|---|---|---|---|---|---|---|
| `caixa_csv` (`caixa`) | Caixa: Lista de Imóveis (CSV oficial) | vitrine, lista completa | arquivo oficial | 21.226 imóveis em 08/10/2026, 27 UFs; preço, avaliação, modalidade, financiamento; capa pelo padrão `F{id13}21.jpg`; ficha opcional (`--detalhes`) | `--arquivo lista.csv` (CP1252 ou UTF-8) | `fontes/caixa/README.md` |
| `leiloesjudiciais_api` (`leiloesjudiciais`) | Leilões Judiciais & Extrajudiciais (API MCP pública) | vitrine, busca parcial | API documentada | lotes judiciais e extrajudiciais de vários leiloeiros; praças, fotos (S3), anexos (edital, matrícula, laudo), coordenada do Street View | `--fixture` (JSON da fixture ou respostas JSON-RPC) | `fontes/leiloesjudiciais/README.md` |
| `pncp` | PNCP (modalidades 1 e 13) | radar | API documentada | editais de leilão de órgãos públicos; arquivos do edital com `--detalhes` | `--fixture` | `fontes/radar/README.md` |
| `djen` | DJEN / Comunica PJe (`meio=E`) | radar | API documentada | editais judiciais | `--fixture` | idem |
| `querido_diario` | Querido Diário (OKBR) | radar | API documentada, de terceiro | diários municipais | `--fixture` | idem |
| `dou_inlabs` | DOU seção 3 via INLABS | radar | arquivo oficial, com login gratuito | avisos federais (SPU, estatais) | `--fixture` (ZIP, XML ou pasta) | idem |

**Fora de propósito, por enquanto:** Suporte Leilões (a API é do leiloeiro: só com parceria) e DataJud (uso comercial bloqueado sem termo com o CNJ). Ver "Limites legais".

## Como rodar

Pipeline completo, pela raiz do repositório:

```bash
npm run base:migrar                                        # cria/atualiza base/dados/luneta.db
npm run base:coletar -- caixa                              # Caixa, lista geral (rede)
npm run base:coletar -- caixa --arquivo lista.csv          # Caixa a partir de arquivo local (sem rede)
npm run base:coletar -- leiloesjudiciais --uf SP           # Leilões Judiciais (rede); sem --uf varre 27 UFs
npm run base:coletar -- leiloesjudiciais --fixture base/fontes/leiloesjudiciais/fixtures/busca-apartamento-sp.json
npm run base:riscos                                        # regras das 26 tags
npm run base:status                                        # contagens, fotos, geo, tags e última coleta
npm run base:exportar                                      # JSON completo em base/dados/exportacao/imoveis.json
npm run base:exportar -- --site                            # instantâneo do site em base/saida/ (amostra, estatísticas e catálogo em site/)
```

Checagens e ferramentas:

```bash
npm run base:testar                                        # testes (node:test, sem rede)
npx tsc -p base/tsconfig.json --noEmit && npx eslint base --max-warnings=0
node --experimental-strip-types base/cli.ts fontes                      # conectores registrados e apelidos
node --experimental-strip-types base/fontes/caixa/medir.ts lista.csv    # parser da Caixa num CSV inteiro
node --experimental-strip-types base/riscos/medir.ts --caixa lista.csv --lj resposta.json  # distribuição das tags
node --experimental-strip-types base/geo/atualizar.ts --simular         # confere a tabela de municípios (GitHub)
node --experimental-strip-types base/geo/medir.ts --arquivo lista.csv   # cidades da fonte × municípios do IBGE
node --experimental-strip-types base/dedup/medir.ts --arquivo lista.csv # cobertura e precisão da deduplicação
```

Opções de `coletar`: `--uf`, `--arquivo` (ou `--fixture`), `--limite`, `--detalhes`. `<fonte>` aceita o id (`caixa_csv`) ou o apelido (`caixa`); `riscos --fonte` também. Em qualquer comando, `--banco <arquivo>` ou `LUNETA_DB` troca o banco; `LUNETA_USER_AGENT` troca o User-Agent. `base/dados/` é ignorada pelo git. As variáveis de cada conector estão no README dele.

## Medição com dados reais (13/10/2026)

Banco novo em `base/dados/luneta.db`: `migrar` → `coletar caixa --arquivo` (CSV completo de 08/10/2026, cópia local de um espelho sem licença, **não versionada**) → `coletar leiloesjudiciais --fixture` (a fixture da sonda de 11/10/2026, 10 lotes) → `riscos` → `status`. Máquina do ambiente de desenvolvimento, Node 22.22.

| Etapa | Tempo | Resultado |
|---|---|---|
| migrar | 0,3 s | versão 0 → 2 |
| coletar caixa | 12,2 s | 21.226 lidos, 21.226 novos, 0 inválidos; 3 alertas de cidade |
| coletar leiloesjudiciais | 0,7 s | 10 lidos, 10 novos: 5 ativos e 5 encerrados (4 fecharam em 17/09, 1 sem data de fechamento) |
| riscos | 29,1 s | 552.136 linhas (26 tags × 21.236 imóveis) |
| status | 0,9 s | |
| exportar (completo) | 11,2 s | 21.231 imóveis, 58,8 MB |
| exportar --site | 9,8 s | 60 imóveis e 27 UFs |

O banco ficou com 176 MB, quase tudo na tabela `risco` (todo imóvel recebe as 26 linhas, inclusive "não" e "desconhecido").

**Por UF (ativos):** RJ 7.193 · GO 2.897 · SP 2.843 (2.838 Caixa + 5 LJ) · PE 1.158 · RS 833 · MG 747 · PI 724 · BA 717 · PB 691 · RN 644 · CE 620 · PR 391 · SE 389 · PA 227 · MA 221 · AM 216 · MS 169 · MT 156 · SC 130 · AL 95 · DF 63 · ES 44 · AC 21 · RO 20 · TO 18 · AP 2 · RR 2.

**Por modalidade (ativos):** venda direta 12.143 (Caixa "Venda Direta Online") · leilão 4.572 (4.567 Caixa "Leilão SFI - Edital Único" e 5 LJ) · venda online 3.570 · licitação aberta 946. **Por tipo:** apartamento 12.346 · casa 7.896 · terreno 754 · comercial 194 · rural 30 · outro 11.

**Fotos:** 21.230 de 21.231 ativos (99,99%) têm URL de foto. Todas são **URL montada por padrão e não verificada** (`origem = padrao_url`): a capa da Caixa `F{id13}21.jpg` e 19 fotos 640x480 de 4 lotes da LJ. **0 verificadas**, porque a verificação por HEAD precisa de rede. O lote da LJ sem foto ganhou "Sem fotos" (a fonte publica fotos); a Caixa nunca ganha essa tag sem HEAD.

**Geocodificação:** 21.228 de 21.231 (99,99%) com coordenada: 21.226 na sede do município do IBGE (precisão "cidade") e 2 pelo Street View da LJ (precisão "rua"). Ficaram 3 sem coordenada, todos da Caixa: "Queimadas"/CE, "Sao Luiz do Tapajos"/PA e "Terra Vermelha"/PE, que não são município nem distrito do IBGE na UF indicada (não dá para escolher o município com segurança; ver `geo/README.md` para virar apelido).

**Tags** (imóveis ativos com valor "sim"; entre parênteses, quantos aguardam leitura humana):

| Tag | Imóveis | % dos ativos |
|---|---|---|
| Ocupação não informada | 21.231 (1) | 100% |
| Imóvel inteiro | 21.229 (3) | 99,99% |
| Praça única | 16.661 (2) | 78,5% |
| Deságio alto | 13.922 | 65,6% |
| Devedor com direito de preferência | 4.568 (1) | 21,5% |
| Deságio baixo | 4.110 | 19,4% |
| Aceita financiamento | 2.468 | 11,6% |
| Preço acima do mercado | 2.039 (2.039) | 9,6% |
| Só direitos sobre o imóvel | 2 (1) | |
| 2ª praça | 2 | |
| Construção irregular | 2 (2) | |
| 1ª praça · Sem fotos · Ocupado · Matrícula com pendência · Dívida passa ao arrematante · Custos extras altos · Condomínio em atraso | 1 cada (todas em revisão, menos 1ª praça e Sem fotos) | |
| Desocupado · IPTU em atraso · Ação judicial · Penhora · Leilão com recurso · Área divergente · Cota-parte · Sem vistoria | 0 | |

Leitura: o CSV da Caixa não traz texto sobre posse, dívidas, processo nem documentação (0 de 21.226 linhas, como a crítica mediu), então essas tags ficam "desconhecido" na Caixa até a ficha (`--detalhes`) ou o edital entrarem. O Leilão SFI fica sem praça (o CSV não diz se é o 1º ou o 2º leilão): 4.567 imóveis com praça "não informada".

**Precisa revisão:** 2.043 ativos (9,62%) têm ao menos uma tag "sim" aguardando leitura humana: os 2.039 da Caixa com preço acima da avaliação (avaliação não é preço de mercado, por isso "Preço acima do mercado" sempre vai para revisão) e 4 dos 5 lotes ativos da LJ. No total, as linhas de risco ficaram 86.282 "sim", 135.641 "não" e 330.213 "desconhecido".

**Duplicatas:** 10 grupos com 20 anúncios da mesma chave dentro da Caixa e 0 entre fontes (a LJ só tem lotes de SP, com endereço tirado do texto).

## Exportação para o site

`npm run base:exportar -- --site [--pasta base/saida] [--amostra 60] [--banco caminho/luneta.db]` grava, em `base/saida/`, os dois formatos do site: o **catálogo completo** em `site/` (o que a nova área de imóveis lê) e a amostra antiga de 60 imóveis com as estatísticas por UF (a `/previa` antiga ainda usa).

### Catálogo completo (`base/saida/site/`)

Todos os imóveis exportáveis (mesma regra do JSON completo: ativos, sem praça vencida há mais de 1 dia, com lance), no formato de `src/lib/catalogo/tipos.ts` (`ImovelResumo` e `ImovelDetalhe`). Tudo em `.json.gz` (gzip nível 9; mesma base, mesmos bytes, fora `gerado_em`) e versionado no Git: **2,3 MB** com os 21.231 imóveis gerados em 14/10/2026 (meta: até 4 MB; o teste da base confere). O site aplica de novo, a cada busca, o corte de praça vencida há mais de 1 dia: o instantâneo fica no ar por dias e um leilão que já passou sai da lista sem precisar gerar de novo.

- **`imoveis.json.gz`** (≈ 1,0 MB): a lista. `formato: "luneta-catalogo"`, `versao` (hoje 1), `gerado_em`, `criterio`, `fontes` (`id`, `nome`, `gerado_na_fonte_em`, `coletado_em`, `total`), `total`, `partes` (32) e `colunas`: um array por campo do `ImovelResumo` (mais `endereco`, só para a busca por texto do servidor), todos do mesmo tamanho; `colunas.titulo[k]` é o título do k-ésimo imóvel. Em colunas o arquivo fica 40% menor que uma lista de objetos. Vai **com** tags e selo: quem tira tags e selo no plano Lente é o servidor do site, antes de responder.
- **`detalhes/00.json.gz` … `1f.json.gz`** (≈ 1,3 MB juntos): o resto do `ImovelDetalhe` (áreas, descrição, todas as fotos, praças, matrícula, cartório, processo, comitente, links, condições de pagamento, data na fonte, por que tem ou não selo e, nas tags, `confianca`, `origem` e `evidencia`), num mapa `{id: detalhe}`. O pedaço de cada id é o FNV-1a de 32 bits do id, módulo 32, em hexadecimal (`parteDoId`); a página do imóvel carrega só um pedaço. Cada pedaço leva o `gerado_em` da lista: pedaço de outra geração é recusado.

Regras dos campos:
- `id` do site: `caixa-<id na fonte>` e `lj-<id na fonte>` (como na amostra). Os 6 tipos entram (rural e outro também).
- `bairro`: uma grafia só por bairro da mesma cidade (`unificarBairros`): a fonte escreve "Sao Jorge" e "São Jorge", "Cabucu" e "Cabuçu"; fica a acentuada, senão a mais usada. Sem isso o filtro de bairro repetia o bairro e dividia a contagem.
- `area` (`areaPrincipal`): privativa, senão total, senão do terreno; terreno e rural pela do terreno (a fonte às vezes põe 1 m² na total de um terreno de 800 m², ou a casa na privativa de uma gleba); casa ou apartamento com privativa abaixo de 15 m² (vírgula fora do lugar: 5,69 m² com total de 71,35 m²) usa a total. O detalhe mostra as três áreas como a fonte publica. `lanceM2` e `avaliacaoM2` inteiros, com centavos abaixo de R$ 10/m² (glebas); `desagio` inteiro, negativo quando o lance passa da avaliação, `null` sem avaliação.
- `praca`: 0 → `"unica"` (venda direta, venda online e licitação da Caixa), 1 → `"1"`, 2 → `"2"`; `null` quando a fonte não diz (Leilão SFI sem ficha, lote da LJ com regra "seg_nulo"). Não há 3ª praça nos dados de hoje; se vier, sai `null`.
- `ocupacao`: só o campo estruturado da fonte (hoje sempre `null`); a tag "Ocupado" fica nas tags, que o Lente não vê.
- `tags`: as "sim" consolidadas, da mais grave para a informativa; `emRevisao` = aguarda leitura humana (nunca mostrar como fato); `evidencia` é o trecho já mascarado.
- `selo: 0` e `seloPendente: true` em tudo (critérios pendentes); `porQueSelo` explica.
- `coletadoEm`: dia (Brasília) em que o imóvel **apareceu pela primeira vez** na base; é o que ordena "Mais recentes". A data do dado na fonte fica em `geradoNaFonteEm`.
- Links (sempre `https`; `http` vira `https`, outros esquemas caem fora): anúncio na fonte, documentos (edital, matrícula, laudo, avaliação, com o título da fonte em frase) e site do leiloeiro (`extras.site_leiloeiro` da LJ). O "Ver endereço no Google Maps" é montado pelo site a partir do endereço, para não ocupar espaço aqui.
- `condicoesPagamento`: da LJ (`nu_parcelas`, `vl_percentualentrada`, `indice_correcao`): "Entrada de 25% e o restante em até 30 parcelas (IPCA)". O padrão da fonte (1 parcela, 100% de entrada) não vira "à vista": não dá para distinguir de "não informado".
- `leiloeiro`: os nomes da fixture da LJ são sintéticos ("Leiloeiro Exemplo Dois") e ficam de fora. Nenhum campo traz nome de devedor ou parte (LGPD).

O site lê com `src/lib/catalogo/instantaneo.ts` (confere cada campo; versão errada ou arquivo faltando dá erro com o comando para gerar de novo) e guarda em memória por instância (`src/lib/catalogo/dados.ts`). Na Vercel, `outputFileTracingIncludes` em `next.config.ts` leva a pasta para `/api/catalogo` e `/previa/**`. Formato mudou de forma incompatível: suba `VERSAO_CATALOGO` em `base/exportar.ts` e em `src/lib/catalogo/instantaneo.ts`.

### Amostra e estatísticas (`base/saida/*.json`)

Dois arquivos pequenos e estáveis:

- **`amostra-site.json`** (≈ 90 KB): até 60 imóveis no formato `Listing` de `src/content/examples.ts`, com os mesmos nomes de campo do tipo do site: `id`, `title`, `place` ("Bairro · Cidade/UF"), `uf`, `type`, `avaliacao`, `lance`, `desagio`, `praca`, `date` ("19 out"), `seal`, `desocupado`, `tags` (`{label, severity}`), `why`, `photo`, `source` (`{leiloeiro, url, coletadoEm}`) e `point` (`latLonToMap`). Acrescenta `city`, `modalidade`, `dataPraca`, `tagsEmRevisao` e `photoFonte` (`{origem, verificadaEm}`). Correspondência com os nomes em inglês: appraisal = `avaliacao`, minBid = `lance`, discountPct = `desagio`.
- **`estatisticas-uf.json`** (≈ 45 KB): por UF e para o Brasil, ativos por fonte, modalidade e tipo; cidades e as 5 maiores; deságio (mediana e quartis) e quantos têm preço acima da avaliação; lance e avaliação medianos; com foto e com foto verificada; geocodificados por precisão; praças; tags confirmadas e em revisão; centro no mapa do site.

Regras da amostra:
- só o que o site consegue mostrar: tipo apartamento, casa, comercial ou terreno (rural, vaga e outro ficam de fora), com avaliação, lance e ponto no mapa; um anúncio por imóvel (mesma `chave_dedup` ou `chave_endereco` não entra duas vezes);
- escolha determinística, variando nessa ordem fonte, modalidade, risco (grave, atenção, sem risco), UF e tipo; desempate pelo hash do id. Mesma base, mesma amostra; o arquivo sai ordenado por UF e id;
- `seal` é sempre 0 (sem selo) e `why` explica que os critérios dos selos estão pendentes;
- `tags` leva só as tags "sim" que não aguardam leitura humana; as que aguardam vão em `tagsEmRevisao` e **não devem aparecer como fato**;
- `praca` é `null` quando a fonte não diz a praça (Leilão SFI da Caixa sem ficha; lote da LJ com regra "seg_nulo"), e `desagio` é negativo quando o lance passa da avaliação. O tipo `Listing` do site trata os dois casos ("Praça não informada pela fonte", "lance acima da avaliação");
- `source.leiloeiro` é o portal ("Caixa", "Leilões Judiciais"), e `coletadoEm` é a data de geração na fonte (em Brasília);
- `photo` é a URL na fonte, nunca baixada. Na Caixa é JPG montado por padrão e não verificado. O site a mostra com `<img>` simples, sem o otimizador do `next/image` (que baixaria e re-hospedaria a foto), e cai no placeholder se ela não carregar.

Amostra atual (dados de 08/10 e 11/10/2026): 60 imóveis de 27 UFs, 15 por modalidade (venda direta, venda online, licitação aberta e leilão), 57 da Caixa e 3 da LJ; apartamento 16, casa 15, terreno 15, comercial 14; praça única 45, não informada 12, 2ª praça 2, 1ª praça 1; 13 com tag grave (12 delas em revisão), 33 sem tag grave ou de atenção, 10 com lance acima da avaliação, 59 com foto. Nenhum dado pessoal: título, lugar, valores, tags e links. Os nomes de leiloeiro da fixture da LJ são sintéticos e por isso não vão para a amostra.

O site usa este instantâneo na prévia interna `/previa` (mesma tela da `/assinante`, com os 60 imóveis reais). O que ela mostra e o caminho para produção estão em **`base/FASE1-SITE.md`**.

A exportação completa (`base/dados/exportacao/imoveis.json`, compacta, ~59 MB) continua fora do Git.

## Coleta manual no GitHub Actions

`.github/workflows/base-coleta.yml` **só roda quando o dono acionar** (gatilho único `workflow_dispatch`: botão "Run workflow" na aba Actions, ou `gh workflow run base-coleta.yml`). Num runner Ubuntu com Node 22, sem `npm ci` (não há dependências), ele roda os testes, `migrar`, `coletar caixa` (lista geral), `coletar leiloesjudiciais` (27 UFs, ou a UF do campo opcional), `riscos`, `status` e `exportar --site`, e publica `base/dados/luneta.db` e a pasta `relatorio/` (status em texto e JSON, mais o instantâneo do site) como artefato por 7 dias. Não faz commit, não usa segredo e tem `permissions: contents: read`. Se uma coleta falhar, as outras etapas seguem, o artefato é publicado e a execução termina vermelha. Os runners do GitHub ficam fora do Brasil: a Caixa pode bloquear (há relatos de bloqueio de IP internacional), e o coletor não tenta contornar.

## O que ficou sem teste ao vivo

Nada foi chamado na fonte real. O código de rede (User-Agent identificado, timeout, retentativas com espera e `Retry-After`, 2 s entre requisições ao mesmo host, robots.txt, validação antes de gravar, nunca sobrescrever dado bom) foi testado com `fetch` falso, servidor MCP falso e arquivos reais arquivados. No ambiente, a coleta pela rede termina limpa: robots.txt inacessível → "bloqueada por precaução", nada gravado. Pendências, por fonte (detalhes nos READMEs de cada uma):

- **Caixa:** download dos CSVs (se o Radware deixa passar um cliente identificado, sem imitar navegador; se 300 s bastam para o geral); robots.txt e termos; fichas de Leilão SFI e de Licitação Aberta (rótulos "Data do 1º/2º Leilão" e "Valor mínimo de venda" vêm de terceiros); ficha de imóvel vendido; HEAD em `/fotos/`, redirecionamento de foto ausente e quantos slots existem; tempo de `--detalhes` na lista inteira (~11,8 h na primeira vez).
- **Leilões Judiciais:** se o servidor exige `notifications/initialized` ou sessão MCP; resposta JSON com `Accept: application/json, text/event-stream`; acento na busca, cobertura real da varredura UF × termos (cada busca devolve no máximo 10 lotes) e ritmo tolerado; campos completos de `get_leilao_details`; formato de busca vazia e códigos de erro; tamanho 640x480 de todas as fotos; robots.txt do S3; outros rótulos de status ("Adiado" e "Condicional" são suposição).
- **Radar:** PNCP (códigos 1 e 13, campos de `/arquivos`, semântica de `/proposta`), DJEN (acento no filtro `texto`, volume de `meio=E`), Querido Diário (limite de `size`, sintaxe da querystring), INLABS (conta, login, nomes e codificação dos XML, 404 em dia sem edição, tamanho do ZIP) e a precisão do filtro "é leilão de imóvel" em avisos reais.
- **Geo:** a atualização da tabela de municípios pelo GitHub (`geo/atualizar.ts`) só rodou com `--simular` sobre arquivos locais.
- **GitHub Actions:** o workflow foi validado (YAML e passos simulados localmente), mas nunca rodou num runner.

## Domínios a liberar

Coleta da vitrine:
```
venda-imoveis.caixa.gov.br        # CSV, ficha, /fotos/ e matrícula da Caixa
www.leiloesjudiciais.com.br       # robots.txt e /api/mcp/messages
s3-sa-east-1.amazonaws.com        # fotos e anexos da LJ (HEAD da capa com --detalhes)
```
Radar de editais:
```
pncp.gov.br
comunicaapi.pje.jus.br
api.queridodiario.ok.org.br
data.queridodiario.ok.org.br
inlabs.in.gov.br
```
Apoio: `raw.githubusercontent.com` (tabela de municípios do IBGE em `geo/atualizar.ts`). Para ler termos e documentação (checagem jurídica): `caixa.gov.br`, `www.caixa.gov.br`, `formularios.cnj.jus.br`, `www.cnj.jus.br`, `docs.queridodiario.ok.org.br`, `www.in.gov.br`. Só depois de parceria ou termo: `api-v2.suporteleiloes.com.br`, `api-publica.datajud.cnj.jus.br`. O host do desafio anti-robô da Caixa (Radware/perfdrive) **não** deve ser liberado para contorno.

## Limites legais

- **DataJud (CNJ):** os termos da API pública falam em uso não comercial, e o resumo das Resoluções CNJ 331/2020 e 446/2022 veda bases derivadas comerciais sem termo específico com o CNJ. O texto original não foi lido (só resumos de terceiros, V1.1 e V1.2). **Bloqueado para o produto pago até haver o termo.** Não há conector.
- **Suporte Leilões:** a API é documentada para o time de TI de cada leiloeiro e exige o cabeçalho `Uloc-Mi` com o domínio dele. Usar o cabeçalho de outro tenant sem autorização equivale a raspagem. **Só com parceria por leiloeiro.** Não há conector. A v1 também expõe IP de quem dá lance e a v2 nomes de partes (LGPD).
- **Anti-robô:** a Caixa usa Radware Bot Manager; Superbid, Grupo Lance e outros usam Cloudflare. A base se identifica (`LunetaDeLeiloes/0.1 (+contato)`), respeita robots.txt e **não contorna desafio** (sem navegador headless, sem imitar navegador, sem FlareSolverr): página de desafio = coleta recusada, nada gravado. O mesmo vale para chaves de API de terceiros sem contrato (ex.: Resale).
- **Termos não lidos:** Caixa, Leilões Judiciais, INLABS e Querido Diário (dados). Pedir autorização por escrito à Leilões Judiciais antes de produção. A LJ declara `Content-Signal: ai-train=no`: os dados não podem treinar modelos.
- **Fotos e documentos:** pertencem a leiloeiros, bancos e comitentes; direito de imagem não confirmado. A base guarda **só a URL da fonte**, com origem e data de verificação, e nunca baixa nem re-hospeda. No site, prefira link ou miniatura com atribuição e o link do anúncio.
- **LGPD:** nunca gravar nome, CPF/CNPJ de pessoa física, e-mail ou IP de devedor, executado, exequente, depositário, licitante ou arrematante; trechos de evidência saem mascarados (`util/lgpd.ts`, seção LGPD abaixo). Fixtures commitadas são pequenas e mascaradas. O CSV completo da Caixa usado na medição veio de um espelho sem licença: fica só local, nunca no Git (as 30 linhas de fixture e a amostra de 60 são recortes).
- **Repositórios de terceiros:** só referência, sem código copiado (créditos nos READMEs dos conectores). A tabela de municípios do IBGE tem a licença em `geo/municipios.LICENSE.txt`.

## Próximos passos (opção 2)

Fontes por endpoint interno ou HTML, em ordem de retorno (catálogo §5 com as correções da crítica). Cada uma pede leitura de termos e robots antes:

1. **Caixa: ficha, fotos e edital.** Ligar `--detalhes` e `LUNETA_CAIXA_VERIFICAR_FOTOS=1` por UF, em ritmo de 2 s, para trazer CEP, matrícula, cartório, praças do Leilão SFI e fotos verificadas; ler o Anexo II do edital SFI (IPTU, matrícula, gravames, ação judicial) e os lances da Venda Online (só agregados). Guardar os dados estáveis da ficha no banco principal (hoje só no cache).
2. **V-Lance (`api.leiloesjudiciais.com.br/core/api/get-lotes`):** inventário completo da LJ e de ~30 tenants numa chamada (endpoint interno: opção 2). Hoje a LJ só entra pela busca MCP de 10 lotes.
3. **Superbid offer-query:** Superbid, Sold e dezenas de leiloeiros do catálogo FENALEI, com ocupação e anexos. Há relatos conflitantes de Cloudflare.
4. **Suporte Leilões (com parceria), SOLEON, Leilão PRO, Sua Plataforma de Leilão, Leiloar, Bom Valor, Degrau:** plataformas white-label, um conector cobre muitos domínios.
5. **Leiloeiros grandes:** Portal Zuk, Frazão (`sitemap-lotes.xml`), Mega Leilões, Sodré Santoro, Leiloeiro Público.
6. **Bancos:** Santander Imóveis (REST do WordPress), Resale (só com parceria), Seu Imóvel BB, Itaú, BRB, Banrisul; deduplicar contra os leiloeiros (`dedup/`).
7. **Enriquecimento:** SPU/SIAPA (terreno de marinha, aforamento: "Só direitos", "Custos extras"), IPTU cadastral de São Paulo e Fortaleza ("Área divergente", "Construção irregular"), DOE-SP (leilões estaduais), BCB SGS 21340 (IVG-R, tendência de preço).

Pendências que não são de fonte: critérios dos **selos** (com o advogado parceiro) e limiares de deságio e área; tela de **revisão humana** das tags em revisão (2.043 imóveis hoje); referência de mercado para "Preço acima do mercado" (avaliação não é mercado); guardar só as tags "sim" e as revisadas, para o banco não crescer 26 linhas por imóvel; migrar para Postgres quando houver API (notas em `esquema.sql`).

## Estrutura

```
base/
  tipos.ts            contratos: ImovelNormalizado, EditalNormalizado, Praca, Foto, Documento,
                      RiscoDetectado, Conector, ImovelGravado
  esquema.sql         esquema v1 (SQLite, portável para Postgres; notas no topo)
  db.ts               abrir, migrar (PRAGMA user_version), transacao()
  validar.ts          validarImovel / validarEdital (use nos testes dos conectores)
  gravar.ts           upsert transacional, histórico, remoção, editais
  coleta.ts           orquestra uma coleta: conector → validação → gravação → log
  consultas.ts        leitura em lote (para riscos e exportação)
  exportar.ts         JSON completo; instantâneo do site (amostra no formato Listing e agregado por UF)
  status.ts           relatório
  cli.ts              linha de comando
  fontes/index.ts     registro de conectores (um import por conector) e apelidos da CLI
  fontes/caixa/       conector da Caixa (CSV, ficha, fotos, cache)
  fontes/leiloesjudiciais/  conector da Leilões Judiciais (MCP)
  fontes/radar/       PNCP, DJEN, Querido Diário e DOU/INLABS
  saida/              instantâneo versionado para o site (exportar --site)
  riscos/tags.ts      as 26 tags (slug estável, rótulo/categoria/severidade iguais ao site)
  riscos/motor.ts     interface de regra, avaliação, gravação e consolidação das tags
  riscos/evidencia.ts ferramentas para escrever regras (textos normalizados, recorte de trecho)
  riscos/regras/      regras das 26 tags, limiares (config.ts), corpus real de teste (corpus.ts)
  riscos/medir.ts     distribuição das tags sobre o CSV da Caixa e respostas da Leilões Judiciais
  util/               numero, data, texto, hash, dedup, lgpd, http, robots, csv, arquivo, uf, classificar
  testes/apoio.ts     banco em memória, imóvel de exemplo, conector falso
  geo/                municípios do IBGE (sede e raio), apelidos, geocodificação, posição no mapa do site
  dedup/              chaves de deduplicação: matrícula + cartório, endereço em partes (README com a precisão)
  migracoes/          002-edital-documentos.sql, 003-edital-site-leilao.sql; as próximas: 004-descricao.sql, ...
```

## Contrato de um conector

Um conector por pasta, `base/fontes/<id>/index.ts`, registrado em `base/fontes/index.ts`.

```ts
import type { Conector } from "../../tipos.ts";
import { lerArquivoTexto } from "../../util/arquivo.ts";

export const minhaFonte: Conector<LinhaBruta> = {
  id: "minha_fonte",                 // slug estável: vira fonte.id
  nome: "Minha Fonte",
  tipo: "banco_publico",             // régua do catálogo de fontes
  acesso: "arquivo_oficial",
  finalidade: "vitrine",             // vitrine | radar | enriquecimento
  capacidades: { fotos: false, documentos: false, ocupacao: false, listaCompleta: true },
  volumeMinimo: 1000,                // abaixo disso a coleta completa é recusada
  async *coletar(op) {
    const texto = op.arquivo
      ? await lerArquivoTexto(op.arquivo)
      : await op.http.texto(URL, { validar: (r) => (r.texto.startsWith("Lista de Im") ? null : "assinatura ausente") });
    op.informar({ geradoEm: "2026-10-08", origem: op.arquivo ?? URL });
    for (const linha of interpretar(texto)) yield linha;
  },
  normalizar(bruto) {
    return { registro: "imovel", id_na_fonte: bruto.id, /* ... */ pracas: [], fotos: [], documentos: [] };
  },
};
```

- `coletar` lê os registros brutos, da rede (sempre por `op.http`) ou de `op.arquivo`. Valida o conteúdo (assinatura, formato, volume) e **lança erro** se vier uma página de bloqueio ou um arquivo truncado. Não grava nada.
- `normalizar` converte um registro: devolve `null` para descartar (fora de escopo) e lança erro só se o registro estiver quebrado. Sem rede, sem banco.
- Datas: `AAAA-MM-DD` ou ISO UTC (`util/data.ts` converte "08/10/2026 10:00" de Brasília). Dinheiro em reais, áreas em m². Campo que a fonte não informa fica `null`.
- `preco` = valor mínimo vigente; se faltar, o núcleo usa a praça atual. `praca_atual` é deduzida pelas datas se faltar; com `praca_incerta: true` (a fonte não diz qual praça vale), ela fica `null` e, havendo uma praça só, a data dela vai para `data_praca`. O desconto é sempre calculado pelo núcleo (preço × avaliação), nunca copiado da fonte.
- Fotos e documentos: só a URL da fonte, com `origem` ("api", "ficha", "padrao_url") e, quando houver, `verificada_em`/`ok`. Nada é baixado.
- Coordenadas: só as da fonte, em `lat`/`lon` com `precisao_geo` (`exata` se omitida). Sem elas, o núcleo põe a sede do município pela cidade + UF (`precisao_geo = "cidade"`); não geocodifique no conector.
- Endereço: o texto como a fonte escreve (`dedup/endereco.ts` separa logradouro, número e unidades, com ou sem "nº"); bairro em `bairro` quando a fonte o separa. Cidade e bairro escritos no fim do texto ("..., Vila Prudente, São Paulo/SP") são reconhecidos e não viram unidade.
- Utilitários prontos: `lerNumeroBR`, `lerDataBR`/`lerDataHoraBR`, `semHtml`, `capitalizarNome`, `normalizarUf`, `inferirTipoImovel`, `classificarModalidade`, `lerCsv`, `decodificar` (CP1252 correto; o `TextDecoder("windows-1252")` do Node 22 erra os bytes 0x80–0x9F).
- Teste com `validarImovel` e com o conector rodando sobre uma fixture pequena (dados pessoais mascarados), sem rede.

## O que o núcleo garante

- **Nada é gravado se a coleta falhar.** Tudo é lido e validado em memória e gravado numa transação só. Coleta com erro, sem registros, com mais de 5% de registros inválidos (até 2 sempre passam), abaixo do `volumeMinimo` ou com arquivo mais antigo que o último gravado vira `invalida`/`erro` no log e não toca nos dados. Exceção: fonte sem lista completa (radar, busca por janela) que respondeu normalmente e não tinha nada no período informa `vazioLegitimo: true` e a coleta vazia fecha como `sucesso` (ex.: domingo sem DOU, PNCP respondendo 204).
- **Imóveis nunca são apagados.** Numa coleta completa e válida (`listaCompleta`, sem `--limite`, sem falha de normalização), o que estava ativo e sumiu vira `removido` (só dentro da UF com `--uf`). Se mais de 50% dos ativos sumirem de uma vez, a remoção é bloqueada e fica um aviso (o conector pode mudar o limite com `maxFracaoRemocao`). Quem reaparece é reativado.
- **Histórico** (`preco_historico`): uma linha quando o imóvel entra e a cada mudança de preço, avaliação, modalidade, praça ou status.
- **Geração da fonte**: um imóvel gravado a partir de um arquivo mais novo nunca é alterado, reativado nem removido por um arquivo mais antigo (ex.: CSV geral da Caixa, que atrasa um dia em relação ao da UF).
- **Geocodificação** (`geo/`): coordenada da fonte conferida contra o município (fora do Brasil, invertida ou longe demais é corrigida ou trocada pela sede); sem coordenada, a sede do município do IBGE com `precisao_geo = "cidade"` (99,99% das linhas do CSV da Caixa casam). A exportação leva `codigo_ibge` e `mapa` ([x, y] do mapa do site). Detalhes em `geo/README.md`.
- **Chaves de endereço e mesmo imóvel** (`dedup/`): a `chave_endereco` é o logradouro, o número e as unidades no município do IBGE, mais o bairro quando a rua é genérica e o endereço pouco específico; endereço sem número nem unidade, ou fração de lote, não gera chave. A `chave_dedup` sozinha não junta uma fonte com matrícula a outra sem: o mesmo imóvel é quem divide a `chave_dedup` ou a `chave_endereco` sem matrículas diferentes (`mesmoImovel`/`agruparDuplicatas`, contado em `status`). Precisão medida em `dedup/README.md`.
- **Coleta educada** (`util/http.ts`): User-Agent `LunetaDeLeiloes/0.1 (+contato)`, timeout (30 s por tentativa, com o corpo; ajustável por requisição com `timeoutMs`, para arquivos grandes), até 3 tentativas com espera exponencial e `Retry-After`, 2 s entre requisições ao mesmo host (mais, se o `Crawl-delay` pedir), robots.txt respeitado (RFC 9309: robots inacessível por erro do servidor bloqueia por precaução), limite de tamanho e validação antes de devolver. Não contorna anti-robô.

## Regras de risco

`riscos/regras/index.ts` lista as regras; cada uma é um `RegraRisco` (`riscos/motor.ts`): recebe o imóvel gravado e os textos prontos para regex e devolve tags com valor (`sim`/`nao`/`desconhecido`), confiança, origem, trecho e `precisa_revisao`. Escreva os regex em minúsculas e sem acento e use `buscar`/`buscarPrimeira` de `riscos/evidencia.ts` para recortar a evidência. O motor confere a tag, mascara o trecho, marca para revisão tags conflitantes (ex.: ocupado e desocupado) e nunca sobrescreve linhas revisadas por humano. Não marque "Sem fotos" quando `fonte.capacidades.fotos` for `false`. Para testar uma regra sem banco: `avaliarImovel(entradaPara(imovelDeTeste(normalizado), fonte), [regra])`.

As 26 tags já têm regra (uma regra por tag, que olha campo e texto juntos). Todo imóvel recebe as 26 linhas: `sim` com evidência, `nao` com contrassinal ou campo da fonte, `desconhecido` quando a fonte não informa; a exportação leva só as `sim`. Critérios, decisões, limites e a medição de falsos positivos: `riscos/regras/README.md`. Para medir uma mudança de regra sem banco:

```bash
node --experimental-strip-types base/riscos/medir.ts --caixa Lista_imoveis_geral.csv --lj resposta_search_leiloes.json
```

O que os conectores podem preencher para as regras: `ocupacao` (campo estruturado), `textos` com origem `ficha`, `edital`, `titulo_leilao`, `alerta`; `extras.regra_praca` ("seg_nulo" = praça única ou desconhecida), `extras.avaliacao_confere` (false rebaixa o deságio), `extras.averbacao_leiloes_negativos`; fotos com `ok`/`verificada_em`; documento com "vistoria" no título. Selo provisório: não existe ainda (critérios dependem do advogado).

## Banco

Tabelas: `fonte`, `coleta` (log de cada execução), `imovel`, `praca`, `preco_historico`, `foto`, `documento`, `risco`, `edital`, mais `imovel_busca`/`edital_busca` (FTS5, sem acento). Migrações: `esquema.sql` é a versão 1 e não muda mais depois de publicado; cada mudança nova vai em `base/migracoes/NNN-descricao.sql` (002, 003...) e `migrar` aplica em ordem, cada uma na sua transação. `002-edital-documentos.sql` acrescenta `edital.documentos` (JSON com os links dos arquivos do edital); uma coleta que não consulta os arquivos (`documentos` ausente) mantém os gravados. `003-edital-site-leilao.sql` acrescenta `edital.site_leilao`, o site onde se dá o lance (leiloeiro ou plataforma), separado de `url`, que é o documento oficial; coleta sem site mantém o gravado. O topo de `esquema.sql` diz como portar para Postgres.

## LGPD

- Nunca mapear nome, CPF/CNPJ, e-mail ou IP de devedor, executado, exequente, depositário, licitante ou arrematante (ex.: `nm_usuario`, `id_usuario`, lances com IP).
- O núcleo limpa e mascara (`util/lgpd.ts`) título, descrição, textos extras, resumos de edital e trechos de evidência antes de gravar: CPF, CNPJ, RG, e-mail e IP viram `[CPF]`, `[CNPJ]`, `[RG]`, `[E-MAIL]`, `[IP]`; nomes depois de papéis ("Executado:", "devedor fiduciante", "em face de", "Sr."...), de quem ganhou o leilão ("arrematado por", "adjudicado a", "adquirido por", "vencedor"), de frases de ocupação ("ocupado por", "na posse de", "locado para", "reside no imóvel") e partes em "FULANO x BELTRANO" viram `[NOME]`. É heurística e prefere mascarar demais.
- Endereço, bairro, cartório, matrícula e comitente **não** passam pela máscara de nomes (só pela de documentos, no comitente). Se o conector tira esses campos de texto livre, ele mesmo precisa garantir que não levam nomes (ver `campoSemPessoa` no conector da Leilões Judiciais).
- Registros brutos não são guardados. Fixtures commitadas devem ser pequenas e já mascaradas.
- Dados com `ai-train=no` (Leilões Judiciais) não podem treinar modelos.

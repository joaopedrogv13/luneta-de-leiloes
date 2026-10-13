# Conector `caixa_csv`: imóveis da Caixa

Fonte: "Lista de Imóveis da Caixa", o CSV oficial publicado em `venda-imoveis.caixa.gov.br`. Opcionalmente lê a ficha de cada imóvel (`--detalhes`) e confere as fotos (HEAD).

```bash
npm run base:coletar -- caixa_csv                          # lista geral (rede)
npm run base:coletar -- caixa_csv --uf SP                  # só o CSV de SP (marca removidos só em SP)
npm run base:coletar -- caixa_csv --arquivo lista.csv      # arquivo local, UTF-8 ou CP1252 (detecta)
npm run base:coletar -- caixa_csv --uf AC --detalhes       # + fichas (2 s cada; só novas, alteradas ou vencidas)
LUNETA_CAIXA_VERIFICAR_FOTOS=1 npm run base:coletar -- caixa_csv --uf AC   # + HEAD nas fotos
node --experimental-strip-types base/fontes/caixa/medir.ts lista.csv       # cobertura do parser, modalidades, deságio
```

| Variável | Efeito |
|---|---|
| `LUNETA_CAIXA_CACHE` | Caminho do cache de fichas e fotos (padrão `base/dados/caixa/detalhes.db`). `off` desliga: só para base que nunca teve ficha (ver "Cache") |
| `LUNETA_CAIXA_VERIFICAR_FOTOS=1` | HEAD nos slots de foto 21, 22, ... até o primeiro 404 |
| `LUNETA_CAIXA_FICHAS=<pasta>` | `--detalhes` lê `<pasta>/<id13>.html` em vez da rede (teste sem rede) |
| `LUNETA_CAIXA_ULTIMA_UF=<UF>` | Última UF esperada na lista geral (padrão: a da lista anterior, ou TO); `off` desliga a checagem |

## Arquivos

```
index.ts     conector: coletar (lista, checagens, fichas, fotos) e normalizar (puro)
lista.ts     leitura e validação do CSV, recuperação de linha com ";" a mais, resumo por UF
descricao.ts parser da coluna "Descrição" e título curto
ficha.ts     parser da ficha detalhe-imovel.asp, máscara LGPD, herança de campos estáveis
fotos.ts     URL da capa e verificação por HEAD
cache.ts     cache local da última ficha boa, das fotos verificadas e da última lista (SQLite à parte)
medir.ts     medição num CSV inteiro (sem banco)
fixtures/    30 linhas do CSV original (CP1252), 2 fichas reais (2023 e 2026), lista de documentos
```

## Lista (CSV)

- URLs: `/listaweb/Lista_imoveis_geral.csv` e `/listaweb/Lista_imoveis_{UF}.csv`. Download com timeout próprio (300 s por tentativa no geral, de ~7,7 MB; 120 s por UF), em vez dos 30 s padrão do cliente.
- Formato: CP1252, `;`, sem aspas, campos com espaços nas bordas. Linha em branco, `Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;...`, cabeçalho, linha em branco, dados (12 colunas). As colunas são lidas pelo nome. O geral vem em ordem de UF (AC a TO).
- **Recusado sem gravar nada**:
  - página de desafio anti-robô (Radware/perfdrive/ShieldSquare/captcha) ou HTML no lugar do CSV;
  - assinatura "Lista de Im" ausente; "Data de geração" ausente, inválida ou no futuro;
  - acentos corrompidos (UTF-8 lido como CP1252); cabeçalho sem coluna obrigatória;
  - última linha cortada (arquivo truncado no meio de uma linha);
  - **lista geral que termina antes da última UF esperada** (corte exato numa quebra de linha: a 60% do arquivo de 08/10/2026 ela parava no RJ e o núcleo marcaria 40% dos imóveis como removidos). A última UF esperada é a da lista anterior (guardada no cache), ou TO. Se uma UF do fim sair de verdade da lista, rode uma vez com `LUNETA_CAIXA_ULTIMA_UF=<última UF presente>`; as seguintes já usam a lista anterior. Com o arquivo fora de ordem de UF, a checagem fica desligada e há aviso;
  - **mesma "Data de geração" da última lista lida no mesmo escopo (geral ou UF), com menos imóveis**: pega o corte dentro da última UF e o CSV de UF truncado. Precisa do cache;
  - CSV de UF com linhas de outra UF.
- O núcleo ainda recusa: menos de 5.000 imóveis válidos na lista geral (`volumeMinimo`; a lista oscilou entre 7.113 e 28.219 em 2026), mais de 5% de linhas inválidas e arquivo mais antigo que o já gravado (o geral atrasa um dia em relação ao da UF).
- **Linha com ";" a mais** (o arquivo não usa aspas): recuperada pelas âncoras (número e UF no começo, modalidade e link do mesmo imóvel no fim, o bloco `Preço;Avaliação;Desconto;Financiamento` uma vez só no meio). O excedente volta para o Endereço ou a Descrição, com aviso.
- **Linha que não dá para recuperar** (sem âncora, ou bloco numérico ambíguo) vira registro inválido. Como o núcleo não sabe o id de um registro que não normalizou, **a marcação de removidos fica desligada naquela coleta** (com aviso); o resto é gravado. O aviso de "modalidade nova" ignora essas linhas.

## Normalização

| Campo | Origem |
|---|---|
| `id_na_fonte` | "N° do imóvel" com zeros à esquerda até 13 dígitos (`10005120` → `0000010005120`), o mesmo número da ficha, das fotos e da matrícula |
| `url` | "Link de acesso" (só se for da Caixa e do mesmo imóvel; senão montado) |
| `titulo` | curto, no estilo do site: "Apartamento 2 quartos", "Terreno 600 m²", "Sala comercial 35 m²" |
| `tipo` | 1º pedaço da Descrição: Apartamento, Casa/Sobrado → casa, Terreno/Gleba Urbana → terreno, Gleba/Imóvel rural → rural, Prédio/Comercial/Sala/Loja/Galpão → comercial, Outros → outro |
| áreas, `quartos`, `vagas` | Descrição ("X de área total/privativa/do terreno", "N qto(s)", "N vaga(s) de garagem"). Área "0.00" e abaixo de 1 m² ("0.01", marcador da Caixa) = não informado. Sem "qto(s)" = não informado, não zero |
| `preco`, `valor_avaliacao` | "Preço" e "Valor de avaliação". O deságio (`desconto_pct`) é calculado pelo núcleo; a coluna "Desconto" vai só para `extras.desconto_fonte` (ela vale 0 quando o preço passa da avaliação) |
| `aceita_financiamento` | coluna "Financiamento" (Sim/Não) |
| `modalidade` | Venda Direta Online → `venda_direta`; Venda Online → `venda_online`; Licitação Aberta → `licitacao_aberta`; Leilão SFI - Edital Único → `leilao`. `judicial = false` sempre (venda extrajudicial). Rótulo novo gera aviso |
| `pracas` | oferta única (praça 0, preço do CSV) nas três vendas; no Leilão SFI, as praças da ficha quando houver (o CSV não diz se é o 1º ou o 2º leilão) |
| `cidade`, `bairro`, `endereco` | capitalizados ("CRUZEIRO DO SUL" → "Cruzeiro do Sul"); palavras com algarismo ficam como estão ("Lt 04C", "PE-07"). O CSV não tem acento nos nomes de cidade |
| `comitente` | "Caixa Econômica Federal" |
| `ocupacao` | sempre `null`: a Caixa não publica ocupação em campo (ver ficha) |
| `extras` | `desconto_fonte`, `tipo_fonte`, `salas`, `lavabos`, `itens`; da ficha: `comarca`, `oficio`, `inscricao_imobiliaria`, `averbacao_leiloes_negativos`, `matriculas` (se mais de uma), `aceita_consorcio`, `edital`, `numero_item`. A data da leitura da ficha fica só no cache: no imóvel ela entraria no hash e toda releitura viraria "atualizado" |

## Ficha (`--detalhes`)

`/sistema/detalhe-imovel.asp?hdnimovel=N`, sempre pelo cliente HTTP educado (User-Agent identificado, robots.txt, retentativas) e com no mínimo 2 s entre fichas. Só é buscada para imóvel sem ficha, com ficha de mais de 7 dias, lida por versão antiga do parser, ou cujo preço, avaliação ou modalidade mudou no CSV. Uma ficha que falhou não é tentada de novo no mesmo dia.

Lido da ficha (testado nas duas fichas reais): número do imóvel, tipo, quartos, garagem, matrícula(s), comarca, ofício, inscrição imobiliária ("Não identificado" = vazio), averbação dos leilões negativos, valor de avaliação e mínimo, áreas, endereço com CEP, descrição, formas de pagamento, regras de despesas (condomínio e tributos), financiamento/FGTS/parcelamento/consórcio, fotos da galeria e o PDF da matrícula (`/editais/matricula/{UF}/{id13}.pdf`). Daí saem `cep`, `matricula`, `cartorio` ("1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC"), `aceita_fgts`, `aceita_parcelamento`, `documentos`, `fotos` e `textos` (origem "ficha", para as regras de risco).

- **"Situação: Desocupado" aparece só dentro de um comentário HTML** nas duas fichas reais. Tudo o que está comentado é descartado antes de ler; ocupação não sai da ficha.
- **Recusada** (conta como falha, não grava): desafio anti-robô, página sem o bloco do imóvel, sem "Valor de avaliação", **sem "Número do imóvel"** (sem ele não dá para conferir que a ficha é do imóvel pedido) ou com o número de outro imóvel.
- **LGPD**: a ficha de Leilão SFI tem texto livre (descrição, "Imóvel com ação judicial", "Penhora gravada no R-7...") que pode citar devedor fiduciante ou outra parte. Descrição, texto, formas de pagamento, regras de despesas, título e títulos de documento saem do parser já mascarados (`mascararDadosPessoais`: "[NOME]", "[CPF]"...); leiloeiro e endereço passam por `mascararDocumentos`. O cache é gravado só com a ficha mascarada.
- **Ficha degradada** (página parcial, layout novo): se a leitura nova perde matrícula, comarca, ofício, CEP, inscrição, endereço, tipo, áreas ou o PDF da matrícula que a anterior tinha, esses campos são mantidos da leitura anterior, com aviso. Uma ficha sem matrícula, comarca e CEP também conta como degradada. 5 degradadas seguidas desligam as fichas no resto da coleta.
- Bloqueio (desafio anti-robô, robots.txt, HTTP 403/429) ou 10 falhas seguidas desligam as fichas no resto da coleta, com aviso; o CSV continua sendo gravado.
- **Não confirmados em HTML real** (vêm de parsers e índices de terceiros; o parser aceita formas tolerantes e há teste com trecho sintético): "Data do 1º/2º Leilão", "Valor mínimo de venda 1º/2º Leilão", "Data da Licitação Aberta", "Leiloeiro(a):", "Edital:", "Número do item:", e na ficha SFI "Valor de venda:" e "Valor mínimo de venda à vista:" (um índice de fichas SFI de 2023 usa as chaves `valor_de_venda` e `valor_minimo_de_venda_a_vista`). O valor mínimo é o "Valor mínimo de venda (à vista)"; sem ele, o "Valor de venda". Confira na primeira ficha de Leilão SFI e de Licitação Aberta baixada.
- **Editais e anexos não são coletados.** A ficha real só traz o link da matrícula; a lista de documentos fica em `/sistema/carregaListaDocumentos.asp`, um POST AJAX atrás do anti-robô, e a verificação do catálogo recomendou não contornar. `extrairDocumentos` sabe ler essa lista (testado na página real de 08/10/2026), mas nenhuma coleta a chama: hoje `documentos` traz só a matrícula. Pendente: ligar o edital do Leilão SFI pela "Licitação"/número do edital ou pelo Anexo do edital, por um caminho que não passe pelo anti-robô.

### Cache (`base/dados/caixa/detalhes.db`)

O núcleo regrava o imóvel inteiro a cada coleta. Sem o cache, a coleta diária (só CSV) apagaria o que veio da ficha. O conector guarda a última ficha boa, a última verificação de fotos de cada imóvel e o resumo da última lista lida, e junta ao CSV em toda coleta:

- dados estáveis da ficha (matrícula, cartório, CEP, áreas, PDF da matrícula) valem sempre;
- dados voláteis (praças, formas de pagamento, edital, textos) só valem se a ficha ainda descreve a oferta do CSV (CSV igual ao do momento da leitura, ou valores da ficha batendo com o CSV);
- ficha que falha nunca apaga a anterior; ficha que perde campos estáveis herda os da anterior;
- só texto mascarado. Caches gravados antes da máscara são mascarados na primeira abertura (migração 2, com `secure_delete` e `VACUUM` para não sobrar texto antigo no arquivo), e essas fichas são relidas na próxima coleta com `--detalhes` (versão 2 do parser).

**Robustez.** O cache é conferido (`PRAGMA quick_check`) antes de sair qualquer registro. Se ele estiver corrompido ou travado, ou se o arquivo sumiu mas a cópia `.bak` continua lá, a coleta **para com erro e não grava nada**, com uma mensagem que diz o caminho e como recuperar. Rodar sem o cache apagaria do banco tudo o que veio das fichas. Depois de cada coleta que grava fichas ou fotos, uma cópia consistente vai para `detalhes.db.bak` (`VACUUM INTO`). Para recuperar:

1. com a cópia: `mv detalhes.db detalhes.db.estragado && cp detalhes.db.bak detalhes.db`;
2. sem a cópia: mova o arquivo e rode a coleta com `--detalhes` para reconstruir (2 s por ficha);
3. `LUNETA_CAIXA_CACHE=off` só serve para base que nunca teve ficha: com ele, matrícula, CEP, cartório, documentos e fotos da ficha são regravados vazios (há aviso).

Pendente (médio prazo): guardar os dados estáveis da ficha também no banco principal (tabela do conector ou merge no núcleo), para que perder o cache e a cópia não apague nada.

## Fotos

Só a URL da fonte, nunca baixada. Capa: `https://venda-imoveis.caixa.gov.br/fotos/F{id13}21.jpg` (o "21" é fixo; confirmado nas duas fichas reais e por dois projetos abertos). A ficha de 2023 tem também o slot 22; quantos slots existem não se sabe.

- Sem verificação: a capa entra com `origem: "padrao_url"`, `ok: null` (não verificada).
- Com a ficha: as fotos da galeria (`origem: "ficha"`); fotos em comentário HTML são ignoradas.
- Com `LUNETA_CAIXA_VERIFICAR_FOTOS=1`: HEAD nos slots 21 a 28 até o primeiro 404/410, com `verificada_em` e `ok`. Capa ausente fica com `ok: false` (a exportação a omite e a regra de "Sem fotos" pode afirmar a ausência). HTML no lugar da imagem, 403/429 ou robots.txt desligam a verificação na coleta. Reverifica a cada 30 dias.
- HEAD que termina noutra URL (redirecionamento, por exemplo para uma imagem padrão de "sem foto") não confirma nada: o slot fica com `ok: null` e a verificação daquele imóvel para ali, com aviso.

## Tempo das coletas com rede

Fichas e fotos são do mesmo host, e o cliente espaça todas as requisições em 2 s. Na lista inteira, sem nada no cache: só fichas, 21.226 × 2 s ≈ 11,8 h; só fotos, pelo menos 2 HEAD por imóvel (capa e o 1º slot ausente) ≈ 23,6 h; as duas ≈ 35 h. O log mostra a estimativa no começo da coleta, e há aviso quando a verificação de fotos é ligada sem `--uf` nem `--limite`. Depois da primeira vez, só imóvel novo, alterado ou vencido é buscado.

## O que não foi testado ao vivo

A rede para `venda-imoveis.caixa.gov.br` está bloqueada no ambiente em que o conector foi escrito. Foram testados com arquivos locais e `fetch` falso: leitura e validação do CSV (inclusive o corte numa quebra de linha), normalização, gravação, fichas, cache e HEAD de fotos. **Não foram testados ao vivo**: o download dos CSVs (inclusive se o Radware deixa passar um cliente identificado, sem imitar navegador, e se 300 s bastam para o geral), o robots.txt e os termos do site, a ficha de Leilão SFI e de Licitação Aberta, o comportamento da ficha de imóvel vendido, se `/fotos/` responde a HEAD, se redireciona foto ausente e quantos slots existem, e o tempo de uma coleta com `--detalhes` na lista inteira.

## Medição no CSV de 08/10/2026 (21.226 linhas)

Rode `medir.ts` para refazer. Resultado com o CSV completo (cópia local, não versionada):

- Parser da Descrição: tipo 100%; alguma área 99,91%; área privativa 96,20%; área total 74,54%; área do terreno 40,60%; quartos 88,16%; vagas 49,13%; salas 86,46%; lavabos 1,67%; **0 linhas com pedaço não reconhecido** (16 pedaços diferentes no arquivo todo). 109 áreas "0.01"/"0.05"/"0.40" tratadas como marcador.
- Modalidades: Venda Direta Online 12.143 (57,2%); Leilão SFI 4.567 (21,5%); Venda Online 3.570 (16,8%); Licitação Aberta 946 (4,5%).
- Deságio calculado: mediana 42,07%; p25 38,24%; p75 48,01%; p90 54,73%; máximo 90%. **Preço acima da avaliação em 2.039 imóveis** (9,6%; comparação em centavos): Leilão SFI 2.036, Venda Direta Online 2, Venda Online 1, com casos extremos (preço até 174× a avaliação). Preço igual à avaliação em 1.687. A coluna "Desconto" vale 0 em todos os 2.039 com preço acima e bate com o cálculo em todas as linhas com preço até a avaliação. Um caso de borda: o imóvel 1444417628245 (SC, Leilão SFI) tem preço 305.011,21 contra avaliação 305.000,00, deságio −0,0037%, que arredondado vira 0; por isso a medição compara preço e avaliação, não o deságio arredondado.
- Coleta do CSV completo num banco temporário (arquivo SQLite, com cache): ~7,5 s, 21.226 novos, 0 inválidos.

## Créditos

Nenhum código foi copiado. Os padrões de URL (capa `F{id13}21.jpg`, matrícula, editais e anexos) e as marcas da página de desafio foram confirmados lendo ldmaster/simplified-auction (MIT), arremata/leilao-br e designativa07/leiloes-caixa (estes dois sem licença, só referência). Os rótulos "Valor de venda" e "Valor mínimo de venda à vista" foram inferidos do índice de murilotimo/imoveis-caixa-vue (sem licença, só referência).

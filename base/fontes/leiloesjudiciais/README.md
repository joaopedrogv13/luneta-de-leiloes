# Leilões Judiciais (API MCP pública)

Conector `leiloesjudiciais_api` (pasta `leiloesjudiciais/`) para www.leiloesjudiciais.com.br, um agregador de vários leiloeiros na plataforma V-Lance. Usa só a API documentada (opção 1 do catálogo de fontes, §3.2): `POST https://www.leiloesjudiciais.com.br/api/mcp/messages`, JSON-RPC 2.0 com `initialize`, `tools/list` e `tools/call`. **Não** usa o endpoint interno `/core/api/get-lotes` (opção 2).

## Situação legal (rever antes de produção)

- **robots.txt** (sonda arquivada de 11/10/2026): `Allow: /api/mcp/messages`, `Allow: /api/openapi.json` e `Content-Signal: ai-train=no, search=yes, ai-input=yes`. O cabeçalho `content-signal` repete esses valores. **`ai-train=no`: estes dados não podem ser usados para treinar modelos.**
- **Os termos de uso do site não foram lidos**, porque a rede estava bloqueada. O OpenAPI diz "API pública… Acesso público, sem autenticação", mas isso não substitui os termos. Peça autorização por escrito antes de produção.
- O direito de imagem das fotos e dos PDFs não foi confirmado. Guardamos só a URL da fonte, sem baixar nem re-hospedar nada.
- O conector repete esse aviso no log de toda coleta pela rede (`AVISO_LEGAL`).

## Como rodar

```bash
npm run base:coletar -- leiloesjudiciais_api --uf SP          # rede: varre SP
npm run base:coletar -- leiloesjudiciais_api                  # rede: 27 UFs (cerca de 405 buscas, mais de 20 min)
npm run base:coletar -- leiloesjudiciais_api --uf SP --detalhes   # + get_leilao_details e HEAD na capa
npm run base:coletar -- leiloesjudiciais_api --fixture base/fontes/leiloesjudiciais/fixtures/busca-apartamento-sp.json
LUNETA_LJ_COLETADO_EM=2026-10-11T01:35:00Z npm run base:coletar -- leiloesjudiciais_api --arquivo sonda.txt
LUNETA_LJ_TERMOS="apartamento,casa" npm run base:coletar -- leiloesjudiciais_api --uf RJ
```

`--arquivo` aceita três formatos:
- a fixture (`{"coletado_em", "respostas": [...]}`);
- uma resposta JSON-RPC como o `curl` devolve, ou uma lista delas. Linhas de status depois do JSON são ignoradas, como nas sondas;
- o JSON de dentro de `content[0].text`.

**A data de coleta é obrigatória.** Ela decide o que já fechou e é a "geração" que o núcleo compara para não deixar uma resposta antiga sobrescrever uma mais nova. Vale o `coletado_em` da fixture; nos outros formatos, informe `LUNETA_LJ_COLETADO_EM` (ISO). Sem nenhuma das duas, o arquivo é recusado. A data de modificação do arquivo **não** é usada, porque copiar ou tocar uma resposta antiga a faria passar por nova. Data inválida ou no futuro também é recusada.

## Como coleta

A ferramenta `search_leiloes` exige `query` e devolve **no máximo 10 lotes**, sem paginação. A coleta funciona assim:

1. Varre **UF × termos** (`apartamento, casa, terreno, lote, sala, loja, galpao, predio, imovel, fazenda, sitio, chacara, area, vaga, direitos`) com `categoria: "imoveis"`.
2. Deduplica por `lote_id`.
3. Espera **3 s depois do fim de cada chamada**. O cliente HTTP do núcleo já impõe 2 s por host, User-Agent `LunetaDeLeiloes/0.1 (+contato)`, robots, timeout, retentativas com `Retry-After` e limite de tamanho.
4. Antes da varredura, chama `initialize` e `tools/list`. Se `search_leiloes` sumir ou perder o parâmetro `query`, a coleta para ("a API mudou"). `get_leilao_details` só é conferida com `--detalhes`; se ela sumir ou perder o parâmetro `leilaoId`, a coleta segue sem detalhes e avisa.
5. Aceita resposta em JSON ou em SSE e devolve o `mcp-session-id`, se o servidor mandar um.

Proteções:
- **Página de bloqueio** (HTML, desafio do Cloudflare), HTTP 4xx, erro JSON-RPC de parâmetro ou método (-32602, -32601...) ou carga fora do formato interrompem a coleta, e nada é gravado.
- **Falhas transitórias** pulam aquela busca com aviso: rede, timeout, HTTP 5xx depois das retentativas, `isError` da ferramenta e erro JSON-RPC do servidor (-32603 "Internal error" e a faixa -32000 a -32099). Com 3 falhas seguidas, ou mais de 10% das buscas previstas, a coleta é interrompida sem gravar.
- **Busca vazia**: `totalResults: 0` com `results` vazio, ausente ou `null` vale como lista vazia. A sonda nunca mostrou uma busca vazia, então esse formato **não foi confirmado**; outro formato interrompe a coleta.
- `capacidades.listaCompleta = false`: a varredura é parcial, então **nada vira "removido"** por não ter aparecido. O aviso "N de M buscas vieram com 10 lotes" mostra quanto ficou de fora.
- `geradoEm` = início da varredura, ou a data de coleta declarada do arquivo (ver acima). Um arquivo mais antigo que o já gravado é recusado pelo núcleo.
- Com `--detalhes`, `get_leilao_details` só é aproveitado quando o detalhe é do **mesmo** `lote_id`, porque a ferramenta aceita id de leilão ou de lote. Só a foto de **capa** grande é conferida por HEAD; as outras fotos grandes ficam sem verificação.

## Mapeamento

| Campo | De onde vem |
|---|---|
| `id_na_fonte`, `url` | `lote_id`; `https://www.leiloesjudiciais.com.br/lote/{leilao_id}/{lote_id}` |
| `tipo` | `nm_subcategoria` ("Apartamentos", "Comerciais"...). "Outros" cai no título |
| `uf`, `cidade` | `nm_estado`, `nm_cidade`. Em lote com vários imóveis, a cidade é a do juízo |
| `preco` | `vl_lanceinicial`, o lance inicial da praça em vigor |
| `pracas`, `praca_atual`, `praca_incerta` | Regra da crítica §1.4 (tabela abaixo); a data é `dt_fechamento` |
| `valor_avaliacao` | `vl_lanceminimo`, **com cautela** (ver abaixo) |
| `status` | `encerrado` se o rótulo diz arrematado, encerrado, suspenso, cancelado, condicional etc.; se `dt_fechamento` já passou quando a resposta chegou; ou se `dt_fechamento` **falta** (ver abaixo). Senão, `ativo`. O motivo vai em `extras.status_motivo` (`rotulo_fonte`, `fechamento_passado`, `fechamento_ausente`). "Adiado" **não** encerra: com data futura, segue ativo |
| `lat`, `lon` | URL do `iframe_streetview` (`!2m2!1d<lat>!2d<lon>`), com precisão "rua" |
| `fotos` | `fotos[]`: `nm_path_incompleto` + `tamanho.thumb_grande` (640x480) + `nm_path`, quando `nm_path_completo` confirma o padrão, com origem **"padrao_url"** (URL montada, não verificada). Senão, a URL pronta da API (196x146), com origem "api" |
| `documentos` | `anexos[].nm_path_completo`, com tipo pelo rótulo: EDITAL → edital, MATRÍCULA → matricula, LAUDO → laudo, AVALIAÇÃO e CÁLCULOS → avaliacao |
| `numero_processo`, `comitente` | "(Proc. NNNNNNN-DD.AAAA.J.TR.OOOO - vara)" na descrição. O tribunal sai do J.TR (8.26 → TJSP, 5.02 → TRT2). A vara passa por `varaSegura` (ver LGPD) |
| `matricula`, `cartorio`, `endereco`, `bairro`, áreas, quartos, vagas | Texto da descrição ("MATRÍCULA Nº … DO 6º CARTÓRIO…", "Local dos bens:", "área útil de…"), só em lote de **um** imóvel. Cartório, endereço e bairro passam por `campoSemPessoa` (ver LGPD) |
| `judicial` | Título do leilão ("JUDICIAL", "TRT", "HASTA") ou processo CNJ. "Extrajudicial" no título → `false` |
| `aceita_parcelamento` | `nu_parcelas > 1`. **Não** é financiamento: `aceita_financiamento` fica `null` |
| `leiloeiro` | `nm_leiloeiro` (profissional público); o site vai em `extras.site_leiloeiro` |
| `descricao`, `textos` | `nm_descricao` sem HTML e mascarada; título do leilão e alertas de habilitação |
| `extras` | `regra_praca`, `vl_*` originais, `avaliacao_origem`, `avaliacao_texto`, `avaliacao_confere`, `status_fonte`, `status_motivo`, `fechamento_ausente`, `nu_qtdelances`, `vl_lance_atual`, `nu_parcelas`, `lote_multiplo`... |

**Praça** (`ini` = vl_lanceinicial, `min` = vl_lanceminimo, `seg` = vl_lanceinicialsegundoleilao):

| Condição | Resultado |
|---|---|
| `seg` preenchido e `ini == min` | 1ª praça em vigor; a 2ª praça vale `seg` |
| `seg` preenchido e `ini == seg` | 2ª praça em vigor |
| `seg` nulo | Praça única **ou** desconhecida: `praca_atual = null` e `praca_incerta = true`, com `regra_praca: "seg_nulo"`. **Exige revisão humana** |
| Outra combinação | Igual, com `regra_praca: "indefinida"` |

Quando a regra não decide, o conector **não** afirma "praça única" (no contrato do núcleo, `praca_atual = 0` é oferta única). A data e o lance inicial ficam numa praça só como dado, com número provisório 0. Com `praca_incerta`, o núcleo grava `praca_atual = null` sem deduzir pelas datas, mas leva a data dessa praça para `data_praca`. Assim, a exportação publica `praca_atual: null` e tira o lote do ar quando a data passa. A regra de risco de praça lê `extras.regra_praca`.

**Sem data de fechamento.** Na sonda, o lote 217032 veio "Aberto para Lance" com `dt_fechamento = null`. Ele é do 710º leilão unificado do TRT2, anterior ao 711º, cujos lotes fecharam em 17/09. Sem data, não dá para saber se o lote ainda vale, e a exportação nunca o tiraria do ar. Por isso ele sai `encerrado`, com `extras.fechamento_ausente = true`, até uma coleta trazer a data (`--detalhes` mescla o `get_leilao_details`, se ele trouxer `dt_fechamento`).

**Avaliação.** A API não documenta `vl_lanceminimo`. Na sonda, ele bateu com a avaliação escrita no texto em todos os 7 lotes conferíveis, inclusive a soma dos lotes com vários imóveis. A conferência fica em `extras.avaliacao_confere`. Fica `null` em dois casos: quando `bn_exibeavaliacao = false` (a fonte esconde) e quando `vl_lanceinicial > vl_lanceminimo` (aí não pode ser avaliação).

## LGPD

- `nm_usuario`, `id_usuario` e qualquer campo de usuário, e-mail, CPF/CNPJ, IP, telefone ou lances são **apagados assim que a resposta chega** (`semCamposPessoais`). Nunca chegam à normalização.
- Título, descrição, textos e títulos de anexos saem mascarados (`util/lgpd.ts`): "EXEQUENTE: [NOME]", "usufruto em favor de [NOME], CPF [CPF]", "ocupado por [NOME]". O núcleo mascara de novo ao gravar.
- **Campos tirados do texto livre** (vara, endereço, bairro, cartório) vão para colunas que o núcleo **não** mascara por nome e que a exportação publica. Por isso, `campoSemPessoa` faz duas coisas: corta o campo onde começa uma pessoa (papel processual, "de propriedade de", "em nome de", "ocupado por", "na posse de", "A x B"...) e descarta o campo inteiro se a máscara ainda mudar algo. A vara (`varaSegura`) também precisa nomear um juízo no 1º trecho ("90ª VT", "Vara", "EXE3", "Foro"...). Os trechos seguintes só ficam se nomearem um juízo, uma cidade com UF ou tiverem uma palavra só. O resto é cortado: "2ª Vara Cível - FULANO DE TAL" vira "2ª Vara Cível".
- Na descrição, o que a vara cortou dentro de "(Proc. … - vara - …)" vira `[NOME]` (`semPartesNoProcesso`). Ali vão as partes, às vezes sem papel nem "x". Prefere mascarar demais: uma cidade escrita por extenso também some.
- O número do processo é guardado (é público e serve para conferir o leilão). Os nomes das partes, não.

## Fixture

`fixtures/busca-apartamento-sp.json` é a resposta real de `search_leiloes` (apartamento, SP, imoveis) arquivada em 11/10/2026, numa sonda de terceiro. Tem 10 lotes.

**Trocado por sintético:** nomes de partes, proprietários, credores, ocupantes e usufrutuários, todos por nomes 100% sintéticos (`FULANO`/`BELTRANO`/`CICLANO` + `SINTETICO` + letra grega). Nenhuma palavra vem do nome real, e foi conferido que nenhuma delas aparece na sonda real. Também foram trocados os CPFs (por CPFs de teste), as empresas executadas (`EMPRESA EXEMPLO … LTDA`), os números de processo (sequencial fictício, mantendo ano, segmento, tribunal e origem) e os nomes de leiloeiros.

**Mantido real:** endereços, áreas, valores, datas, matrículas e URLs de fotos e anexos.

**Outros ajustes:** as fotos foram cortadas em até 5 por lote. `nm_usuario` e `id_usuario` do primeiro lote são sintéticos, para testar que nunca são mapeados.

Os scripts que montaram e conferiram a fixture **não foram commitados**, porque leem a sonda real com os nomes que trocam. Uso: só teste local.

## O que ficou sem teste ao vivo

A rede estava bloqueada. Tudo foi testado com a fixture e com um servidor MCP falso; nada foi chamado na fonte real. Ficou pendente:

- Se o servidor exige `notifications/initialized` ou sessão MCP entre `initialize` e `tools/call`. O conector não manda a notificação; se o servidor mandar `mcp-session-id`, o conector devolve.
- Se o servidor aceita `Accept: application/json, text/event-stream` e responde JSON. Pelo spec do MCP, deveria.
- Se a busca diferencia acento, quantos lotes a varredura UF × termos cobre de fato e o ritmo tolerado pela API.
- Campos completos de `get_leilao_details`: a resposta da sonda veio truncada. Também não se sabe se ele traz `dt_fechamento` quando a busca não traz.
- O formato de uma busca **vazia** (a sonda só tem buscas com 10 lotes) e quais códigos de erro JSON-RPC o servidor usa de fato.
- Se o tamanho 640x480 existe para todas as fotos. Com `--detalhes`, só a capa é conferida.
- O robots.txt do S3, para a verificação de fotos.
- Outros rótulos de `nm_statuslote` além de "Aberto para Lance" e "Aguardando". O tratamento de "Adiado" (segue ativo) e de "Condicional" (encerra) é suposição.

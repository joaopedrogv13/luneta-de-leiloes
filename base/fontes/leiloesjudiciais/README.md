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
LUNETA_LJ_TERMOS="apartamento,casa" npm run base:coletar -- leiloesjudiciais_api --uf RJ
```

`--arquivo` aceita três formatos:
- a fixture (`{"coletado_em", "respostas": [...]}`);
- uma resposta JSON-RPC como o `curl` devolve, ou uma lista delas. Linhas de status depois do JSON são ignoradas, como nas sondas;
- o JSON de dentro de `content[0].text`.

Sem `coletado_em`, vale a data de modificação do arquivo, com um aviso.

## Como coleta

A ferramenta `search_leiloes` exige `query` e devolve **no máximo 10 lotes**, sem paginação. A coleta funciona assim:

1. Varre **UF × termos** (`apartamento, casa, terreno, lote, sala, loja, galpao, predio, imovel, fazenda, sitio, chacara, area, vaga, direitos`) com `categoria: "imoveis"`.
2. Deduplica por `lote_id`.
3. Espera **3 s depois do fim de cada chamada**. O cliente HTTP do núcleo já impõe 2 s por host, User-Agent `LunetaDeLeiloes/0.1 (+contato)`, robots, timeout, retentativas com `Retry-After` e limite de tamanho.
4. Antes da varredura, chama `initialize` e `tools/list`. Se `search_leiloes` sumir ou perder o parâmetro `query`, a coleta para ("a API mudou").
5. Aceita resposta em JSON ou em SSE e devolve o `mcp-session-id`, se o servidor mandar um.

Proteções:
- **Página de bloqueio** (HTML, desafio do Cloudflare), HTTP 4xx, erro JSON-RPC ou carga fora do formato interrompem a coleta, e nada é gravado.
- **Falhas transitórias** (rede, timeout, 5xx depois das retentativas) pulam aquela busca com aviso. Com 3 falhas seguidas, ou mais de 10% das buscas previstas, a coleta é interrompida sem gravar.
- `capacidades.listaCompleta = false`: a varredura é parcial, então **nada vira "removido"** por não ter aparecido. O aviso "N de M buscas vieram com 10 lotes" mostra quanto ficou de fora.
- `geradoEm` = início da varredura, ou `coletado_em` da fixture. Um arquivo mais antigo que o já gravado é recusado pelo núcleo.
- Com `--detalhes`, `get_leilao_details` só é aproveitado quando o detalhe é do **mesmo** `lote_id`, porque a ferramenta aceita id de leilão ou de lote. A foto de capa grande é conferida por HEAD.

## Mapeamento

| Campo | De onde vem |
|---|---|
| `id_na_fonte`, `url` | `lote_id`; `https://www.leiloesjudiciais.com.br/lote/{leilao_id}/{lote_id}` |
| `tipo` | `nm_subcategoria` ("Apartamentos", "Comerciais"...). "Outros" cai no título |
| `uf`, `cidade` | `nm_estado`, `nm_cidade`. Em lote com vários imóveis, a cidade é a do juízo |
| `preco` | `vl_lanceinicial`, o lance inicial da praça em vigor |
| `pracas`, `praca_atual` | Regra da crítica §1.4 (tabela abaixo); a data é `dt_fechamento` |
| `valor_avaliacao` | `vl_lanceminimo`, **com cautela** (ver abaixo) |
| `status` | `encerrado` se `dt_fechamento` já passou quando a resposta chegou, ou se o rótulo diz arrematado, encerrado, suspenso, cancelado etc. Senão, `ativo` |
| `lat`, `lon` | URL do `iframe_streetview` (`!2m2!1d<lat>!2d<lon>`), com precisão "rua" |
| `fotos` | `fotos[]`: `nm_path_incompleto` + `tamanho.thumb_grande` (640x480) + `nm_path`, quando `nm_path_completo` confirma o padrão. Senão, a URL pronta (196x146). Origem "api" |
| `documentos` | `anexos[].nm_path_completo`, com tipo pelo rótulo: EDITAL → edital, MATRÍCULA → matricula, LAUDO → laudo, AVALIAÇÃO e CÁLCULOS → avaliacao |
| `numero_processo`, `comitente` | "(Proc. NNNNNNN-DD.AAAA.J.TR.OOOO - vara)" na descrição. O tribunal sai do J.TR (8.26 → TJSP, 5.02 → TRT2) |
| `matricula`, `cartorio`, `endereco`, áreas, quartos, vagas | Texto da descrição ("MATRÍCULA Nº … DO 6º CARTÓRIO…", "Local dos bens:", "área útil de…"), só em lote de **um** imóvel |
| `judicial` | Título do leilão ("JUDICIAL", "TRT", "HASTA") ou processo CNJ. "Extrajudicial" no título → `false` |
| `aceita_parcelamento` | `nu_parcelas > 1`. **Não** é financiamento: `aceita_financiamento` fica `null` |
| `leiloeiro` | `nm_leiloeiro` (profissional público); o site vai em `extras.site_leiloeiro` |
| `descricao`, `textos` | `nm_descricao` sem HTML e mascarada; título do leilão e alertas de habilitação |
| `extras` | `regra_praca`, `vl_*` originais, `avaliacao_origem`, `avaliacao_texto`, `avaliacao_confere`, `status_fonte`, `nu_qtdelances`, `vl_lance_atual`, `nu_parcelas`, `lote_multiplo`... |

**Praça** (`ini` = vl_lanceinicial, `min` = vl_lanceminimo, `seg` = vl_lanceinicialsegundoleilao):

| Condição | Resultado |
|---|---|
| `seg` preenchido e `ini == min` | 1ª praça em vigor; a 2ª praça vale `seg` |
| `seg` preenchido e `ini == seg` | 2ª praça em vigor |
| `seg` nulo | Praça 0 (única ou desconhecida), com `regra_praca: "seg_nulo"`: **exige revisão humana** |
| Outra combinação | Sem praças, `regra_praca: "indefinida"` e `fechamento_fonte` em extras |

**Avaliação.** A API não documenta `vl_lanceminimo`. Na sonda, ele bateu com a avaliação escrita no texto em todos os 7 lotes conferíveis, inclusive a soma dos lotes com vários imóveis. A conferência fica em `extras.avaliacao_confere`. Fica `null` em dois casos: quando `bn_exibeavaliacao = false` (a fonte esconde) e quando `vl_lanceinicial > vl_lanceminimo` (aí não pode ser avaliação).

## LGPD

- `nm_usuario`, `id_usuario` e qualquer campo de usuário, e-mail, CPF/CNPJ, IP, telefone ou lances são **apagados assim que a resposta chega** (`semCamposPessoais`). Nunca chegam à normalização.
- Título, descrição, textos e títulos de anexos saem mascarados (`util/lgpd.ts`): "EXEQUENTE: [NOME]", "usufruto em favor de [NOME], CPF [CPF]". O núcleo mascara de novo ao gravar.
- O número do processo é guardado (é público e serve para conferir o leilão). Os nomes das partes, não.

## Fixture

`fixtures/busca-apartamento-sp.json` é a resposta real de `search_leiloes` (apartamento, SP, imoveis) arquivada em 11/10/2026, numa sonda de terceiro. Tem 10 lotes.

**Trocado por fictício:** nomes de partes, proprietários, credores e usufrutuários; CPFs (por CPFs de teste); empresas executadas; números de processo (sequencial fictício, mantendo ano, segmento, tribunal e origem); nomes de leiloeiros.

**Mantido real:** endereços, áreas, valores, datas, matrículas e URLs de fotos e anexos.

**Outros ajustes:** as fotos foram cortadas em até 5 por lote. `nm_usuario` e `id_usuario` do primeiro lote são sintéticos, para testar que nunca são mapeados.

O script que montou a fixture **não foi commitado**, porque contém os nomes reais que troca. Uso: só teste local.

## O que ficou sem teste ao vivo

A rede estava bloqueada. Tudo foi testado com a fixture e com um servidor MCP falso; nada foi chamado na fonte real. Ficou pendente:

- Se o servidor exige `notifications/initialized` ou sessão MCP entre `initialize` e `tools/call`. O conector não manda a notificação; se o servidor mandar `mcp-session-id`, o conector devolve.
- Se o servidor aceita `Accept: application/json, text/event-stream` e responde JSON. Pelo spec do MCP, deveria.
- Se a busca diferencia acento, quantos lotes a varredura UF × termos cobre de fato e o ritmo tolerado pela API.
- Campos completos de `get_leilao_details`: a resposta da sonda veio truncada.
- Se o tamanho 640x480 existe para todas as fotos. Isso só é conferido com `--detalhes`.
- O robots.txt do S3, para a verificação de fotos.
- Outros rótulos de `nm_statuslote` além de "Aberto para Lance" e "Aguardando".

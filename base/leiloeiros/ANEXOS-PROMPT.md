# Anexos do prompt da auditoria dos leiloeiros (Luneta de Leilões)

Este arquivo acompanha o prompt de `PROMPT-AUDITORIA.md`. O dono salva este arquivo como
`C:\Users\jpedr\Downloads\ANEXOS-LUNETA.md` (ou o anexa no chat) antes de colar o prompt. São as regras que o
código refeito precisa seguir: o formato dos dados (Anexo A), as tags (Anexo B), a conferência sem o validador
(Anexo C) e as plataformas conhecidas (Anexo D). A versão oficial do Anexo A é `base/leiloeiros/CONTRATO.md`, com os
esquemas `imovel.schema.json` e `coleta.schema.json` ao lado; um teste do repositório confere que este arquivo
continua batendo com eles.

## Anexo A: contrato de dados da Luneta (versão 1)

### A.1 O arquivo

- **JSONL em UTF-8**: um objeto JSON por linha, sem vírgula entre linhas e sem lista em volta. Dois tipos de linha
  pelo campo `registro`: `"coleta"` (uma por leiloeiro em cada carga) e `"imovel"` (um lote de imóvel; veículos e
  outros bens não entram).
- **`null` = a fonte não informa.** Nunca `0`, `""` ou chute no lugar de `null`.
- **Mande sempre todas as chaves**, com `null` quando não houver. Assim nunca falta uma obrigatória dentro dos
  objetos (`pracas[].data` e `valor_minimo`, `ocupacao.situacao` e `origem`, `debitos.iptu.valor` e `responsavel`).
- **Dinheiro:** número em reais com ponto decimal (`1234567.89`), nunca texto. **Áreas:** m² (hectare × 10.000).
  **Datas:** ISO 8601 **com fuso**: `"2026-11-10T14:00:00-03:00"`. Sem fuso, `-03` sem minutos ou `"10/11/2026"` são
  recusados. **UF:** sigla em maiúsculas (`"sp"` é recusado).
- **Corte os textos no limite** (texto maior derruba o lote): 80 caracteres nos rótulos (`plataforma`, `leilao_id`,
  `lote_numero`, `situacao_fonte`, `tipo_fonte`, `modalidade_fonte`, `matricula_junta`), 120 em `leiloeiro.nome`,
  `bairro`, `cidade` e `complemento`, 200 em `logradouro`, `comitente.nome`, `cartorio` e títulos de documento, 300 no
  `titulo`, 500 no `leilao_titulo` e no `endereco.texto`, 2.000 em `ocupacao.texto`, 5.000 nos `texto` de pagamento
  e dívidas, 20.000 na `descricao` e nas `observacoes`; 20 no `numero`, 40 em `indice_correcao`, 120 na `matricula`,
  1.000 nas URLs. Listas: até 4 praças, 50 documentos, 60 fotos e 30 chaves em `extras`.
- **Carga completa:** em cada execução, todos os imóveis ativos do leiloeiro (não só os que mudaram), com
  `completa: true` na linha de coleta. É assim que a Luneta tira do site o que sumiu. **Um leiloeiro, uma carga, um
  arquivo:** nunca divida um leiloeiro em dois arquivos com `completa: true` (o segundo tiraria do site os lotes do
  primeiro). O arquivo pode ter vários leiloeiros.
- **Ids:** slug do leiloeiro em minúsculas, dígitos e hífens (2 a 30, estável para sempre: `alfa-leiloes`); id do lote
  **só com letras minúsculas e dígitos** (1 a 40, estável entre coletas; tire barras, hífens e espaços:
  `2026/001-A` → `2026001a`); `id` da linha = `<slug>:<lote>` (`alfa-leiloes:48211`). No site o imóvel vira
  `ll-alfa-leiloes-48211`. Trocar o slug ou o id do lote faz o imóvel sumir e reaparecer como outro.

### A.2 Linha de coleta

```json
{"registro":"coleta","versao_contrato":1,"leiloeiro":{"slug":"alfa-leiloes","nome":"Alfa Leilões","site":"https://alfa-leiloes.example","matricula_junta":null},"plataforma":"Leilão PRO","metodo":"html","iniciado_em":"2026-10-26T21:58:00-03:00","coletado_em":"2026-10-26T22:10:00-03:00","versao_coletor":"alfa-1.0.0","completa":true,"total_na_fonte":5,"total_enviados":5,"saude":"ok","erro":null,"frequencia":"diaria","extrai":{"fotos":true,"documentos":true,"ocupacao":true},"robots":"permite","termos":"silenciosos"}
```

| Campo | Tipo | Obrigatório | Valores e regra |
| --- | --- | --- | --- |
| `registro` | texto | sim | `"coleta"` |
| `versao_contrato` | número | sim | `1` |
| `leiloeiro` | objeto | sim | `slug` (texto), `nome` (texto, como no site), `site` (URL da página inicial), `matricula_junta` (texto ou null) |
| `plataforma` | texto ou null | não | plataforma que atende vários leiloeiros; null se o site é próprio |
| `metodo` | enum ou null | não | `html`, `json_interno`, `api_documentada`, `arquivo_oficial` |
| `iniciado_em` | data e hora ou null | não | início |
| `coletado_em` | data e hora | sim | **fim** da coleta; carga mais antiga que a última importada é recusada |
| `versao_coletor` | texto (até 40) | sim | |
| `completa` | boolean | sim | `true` só se trouxe **todos** os imóveis ativos e a saúde é `ok` |
| `total_na_fonte` | inteiro ou null | não | contador do site |
| `total_enviados` | inteiro | sim | linhas de imóvel deste leiloeiro na carga |
| `saude` | enum | sim | `ok` (leu tudo), `parcial` (leu uma parte), `quebrado` (o site mudou e o coletor não acha os lotes), `bloqueado` (robots, 403/429, desafio anti-robô) |
| `erro` | texto (até 500) ou null | não | curto, sem segredos |
| `frequencia` | enum ou null | não | `diaria`, `semanal`, `quinzenal`, `mensal`, `manual` |
| `extrai` | objeto ou null | não | `{"fotos": bool, "documentos": bool, "ocupacao": bool}`: o que o coletor sabe extrair deste site |
| `robots` | enum ou null | não | `permite`, `proibe`, `sem_robots`, `nao_verificado` |
| `termos` | enum ou null | não | `permitem`, `proibem`, `silenciosos`, `nao_lidos` |

Coletor `quebrado` ou `bloqueado` sem nenhum lote: mande só a linha de coleta (os lotes já publicados continuam).

### A.3 Linha de imóvel

```json
{"registro":"imovel","versao_contrato":1,"id":"alfa-leiloes:48212","leiloeiro":{"slug":"alfa-leiloes","nome":"Alfa Leilões","site":"https://alfa-leiloes.example","matricula_junta":null},"plataforma":"Leilão PRO","comitente":{"nome":"TJSP – 2ª Vara Cível de Campinas","tipo":"judicial"},"url":"https://alfa-leiloes.example/lote/48212","leilao_id":"L-2026-120","leilao_titulo":"2ª Vara Cível de Campinas/SP – Leilão Judicial nº 12/2026","lote_numero":"3","situacao":"ativo","situacao_fonte":null,"tipo":"casa","tipo_fonte":"Casa térrea","titulo":"Casa 3 dormitórios, Jardim Chapadão, Campinas","descricao":"Casa térrea com 3 dormitórios (1 suíte), sala, cozinha, quintal e 2 vagas. Há outras penhoras sobre o imóvel.","observacoes":null,"endereco":{"texto":"Rua das Palmeiras, 250, Jardim Chapadão, Campinas/SP","logradouro":"Rua das Palmeiras","numero":"250","complemento":null,"bairro":"Jardim Chapadão","cidade":"Campinas","uf":"SP","cep":"13070-000"},"lat":null,"lon":null,"precisao_geo":null,"area_privativa":null,"area_total":180,"area_terreno":300,"quartos":3,"vagas":2,"avaliacao":400000,"lance_minimo":null,"lance_atual":null,"incremento":null,"comissao_pct":5,"pracas":[{"numero":1,"data":"2026-11-05T10:00:00-03:00","valor_minimo":400000,"situacao":"futura"},{"numero":2,"data":"2026-11-19T10:00:00-03:00","valor_minimo":200000,"situacao":"futura"}],"praca_atual":null,"modalidade":"leilao","modalidade_fonte":"Leilão Judicial","natureza":"judicial","processo":"0012345-67.2024.8.26.0114","pagamento":{"a_vista":true,"parcelamento":true,"parcelas_max":30,"entrada_pct":25,"indice_correcao":"IPCA","financiamento":false,"fgts":null,"texto":"Parcelamento conforme o art. 895 do CPC."},"ocupacao":{"situacao":"ocupado","origem":"campo","texto":null},"debitos":{"iptu":{"valor":8500,"responsavel":"pago_com_o_lance"},"condominio":null,"texto":"Os débitos de IPTU sub-rogam-se no preço da arrematação (art. 130 do CTN)."},"documentos":[{"tipo":"edital","titulo":"Edital","url":"https://alfa-leiloes.example/docs/48212-edital.pdf"}],"fotos":[{"url":"https://alfa-leiloes.example/fotos/48212-1.jpg","ordem":0}],"registro_imovel":{"matricula":"98.765","cartorio":"2º Cartório de Registro de Imóveis de Campinas","inscricao_municipal":null},"extras":null,"controle":{"coletado_em":"2026-10-26T22:10:00-03:00","versao_coletor":"alfa-1.0.0","hash":null}}
```

Obrigatórios: `registro`, `versao_contrato`, `id`, `leiloeiro`, `url`, `situacao`, `tipo`, `titulo`, `endereco`
(com `cidade` e `uf`), `pracas` (pode ser `[]`), `modalidade`, `documentos` (pode ser `[]`), `fotos` (pode ser `[]`),
`controle` (com `coletado_em` e `versao_coletor`). Todo o resto é opcional e vai `null` quando a fonte não diz. Campo
fora desta lista é recusado (use `extras`).

| Campo | Tipo | Valores e regra |
| --- | --- | --- |
| `registro`, `versao_contrato` | | `"imovel"`, `1` |
| `id` | texto | `<slug>:<lote>` (A.1); o slug tem de ser igual a `leiloeiro.slug` |
| `leiloeiro` | objeto | igual ao da linha de coleta |
| `plataforma` | texto ou null | |
| `comitente` | objeto ou null | `nome` (quem vende: banco, vara/tribunal, órgão, empresa; **nunca pessoa física**) e `tipo`: `banco`, `judicial`, `orgao_publico`, `empresa`, `outro` (com `outro`, o nome sem palavra de empresa ou órgão, como S.A., Ltda, Prefeitura, Condomínio, é descartado na importação) |
| `url` | URL | página pública do lote (completa, com `https://`) |
| `leilao_id`, `leilao_titulo`, `lote_numero` | texto ou null | o leilão (evento) e o número do lote nele. **Mande o `leilao_id` sempre que o site tiver**: é por ele que o relatório conta os leilões de cada leiloeiro |
| `situacao` | enum | `ativo` (aceita lance ou proposta agora, ou tem praça futura; "adiado" com data nova é ativo), `suspenso`, `encerrado`, `vendido`, `cancelado` (esses quatro saem do site) |
| `situacao_fonte` | texto ou null | rótulo original ("Arrematado") |
| `tipo` | enum | `apartamento`, `casa`, `terreno`, `comercial` (sala, loja, galpão, prédio), `rural` (sítio, chácara, fazenda), `vaga` (box), `outro` |
| `tipo_fonte` | texto ou null | como a fonte escreve |
| `titulo` | texto (3 a 300) | |
| `descricao` | texto ou null | **a descrição completa em texto bruto** (é o que as regras de tag leem) |
| `observacoes` | texto ou null | observações e condições do lote |
| `endereco` | objeto | `texto` (como a fonte escreve), `logradouro`, `numero` (null se sem número; não escreva "s/n"), `complemento`, `bairro`, `cidade` (obrigatória; como o IBGE escreve, com acento: "Mogi das Cruzes", não "Moji"), `uf` (obrigatória; sigla), `cep` (`00000-000` ou null se não tiver 8 dígitos). **Só o lugar, sem nome de pessoa** |
| `lat`, `lon`, `precisao_geo` | número, número, enum ou null | só se a fonte publicar o ponto (dentro do Brasil); `precisao_geo`: `exata`, `rua`, `cep`, `bairro`, `cidade` (obrigatória com lat/lon). Nunca geocodifique |
| `area_privativa`, `area_total`, `area_terreno` | número (m²) ou null | |
| `quartos`, `vagas` | inteiro ou null | |
| `avaliacao` | número ou null | valor de avaliação |
| `lance_minimo` | número ou null | lance mínimo **vigente agora** ou preço da venda direta; null = a Luneta usa o da praça em vigor. Sem lance, o lote não aparece no site |
| `lance_atual`, `incremento` | número ou null | |
| `comissao_pct` | número (0 a 100) ou null | `5` = 5% |
| `pracas` | lista (até 4) | cada uma: `numero` (0 = única ou venda direta; 1, 2; 3 raro), `data` (data e hora com fuso, ou null), `valor_minimo` (número ou null), `situacao` (`futura`, `aberta`, `deserta`, `arrematada`, `encerrada`, `suspensa`, `cancelada` ou null). Números sem repetir; 0 nunca junto com 1/2; datas em ordem crescente; mínimo da 2ª **≤** o da 1ª |
| `praca_atual` | 0 a 3 ou null | a praça em vigor (precisa estar em `pracas`); null = a Luneta deduz |
| `modalidade` | enum | `leilao` (com praças), `venda_direta` (preço fixo, primeira proposta), `venda_online` (disputa com prazo, sem praças), `licitacao_aberta`, `outro` |
| `modalidade_fonte` | texto ou null | rótulo original, aparece no site |
| `natureza` | enum ou null | `judicial`, `extrajudicial` |
| `processo` | texto ou null | **só o número CNJ** `NNNNNNN-DD.AAAA.J.TR.OOOO`, sem partes |
| `pagamento` | objeto ou null | `a_vista`, `parcelamento` (do lance, art. 895; não é financiamento), `parcelas_max` (inteiro), `entrada_pct` (0 a 100), `indice_correcao` (texto), `financiamento` (bancário), `fgts` (todos booleans ou null, menos os números e o texto), `texto` (as condições como a fonte escreve) |
| `ocupacao` | objeto ou null | `situacao` (`ocupado`, `desocupado`, null), `origem` (`campo` = o site tem campo próprio; `texto` = achado na descrição), `texto` (o trecho, **sem nome de ocupante**) |
| `debitos` | objeto ou null | `iptu` e `condominio`: `{"valor": ..., "responsavel": ...}`, com `valor` (número ou null) e `responsavel` (`arrematante`, `pago_com_o_lance` = sub-roga-se no preço, `vendedor` ou null), só para dívida que a fonte **declara que existe**; `texto` (o trecho sobre dívidas) |
| `documentos` | lista (até 50) | `tipo` (`edital`, `matricula`, `laudo`, `avaliacao`, `processo`, `outro`), `titulo` (sem nome de parte), `url`. Só o link |
| `fotos` | lista (até 60) | `url`, `ordem` (0 = capa). Só o link |
| `registro_imovel` | objeto ou null | `matricula` (como a fonte escreve), `cartorio` (**com o número do ofício**: "6º Oficial de Registro de Imóveis de São Paulo"), `inscricao_municipal` |
| `extras` | objeto ou null | até 30 chaves `a-z0-9_` (começando por letra) com texto (até 500), número, boolean ou null; nada que mude a cada coleta (visitas) |
| `controle` | objeto | `coletado_em` (data e hora com fuso), `versao_coletor`, `hash` (ou null) |

**O `hash`:** SHA-256 em 64 hex minúsculos do `JSON.stringify` da linha sem o bloco `controle`, com as chaves sempre na
mesma ordem (a do coletor). A Luneta não confere: ele serve ao coletor para saber o que mudou e só abrir a página de
detalhe do que é novo ou mudou.

### A.4 Relatório por leiloeiro (`relatorio-leiloeiros.json`)

```json
{
  "formato": "luneta-relatorio-leiloeiros", "versao": 1, "gerado_em": "2026-10-27T12:00:00.000Z", "origem": "jsonl",
  "criterio": "Ativo = aparece no site: situação ativa, lance maior que zero e praça que não venceu há mais de 1 dia.",
  "totais": { "leiloeiros": 3, "leiloeiros_com_ativos": 3, "ativos": 9, "leiloes_ativos": 2, "ativos_todas_as_fontes": 9, "por_saude": { "ok": 2, "parcial": 1 } },
  "leiloeiros": [{
    "slug": "alfa-leiloes", "nome": "Alfa Leilões", "site": "https://alfa-leiloes.example", "plataforma": "Leilão PRO",
    "fonte_id": "ll_alfa_leiloes", "prefixo_id_site": "ll-alfa-leiloes", "ativos": 4, "leiloes_ativos": 2,
    "situacao": { "ativos_na_fonte": 4, "encerrados": 1, "removidos": null, "praca_vencida": 0, "sem_lance": 0 },
    "por_uf": { "SP": 4 }, "por_tipo": { "apartamento": 2, "casa": 1, "terreno": 1 },
    "por_modalidade": { "leilao": 3, "venda_direta": 1 }, "por_natureza": { "extrajudicial": 3, "judicial": 1 },
    "qualidade": { "com_foto_pct": 100, "com_edital_pct": 100, "com_avaliacao_pct": 75, "com_area_pct": 100, "com_endereco_completo_pct": 100, "com_praca_datada_pct": 100 },
    "repetidos_caixa": null,
    "coleta": { "ultima_em": "2026-10-27T01:10:00.000Z", "ultima_valida_em": "2026-10-27T01:10:00.000Z", "gerado_na_fonte_em": "2026-10-27T01:10:00.000Z", "completa": true, "saude": "ok", "frequencia": "diaria", "dias_sem_coleta_valida": 0, "erro": null }
  }],
  "outras_fontes": []
}
```

Regras: `ativos` conta só o que o site mostraria (situação ativa, com lance, praça não vencida há mais de 1 dia);
`leiloes_ativos` conta os `leilao_id` distintos entre os ativos (null quando nenhum ativo traz `leilao_id`); as divisões
por UF, tipo, modalidade e natureza (`judicial`, `extrajudicial`, `nao_informada`) e a qualidade (percentual inteiro de
0 a 100, ou null sem ativos) contam só os ativos; `saude` em `ok`, `parcial`, `quebrado`, `bloqueado`, `desconhecida`;
`frequencia` em `diaria`, `semanal`, `quinzenal`, `mensal`, `manual`, `irregular`, `desconhecida`; `repetidos_caixa` e
`removidos` ficam null (só a base da Luneta sabe); leiloeiros ordenados do que tem mais ativos para o que tem menos.
Com o repositório, gere com
`node --experimental-strip-types base/leiloeiros/relatorio.ts --arquivo <carga-completa.jsonl> --saida <destino>`.

### A.5 Como a Luneta usa (para entender o porquê das regras)

- Importação: `npm run base:coletar -- leiloeiros --arquivo saida.jsonl`. Cada leiloeiro vira uma fonte, com o nome
  dele no cartão do imóvel e no filtro do site. Lote com erro é ignorado; com mais de 2 lotes (ou 5%) com erro, a carga
  daquele leiloeiro é recusada inteira. Leiloeiro que não está no arquivo não muda.
- Sumiu de uma carga **completa** e de saúde `ok` → sai do site. Trava: se sumirem mais de 50% (e 10 ou mais) antes
  da data da praça, nada sai e fica um aviso; o que some depois da praça (leilão que já aconteceu) não conta para a
  trava. Uma linha ilegível no arquivo desliga a remoção de todos os leiloeiros da carga. Vendido, encerrado, suspenso,
  cancelado → sai do site. Praça vencida há mais de 1 dia → sai.
- Endereço, bairro, cartório, matrícula e comitente vão ao site **sem** máscara de nomes. Título, descrição e textos são
  mascarados ao gravar, mas a máscara é heurística: tire os nomes na origem.
- A cidade é gravada como o IBGE escreve ("SÃO PAULO" → "São Paulo"); grafia antiga gera aviso.
- Matrícula + número do ofício, ou o endereço com número, servem para achar o mesmo imóvel na Caixa e em outros
  leiloeiros (o relatório da base conta os `repetidos_caixa`).

## Anexo B: as 26 tags da Luneta e o que alimenta cada uma

Valores: `sim`, `nao`, `desconhecido`. Só `sim` aparece no site, e as que pedem revisão aparecem como "em revisão".

| Tag (slug) | Rótulo | Grupo · severidade | O que alimenta (campo do Anexo A ou texto) |
| --- | --- | --- | --- |
| `ocupado` | Ocupado | posse · grave | `ocupacao` com origem campo (confiança alta); frases no texto ("imóvel ocupado", "ocupado por", "Situação: Ocupado") |
| `desocupado` | Desocupado | posse · positivo | o mesmo; vindo de texto, sempre em revisão |
| `ocupacao-nao-informada` | Ocupação não informada | posse · info | ausência de informação |
| `desagio-alto` | Deságio alto | preço · positivo | `avaliacao` e lance (40% ou mais abaixo) |
| `desagio-baixo` | Deságio baixo | preço · atenção | `avaliacao` e lance (menos de 20%) |
| `preco-acima-mercado` | Lance acima da avaliação | preço · grave | lance maior que a `avaliacao` |
| `custos-extras-altos` | Custos extras altos | preço · atenção | `comissao_pct` acima de 5%; laudêmio, foro, terreno de marinha, regularização a cargo do arrematante no texto |
| `condominio-em-atraso` | Condomínio em atraso | dívidas · atenção | `debitos.condominio` com valor; "Há débitos de condomínio de R$ ..." no texto |
| `iptu-em-atraso` | IPTU em atraso | dívidas · atenção | `debitos.iptu` com valor; o mesmo no texto |
| `divida-passa-arrematante` | Dívida passa ao arrematante | dívidas · grave | `responsavel: "arrematante"`; "por conta / a cargo do arrematante" no texto (sub-rogação no preço anula) |
| `acao-judicial` | Ação judicial em curso | jurídico · grave | texto: anulatória, embargos de terceiro, usucapião, possessória |
| `penhora-outros-credores` | Penhora de outros credores | jurídico · grave | texto: "há outras penhoras"; atos da matrícula (documento) |
| `leilao-com-recurso` | Leilão com recurso | jurídico · atenção | texto: agravo, recurso pendente, efeito suspensivo |
| `direito-preferencia` | Devedor com direito de preferência | jurídico · atenção | `natureza: "extrajudicial"` com alienação fiduciária (Lei 9.514) em `modalidade_fonte` ou no texto |
| `matricula-pendencia` | Matrícula com pendência | documentação · atenção | texto: indisponibilidade, hipoteca, gravame; atos da matrícula (documento) |
| `construcao-irregular` | Construção irregular | documentação · grave | texto ou laudo: "não averbada", "sem habite-se" |
| `area-divergente` | Área divergente | documentação · atenção | texto: "divergência de área"; área do título × áreas dos campos |
| `imovel-inteiro` | Imóvel inteiro | propriedade · positivo | extrajudicial de banco; "100% do imóvel" no texto |
| `cota-parte` | Cota-parte | propriedade · atenção | título ou `leilao_titulo` com "fração", "parte ideal", "50% do imóvel" |
| `so-direitos` | Só direitos sobre o imóvel | propriedade · grave | título "Direitos ..."; "direitos aquisitivos/possessórios", domínio útil, nua-propriedade |
| `sem-fotos` | Sem fotos | condição · info | `fotos` vazia num site que publica fotos (`extrai.fotos`) |
| `sem-vistoria` | Sem vistoria | condição · info | texto: "não foi possível vistoriar", "visitação não permitida"; documento de vistoria anula |
| `aceita-financiamento` | Aceita financiamento | condição · positivo | `pagamento.financiamento` (parcelamento não conta) |
| `primeira-praca` | 1ª praça | praça · info | `pracas` com datas e situação, ou `praca_atual` |
| `segunda-praca` | 2ª praça | praça · positivo | o mesmo |
| `praca-unica` | Praça única | praça · info | praça com `numero: 0`, venda direta, venda online, licitação |

## Anexo C: conferência sem o validador oficial

Sem o repositório, confira cada linha da amostra antes de entregar (e conte no `validacao.txt` quantas passaram). Se
o Node estiver instalado, escreva um conferidor pequeno com estas regras e rode-o; senão, confira por amostragem e
diga isso.

- é JSON válido, em UTF-8, uma linha por objeto; `registro` é `coleta` ou `imovel`; `versao_contrato` é 1;
- uma linha de coleta por leiloeiro; `total_enviados` bate com as linhas de imóvel dele; `completa: true` só com
  `saude: "ok"`; `coletado_em` não está no futuro;
- `id` no formato `<slug>:<lote>` (lote só com letras minúsculas e dígitos), sem repetir, e o slug igual a
  `leiloeiro.slug`; o mesmo `leiloeiro.nome` e `leiloeiro.site` em todas as linhas do leiloeiro;
- campos obrigatórios presentes; nenhum campo fora da lista; enums só com os valores do Anexo A; textos dentro dos
  limites de A.1;
- URLs completas com `http://` ou `https://`; datas com fuso; dinheiro como número; CEP com 8 dígitos ou null;
- praças: números sem repetir, 0 sozinho, datas crescentes, mínimo da 2ª menor ou igual ao da 1ª, `praca_atual` existente;
- lat e lon juntas e com `precisao_geo`; `processo` no padrão CNJ;
- **LGPD:** nenhum CPF, RG ou e-mail em nenhum campo, nem telefone de pessoa (o do leiloeiro pode); nenhum papel de
  pessoa ("proprietário", "executado", "ocupado por", "réu", "exequente", "arrematante", "herdeiro", "em nome de") no
  endereço, no bairro, no cartório ou no comitente; nenhum nome de pessoa depois de "Executado:", "Arrematante:",
  "Réu:" na descrição;
- avisos (não impedem, mas corrija): lote ativo com a praça já vencida; sem lance mínimo; avaliação 0 ou abaixo de
  R$ 1.000; lance acima de 3 vezes a avaliação; judicial sem processo; sem endereço; cidade que não é município do IBGE
  ou com grafia antiga.

## Anexo D: plataformas e sinais conhecidos (para reconhecer e priorizar)

- **Plataformas que atendem muitos leiloeiros** (um coletor cobre vários): V-Lance (~30 leiloeiros; a Leilões
  Judiciais é V-Lance; atenção: as respostas trazem dados de usuário, que não podem ser lidos), Superbid (Superbid, Sold
  e dezenas de leiloeiros; traz ocupação, anexos, comissão e parcelas; há relatos de Cloudflare), Suporte Leilões
  (~107 domínios; só com parceria), SOLEON (~107 domínios), Leilão PRO (~103 domínios), Sua Plataforma de Leilão (~44
  domínios; algumas páginas expõem CPF de depositário: não ler), Leiloar (~20), Bom Valor (~11), SISHP (~8).
  Estimativa de mercado: "~10 conectores alcançam ~490 sites".
- **Leiloeiros grandes** de site próprio: Portal Zuk (bancos: Itaú, Bradesco, Santander, BB, C6), Frazão
  (`sitemap-lotes.xml`), Mega Leilões, Grupo Lance (Cloudflare), Sodré Santoro.
- **Anti-robô conhecido:** Cloudflare (Superbid, Grupo Lance, Leilão Imóvel) e Radware/perfdrive (Caixa). Bloqueio =
  parar e registrar; a saída é parceria, não contorno.
- **Caixa:** a Luneta já tem a lista da Caixa (~21 mil imóveis). Lote de leiloeiro cujo comitente é a Caixa Econômica
  Federal tende a ser o mesmo imóvel da lista: conte esses lotes à parte.
- O mercado tem de 19 a 25 mil imóveis em leilão por mês, ~68% extrajudiciais (bancos), que não passam por diário
  oficial: só no site do leiloeiro. Por isso os coletores dos leiloeiros importam tanto.

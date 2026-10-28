# Contrato de troca: coletores dos leiloeiros → Luneta (versão 1)

Este é o formato que qualquer coletor de leiloeiro entrega à Luneta: hoje os Apps Scripts do dono, amanhã um
conector em Node ou um parceiro. Quem escreve o coletor só precisa deste arquivo. Os esquemas formais (JSON Schema,
draft 2020-12) estão ao lado: [`imovel.schema.json`](imovel.schema.json), [`coleta.schema.json`](coleta.schema.json)
e [`relatorio-leiloeiros.schema.json`](relatorio-leiloeiros.schema.json). Antes de entregar, rode o validador:

```bash
npm run leiloeiros:validar -- --arquivo saida.jsonl
# no Windows (PowerShell): node --experimental-strip-types base/leiloeiros/validar.ts --arquivo saida.jsonl
```

Exemplo completo, com 12 lotes fictícios de 3 leiloeiros e os casos difíceis (sem avaliação, praça única, judicial
com processo, endereço só em texto, vendido, suspenso, cancelado, carga incompleta):
[`base/fontes/leiloeiros/fixtures/tres-leiloeiros.jsonl`](../fontes/leiloeiros/fixtures/tres-leiloeiros.jsonl).

## 1. O arquivo

- **JSONL em UTF-8**: um objeto JSON por linha, sem vírgula entre linhas e sem lista em volta. Linhas em branco são
  ignoradas; BOM é aceito. Não use CP1252/Latin-1 (o validador recusa caracteres trocados por `�`).
- **Dois tipos de linha**, pelo campo `registro`:
  - `"coleta"`: **uma por leiloeiro em cada carga**, de preferência antes dos lotes dele. Diz quando a coleta
    terminou, se a carga é completa e a saúde do coletor;
  - `"imovel"`: um lote de imóvel. Veículos, máquinas e outros bens **não** entram.
- **Uma carga por arquivo**: o arquivo pode ter vários leiloeiros. Cada leiloeiro é importado à parte: um coletor
  quebrado não derruba os outros. **Nunca divida um leiloeiro em dois arquivos com `completa: true`** (lotes 1 a 100
  num, 101 a 200 noutro): o segundo tiraria do site os lotes do primeiro. Um leiloeiro, uma carga, um arquivo.
- **Carga completa**: em cada execução, mande **todos** os lotes de imóveis ativos do leiloeiro (não só os que
  mudaram) e `completa: true`. É assim que a Luneta tira do site o que sumiu. O `controle.hash` serve para o
  coletor saber o que mudou (e economizar leitura de páginas de detalhe), não para mandar só a diferença.
- **`null` = a fonte não informa.** Nunca chute, nunca copie de outro campo (avaliação não é o lance da 1ª praça), nunca
  use `0` ou `""` no lugar de `null`. Campo que o coletor não sabe extrair vai como `null`.
- **Mande sempre todas as chaves**, com `null` quando não houver: é o jeito mais simples de nunca faltar uma
  obrigatória dentro dos objetos (`pracas[].data` e `valor_minimo`, `ocupacao.situacao` e `origem`,
  `debitos.*.valor` e `responsavel`).
- **Corte os textos no limite** em vez de mandar maior (o lote com texto longo demais é recusado): 80 caracteres nos
  rótulos (`plataforma`, `leilao_id`, `lote_numero`, `situacao_fonte`, `tipo_fonte`, `modalidade_fonte`), 300 no
  `titulo`, 500 no `leilao_titulo` e no `endereco.texto`, 20.000 na `descricao` e nas `observacoes`, 5.000 nos
  `texto` de pagamento e dívidas; listas: até 4 praças, 50 documentos, 60 fotos e 30 chaves em `extras`.

## 2. Ids

| O quê | Formato | Exemplo |
| --- | --- | --- |
| slug do leiloeiro | minúsculas, dígitos e hífens, 2 a 30 caracteres, **estável para sempre** | `alfa-leiloes` |
| id do lote | **só letras minúsculas e dígitos**, 1 a 40, estável entre coletas (o id do lote no site do leiloeiro; tire barras, hífens e espaços: `2026/001-A` → `2026001a`) | `48211` |
| `id` da linha | `<slug>:<id do lote>` | `alfa-leiloes:48211` |
| fonte na base | `ll_` + slug com `_` | `ll_alfa_leiloes` |
| id no site | `ll-<slug>-<lote>` (até 74 caracteres; é a URL `/previa/imovel/<id>`) | `ll-alfa-leiloes-48211` |

Por que o lote não pode ter hífen: no site, o que vem depois do último hífen é o lote. Assim dois leiloeiros nunca geram o
mesmo id (o site recusa o arquivo inteiro se um id repetir). Trocar o slug ou o id do lote faz o imóvel "sumir" e
"aparecer de novo" com outro endereço: não troque.

## 3. Linha de coleta (`registro: "coleta"`)

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `registro` | `"coleta"` | sim | | |
| `versao_contrato` | `1` | sim | | |
| `leiloeiro` | objeto (seção 4.1) | sim | igual ao dos lotes | `fonte` (nome, url) |
| `plataforma` | texto ou null | não | plataforma que atende vários leiloeiros (`"Leilão PRO"`, `"SOLEON"`, `"V-Lance"`, `"Superbid"`...); null se o site é próprio | relatório |
| `metodo` | `html`, `json_interno`, `api_documentada`, `arquivo_oficial` ou null | não | como o coletor lê o site | `fonte.acesso` |
| `iniciado_em` | data e hora ISO com fuso, ou null | não | início da coleta | |
| `coletado_em` | data e hora ISO com fuso | sim | **fim** da coleta. Uma carga mais antiga que a última importada do mesmo leiloeiro é recusada | `coleta.gerado_na_fonte_em` |
| `versao_coletor` | texto (até 40) | sim | `"alfa-1.3.0"` | log da coleta |
| `completa` | boolean | sim | `true` só se a carga traz **todos** os lotes de imóveis ativos do leiloeiro e o coletor leu tudo (saúde `ok`). Em dúvida, `false` | remoção (seção 6) |
| `total_na_fonte` | inteiro ou null | não | quantos lotes de imóveis o site diz ter (contador da página) | conferência |
| `total_enviados` | inteiro | sim | quantas linhas de imóvel deste leiloeiro vão nesta carga | conferência |
| `saude` | `ok`, `parcial`, `quebrado`, `bloqueado` | sim | `ok` = leu tudo; `parcial` = leu uma parte (paginação falhou, tempo esgotado); `quebrado` = o site mudou e o coletor não acha os lotes; `bloqueado` = robots, 403/429 ou desafio anti-robô (o coletor parou, como deve) | relatório, log |
| `erro` | texto (até 500) ou null | não | mensagem curta, **sem segredos** (token, senha, cookie) | log, relatório |
| `frequencia` | `diaria`, `semanal`, `quinzenal`, `mensal`, `manual` ou null | não | agenda deste coletor | relatório |
| `extrai` | `{fotos, documentos, ocupacao}` (booleans) ou null | não | o que o coletor sabe extrair deste site. `fotos: false` evita a tag "Sem fotos" falsa. Sem o bloco, a Luneta deduz pelos lotes | `fonte.publica_*` |
| `robots` | `permite`, `proibe`, `sem_robots`, `nao_verificado` ou null | não | o robots.txt permite ler as páginas de lote? | auditoria |
| `termos` | `permitem`, `proibem`, `silenciosos`, `nao_lidos` ou null | não | os termos de uso permitem coleta automatizada? | auditoria |

Leiloeiro com a coleta `quebrado` ou `bloqueado` e **nenhum** lote: mande só a linha de coleta. A importação registra a
coleta como erro (`[bloqueado] mensagem`), o relatório mostra a saúde, e os lotes já publicados continuam como estavam.

## 4. Linha de imóvel (`registro: "imovel"`)

### 4.1 Identificação

| Campo | Tipo | Obrig. | Como preencher | Vai para (base) |
| --- | --- | --- | --- | --- |
| `registro` | `"imovel"` | sim | | |
| `versao_contrato` | `1` | sim | | |
| `id` | texto | sim | `<slug>:<id do lote>` (seção 2) | `fonte_id` = `ll_<slug>`; `id_na_fonte` = lote |
| `leiloeiro.slug` | texto | sim | seção 2 | `extras.leiloeiro_slug` |
| `leiloeiro.nome` | texto (2 a 120) | sim | nome público do leiloeiro ou da casa de leilões, como no site. É o nome que a Luneta mostra no cartão e no filtro de fonte | `fonte.nome`, `imovel.leiloeiro` |
| `leiloeiro.site` | URL | sim | página inicial do leiloeiro | `fonte.url`, `extras.site_leiloeiro` (link "Site do leiloeiro") |
| `leiloeiro.matricula_junta` | texto ou null | não | `"JUCESP nº 1.234"`, se o site informa | `extras.leiloeiro_junta` |
| `plataforma` | texto ou null | não | como na linha de coleta | `extras.plataforma` |
| `comitente.nome` | texto | se houver comitente | quem vende: banco, vara/tribunal, órgão, empresa (`"Banco X S.A."`, `"TJSP – 2ª Vara Cível de Campinas"`). **Nunca pessoa física**: mande `comitente: null` | `imovel.comitente` |
| `comitente.tipo` | `banco`, `judicial`, `orgao_publico`, `empresa`, `outro` | se houver comitente | com `outro`, o nome sem palavra de empresa, banco, vara ou órgão (S.A., Ltda, Prefeitura, Condomínio...) é descartado na importação: pode ser pessoa física | `extras.comitente_tipo` |
| `url` | URL | sim | página pública do lote (para onde o site leva o usuário) | `imovel.url` |
| `leilao_id` | texto ou null | não | id do leilão (evento) que contém o lote, estável entre coletas. **Mande sempre que o site tiver**: é por ele que o relatório conta os leilões de cada leiloeiro | `extras.leilao_id` |
| `leilao_titulo` | texto ou null | não | título do leilão como a fonte escreve | `textos[titulo_leilao]` (as tags de praça e de cota-parte leem) |
| `lote_numero` | texto ou null | não | `"3"`, `"003"` | `extras.lote_numero` |

### 4.2 Situação

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `situacao` | `ativo`, `suspenso`, `encerrado`, `vendido`, `cancelado` | sim | `ativo` = aceita lance ou proposta agora, ou tem praça futura. "Adiado" com data nova é `ativo` | `imovel.status`: `ativo` → ativo; o resto → `encerrado` (sai do site); `extras.situacao` |
| `situacao_fonte` | texto ou null | não | rótulo original (`"Arrematado"`, `"Em loteamento"`, `"Adiado"`) | `extras.status_fonte` |

### 4.3 Imóvel

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `tipo` | `apartamento`, `casa`, `terreno`, `comercial`, `rural`, `vaga`, `outro` | sim | sala, loja, galpão, prédio comercial → `comercial`; sítio, chácara, fazenda → `rural`; box de garagem → `vaga` (no site vira "outro") | `imovel.tipo` |
| `tipo_fonte` | texto ou null | não | como a fonte escreve (`"Apartamento Duplex"`) | `extras.tipo_fonte` |
| `titulo` | texto (3 a 300) | sim | título do lote | `imovel.titulo` (o núcleo tira HTML e mascara nomes) |
| `descricao` | texto ou null | não | **descrição completa, em texto bruto** (sem menus nem rodapé). É o que as regras de tag leem | `imovel.descricao` |
| `observacoes` | texto ou null | não | observações e condições do lote que não estão na descrição | `textos[observacoes]` |
| `endereco.texto` | texto ou null | não | endereço inteiro como a fonte escreve | `imovel.endereco` quando não há `logradouro` |
| `endereco.logradouro` | texto ou null | não | `"Rua das Flores"` | `imovel.endereco` = logradouro, número e complemento juntos |
| `endereco.numero` | texto ou null | não | `"100"`, `"100-A"`; **null** se sem número (não escreva "s/n") | idem |
| `endereco.complemento` | texto ou null | não | `"Apto 31, Bloco B"`, `"Lote 5, Quadra 3"` | idem |
| `endereco.bairro` | texto ou null | não | | `imovel.bairro` |
| `endereco.cidade` | texto | sim | nome do município, de preferência como o IBGE escreve, com acento. O validador avisa quando não casa com o IBGE (o imóvel fica fora do mapa) | `imovel.cidade` |
| `endereco.uf` | sigla da UF | sim | `"SP"` | `imovel.uf` |
| `endereco.cep` | `"00000-000"`, `"00000000"` ou null | não | **null** se não tiver 8 dígitos (CEP malformado derruba o lote) | `imovel.cep` |
| `lat`, `lon` | número ou null | não | só se a fonte publicar (mapa embutido, Street View). **Nunca geocodifique** no coletor | `imovel.lat/lon` (a base confere contra a cidade) |
| `precisao_geo` | `exata`, `rua`, `cep`, `bairro`, `cidade` ou null | se houver lat/lon | ponto do mapa da fonte = `exata` ou `rua` | `imovel.precisao_geo` |
| `area_privativa` | número (m²) ou null | não | área útil/privativa | `imovel.area_privativa` |
| `area_total` | número (m²) ou null | não | área total/construída | `imovel.area_total` |
| `area_terreno` | número (m²) ou null | não | hectare × 10.000; alqueire: só com a unidade dita (paulista 24.200 m², mineiro 48.400 m²) | `imovel.area_terreno` |
| `quartos` | inteiro ou null | não | dormitórios (suíte conta) | `imovel.quartos` |
| `vagas` | inteiro ou null | não | vagas de garagem | `imovel.vagas` |

### 4.4 Dinheiro e praças

Dinheiro: **número em reais com ponto decimal** (`1234567.89`), nunca texto (`"R$ 1.234.567,89"`). Datas: ISO 8601
**com fuso**: `"2026-11-10T14:00:00-03:00"` (Brasília). Sem fuso, sem segundos no fuso (`-03`) ou `"10/11/2026"`
são recusados.

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `avaliacao` | número ou null | não | valor de avaliação. null se a fonte não publica | `imovel.valor_avaliacao` (deságio) |
| `lance_minimo` | número ou null | não | lance mínimo **vigente agora** (o da praça em vigor) ou o preço da venda direta. Se null, a Luneta usa o `valor_minimo` da praça em vigor. **Sem lance, o lote não aparece no site** | `imovel.preco` |
| `lance_atual` | número ou null | não | maior lance já dado, se a fonte mostra | `extras.lance_atual` |
| `incremento` | número ou null | não | incremento mínimo entre lances | `extras.incremento` |
| `comissao_pct` | número (0 a 100) ou null | não | comissão do leiloeiro em % (`5` = 5%) | `extras.comissao_pct` e uma frase para a tag "Custos extras altos" (acima de 5%) |
| `pracas` | lista (até 4) | sim (pode ser `[]`) | em ordem. Venda direta, venda online ou praça única: **uma** praça com `numero: 0` (data = prazo, valor = preço) | tabela `praca` |
| `pracas[].numero` | 0, 1, 2 ou 3 | sim | 0 = única; 1 e 2 = 1ª e 2ª praça | |
| `pracas[].data` | data e hora com fuso, ou null | sim | início da praça (ou fim da disputa) | `praca.data` (em UTC) |
| `pracas[].valor_minimo` | número ou null | sim | lance mínimo desta praça | `praca.valor_minimo` |
| `pracas[].situacao` | `futura`, `aberta`, `deserta`, `arrematada`, `encerrada`, `suspensa`, `cancelada` ou null | não | `deserta` = sem lances (a seguinte entra em vigor) | `extras.praca_N_situacao`; a primeira `futura`/`aberta` vira a praça em vigor |
| `praca_atual` | 0 a 3 ou null | não | número da praça em vigor (precisa estar em `pracas`). null = a Luneta deduz pela situação e pelas datas | `imovel.praca_atual` (tags 1ª/2ª praça/praça única) |

Regras que o validador confere: números de praça sem repetir; 0 nunca junto com 1/2/3; datas em ordem crescente;
valor mínimo da 2ª **menor ou igual** ao da 1ª; `praca_atual` existente.

### 4.5 Condições

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `modalidade` | `leilao`, `venda_direta`, `venda_online`, `licitacao_aberta`, `outro` | sim | `leilao` = com praças | `imovel.modalidade` |
| `modalidade_fonte` | texto ou null | não | rótulo original (`"Leilão Extrajudicial - Lei 9.514/97"`); aparece no site | `imovel.modalidade_fonte` |
| `natureza` | `judicial`, `extrajudicial` ou null | não | judicial = ordem de juiz; extrajudicial = banco/credor fiduciário, empresa, órgão | `imovel.judicial` |
| `processo` | texto CNJ ou null | não | **só o número**: `NNNNNNN-DD.AAAA.J.TR.OOOO`. Nunca com o nome das partes ("Fulano x Banco"). O número é público e não é mascarado | `imovel.numero_processo` |
| `pagamento.a_vista` | boolean ou null | não | | `extras.aceita_a_vista` |
| `pagamento.parcelamento` | boolean ou null | não | parcelamento do lance (art. 895 do CPC ou do leiloeiro). **Não é financiamento** | `imovel.aceita_parcelamento` |
| `pagamento.parcelas_max` | inteiro ou null | não | | `extras.nu_parcelas` (o site monta "Entrada de 25% e o restante em até 30 parcelas (IPCA)") |
| `pagamento.entrada_pct` | número (0 a 100) ou null | não | entrada mínima em % | `extras.vl_percentualentrada` |
| `pagamento.indice_correcao` | texto ou null | não | `"IPCA"`, `"INPC"` | `extras.indice_correcao` |
| `pagamento.financiamento` | boolean ou null | não | financiamento bancário | `imovel.aceita_financiamento` (tag "Aceita financiamento") |
| `pagamento.fgts` | boolean ou null | não | | `imovel.aceita_fgts` |
| `pagamento.texto` | texto ou null | não | condições como a fonte escreve | `textos[pagamento]` |
| `ocupacao.situacao` | `ocupado`, `desocupado` ou null | se houver `ocupacao` | | `imovel.ocupacao` **só com origem `campo`** |
| `ocupacao.origem` | `campo`, `texto` ou null | se houver `ocupacao` | `campo` = o site tem um campo próprio ("Situação: Ocupado"); `texto` = achado na descrição | |
| `ocupacao.texto` | texto ou null | não | o trecho da fonte, **sem nome de ocupante** | `textos[ocupacao]` (as regras de posse leem) |
| `debitos.iptu`, `debitos.condominio` | `{valor, responsavel}` ou null | não | **só dívida que a fonte declara que existe** (não "eventuais débitos"). `valor` em reais ou null; `responsavel`: `arrematante`, `pago_com_o_lance` (sub-rogação no preço, CTN 130, CPC 908), `vendedor` ou null | `extras.debito_*` e uma frase para as tags "Condomínio em atraso", "IPTU em atraso" e "Dívida passa ao arrematante" |
| `debitos.texto` | texto ou null | não | trecho da fonte sobre dívidas e quem paga | `textos[debitos]` |

### 4.6 Documentos e fotos (só links; nunca baixe nem re-hospede)

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `documentos[]` | lista (até 50) | sim (pode ser `[]`) | | tabela `documento` |
| `documentos[].tipo` | `edital`, `matricula`, `laudo`, `avaliacao`, `processo`, `outro` | sim | laudo de vistoria → `laudo` com "vistoria" no título | `processo` vira `outro` com título "Processo" |
| `documentos[].titulo` | texto ou null | não | rótulo do link, **sem nome de parte** | rótulo do link no site |
| `documentos[].url` | URL | sim | | |
| `fotos[]` | lista (até 60) | sim (pode ser `[]`) | a capa primeiro | tabela `foto` (origem `ficha`) |
| `fotos[].url` | URL | sim | URL da imagem na fonte | |
| `fotos[].ordem` | inteiro ou null | não | 0 = capa | |

### 4.7 Registro do imóvel

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `registro_imovel.matricula` | texto ou null | não | número como a fonte escreve (`"123.456"`); várias: separadas por vírgula | `imovel.matricula` (deduplicação com a Caixa) |
| `registro_imovel.cartorio` | texto ou null | não | **com o número do ofício**: `"6º Oficial de Registro de Imóveis de São Paulo"`, `"2º Cartório de Registro de Imóveis de Campinas"` | `imovel.cartorio` (deduplicação) |
| `registro_imovel.inscricao_municipal` | texto ou null | não | inscrição do IPTU | `extras.inscricao_imobiliaria` |
| `registro_imovel.numero_caixa` | 13 dígitos ou null | não | número do imóvel na Caixa, com os zeros à esquerda (`"0000010119245"`), quando o leiloeiro vende um imóvel da Caixa e o número aparece no lote (`hdnimovel=` na URL, título, descrição) | `extras.numero_caixa`: o relatório conta o lote como "também na Caixa" quando o número é de um ativo da Caixa, mesmo sem matrícula nem endereço que batam |

### 4.8 Extras e controle

| Campo | Tipo | Obrig. | Como preencher | Vai para |
| --- | --- | --- | --- | --- |
| `extras` | objeto de valores simples (texto, número, boolean, null; até 30 chaves `a-z0-9_`) ou null | não | campos da fonte sem lugar aqui. **Nada que mude a cada coleta** (visitas, "visto em"): isso faria todo lote parecer atualizado | `imovel.extras` com prefixo `x_` |
| `controle.coletado_em` | data e hora com fuso | sim | quando este lote foi lido | data de geração quando falta a linha de coleta |
| `controle.versao_coletor` | texto | sim | | (não vai ao imóvel) |
| `controle.hash` | 64 hex minúsculos ou null | não (recomendado) | SHA-256 do lote sem o bloco `controle`, para o coletor saber o que mudou | (não vai ao imóvel) |

## 5. LGPD (obrigatório)

- **Nunca exportar**: nome, CPF/CNPJ, RG, e-mail, telefone ou IP de devedor, executado, exequente, réu, autor,
  depositário, ocupante, proprietário, cônjuge, herdeiro, licitante ou arrematante; lista de lances com apelido ou IP;
  placa, chassi e RENAVAM. Se o site mostra isso, o coletor **não lê** esses campos.
- **Pode ir**: o nome do leiloeiro (profissional público), do comitente pessoa jurídica (banco, vara, órgão, empresa) e o
  número do processo (público, sem as partes).
- **Endereço, bairro, cartório, matrícula e comitente vão ao site sem a máscara de nomes.** Mande só o lugar e o órgão.
  Na importação, esses campos passam por um corte (`campoSemPessoa`): o que vier depois de "proprietário", "ocupado
  por", "executado" etc. é descartado, e o campo inteiro cai se ainda parecer ter nome.
- Título, descrição e textos são mascarados pela base ao gravar (CPF, CNPJ, RG, e-mail, IP e nomes depois de papéis viram
  `[CPF]`, `[NOME]`...), mas a máscara é heurística: tire na origem.
- O validador acusa: **erro** para CPF/RG em qualquer campo e para documento ou papel de pessoa nos campos de lugar e de
  comitente (o lote não entra); **aviso** para nome depois de papel em título e descrição.
- Fotos e documentos: só a URL. Nada é baixado.
- Segredos (token, senha, cookie, chave de API) nunca vão no arquivo, nem em `erro`.

## 6. O que a importação faz

```bash
npm run base:coletar -- leiloeiros --arquivo saida.jsonl
```

- Cada leiloeiro vira (ou atualiza) a fonte `ll_<slug>`, com o nome e o site dele, e tem a própria coleta no log.
- Cada lote passa pelo mesmo exame do validador. Lote com erro é ignorado; com mais de 2 lotes (ou 5%) com erro, a
  carga **daquele leiloeiro** é recusada inteira e nada dele muda.
- **Sumiu da carga** → status `removido` (sai do site), só quando a linha de coleta diz `completa: true` com saúde `ok`,
  não há lote com erro nem linha ilegível no arquivo, e somem no máximo 50% dos ativos do leiloeiro (a trava do
  núcleo, que só age a partir de 10 lotes). Para a trava, não conta o lote cuja praça já passou há mais de 1 dia: o
  leilão aconteceu e é normal o evento inteiro sair do site do leiloeiro no dia seguinte.
  Sem linha de coleta, ou com a carga incompleta, nada sai por ter sumido. Quem reaparece volta a `ativo`.
- **Vendido, encerrado, suspenso ou cancelado** (dito pelo coletor) → `encerrado` (sai do site).
- **Praça vencida** há mais de 1 dia: o lote sai do site mesmo "ativo". O coletor precisa trazer a situação nova.
- **Carga mais antiga** que a última importada do mesmo leiloeiro (pelo `coletado_em` da linha de coleta) é recusada.
- **Cidade**: gravada como o IBGE escreve quando é o mesmo município com outra grafia ("SÃO PAULO", "Sao Paulo",
  "Moji das Cruzes" → "Mogi das Cruzes"); o validador avisa a grafia antiga para o coletor corrigir. Distrito fica
  como veio.
- Leiloeiro que não está no arquivo não muda em nada (nem sai do site): a remoção é só do leiloeiro da carga.
- Depois: `npm run base:riscos` (tags), `npm run base:exportar -- --site` (site) e
  `npm run leiloeiros:relatorio -- --site` (relatório por leiloeiro).

## 7. Relatório por leiloeiro (`relatorio-leiloeiros.json`)

Formato em [`relatorio-leiloeiros.schema.json`](relatorio-leiloeiros.schema.json). Por leiloeiro: slug, nome, site,
plataforma, fonte e prefixo do id no site; **ativos** (o que o site mostra: situação ativa, com lance e sem praça vencida);
situação (ativos na fonte, encerrados, removidos, com praça vencida, sem lance); divisão por UF, tipo, modalidade e
natureza; qualidade (% com foto, edital, avaliação, área, endereço com número e praça com data); quantos são o mesmo
imóvel de um ativo da Caixa; **leilões ativos** (eventos distintos pelo `leilao_id`, null quando o coletor não manda
esse campo); e a coleta (última, última válida, data na fonte, completa, saúde `ok`/`parcial`/
`quebrado`/`bloqueado`/`desconhecida`, frequência declarada ou medida, dias sem coleta válida e o erro). Os totais
dão o número para "[X] leiloeiros monitorados" (`leiloeiros_com_ativos`). As outras fontes (Caixa, Leilões Judiciais)
vêm à parte, com os leiloeiros citados nos lotes dos agregadores.

## 8. Mudanças no contrato

Versão 1. Campo novo opcional não muda a versão. Renomear, remover ou mudar o significado de um campo sobe
`versao_contrato` e pede ajuste no validador, no conector (`base/fontes/leiloeiros`) e nos coletores.

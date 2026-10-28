# Auditoria do código do Coletor de Leilões PBCV

> Feita em 27/10/2026 sobre o repositório privado `luneta-base` (commit `d73d830b`) e a base extraída
> (`leiloes.db`, última coleta em 01/10/2026). Foi **só leitura**: nada foi alterado no repositório, nenhuma coleta
> foi feita na rede e nenhum segredo foi copiado. Os testes rodaram numa cópia do código no scratchpad (sem os segredos e
> sem os bancos), com um ambiente Python próprio.
>
> Todo número deste texto foi medido (no banco, nos manifestos do `bruto/` ou no código). Quando é estimativa, está
> escrito "estimativa".

---

## Resumo para o dono (1 minuto)

1. **O motor é bom e deve ser mantido.** O núcleo (`core/`) foi escrito com cuidado raro: "não sei" nunca vira zero,
   falha de site nunca vira "imóvel saiu", o robô se identifica e respeita o robots.txt, e tudo o que é baixado fica
   guardado para reprocessar sem rede. Os 823 sites são lidos por 188 "famílias" de software, e não um a um.
2. **O número de imóveis está inflado.** Dos 35,3 mil imóveis "ativos" da base, só **cerca de 24 mil** foram vistos na
   última rodada e estão abertos ou agendados. O resto são suspensos de anos atrás, encerrados e "zumbis" (lotes que
   ninguém vê há semanas, mas que o sistema não deixa sair). O maior leiloeiro do ranking (Fidalgo, 1.339 imóveis) tem,
   na verdade, cerca de 30 imóveis vistos de verdade.
3. **A atualização mensal não serve para a Luneta.** Metade do estoque aberto encerra em 8 dias; em 30 dias, 85%. E a
   rodada agendada de 01/10 parou sozinha às 03:27, depois de 246 dos 823 sites, sem que ninguém fosse avisado.
4. **Há dois segredos dentro do repositório** (chave do Google e chave da Groq). A da Groq serve a um código morto:
   revogue as duas.
5. **LGPD:** a base guarda nomes de executados e exequentes (de 6 a 7 mil lotes ativos); a exportação para Excel e a
   planilha publicam colunas com nome de parte ou de comitente pessoa física; o painel registra o IP de quem o abre.
   Nada disso pode ir para a Luneta.
6. **Pode aposentar:** a IA Groq (já morta), o painel do Apps Script e a publicação no Google Sheets, depois que a Luneta
   mostrar os leiloeiros. Antes de apagar, salve a aba "Triagem" (as suas decisões) e apague a aba "Acessos".
7. **A arrumação cabe em etapas pequenas:** primeiro limpar e corrigir os dados (zumbis, suspensos, tipo do bem), depois o
   exportador para a Luneta, depois a coleta diária incremental. Não é preciso reescrever o que funciona.

---

## 1. Visão geral

### 1.1 O que o sistema faz

O PBCV visita os sites dos leiloeiros, lê cada lote (imóvel, veículo, máquina...) e grava num banco SQLite
(`leiloes.db`). A cada rodada, compara com a anterior e registra o que **entrou**, o que **saiu** e o que **mudou**
(preço, situação, praça). Depois publica numa planilha do Google, que alimenta um painel web.

O caminho de uma rodada:

```
juntas comerciais (26 UFs)  ──►  base de leiloeiros (2.813)  ──►  catálogo de sites (823 domínios)
                                                                         │
           expansao_br/rodar_mensal.py  (orquestrador, 8 passos)          ▼
             passo 5: expansao_br/coletar_paralelo.py  ──► 10 processos, 1 por domínio
                         └─► coletar_br.py --fonte X  (confere catálogo e robots)
                               └─► coletar.py::rodar_coleta  ──► adapter da plataforma ──► Lote
                                     └─► core/db.py::Banco.sincronizar_fonte  (grava + diff + eventos)
             passo 7: expansao_br/geo_lotes.py  (cidade/UF pelo texto, coordenadas)  ──► tabela geo_lote
             passo 8: sheets_br.py → sheets.py  ──► Google Sheets  ──► appscript/ (painel "Mesa de Leilões")
```

### 1.2 O tamanho

| Pasta | Arquivos `.py` | Linhas | Parte que é comentário/documentação | Para que serve |
|---|---:|---:|---:|---|
| `core/` | 9 | 3,1 mil | 29% | núcleo: rede, modelo, banco, normalização |
| `adapters/` | 15 | 6,0 mil | 33% | as 14 plataformas originais (fase SP) |
| `adapters_uf/` (famílias) | 56 | 43,9 mil | **51%** | as plataformas da expansão nacional |
| `adapters_uf/sites/` | 118 | 58,5 mil | 32% | 117 sites com software próprio |
| `expansao_br/` | 272 | 53,9 mil | 19% | juntas, orquestrador, geo, sondas do mapeamento |
| `scripts/` | 26 | 6,8 mil | 20% | ferramentas da varredura |
| `recon/` | 125 | 11,2 mil | 9% | engenharia reversa (uso único) |
| raiz | 18 | 5,8 mil | 21% | `coletar.py`, `sheets.py`, testes, Groq |
| **total** | **645** | **~190 mil** | | |

O caminho que de fato coleta (`core/` + `adapters/` + `adapters_uf/` + `coletar*.py`) tem **cerca de 112 mil linhas**.
O resto é ferramenta de uso único, documentação e histórico. O repositório ocupa 1,8 GB (mais 734 MB do `.git`):
`bruto/` 664 MB, `docs/` 428 MB (evidências do mapeamento), `expansao_br/` 351 MB, `recon/` 153 MB.

### 1.3 A arquitetura em quatro peças

- **Modelo único** (`core/modelo.py::Lote`): todo site, qualquer que seja o software, vira o mesmo objeto, com os mesmos
  campos e a mesma regra de preço (`valor_lance_minimo` é sempre o menor valor de praça publicado).
- **Adapter por plataforma** (`adapters/base.py::Adapter`): uma classe por software. `adapters_uf/soleon.py` atende 100
  domínios, `adapters_uf/leilaopro.py` 103, `adapters/apiengine.py` 65. O registro é feito pelo `import`
  (`adapters/base.py::registrar` e `adapters/__init__.py::_mapa`).
- **Banco com histórico** (`core/db.py`): tabelas `lote`, `evento` (ENTROU, SAIU, PRECO, SITUACAO, PRACA), `coleta` e
  `coleta_fonte` (saúde por site em cada rodada).
- **Store bruto** (`core/bruto.py`): cada resposta HTTP fica gravada em `bruto/<domínio>/`, o que permite reprocessar
  tudo sem rede (`coletar.py --reprocessar`).

---

## 2. O que é bom e deve ser mantido

### 2.1 Decisões de confiabilidade (o coração do sistema)

| Decisão | Onde | Por que importa para a Luneta |
|---|---|---|
| **"Não sei" nunca vira zero.** Campo não lido é `None`. | `core/modelo.py` (cabeçalho) | um imóvel sem preço não aparece como "de graça" |
| **Desconto falso é proibido.** Avaliação só vale se passa do mínimo em mais de 1%. | adapters + `core/modelo.py::Lote.desconto_pct` | evita deságio de 0% em fontes inteiras |
| **Falha nunca vira "saiu".** Se o adapter quebra, nada é marcado como saído. | `core/db.py::Banco.sincronizar_fonte` | sem isso, um bug viraria centenas de "imóvel vendido" |
| **Queda acima de 60% é suspeita** e suprime as saídas. | mesmo lugar (`queda_maxima_pct`) | site devolvendo meia página não apaga o estoque |
| **Coleta incompleta se declara** (`coleta_completa = False`). | `adapters/base.py::Adapter._incompleta` (173 adapters usam) | um erro 429 no meio da paginação não gera "saiu" |
| **Corpo inválido falha alto.** HTML corrompido levanta erro em vez de devolver lista vazia. | `core/http.py::validar_corpo` | "zero resultados em silêncio" é o pior defeito de um coletor |
| **Recusa a rodar sem brotli/zstd.** | `core/http.py::_verificar_dependencias` | sem eles o site responde comprimido e o parser lê lixo |
| **Charset declarado vence o chute.** | `core/http.py::_escolher_encoding` | acentos corretos em sites antigos |
| **429 tem espera própria** (15 s, 30 s...) e `Retry-After` tem teto. | `core/http.py::Cliente.buscar` | o robô não insiste nem trava |
| **Lote de teste/simulação é descartado.** | `core/normaliza.py::eh_teste`, `eh_leilao_teste` | "LEILÃO SIMULAÇÃO" de R$ 500 mil não vira oportunidade |
| **Matrícula, vara e processo só com rótulo**; CNJ com dígito verificador. | `core/normaliza.py::matricula`, `vara`, `processo_cnj` | a matrícula é a chave de deduplicação com a Caixa |
| **Lote com problema é marcado** (`problemas`) e fica fora do ranking. | `core/modelo.py::Lote.validar` e `para_dict` | |

### 2.2 Conduta do robô

- Ele **se apresenta como robô** (`core/http.py`, constante `UA = "PBCV-Coletor/1.0 ... respeita robots.txt"`). A troca do
  antigo disfarce de Chrome foi medida antes (`varredura/MEDICAO_UA.json`).
- **robots.txt pela regra certa** (RFC 9309: vence a regra mais longa, `Allow` desempata), por caminho e para todo host
  visitado, inclusive API e CDN (`core/http.py::RobotsTxt` e `Cliente._conferir_robots`). Domínio sem sondagem é
  proibido por padrão (`coletar_br.py::conferir_robots`).
- **Um pedido por vez por site**, com intervalo de 1,2 s e o `Crawl-delay` do site honrado até 60 s
  (`core/http.py::LimitadorPorHost`).
- **Nunca burla bloqueio.** Cloudflare, CAPTCHA, login e "403 só para robô" viram status `BLOQUEADO`, com 3 momentos de
  evidência (`varredura/RECUSA_ROBO.json`). São 202 domínios bloqueados; o maior grupo (81) é o desafio Cloudflare,
  com destaque para a família Superbid.

### 2.3 Adapters por plataforma e o método de prova

- **823 domínios em 188 plataformas.** As 5 maiores famílias por número de domínios (leilaopro 103, soleon 100,
  apiengine 65, superbid 61, suporteleiloes 44) somam 373 domínios.
- **Nada entra sem prova.** `scripts/provar_adapter.py` roda o adapter contra o site vivo e reprova por 10 critérios
  (ids repetidos, mais de 10% sem título, lote de teste, avaliação menor que o lance em mais de 20%, data de abertura
  gravada como encerramento, espelho de outro site...). `adapters_uf/__init__.py::conferir_catalogo` impede que dois
  adapters disputem o mesmo domínio.
- **Auditoria adversarial**: a revisão independente achou defeito em 12 de 13 adapters de uma onda, e todos foram
  corrigidos antes de entrar (`adapters_uf/__init__.py`, comentários da "cauda longa").
- **Reprocessamento offline**: `coletar.py --reprocessar` relê o `bruto/` com o código novo e mostra, campo a campo, o
  que mudaria, sem gravar e sem gerar "saiu" (`coletar.py::reprocessar`).

### 2.4 Registro do que foi decidido

`docs/DECISOES.md`, `docs/ESTADO.md` e `varredura/MUDANCAS_COMPARTILHADAS.md` explicam cada escolha com o número que a
sustentou. É raro e valioso: dá para saber **por que** cada regra existe antes de mexer nela.

### 2.5 Testes que funcionam (rodados nesta auditoria, offline)

| Teste | Resultado |
|---|---|
| `testar_nucleo.py`, seções 1 a 8 (moeda, datas, CNJ, endereço, classificação, anti-brotli, banco e diff) | todas passaram |
| `testar_pesquisa.py` (busca local, com banco de brinquedo) | "tudo passou" |
| `expansao_br/testar_geo_lotes.py` | 126 verificações ok; parou por falta do `pyarrow` (ver 3.2-M7) |

---

## 3. O que precisa melhorar, por prioridade

### 3.1 Prioridade ALTA

#### A1. Lotes "zumbis": a trava de segurança se prende e não solta mais

**O que acontece.** A trava "queda acima de 60% é suspeita" (`core/db.py::Banco.sincronizar_fonte`) compara a coleta
nova com **todos os lotes ativos** da fonte. Quando o site encolhe de verdade (ou o adapter passa a ler menos), a coleta
seguinte é suspeita, os lotes antigos ficam ativos, e a próxima comparação é de novo contra eles: **a trava nunca mais
solta.** A única saída prevista (`_venceu`, "a data do lote já passou") não serve para lote **sem data**.

**Evidência.**

- `fidalgoleiloes.com.br`, o 1º do ranking de imóveis ativos (1.339): seis coletas seguidas `suspeita` (38 a 49 lotes
  cada) desde 23/09. Dos 1.339, **1.176 foram vistos pela última vez em 14/08** e não têm nenhuma data.
- **36 fontes** estão com as 3 últimas coletas `suspeita`; somam 2.440 imóveis ativos, dos quais 1.747 não são vistos
  desde antes de 20/09.
- Na base toda, **3.976 imóveis ativos** não são vistos desde antes de 20/09 (1.728 deles sem data nenhuma).
- Fontes cuja última coleta deu erro (90) mantêm 1.609 imóveis ativos, por desenho ("falha nunca vira saiu"), o que é
  certo como trava, mas deixa o lote envelhecer sem aviso.

**Correção sugerida (pequena).** (1) Comparar a coleta nova com os lotes vistos **na coleta anterior** da fonte, e não
com todos os ativos; (2) aceitar o novo patamar depois de 3 coletas suspeitas com contagem estável (±20%); (3) criar a
noção de "não confirmado": lote não visto em N coletas da sua fonte (ou há mais de 14 dias) sai da exportação, sem gerar
evento SAIU. Tudo em `core/db.py`.

#### A2. "Ativo" não quer dizer "à venda"

**Evidência.** Situação dos 35.333 imóveis com `ativo=1`: aberto 24.355 · **suspenso 6.149** · agendado 2.343 ·
**encerrado 1.437** · desconhecida 1.037 · vendido 12.

- Os suspensos vêm quase todos da família ApiEngine (`legisleiloes` 963, `sublimeleiloes` 506, `destakleiloes` 501,
  `francoleiloes` 382...), com praças de **2019 a 2024**. O motivo está em `adapters/apiengine.py` (linhas 229 e 254):
  o filtro `apenas_abertos` só descarta `encerrado` e `vendido`; `suspenso` passa.
- `soleiloes.com.br` (leilaopro, 2º do ranking com 1.137) tem **1.120 encerrados** marcados ativos.
- Contando só o que foi visto na última rodada e está aberto, agendado ou com situação desconhecida, sobram
  **23.985 imóveis em 496 fontes**. É esse o número honesto para a Luneta e para o relatório por leiloeiro.

**Correção.** No exportador, mandar só lote visto na rodada e com situação aberta/agendada (o contrato já trata
`suspenso` e `encerrado` como "sai do site"). No PBCV, incluir `suspenso` no filtro de `apenas_abertos` dos adapters
ApiEngine (ou marcar como encerrado o suspenso cuja última praça passou há mais de 1 ano).

#### A3. Segredos dentro do repositório

- `google_credentials.json`: chave privada da conta de serviço do Google (dá escrita na planilha).
- `config_groq.py`: chave da API da Groq. É usada só por `analyzer_groq.py`/`main_groq.py`, que **nem rodam** (ver 4.3).
- Os dois estão no único commit do histórico (`d73d830b`): apagar o arquivo não apaga do histórico.
- O `.gitignore` original os excluía; subiram de propósito com `git add -f` (`MANIFESTO.md`).

**O que fazer.** Revogar as duas chaves (Groq: painel da Groq → API Keys; Google: Console → IAM → Contas de serviço →
Chaves). Depois, tirar os dois arquivos do repositório. Com as chaves revogadas, reescrever o histórico vira opcional.

#### A4. LGPD: nomes de partes e dados de pessoas

| Onde | O que há | Medido |
|---|---|---|
| `lote.executado`, `lote.exequente` | nome das partes do processo | 6.087 e 6.756 lotes ativos preenchidos |
| `coletar.py::exportar` (`--exportar x.xlsx`) | `SELECT *` exporta tudo, **inclusive** `executado` e `exequente` | o arquivo `leiloes_2026-08-13.xlsx`, na raiz do repositório, tem as duas colunas em 12.570 linhas |
| `sheets.py` (abas `Todos` e `Históricos`), `planilha.py`, painel (`appscript/Codigo.gs::carregarLotes`) | coluna **Comitente** | 17.124 imóveis com comitente; numa amostra de 12 comitentes sem palavra de empresa, banco ou órgão, 2 eram nomes de pessoa física |
| `descricao` e `titulo` | texto do edital, às vezes com nome de parte | 1.473 imóveis ativos com "executad..." na descrição |
| painel (`appscript/Index.html`, perto da linha 3659; `Codigo.gs::registrarAcesso`) | grava IP, cidade, provedor e conta Google de quem abre o painel, consultando `ipapi.co` e `api.ipify.org` | dado pessoal de quem visita, enviado a serviços de terceiros |

O lado bom: a planilha **não** publica `executado` nem `exequente`.

**Para a Luneta** (contrato `base/leiloeiros/CONTRATO.md` §5): nunca mandar `executado`/`exequente`; mandar comitente
só se for pessoa jurídica (banco, vara, órgão, empresa), senão `null`; processo só com o número CNJ; tirar nomes da
descrição na origem sempre que possível (a Luneta mascara, mas a máscara é heurística).

#### A5. A cadência mensal não acompanha o mercado, e a rodada agendada falhou sem aviso

- **Meia-vida do estoque: 8 dias.** Medido pelo próprio projeto (`docs/pesquisa/DIAGNOSTICO.md` §2): do que estava
  aberto no dia da coleta, 66% ainda está aberto em 3 dias, 51% em 8 e **15% em 30**. Entre duas coletas com 5 a 9 dias
  de intervalo, 25% dos lotes são novos e 12% saíram (medido nos eventos; parte das entradas vem de correções de
  adapter feitas no período).
- **A rodada de 01/10 parou.** A tarefa `PBCV-Leiloes-Mensal` começou às 03:00 e o último arquivo foi gravado às
  **03:27:14**: 246 de 823 domínios (de `123leiloes` a `falleirosleiloes`), 10 coletas ficaram com status `rodando`
  para sempre, e o `EXECUCAO_MENSAL.json` parou no passo 4. O log (`EXECUCAO_MENSAL.log`) está **vazio**: o Python guarda
  a saída em buffer quando ela vai para arquivo e perde tudo se o processo morre. A causa provável é o PC ter suspendido
  (27 minutos é próximo do tempo padrão de suspensão do Windows), mas não dá para provar daqui.
- A tarefa foi criada sem as opções que a tornariam confiável: `expansao_br/agendar_mensal.py` chama
  `schtasks /create /sc monthly ...` sem `/RU` (só roda com o usuário logado), sem "acordar o computador" e sem
  "executar assim que possível se a hora foi perdida".

#### A6. Os testes não protegem mais a maior parte do código

- **`testar_regressao.py`: 30 de 30 fixtures vermelhas.** 9 levantam `FaltaNoBruto` (o adapter passou a pedir uma página
  que a gravação não tem: `dantasleiloes`, `euamoleilao`, `jrfleiloes`, `silveiraleiloes`...), e as outras divergem em
  `problemas` (92 lotes, mudança intencional) e em campos reais (`vara`, `area_m2`, `situacao`, `tipo_bem`). Uma suíte
  sempre vermelha não avisa mais nada.
- **As fixtures cobrem só as 14 plataformas originais** (30 sites da fase SP). As 174 plataformas da expansão (712 dos
  823 domínios, 87%) não têm nenhum teste offline; foram provadas uma vez contra o site vivo.
- **`testar_nucleo.py` vai à rede na seção 9** (coleta real num site Superbid), apesar de o README chamá-lo de offline. A
  Superbid hoje bloqueia o robô (desafio Cloudflare), então essa seção falha sempre. Nesta auditoria a tentativa foi
  barrada pelo proxy do ambiente: nenhum pedido chegou ao site.
- **Não há teste automático a cada mudança** (nenhuma integração contínua).
- **O canário de mudança de layout cobre 17 de 192 plataformas** (`canario_br.py::cobertura`), não roda dentro da
  rodada mensal e a linha de base (`canario_base.json`) é de 25/07, com 26 fontes.

### 3.2 Prioridade MÉDIA

#### M1. Classificação do tipo do bem (`core/normaliza.py::tipo_bem`)

A função decide por palavras-chave, nesta ordem: imóvel urbano inequívoco → rural → imóvel → veículo → diversos. Erros
medidos nos lotes ativos:

| Erro | Quantidade | Exemplo (tipo de texto) | Causa |
|---|---:|---|---|
| máquina agrícola como **rural** | ~300 | "TRATOR AGRÍCOLA NEW HOLLAND..." | `agricol` está na regra de rural, que vem antes da de veículo |
| animais como **rural** | ~40 | "SEMOVENTES", "gado" | `semovente` e `gado` estão na regra de rural |
| veículo como **imóvel** | ~100 | "HONDA/CG 125", "FIAT/SIENA" | palavras como `comercial`, `residencial` ou `matrícula` no texto vencem a marca |
| box de guarda-volumes como **imóvel** | ~100 | "Box 3021A - 3m² BENS: TV, cafeteira..." (Fidalgo) | `m²` e "box" puxam para imóvel |
| imóvel como **desconhecido** | ~600 | "LOTE URBANO nº 2 da quadra 52..." (`grupolance` 361) | o adapter não passa o texto certo para a função |

Para a Luneta, "rural" vira imóvel: trator e boi apareceriam como fazenda. Somados, são ~1.100 lotes (3% dos imóveis).

Falta também o **subtipo** que o contrato exige (`apartamento`, `casa`, `terreno`, `comercial`, `rural`, `vaga`,
`outro`). Uma regra simples sobre título + categoria já separa: apartamento ~8,8 mil, terreno ~7,7 mil, casa ~7,4 mil,
comercial ~2,9 mil, rural ~2,7 mil, vaga ~0,8 mil, outro ~5,2 mil (estimativa sobre os 35,3 mil).

#### M2. Endereço e UF

- **11.136 imóveis ativos sem UF** em `lote.uf` (31%), e só 27 deles têm cidade. A maior parte vem de poucas famílias:
  `soleiloes` 1.132, `legisleiloes` 1.084, `kleiloes` 676, `tonialleiloes` 610, `sublimeleiloes` 579... O
  `docs/ESTADO.md` já mediu os piores casos: `leilaoonline` 0,2% de UF, `leilaopro` 16%, `soleon` 36%.
- **A tabela `geo_lote` já recupera metade**: lê o par cidade/UF no título e na descrição e só aceita o que o IBGE
  confirma (`expansao_br/geo_lotes.py`, regras R1 e R2, com autochecagem de precisão ≥ 97%). Com ela, 5.842 dos 11.136
  ganham UF, e o total com UF vai a **30.039 de 35.333 (85%)**. Restam ~5,3 mil, muitos com o local no título
  ("IMÓVEL EM CEILÂNDIA/DF") que a `geo_lote` ainda não processou (ela roda depois da coleta e pode estar defasada).
- `core/normaliza.py::cidade_uf` é cuidadosa (o histórico de correções está no próprio código: "Rio de Janeiro" virando
  "Janeiro", "SE" de Sergipe colidindo com o pronome "se").
- Há **duas tabelas de municípios do IBGE**: `expansao_br/dados/municipios_ibge.json` (usada pela `geo_lote`) e
  `expansao_br/bruto_juntas/RR/ibge_municipios.json.gz` (usada por `pesquisa/geo.py`), esta escondida dentro do bruto da
  junta de Roraima.
- Atenção ao contrato: ele diz **"nunca geocodifique no coletor"**. A fase 2 da `geo_lote` (endereço → ponto pelo CNEFE,
  precisões `endereco` e `cep`) não deve virar `lat`/`lon` na exportação; só o ponto publicado pela própria fonte
  (precisão `fonte`, 2.689 imóveis).

#### M3. Avaliação faltando

Avaliação existe em 51% dos imóveis ativos. Parte é a fonte que não publica (e aí `null` é o certo), parte pode ser
leitura que falta. Um teste barato (procurar "Avaliação ... R$" nos 40 primeiros arquivos do `bruto/` de cada fonte com
menos de 30% de avaliação) achou o rótulo em fontes grandes:

| Fonte | Imóveis | Com avaliação | Arquivos com "Avaliação ... R$" |
|---|---:|---:|---:|
| `viannaleiloes.com.br` | 168 | 0% | 39 de 40 |
| `tonialleiloes.com.br` (leilaopro) | 617 | 0% | 28 de 40 |
| `leilaobrasil.com.br` | 220 | 0% | 26 de 40 |
| `fidalgoleiloes.com.br` | 1.339 | 2% | 24 de 40 |
| `mercadoleiloes.com.br` | 75 | 0% | 19 de 40 |
| `jeleiloes.com.br` | 201 | 0% | 14 de 40 |

É **indício, não prova**: o rótulo pode estar num lote de veículo, ou ser o mesmo valor do lance (e aí a regra do
"desconto falso" o descarta de propósito). Mas ~8 mil imóveis estão em fontes com esse indício, e conferir custa pouco
(`coletar.py --reprocessar --fonte X` depois de ajustar o adapter).

#### M4. Lote que sai e volta perde o histórico

`core/db.py::Banco._inserir` usa `INSERT OR REPLACE`. Quando um lote marcado como saído reaparece, ele é tratado como
novo: ganha outro evento ENTROU e **perde a data em que foi visto pela primeira vez** (`visto_primeiro_em`). Há 34.748
lotes com mais de um ENTROU. Para a Luneta isso significa alerta falso de "imóvel novo" e "na base desde" errado.

#### M5. Relógio e fuso horário

Há 82 chamadas a `datetime.now()` em `core/` e nos adapters, sem fuso. A situação de um lote sem rótulo depende da hora
(`core/normaliza.py::situacao`, última linha), e a trava `_venceu` compara texto de data com a hora local. Rodando fora
do Brasil (GitHub Actions roda em UTC), tudo se desloca 3 horas. O contrato da Luneta exige data com fuso
(`2026-11-10T14:00:00-03:00`). Correção: uma função única `agora()` em `America/Sao_Paulo` e o fuso acrescentado na
exportação.

#### M6. Desempenho

- **Não há coleta incremental.** Toda rodada baixa a página de detalhe de todo lote, mudou ou não. Uma rodada completa
  faz **~64 mil pedidos e baixa ~7,6 GB** (soma dos manifestos do `bruto/`). A família leilaopro sozinha é 42% dos bytes
  (~560 KB por lote).
- **Desperdício pontual:** `plazaleiloes.com.br` faz 2.540 pedidos (2.436 páginas de detalhe) para guardar 70 lotes: lê o
  detalhe de lotes encerrados e só depois descarta. Foi o domínio mais lento da rodada (até 131 min).
- **Cada domínio abre um processo que carrega o catálogo inteiro** (~112 mil linhas): 2,6 s por domínio, 823 vezes.
- **`core/db.py::Banco._atualizar` reescreve a linha inteira** de todo lote visto, mesmo sem mudança.
- **`core/http.py::LimitadorPorHost.esperar` dorme dentro de uma trava global**: inofensivo hoje (um processo por
  domínio), mas impede paralelizar com threads no futuro.

#### M7. Organização do repositório

- **Três gerações de coletor convivem**: `coletar.py` (o original, sequencial), `coletar_br.py` (um invólucro que só
  acrescenta o catálogo da expansão e a checagem de robots) e `expansao_br/coletar_paralelo.py` +
  `expansao_br/rodar_mensal.py` (os que rodam de fato). Os invólucros existem porque a expansão foi feita em "modo
  aditivo" (proibido editar arquivo antigo), regra registrada em `docs/DECISOES.md`. O mesmo vale para `sheets_br.py`,
  `canario_br.py` e `auditar_cobertura.py`, cada um "estendendo" o antigo por mutação de variável global.
- **Raiz poluída**: 9 `.log`, 11 bancos de teste (`teste_*.db`, 24 MB), 7 `.xlsx` (exportações e listas de leiloeiros),
  5 roteiros de prompt antigos (`MISSAO_VARREDURA_COMPLETA.md`, `PROMPT_VARREDURA.md`, `PROXIMA_JANELA.md`,
  `PROXIMA_RODADA.md`, `CLAUDE.md`), `PLANO_MONETIZACAO.html` (213 KB), `.demo_*.json`, `auditoria.json`. No repositório
  inteiro há 113 arquivos `.log`.
- **Ferramentas de uso único misturadas ao código vivo**: `recon/` (125 scripts, `c19_*`, `c20_*`, `clusterB2.py`...),
  `expansao_br/mapeamento/sondas/` (~170 scripts), 26 scripts da varredura em `scripts/`.
- **`appscript/` tem 8 cópias antigas** (`Index.antes-do-mapa.html`, `Codigo.antes-do-geo.gs`...), 1,4 MB.
- **Não há `requirements.txt`.** O README lista 7 pacotes, mas o código usa também `gspread` e `google-auth` (planilha),
  `pyarrow` (geo, CNEFE), `pdfplumber` (`gerar_planilha.py`), `httpx`, `tenacity` e `rich` (Groq).
- **Docstrings-diário**: em `adapters_uf/*.py`, 51% das linhas são texto. O conteúdo é bom (é a memória de cada armadilha),
  mas torna os arquivos longos de ler; o lugar dessa narrativa é um `.md` por plataforma, com o docstring curto.

#### M8. Dependência da planilha e do Google

- `sheets.py` apaga a aba (`aba.clear()`) antes de escrever. Publicar da pasta errada ou com o banco vazio **apaga a
  planilha**: por isso a tarefa agendada não publica (`expansao_br/rodar_mensal.py`, comentário do cabeçalho).
- A Drive API está desligada no projeto do Google; a planilha só abre pelo ID (`docs/ESTADO.md`, "Armadilhas novas").
- Acoplamentos que impedem apagar o `sheets.py` sem cuidado: `planilha.py` importa `sheets.CONSULTAS`;
  `expansao_br/geo_lotes.py` importa `sheets.AINDA_VALE`; a `geo_lote` "simula o mapa do painel"
  (`localizar()` do `appscript/Index.html`).

#### M9. Paralelismo por domínio, mas não por servidor

`expansao_br/coletar_paralelo.py` roda 10 domínios ao mesmo tempo, um processo cada. A promessa do docstring ("recusa
dois trabalhadores no mesmo host") hoje não faz nada: `_colidem_no_host` sempre devolve vazio. Domínios da mesma
plataforma white-label (100 da soleon, 103 da leilaopro) provavelmente estão no mesmo servidor e podem ser coletados 10
ao mesmo tempo. Cada processo também abre sua própria linha em `coleta` (são 7.221), então não existe o registro de uma
"rodada" inteira.

#### M10. Monitoramento passivo

Existe medição (status por fonte em `coleta_fonte`, `expansao_br/aceite_fase5.py`, ledgers JSON), mas **nada avisa
ninguém**. Exemplos: `realizaleiloes.com.br` caiu de 5.014 lotes para 0 em 24/09 e ficou só como `suspeita`; a rodada de
01/10 morreu e passou quase um mês sem que ninguém soubesse. Detalhes e proposta no plano de atualização.

### 3.3 Prioridade BAIXA

- **B1. Código parecido entre sites avulsos.** Funções com o mesmo nome e papel se repetem (`_situacao` em 67 arquivos,
  `_data` em 39, `_txt` em 33, `_num` em 28). É esperado em sites diferentes e não é urgente; extraia um utilitário comum
  só quando mexer no adapter. O núcleo já é reaproveitado: `N.moeda` em 125 adapters, `N.tipo_bem` em 130,
  `N.situacao` em 97.
- **B2. TLS:** quando o certificado do site é inválido, `core/http.py::Cliente.buscar` repete sem verificar
  (`verify=False`). Aceitável para página pública, mas convém registrar quais domínios precisam disso.
- **B3. Eventos que não existem:** o tipo `DOCUMENTO` está no esquema e nunca é emitido (0 eventos); a 3ª praça (58
  imóveis) não tem data própria; `hash_conteudo` não inclui as datas das praças.
- **B4. Peças só de Windows:** `expansao_br/agendar_mensal.py` e `rodar_mensal.cmd`; `gerar_planilha.py` tem caminhos
  absolutos de `C:\Users\...`. O resto do código rodou sem mudança no Linux.

---

## 4. O que remover ou aposentar, agora que o destino é a Luneta

| Peça | O que faz hoje | Ainda serve? | Recomendação | Cuidado antes |
|---|---|---|---|---|
| **IA Groq** (`config_groq.py`, `analyzer_groq.py`, `main_groq.py`) | era um capturador "V4" com IA; não está no caminho da coleta (provado por `scripts/auditar_final.py`, checagem 7) | **não**: `main_groq.py` importa `config`, `analyzer`, `exporter`, `link_extractor` e `scraper`, módulos que **não existem** no repositório. Não roda. | **apagar já** | revogar a chave da Groq |
| **Publicação no Google Sheets** (`sheets.py`, `sheets_br.py`) | abas Oportunidades, Todos, Históricos, Entraram, Saíram, Mudou de preço, Fontes; colunas de retorno financeiro | só como visão interna do dono. A Luneta faz busca, mapa, tags e relatório por leiloeiro | **aposentar** depois que a Luneta mostrar os leiloeiros | mover `AINDA_VALE` e `CONSULTAS` para um módulo próprio (`geo_lotes.py` e `planilha.py` dependem deles); revogar a chave do Google |
| **Painel Apps Script** (`appscript/`) | "Mesa de Leilões": lê a aba Todos, mostra mapa e filtros, e grava a triagem (Favoritar/Descartar, valor-alvo, nota) na aba "Triagem"; registra acessos com IP | é a ferramenta de triagem pessoal do dono; a Luneta não tem triagem privada | **aposentar** junto com a planilha | **exportar a aba "Triagem"** (as suas decisões não se regeneram); **apagar a aba "Acessos"** (IPs de visitantes) |
| `planilha.py` (`.xlsx` local) | gera as mesmas abas num arquivo | útil para quem quer analisar no Excel | manter como opcional | trocar o import de `sheets` |
| `coletar.py --exportar` | exporta `SELECT *` | sim, mas com colunas de parte | manter **sem** `executado`/`exequente` | apagar os `.xlsx` antigos da raiz |
| `gerar_planilha.py` | lia o PDF da JUCESP (caminhos fixos do Windows) | não: SP vem do VRE desde 07/09 (`docs/DECISOES.md`) | apagar | |
| `core/retorno.py` | modelo de fluxo de caixa (TIR, retorno em 12 meses) | não é usado pela exportação | manter como biblioteca (pode alimentar uma calculadora na Luneta) | |
| `pesquisa/` | busca local no banco (`py -m pesquisa buscar`) | útil para o dono no terminal, barato de manter | manter | |
| `recon/`, `expansao_br/mapeamento/`, `scripts/` da varredura, prompts antigos | ferramentas e roteiros de uso único; a varredura terminou (`varredura/AUDITORIA_FINAL.md`: 11 de 11 PASSA) | como histórico | mover para `arquivo/` | manter `provar_adapter.py`, `registrar_sites.py`, `aposentar_fonte.py` e `verificar_varredura.py`, que servem para adapter novo |
| coletores das juntas (`expansao_br/coletar_junta_*.py`, `unificar_base.py`) | cadastro oficial dos leiloeiros (nome, matrícula, UF) | **sim**: dá o nome e a matrícula que o contrato pede | manter, mensal | |
| canário (`core/canario.py`, `canario.py`, `canario_br.py`) | avisa quando um site muda o layout | **sim** | manter e ligar na rodada (ver plano) | |

---

## 5. O caminho até a Luneta: o que o PBCV tem e o que o contrato pede

O contrato é `luneta-de-leiloes/base/leiloeiros/CONTRATO.md` (versão 1). Outra frente está escrevendo o exportador; aqui
fica só o que o lado do PBCV precisa garantir.

| Contrato | No PBCV | Situação |
|---|---|---|
| `id` = `<slug>:<id do lote>` (só `a-z0-9`, até 40) | `lote.id_externo` | **ok**: medido, 0 ids longos, 0 vazios e 0 colisões depois de normalizar |
| `leiloeiro.slug` estável | domínio | **precisa de tabela fixa**: o slug "ingênuo" do domínio colide em 5 casos (`jmleiloes.com.br` × `jmleiloes.leilao.br`, `hastapublica.com.br` × `.lel.br`...) |
| `leiloeiro.nome`, `matricula_junta` | `expansao_br/leiloeiros_br.json` (pelo site) e `varredura/dominios.json` | 419 das 566 fontes com imóvel casam pelo site; 63 têm mais de um leiloeiro |
| `situacao` | `lote.situacao` | mapear: aberto/agendado → `ativo`; suspenso; encerrado; vendido. Desconhecida só com praça futura |
| `tipo` (apartamento, casa...) | só `imovel`/`rural` + `categoria` (69% preenchida) | **falta o subtipo**: derivar de título + categoria (seção M1) |
| `endereco.cidade` e `uf` (obrigatórios) | `lote.cidade/uf`, completados por `geo_lote` | 85% com UF usando as duas; lote sem cidade e UF é recusado |
| `lat`/`lon` | `lote.latitude` (5%) e `geo_lote` | **só precisão `fonte`**; nunca o geocode do CNEFE |
| `pracas[]` (número, data, valor) | `data_primeira_praca` + `valor_lance_inicial`; `data_segunda_praca` + `valor_lance_minimo` | montável; 2ª praça com data em 44% |
| `praca_atual` | `lote.praca_atual` | nulo em 52%: deixar `null` e a Luneta deduz pelas datas |
| `modalidade`, `natureza` | `lote.modalidade` (judicial, extrajudicial, venda_direta, desconhecida 31%) | mapear; desconhecida → `natureza: null` |
| `processo` | `numero_processo` (CNJ validado) | ok, só o número |
| `comitente` | `lote.comitente` | só pessoa jurídica; senão `null` |
| `documentos[]` | `lote.documentos` (edital, matricula, avaliacao, iptu, processo, condominio, outro) | mapear tipos (iptu/condominio → `outro`) |
| `fotos[]` | `lote.imagens` (71%) | ok |
| `registro_imovel.matricula`, `cartorio` | `matricula` (30%); cartório **não é extraído** | o cartório ajuda a casar com a Caixa: vale extrair nos adapters grandes |
| `ocupacao`, `debitos`, `pagamento`, `quartos`, `vagas`, áreas separadas | **não existem no modelo** | as tags correspondentes da Luneta não vão disparar para leiloeiros; dá para mandar a descrição completa, que as regras de tag leem |
| linha `coleta` (`completa`, `saude`) | `coleta_fonte.status` | `completa: true` **só** com status `ok` na rodada; `incompleta` e `suspeita` → `parcial`; erro de robots/403/429/Cloudflare → `bloqueado`; outro erro → `quebrado` |
| datas com fuso | datas sem fuso | acrescentar `-03:00` |
| LGPD | ver A4 | sem partes, sem comitente pessoa física |

Regra de ouro para o exportador: **mandar só o lote visto na rodada atual da sua fonte**. É isso que evita levar os
zumbis (A1) para o site.

---

## 6. Readequação: estrutura alvo e etapas

### 6.1 Princípios

- **Não reescrever o que funciona.** O núcleo e os adapters ficam como estão; muda o lugar, a amarração e os pontos
  medidos acima.
- **Cada etapa tem uma prova de que nada quebrou**: o catálogo continua com 823 domínios
  (`adapters_uf.conferir_catalogo()`), `coletar.py --reprocessar` (sem `--gravar`) não mostra diferença inesperada, e os
  testes offline passam.
- **A regra do "modo aditivo" acabou** (a missão terminou). Ela foi útil para não quebrar SP durante a expansão, mas hoje
  é a causa dos invólucros e das mutações de variável global. As mudanças passam a ser feitas no lugar certo, com teste.

### 6.2 Estrutura alvo

```
luneta-base/
├── pbcv/                         ← o pacote único (era core/, adapters/, adapters_uf/)
│   ├── nucleo/                   core/ sem mudança de lógica (http, modelo, normaliza, db, bruto, canario, htmlparse)
│   ├── plataformas/              adapters/*.py + adapters_uf/*.py (as famílias)
│   ├── sites/                    adapters_uf/sites/*.py (os 117 avulsos)
│   ├── catalogo.py               registro automático + conferir_catalogo() + fontes.csv (slug, faixa A/B/C, plataforma)
│   ├── coleta.py                 rodar_coleta + reprocessar (de coletar.py) + paralelo (de coletar_paralelo.py)
│   ├── saida_luneta.py           exportador JSONL do contrato (a outra frente) + envio ao branch
│   ├── saude.py                  canário + aceite + relatório de saúde + alerta
│   ├── juntas/                   expansao_br/coletar_junta_*.py + unificar_base.py
│   └── geo/                      geo_br.py, geo_lotes.py, geo_endereco.py (sem dependência do sheets/painel)
├── pbcv.py                       CLI única: coletar --faixa A | reprocessar | exportar-luneta | saude | juntas
├── dados/                        municipios_ibge.json (uma tabela só), fontes.csv
├── testes/                       pytest + fixtures (inclusive das plataformas da expansão)
├── docs/                         README, ESTADO, DECISOES, mapas/<plataforma>.md (a narrativa dos docstrings)
├── arquivo/                      recon/, sondas, scripts da varredura, prompts antigos, appscript/, Groq (ou apagar)
├── requirements.txt
└── .gitignore                    bancos, logs, bruto/, xlsx e segredos fora do git (de verdade)
```

### 6.3 Etapas, da mais segura para a mais trabalhosa

| Etapa | O que muda | Tamanho | Como provar |
|---|---|---|---|
| **0. Segurança** | revogar as chaves da Groq e do Google; tirar `config_groq.py`, `google_credentials.json` e os `.xlsx` com partes do repositório; criar `requirements.txt` | horas | `git grep` sem chave; projeto importa com o ambiente limpo |
| **1. Limpeza sem mudar comportamento** | mover para `arquivo/`: logs, `teste_*.db`, prompts antigos, `recon/`, sondas, scripts de uso único, cópias `*.antes-*` do painel, `gerar_planilha.py`; apagar a Groq | 1 dia | catálogo com 823 domínios; `testar_nucleo.py` 1–8 ok; reprocessar sem diferença |
| **2. Correções de dado de maior efeito** | zumbis e trava suspeita (A1); suspensos ApiEngine (A2); reentrada sem perder histórico (M4); `tipo_bem` (M1); `agora()` com fuso (M5); `executado`/`exequente` fora do `--exportar` | 2 a 4 dias | testes novos para cada regra; reprocessar mostra só as mudanças esperadas |
| **3. Saída para a Luneta** | exportador + validação + envio ao branch `coletas-dados` (outra frente escreve; aqui só as regras da seção 5) | (outra frente) | `validar.ts` sem erro; importação num banco de teste da Luneta |
| **4. Testes que protegem** | consertar a regressão (regravar as 30 fixtures, conscientemente); criar fixtures para as 20 plataformas com mais imóveis a partir do `bruto/`; tirar a seção de rede do `testar_nucleo.py`; teste offline rodando a cada push | 2 a 3 dias | suíte verde e rodando sozinha |
| **5. Coleta diária e incremental** | faixas A/B/C; assinatura de cartão e detalhe só do que mudou nas 5 maiores famílias; teto por plataforma; registro de rodada | 1 a 2 semanas | ver o plano de atualização |
| **6. Unificar os coletores** | `coletar.py` + `coletar_br.py` + `coletar_paralelo.py` + `rodar_mensal.py` viram `pbcv.py` com subcomandos; os nomes antigos ficam um ciclo como atalho | 2 dias | mesma saída nas duas formas por uma semana |
| **7. Mudar de pasta e aposentar a planilha** | `core/` → `pbcv/nucleo/` etc. (só `git mv` e imports); desligar Sheets e painel | 1 a 2 dias | catálogo, testes e reprocessar iguais |

O que **não** fazer: reescrever adapter que passa na prova; trocar o banco (SQLite atende bem este volume); trocar
`requests`/BeautifulSoup; voltar a UA de navegador para passar por bloqueio.

---

## Anexo: como cada número foi medido

- Base: `leiloes.db` aberto só para leitura (`file:...?mode=ro`). "Imóvel" = `tipo_bem in ('imovel','rural')`. "Vivo" =
  `ativo=1`, `visto_ultimo_em >= 2026-09-23` e `situacao in ('aberto','agendado','desconhecida')`.
- Pedidos, bytes e lotes por site: `bruto/<domínio>/manifesto.json` (campos `n_requisicoes`, `bytes_total`, `n_lotes`)
  da última coleta de cada um dos 827 domínios.
- Cloudflare: campo `http.server` de `expansao_br/juntas/SONDAGEM.json`.
- Testes: cópia do código em scratchpad, Python 3.13, `requests`, `beautifulsoup4`, `lxml`, `brotli`, `zstandard`,
  `pandas`, `openpyxl`; `TZ=America/Sao_Paulo`.
- Avaliação no bruto: regex `Avaliação ... R$ 0,00` sobre o texto sem tags dos 40 primeiros `.gz` de cada fonte (o
  repositório guarda até 2 MB por leiloeiro; o resto está no Release `dados-v1`).

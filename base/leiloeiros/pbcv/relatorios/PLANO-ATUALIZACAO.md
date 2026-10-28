# Plano de atualização do Coletor PBCV (de mensal para diário)

> Companheiro de `pbcv-AUDITORIA-CODIGO.md`. Medido em 27/10/2026 sobre o repositório `luneta-base` e a base
> `leiloes.db` (última coleta em 01/10/2026). Nada foi coletado na rede para escrever este plano: os números de custo
> vêm dos manifestos do `bruto/` e da tabela `coleta_fonte`. O que é estimativa está marcado como estimativa.
>
> Os comandos com `pbcv.py` ainda **não existem**: são a forma proposta, depois das etapas da auditoria (seção 6.3).

---

## Resumo

- **Hoje:** uma rodada por mês (dia 1, 03:00, no PC Windows do dono), de ~3,3 h, que visita os 823 sites, faz ~64 mil
  pedidos e baixa ~7,6 GB. A rodada de 01/10 parou sozinha às 03:27 e ninguém foi avisado.
- **Problema:** metade do estoque aberto encerra em 8 dias. Uma foto mensal chega à Luneta já vencida.
- **Proposta:** três faixas de sites.
  - **A, todo dia:** 173 sites com 90% dos imóveis vivos. São os 100 maiores mais 73 com imóveis indo para a 2ª praça.
  - **B, toda semana:** 120 sites com 8%.
  - **C, todo mês:** 203 sites com 2%, junto com as juntas comerciais.
- **Incremental:** ler a página de detalhe só do lote novo ou que mudou. Corta de 70% a 85% dos pedidos (estimativa) e
  faz a faixa A caber em 30 a 60 minutos por noite.
- **Onde:** começar já no PC do dono, que tem IP residencial brasileiro e custo zero, com ajustes de energia e um vigia do
  lado da Luneta que manda e-mail se a coleta não chegar. Testar o GitHub Actions por uma semana. Servidor pago só se
  as duas coisas falharem.
- **Saída:** o exportador (outra frente) gera o JSONL do contrato; o envio vai para o branch `coletas-dados` da Luneta,
  pelo mesmo caminho que a coleta das fichas da Caixa já usa.

---

## 1. Como roda hoje

### 1.1 Agenda e passos

- **Onde:** no PC Windows do dono, na pasta do projeto, com o Python 3.14 (`expansao_br/rodar_mensal.cmd`).
- **Quando:** tarefa `PBCV-Leiloes-Mensal` no Agendador de Tarefas, **dia 1 de cada mês às 03:00**, instalada por
  `expansao_br/agendar_mensal.py` em 07/09/2026.
- **O que roda:** `expansao_br/rodar_mensal.py`, **sem** `--publicar` (publicar na planilha é manual, porque `sheets.py`
  apaga a aba antes de escrever).

| Passo | O que faz | Duração na prova de 24/09 |
|---:|---|---:|
| 1 | confere o catálogo (domínio disputado por dois adapters aborta) | 0,7 s |
| 2 | baixa a relação de leiloeiros de 25 juntas (AL e PB ficam fora pelo robots.txt) | ~25 s (medido em 01/10) |
| 3 | unifica a base de leiloeiros (`unificar_base.py`) | 1,1 s |
| 4 | sonda domínios novos (`cruzar_dominios.py`, `sondar_dominios.py`) | 1,2 s |
| 5 | **coleta os 823 domínios**, 10 processos, 1 domínio por processo (`coletar_paralelo.py`) | **3 h 16 min** |
| 6 | critérios de aceite (`aceite_fase5.py`) | 4,9 s |
| 7 | cidade/UF e coordenadas (`geo_lotes.py`), desde 30/09 | (não medido na prova) |
| 8 | publicação no Google Sheets (só com `--publicar`) | 130 s |

**Total da prova manual de 24/09: 3,3 h (11.938 s)**, rc=0, 823 de 823 domínios executados. Somando o tempo de cada
domínio, uma rodada sequencial levaria cerca de 27 h; os 10 processos em paralelo é que a trazem para 3,3 h.

### 1.2 A rodada agendada de 01/10 não terminou

- Começou às 03:00. O último arquivo do projeto foi gravado às **03:27:14**. Foram coletados 246 de 823 domínios, de
  `123leiloes` a `falleirosleiloes`.
- 10 coletas ficaram com status `rodando` no banco, que são os 10 processos que estavam no ar. O
  `EXECUCAO_MENSAL.json` parou no passo 4.
- O log `EXECUCAO_MENSAL.log` está **vazio**: quando a saída vai para arquivo, o Python a guarda em buffer, e o buffer
  se perde quando o processo morre.
- A causa provável é a suspensão do PC (27 minutos fica perto do tempo padrão do Windows), mas não dá para provar
  daqui. A tarefa foi criada sem "executar com o usuário desconectado", sem "acordar o computador" e sem "executar
  assim que possível se a hora foi perdida".
- **Ninguém foi avisado**: não existe alerta.

### 1.3 Quanto custa, em pedidos e em tempo, por site

Uma rodada completa, somada nos manifestos da última coleta de cada domínio, dá:

- **~64 mil pedidos** e **~7,6 GB** baixados (tamanho descomprimido);
- **79 mil lotes** gravados, ou seja, cerca de 1 pedido por lote. Quase toda plataforma lê a página de detalhe de cada
  lote, toda vez;
- pedidos por domínio: **mediana 13**, 90% dos domínios com até 163 e 99% com até 1.164.

Os 10 domínios que mais pedem:

| Domínio | Plataforma | Pedidos | Lotes guardados | Observação |
|---|---|---:|---:|---|
| lancetotal.com.br | própria | 2.874 | 694 | 4 pedidos por lote (lote, anexos, atualização) |
| plazaleiloes.com.br | laravel_lotes | 2.540 | **70** | lê o detalhe de 2.436 lotes e descarta os encerrados: desperdício |
| vincoleiloes.com.br | vinco_sishp | 2.441 | 936 | |
| lanceleiloes.com.br | laravel_lotes | 1.534 | 1.478 | |
| ricoleiloes.com.br | soleon | 1.435 | 1.376 | |
| lancecertoleiloes.com.br | própria | 1.378 | 1.279 | |
| freitasleiloeiro.com.br | freitas | 1.337 | 1.248 | |
| nossoleilao.com.br | laravel_lotes | 1.213 | 1.170 | |
| soleiloes.com.br | leilaopro | 1.164 | 1.139 | **933 MB** numa rodada |
| palaciodosleiloes.com.br | própria | 1.150 | 1.128 | |

- **Banda:** a família leilaopro (103 domínios) é 42% de todos os bytes, com ~560 KB por página de lote.
- **Tempo por domínio:** os mais lentos na rodada de 24/09 foram plazaleiloes (132 min), ricoleiloes (109),
  soleiloes (102), trileiloes (96), turanileiloes (95), tonialleiloes (92) e topleiloes (86).
- **Ritmo por site:** um pedido por vez, com 1,2 s entre pedidos (`coletar.py`, `--intervalo 1.2`). Quando o
  robots.txt pede `Crawl-delay`, ele é respeitado até 60 s. O teto é de ~3 mil pedidos por hora por site, e só os
  maiores chegam perto disso.

### 1.4 Por que mensal não serve para a Luneta

- **Meia-vida de 8 dias.** O projeto mediu o que estava aberto no dia da coleta (`docs/pesquisa/DIAGNOSTICO.md` §2):
  66% ainda estava aberto 3 dias depois, 51% em 8 dias, 25% em 21 dias e 15% em 30 dias.
- **Mudança por intervalo**, medida nos eventos entre duas coletas boas seguidas do mesmo site:

| Intervalo entre coletas | Lotes novos | Saíram | Mudou a situação | Mudou o preço |
|---|---:|---:|---:|---:|
| 5 a 9 dias | 25% | 12% | 13% | 2% |
| mais de 9 dias | 51% | 38% | 7% | 4% |

  Parte das entradas vem de correções de adapter feitas no período.
- **A praça muda num dia marcado.** 10.047 imóveis vivos têm a 2ª praça no futuro. O alerta de praça da Luneta só
  funciona se o site for lido perto desse dia.

---

## 2. Proposta: três faixas de frequência

### 2.1 Critério

**"Imóvel vivo"** é o lote de imóvel (ou rural) visto na última rodada e com situação aberta, agendada ou
desconhecida. Hoje são 23.985, em 496 fontes. É esse o número que interessa, e não os 35,3 mil "ativos" (ver A1 e A2 da
auditoria).

| Faixa | Frequência | Quais sites | Fontes | Imóveis vivos | Pedidos por rodada (hoje, sem incremental) |
|---|---|---|---:|---:|---:|
| **A** | **todo dia** | os 100 maiores em imóveis vivos **+** os sites com 10 ou mais imóveis com 2ª praça no futuro (73 fora do top 100) | 173 | 21.509 (**89,7%**) | ~33,7 mil |
| **B** | toda semana | os 120 seguintes | 120 | 1.889 (7,9%) | ~8,6 mil |
| **C** | todo mês | os 203 restantes com imóvel | 203 | 587 (2,4%) | ~10,4 mil |
| D | todo mês, ou parar | 327 domínios sem imóvel vivo (só veículos, máquinas e diversos, ou vitrine vazia) | 327 | 0 | ~11,4 mil |
| Juntas | todo mês | relação oficial de leiloeiros (passos 2 a 4 de hoje) | 25 UFs | n/a | poucas dezenas |
| Bloqueados | toda semana, leve | só o robots.txt e 1 página, para saber se o bloqueio caiu | 202 | n/a | ~400 |

- A **faixa D** não interessa à Luneta, que recebe só imóveis. Mantenha mensal se o dono quiser veículos para uso
  próprio; senão, pode parar.
- **As faixas se revisam sozinhas**, uma vez por mês. Sobe para A quem passar de um patamar de imóveis vivos ou tiver
  2ª praça nos próximos 15 dias; desce quem ficar 2 meses abaixo. A tabela fica num arquivo (`dados/fontes.csv`, com
  slug, plataforma e faixa), e não no código.
- O site que **muda de praça** fica na A por definição: o critério da 2ª praça futura existe para isso.

### 2.2 Tempo por noite (estimativa)

| Faixa A | Sem incremental | Com incremental (seção 3) |
|---|---|---|
| tempo somado dos 173 sites (pior caso das rodadas recentes) | ~24 h | ~4 a 7 h |
| com 10 processos em paralelo | **~2 a 2,5 h** (o site mais lento sozinho leva ~1 h 40) | **~30 a 60 min** |

B leva cerca de 45 minutos por semana com 10 processos. C e as juntas levam cerca de 1 hora por mês.

### 2.3 Carga sobre cada site

Com a faixa A diária e sem incremental, o site mais pesado recebe até ~2,9 mil pedidos por dia, um de cada vez, com
1,2 s de intervalo. Com incremental, a maior parte dos sites fica em algumas dezenas de pedidos por dia: a listagem mais
os lotes novos. Isso continua dentro da conduta atual: identificado, um pedido por vez e robots.txt respeitado.

---

## 3. Coleta incremental

### 3.1 O que já existe

| Peça | Onde | Serve para |
|---|---|---|
| **`hash_conteudo`** de cada lote: título, descrição, valores, situação, praça, encerramento, endereço, matrícula, processo e quantidade de documentos e fotos | `core/modelo.py::Lote.hash_conteudo` | saber se o lote mudou **depois** de ler o detalhe |
| **tabela `evento`**: ENTROU, SAIU, PRECO, SITUACAO e PRACA, com valor antigo e novo | `core/db.py::Banco.sincronizar_fonte`, `CAMPOS_MONITORADOS` | histórico de preço, situação e praça |
| `visto_primeiro_em`, `visto_ultimo_em`, `saiu_em` | tabela `lote` | idade e frescor de cada lote |
| store bruto | `core/bruto.py` | reprocessar sem rede |
| cache HTTP de 30 min | `core/http.py::Cliente`, `--cache-ttl 1800` | só desenvolvimento: não é incremental |

### 3.2 O que falta

1. **A assinatura do cartão.** É o que a listagem já mostra de cada lote: número, preço, data, situação e título. Com um
   hash leve disso, o adapter sabe, **antes** de abrir o detalhe, se algo mudou.
2. **O adapter saber o que já conhece.** Um parâmetro opcional em `Adapter.coletar(..., conhecidos=...)` com a
   assinatura de cartão e a data do último detalhe de cada lote. O adapter que não implementa continua como hoje, então
   a mudança é compatível.
3. **A regra de frescor.** Ler o detalhe só quando:
   - o lote é novo;
   - o cartão mudou;
   - o último detalhe tem mais de 7 dias;
   - ou a próxima praça é nas próximas 48 h.

   Nos outros casos, só atualizar `visto_ultimo_em`.
4. **Gravação leve.** Hoje `core/db.py::Banco._atualizar` reescreve a linha inteira de todo lote visto. A proposta é
   gravar só `visto_ultimo_em` quando nada mudou.
5. **Registro de rodada.** Hoje cada domínio abre a sua própria `coleta` (são 7.221). Falta uma tabela `rodada` (faixa,
   início, fim, status) que agrupe as coletas, para saber "a rodada A de hoje terminou?".
6. **ETag e Last-Modified**, onde o servidor mandar. É preciso medir: site dinâmico raramente manda.
7. **Lote que volta não é lote novo.** Hoje ele ganha outro ENTROU e perde a data de entrada (`_inserir` com
   `INSERT OR REPLACE`; 34.748 casos). Precisa ser corrigido antes, senão o incremental confunde "voltou" com "novo".

### 3.3 Por onde começar

Comece pelas famílias que mais pedem e pesam:

1. **leilaopro**: 103 domínios, 42% dos bytes;
2. **soleon**: 100 domínios;
3. **laravel_lotes**: 30 domínios, inclusive o `plazaleiloes`, que deve parar de ler o detalhe de lote encerrado;
4. **suporteleiloes** e suas variantes.

A **apiengine** (65 domínios) já é barata: a listagem em JSON traz quase tudo (0,2 pedido por lote).

**Ganho estimado:** entram de 3% a 6% de lotes novos por dia, e a listagem é poucas páginas por site. Nas famílias
grandes, os pedidos caem de 70% a 85% (estimativa, a confirmar na primeira semana).

---

## 4. Saída do lote e mudança de praça

### 4.1 Como é hoje

- **SAIU** acontece quando o lote não aparece numa coleta completa e não suspeita (`core/db.py::sincronizar_fonte`), ou
  numa coleta suspeita quando a data do próprio lote já passou (`_venceu`). A produção lê só os abertos
  (`apenas_abertos=True`). Por isso SAIU quer dizer "saiu da vitrine": encerrou, foi vendido, suspenso ou retirado.
  **Não quer dizer vendido.**
- **Mudança de praça.**
  - O evento **PRACA** nasce quando `praca_atual` muda. Foram só 1.976 na história (1→2 em 1.295 casos), porque
    `praca_atual` está vazio em 52% dos imóveis.
  - **PRECO** (10.342) registra a queda do lance mínimo na 2ª praça.
  - **SITUACAO** (22.268) registra mudanças como agendado→aberto e aberto→encerrado.
- **Os defeitos que atrapalham:**
  - os zumbis: lote preso como ativo para sempre pela trava de queda (auditoria A1);
  - os suspensos de anos atrás tratados como ativos (A2);
  - o ENTROU repetido de quem volta (M4).

### 4.2 Proposta

- **Para a Luneta (a base do alerta de praça):** o exportador manda `pracas[]` com a data e o valor de cada praça. A
  Luneta já sabe deduzir a praça em vigor pelas datas (contrato, §4.4) e pode disparar alertas como "vai para a 2ª
  praça amanhã" e "baixou para a 2ª praça". Os eventos PRACA, PRECO e SITUACAO do PBCV ficam como conferência e
  histórico.
- **No PBCV:**
  1. Corrigir os zumbis: a trava compara com a coleta anterior, aceita o novo patamar depois de 3 coletas estáveis, e o
     lote não visto há N coletas fica "não confirmado" (fora da exportação, sem SAIU).
  2. Emitir também a mudança de praça **derivada da data**: a 1ª praça passou e existe 2ª praça. Hoje só existe a que
     vem do rótulo.
  3. Guardar a data da 3ª praça (58 imóveis).
  4. Manter "falha nunca vira saiu": na Luneta, quem tira lote do site é a carga `completa: true` com saúde `ok`, e ela
     tem a sua própria trava de 50% (contrato §6).

---

## 5. Paralelismo seguro por domínio

**Hoje:**

- 10 processos, cada um com **um** domínio (`expansao_br/coletar_paralelo.py`);
- dentro do domínio, um pedido por vez, 1,2 s entre pedidos e `Crawl-delay` respeitado;
- robots.txt por caminho;
- espera longa no erro 429.

**O que acrescentar:**

1. **Teto por plataforma:** no máximo 3 domínios da mesma família ao mesmo tempo. Domínios white-label (100 da soleon,
   103 da leilaopro) provavelmente estão no mesmo servidor. A checagem atual "mesmo host" (`_colidem_no_host`) não pega
   isso e hoje sempre devolve vazio.
2. **Começar pelos mais demorados.** Com os sites longos no início, a rodada termina perto do tempo do site mais lento,
   e não depois dele.
3. **Freio geral:** se, numa rodada, muitos sites diferentes devolvem 403 ou 429, o coletor pausa tudo. É sinal de que
   o IP foi marcado.
4. **Janela noturna** (01:00 às 06:00, horário de Brasília) e o mesmo ritmo de hoje por site. Não aumentar.
5. **Fechar o que ficou pendurado:** coleta com status `rodando` há mais de 12 h vira `interrompida` no começo da
   rodada seguinte.

---

## 6. Onde rodar

| | **PC do dono** (Agendador do Windows) | **GitHub Actions** (servidor do GitHub) | **Runner do GitHub no PC** | **Servidor no Brasil** (VPS) |
|---|---|---|---|---|
| Custo | zero (energia) | grátis até 2.000 min/mês num repositório privado; acima disso, pago | zero | da ordem de R$ 30 a R$ 120 por mês para 2 GB de RAM em São Paulo (conferir o preço do dia) |
| IP que os sites veem | **residencial, no Brasil** | servidor de datacenter fora do Brasil (Azure) | residencial, no Brasil | datacenter no Brasil |
| Bloqueio | medido: funciona hoje, menos os 202 já bloqueados | **desconhecido e arriscado** (ver abaixo) | igual ao PC | menor que o Actions (sem bloqueio por país), mas ainda é datacenter |
| Confiabilidade | depende do PC ligado e sem suspender; já falhou em 01/10 | alta (o horário pode atrasar alguns minutos) | depende do PC | alta |
| Estado entre rodadas (banco de 373 MB, `bruto/` de 2,4 GB) | no disco | precisa ser guardado a cada rodada (o cache do Actions some depois de 7 dias sem uso) | no disco | no disco |
| Aviso de falha | não há | e-mail automático do GitHub | e-mail automático do GitHub | precisa montar |
| Limite de tempo | nenhum | 6 h por job | nenhum | nenhum |
| Manutenção | baixa | baixa | média (instalar o runner como serviço do Windows) | média a alta (Linux, atualizações) |

### 6.1 Os sites bloqueariam o GitHub Actions?

Daqui não dá para medir: a rede deste ambiente só abre GitHub, npm e PyPI. Os indícios:

- **633 dos 823 domínios** estão atrás do Cloudflare (`SONDAGEM.json`, campo `server`). Dentro da faixa A são 129 de
  173 sites, com **72% dos imóveis vivos**. O Cloudflare costuma desconfiar mais de IP de datacenter, e o robô se
  identifica como robô.
- **A própria Luneta já viu isso:** as fichas da Caixa e o ITBI de Belo Horizonte recusam os servidores do GitHub, e por
  isso rodam no PC (`luneta-de-leiloes/base/COLETA-NO-PC.md`).
- Três sites de Acre e Rondônia (`maleiloesro`, `saleiloes`, `loteleiloes`) já bloqueiam o IP do PC; por IP, o
  bloqueio pode piorar.

### 6.2 Minutos do GitHub Actions (estimativa)

- **Faixa A diária sem incremental:** 2 a 2,5 h por dia, ou 3.600 a 4.500 minutos por mês. Passa dos 2.000 grátis.
- **Faixa A com incremental:** 30 a 60 minutos por dia, ou 900 a 1.800 minutos por mês.
- **Somando B e C:** mais ~250 minutos por mês. Cabe no limite, mas com pouca folga.
- Repositório **público** tem minutos ilimitados, mas o código do coletor passaria a ser público.

### 6.3 Recomendação

1. **Agora: o PC do dono.** É custo zero, tem o melhor IP para este trabalho (residencial e brasileiro) e o código já
   roda lá. O que precisa:
   - os ajustes de energia e da tarefa (seção 9);
   - um log sem buffer;
   - o **vigia do lado da Luneta** (seção 8), que avisa por e-mail se a coleta do dia não chegar. Isso cobre exatamente
     a falha de 01/10.
2. **Em paralelo, um piloto de uma semana no GitHub Actions**, só com a faixa A, num banco descartável, para **medir**
   quantos imóveis da faixa A ele consegue ler.
   - Se for **95% ou mais**, a coleta diária pode ir para o Actions, já com o incremental. O estado vai num arquivo
     compacto, e não no banco inteiro.
   - Se for menos, fica no PC.
3. **Servidor pago só se o PC se mostrar pouco confiável e o Actions for bloqueado.** Uma alternativa de custo zero que
   junta as duas coisas é o **runner do GitHub instalado no PC**. O GitHub agenda, guarda o log e manda e-mail, e o PC
   executa com o IP de casa.

---

## 7. Como a saída chega à Luneta

```
coleta da faixa (PC)  ──►  leiloes.db
       │
       ▼
exportador (outra frente)  ──►  saida/leiloeiros-AAAA-MM-DD-A.jsonl(.gz)  +  saude-AAAA-MM-DD.json
       │
       ▼
validar.ts (contrato v1)  ──►  sem erro?  ──►  envio ao branch coletas-dados (clone temporário)
                                                     │
                                                     ▼
                                   Luneta: importação diária (npm run base:coletar -- leiloeiros ...)
                                           relatório por leiloeiro (npm run leiloeiros:relatorio)
```

### 7.1 O que o lado do PBCV garante ao exportador

O detalhe está na seção 5 da auditoria. Em resumo:

- **Lotes:**
  - só lote **visto nesta rodada**, de imóvel ou rural, com situação aberta ou agendada; desconhecida só com praça
    futura;
  - **`completa: true` só** quando a fonte teve status `ok` nesta rodada. `incompleta` e `suspeita` viram
    `saude: parcial`. Robots, 403, 429 ou Cloudflare viram `bloqueado`; outro erro vira `quebrado`;
  - para fonte bloqueada ou quebrada, só a linha de coleta: os lotes já publicados ficam como estão, e a Luneta os
    tira quando a praça vence.
- **Identidade:** slug fixo por domínio, numa tabela. O slug tirado do domínio colide em 5 casos, como
  `jmleiloes.com.br` e `jmleiloes.leilao.br`.
- **Campos:**
  - datas com `-03:00`;
  - `lat` e `lon` só quando a própria fonte publica a coordenada (nunca o geocode do CNEFE);
  - cidade e UF da tabela `lote`, completadas pela `geo_lote` (85% com UF).
- **LGPD:** sem `executado` nem `exequente`; comitente só se for pessoa jurídica; processo só com o número.

### 7.2 O envio

- **Mesmo caminho da coleta das fichas da Caixa.** `luneta-de-leiloes/base/coleta-pc.ts` já publica no branch
  `coletas-dados` por um clone temporário raso (`--depth 1`), com `core.autocrlf=false` e sem mexer nos arquivos do
  dono. O PBCV pode reaproveitar essa rotina, chamando-a ou copiando o desenho.
- **Onde:** `leiloeiros/AAAA-MM-DD/A.jsonl.gz`, mais `leiloeiros/saude/AAAA-MM-DD.json` e um `leiloeiros/ultimo.json`
  que aponta para o mais recente.
- **Token:** fine-grained, com acesso **só** ao repositório da Luneta e só a "Contents: read and write", guardado no
  Gerenciador de Credenciais do Windows ou numa variável de ambiente. Nunca no código, no arquivo ou no log.
- **Tamanho (estimativa):** os ~24 mil imóveis vivos têm ~34 MB de texto. O JSONL diário fica entre 40 e 60 MB, ou de
  8 a 15 MB comprimido.
  - Mandar **comprimido**, ou dividir por faixa ou plataforma, sem nunca partir um leiloeiro em dois arquivos.
  - Como o git guarda todo arquivo enviado, 50 MB por dia incham o branch. A Luneta deve decidir entre recriar o
    branch sem histórico de tempos em tempos e usar um Release com o arquivo do dia.
- **Do lado da Luneta:** a importação diária e o relatório por leiloeiro já existem como comando. Falta o agendamento
  (`PENDENCIAS.md`, "Importação diária dos leiloeiros", que depende da decisão 38).

---

## 8. Monitoramento e alertas

### 8.1 O que existe

- **O canário** (`core/canario.py`, `canario.py`, `canario_br.py`).
  - Para cada plataforma, ele tem uma lista do que o adapter precisa encontrar na página crua: uma chave JSON, uma
    classe CSS ou um rótulo de texto. Cada item diz qual campo do lote morre se ele sumir. Ele roda sobre o `bruto/`,
    sem rede e na hora, e separa "loja sem leilão hoje" de "o site mudou o layout". Os alertas são críticos ou avisos.
  - **Limites:** cobre **17 de 192 plataformas**; **não roda** dentro da rodada mensal; a linha de base
    (`canario_base.json`) é de 25/07, com 26 fontes.
- **A saúde por fonte em cada rodada:** `coleta_fonte.status` (ok, incompleta, suspeita, erro) e a mensagem de erro.
- **Os critérios de aceite** (`expansao_br/aceite_fase5.py`, passo 6). Na última medição, 5 passam e 2 falham: "95%
  dos domínios com adapter respondendo" (86,8%) e "paridade de UF com SP".
- **Os registros das rodadas** (`EXECUCAO_MENSAL.json`, `COLETA_PARALELA.json`) e a aba "Fontes" da planilha.
- **O que falta:** **nada disso avisa ninguém.** `realizaleiloes.com.br` caiu de 5.014 lotes para 0 e ficou só marcado
  como "suspeita"; a rodada de 01/10 morreu em silêncio.

### 8.2 Proposta

1. **Um `saude.json` por rodada**, gravado pelo PBCV e enviado junto com o JSONL. Ele traz:
   - início e fim da rodada, e quantas fontes ficaram em cada status;
   - fontes da faixa A com erro;
   - queda de mais de 50% numa fonte com 50 ou mais imóveis;
   - fontes presas em "suspeita" por 3 ou mais rodadas;
   - o **canário de campo**: uma fonte em que avaliação, data, cidade ou foto caiu mais de 30 pontos percentuais de uma
     rodada para outra. É medido no banco, cobre as 188 plataformas sem esforço e completa o canário estrutural (que
     vale a pena estender às 20 plataformas com mais imóveis).
2. **O vigia do lado da Luneta.** Um workflow do GitHub Actions no repositório da Luneta, que é público e não gasta
   minutos, roda todo dia às 09:00 e **falha** em dois casos:
   - o último `saude.json` tem mais de 36 h;
   - a faixa A trouxe menos de 90% dos imóveis da véspera.

   Quando o workflow falha, o GitHub manda **e-mail** ao dono. O vigia não depende do PC: se o PC dormir, ele percebe.
3. **Log que sobrevive.** Rodar o Python com `-u` (sem buffer), um arquivo de log por rodada com a data no nome, e
   fechar no começo da rodada as coletas `rodando` antigas.
4. **Saúde por leiloeiro na Luneta.** A linha de coleta do contrato já tem `saude` e `erro`, e o relatório por leiloeiro
   já mostra "dias sem coleta válida". Isso vira o painel de saúde, no lugar da aba "Fontes" da planilha.

---

## 9. Passo a passo para o dono

### 9.1 O que só você pode fazer (sem mexer em código)

1. **Revogar a chave da Groq.** Ela está em `config_groq.py`, e o código que a usa nem roda. No site da Groq, abra API
   Keys e apague a chave.
2. **Decidir o futuro da planilha e do painel.** Se forem ser aposentados:
   - baixe a aba **"Triagem"** (Arquivo → Fazer download → CSV), que tem as suas decisões de Favoritar e Descartar;
   - **apague a aba "Acessos"**, que guarda o IP de quem abriu o painel;
   - depois, revogue a chave da conta de serviço do Google (Console do Google Cloud → IAM → Contas de serviço → Chaves).
3. **Deixar o PC pronto para rodar de madrugada:**
   - Configurações → Sistema → Energia (e bateria) → Tela e suspensão: **suspender = Nunca** quando estiver na tomada;
   - abra o Agendador de Tarefas e a tarefa `PBCV-Leiloes-Mensal`:
     - Geral: "Executar estando o usuário conectado ou não";
     - Condições: marque "**Ativar o computador para executar esta tarefa**";
     - Configurações: marque "**Executar a tarefa o mais cedo possível após uma inicialização agendada ter sido
       perdida**" e "Se a tarefa falhar, reiniciar a cada 30 minutos, até 3 vezes";
   - a pasta do projeto deve ficar **fora** do OneDrive ou do Google Drive.
4. **Criar o token de envio.** No GitHub, abra Settings → Developer settings → Fine-grained tokens. Repositório: só
   `luneta-de-leiloes`; permissão: "Contents: Read and write"; validade de 1 ano. Guarde no Gerenciador de Credenciais
   do Windows. Não mande o token por chat nem o cole em arquivo do projeto.

### 9.2 O que uma sessão do Claude faz (as etapas da auditoria, seção 6.3)

5. **Etapas 0 e 1:** limpeza e segurança, sem mudar o comportamento.
6. **Etapa 2:** corrigir os zumbis, os suspensos, a volta de lote, o tipo do bem, o fuso e a exportação sem partes.
7. **Ligar o exportador da outra frente** e o envio ao `coletas-dados`, e criar o vigia na Luneta.
8. **Criar as faixas** (`dados/fontes.csv`) e as três tarefas: diária às 01:30 (A), semanal no domingo às 01:30 (B) e
   mensal no dia 1 às 01:30 (C, D e juntas).

### 9.3 A primeira semana (você roda, com os comandos que a etapa 8 vai criar)

9. Primeira coleta de teste da faixa A, num banco separado: `py pbcv.py coletar --faixa A --banco teste.db` (cerca de
   2 h sem incremental).
10. Exportar, validar e enviar: `py pbcv.py exportar-luneta --faixa A --enviar`. Quando aparecer "enviado", a Luneta
    importa.
11. Instalar as tarefas: `py pbcv.py agenda --instalar`, e conferir com `py pbcv.py agenda --conferir`.
12. Acompanhar por uma semana: se nada chegar, o e-mail do vigia avisa, e o relatório por leiloeiro da Luneta mostra a
    saúde de cada um.
13. Opcional: autorizar o piloto de uma semana no GitHub Actions (seção 6.3).

---

## 10. Cronograma sugerido

| Semana | Entrega |
|---|---|
| 1 | Chaves revogadas; PC configurado; limpeza do repositório (etapas 0 e 1); log sem buffer; vigia na Luneta |
| 2 | Correções de dado (etapa 2); exportador validado; primeira carga manual na Luneta (banco de teste e depois produção) |
| 3 | Faixa A diária no PC, ainda sem incremental (~2 h por noite); piloto do Actions; faixas B e C nas tarefas |
| 4 e 5 | Incremental em leilaopro, soleon, laravel_lotes e suporteleiloes; teto por plataforma; testes offline das 20 maiores plataformas |
| depois | Unificar os coletores em `pbcv.py`; aposentar a planilha e o painel; decidir sobre o Actions ou o runner no PC |

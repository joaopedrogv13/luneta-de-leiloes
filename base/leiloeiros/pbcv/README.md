# Exportador do PBCV: do seu coletor de leilões para a Luneta

## O que é

O seu coletor (o "Coletor de Leilões PBCV", em Python) lê os sites dos leiloeiros e guarda tudo no `leiloes.db`. Este
exportador **lê esse banco, sem mudar nada nele**, e escreve o arquivo que a Luneta importa: o JSONL do contrato dos
leiloeiros ([`../CONTRATO.md`](../CONTRATO.md)), com uma linha de coleta por leiloeiro (domínio) e uma linha por imóvel
à venda. Na Luneta, cada leiloeiro vira uma fonte (`ll_<slug>`) com o próprio histórico de coletas.

| Arquivo | Para quê |
| --- | --- |
| `exportar.py` | o exportador (só a biblioteca padrão do Python 3.9+) |
| `regra_imovel.py` | quem é imóvel de verdade (título, categoria, começo da descrição e o `tipo_bem` do PBCV) |
| `regras_luneta.py` | as regras da Luneta traduzidas para Python: a máscara de dados pessoais (`base/util/lgpd.ts`), o corte de pessoa dos campos de endereço, o tipo do imóvel |
| `testar.py` | os testes (`python3 base/leiloeiros/pbcv/testar.py`): uma base de exemplo com o esquema do PBCV, e a máscara contra o TypeScript |
| `casos-compartilhados.json` | 168 casos com a saída do TypeScript; o `testar.py` confere o Python e o `pbcv.test.ts` (no `npm run base:testar`) confere o TypeScript |
| `casos.ts`, `gerar-casos.ts`, `pbcv.test.ts` | o lado TypeScript dos casos compartilhados |

## Pelo Claude Code no PC

A coleta completa, a exportação e o envio, feitos pelo Claude Code, seguem o roteiro de
[`PROMPT-ATUALIZAR.md`](PROMPT-ATUALIZAR.md). No Prompt de Comando (cmd), rode:

```
cd /d %USERPROFILE%
curl -L -o PROMPT-ATUALIZAR.md https://raw.githubusercontent.com/joaopedrogv13/luneta-de-leiloes/main/base/leiloeiros/pbcv/PROMPT-ATUALIZAR.md
claude --dangerously-skip-permissions "Leia o arquivo PROMPT-ATUALIZAR.md nesta pasta e execute tudo o que ele pede, do comeco ao fim."
```

## Como exportar no seu PC (Windows)

Precisa do que você já tem: o Python do PBCV, e o Node e o Git da coleta no PC, com o projeto `luneta-de-leiloes`
baixado (guia: [`base/COLETA-NO-PC.md`](../../COLETA-NO-PC.md), passos 1 e 2).

1. **Rode o seu coletor como sempre**, na pasta do PBCV (`py coletar.py`, ou a atualização mensal). Espere terminar: o
   exportador lê o `leiloes.db` e precisa dele parado.
2. **Exporte**, na pasta do `luneta-de-leiloes` (troque o caminho pelo da pasta do PBCV):

   ```
   git pull
   py base\leiloeiros\pbcv\exportar.py --banco C:\caminho\do\PBCV\leiloes.db
   ```

   Leva de 1 a 2 minutos e grava `coletas-pc\leiloeiros\pbcv-luneta.jsonl` (o arquivo, ~70 MB) e
   `coletas-pc\leiloeiros\pbcv-resumo.json` (as contas por leiloeiro). No fim, ele mostra o resumo: quantos imóveis,
   quantos leiloeiros e por que cada lote ficou de fora. Se rodar toda semana, acrescente `--frequencia semanal`.
3. **Confira** (opcional, o envio também confere que o arquivo está inteiro):

   ```
   node --experimental-strip-types base\leiloeiros\validar.ts --arquivo coletas-pc\leiloeiros\pbcv-luneta.jsonl
   ```

   O que importa é a segunda linha: **"Resultado: OK para importar"**. Os avisos são para melhorar o coletor (praça
   vencida, lote sem endereço, judicial sem processo); não impedem a importação.
4. **Envie** (próxima seção).

No Mac ou no Linux é igual, com `python3` no lugar de `py` e `/` no lugar de `\`.

Outras opções: `--fontes portalzuk.com.br,megaleiloes` (só esses leiloeiros), `--desde 2026-10-20` (só lotes vistos a
partir da data; a carga do leiloeiro com lote mais antigo deixa de ser completa) e `--saida outro-lugar.jsonl`.

## Como mandar o arquivo para a Luneta

**Pelo GitHub (o mesmo caminho da coleta no PC).** Depois de exportar:

```
node base/coleta-pc.mjs --so-publicar
```

É o envio da coleta no PC ([`base/coleta-pc.ts`](../../coleta-pc.ts)): ele confere que o arquivo está inteiro (um arquivo
cortado não vai, e o que já está no GitHub fica), comprime o JSONL (~70 MB viram ~8 MB) e envia para o branch
`coletas-dados`, em `pc/leiloeiros/pbcv-luneta.jsonl.gz` e `pc/leiloeiros/pbcv-resumo.json`, junto com as fichas da
Caixa e o ITBI de BH, se houver. O login no GitHub é o do guia (item 7 do `COLETA-NO-PC.md`). Vai sempre para o mesmo
lugar: cada envio substitui o anterior (o histórico do branch guarda os antigos).

Do lado da Luneta, a importação é automática: `node base/atualizar-site.mjs` (no mesmo PC, depois do envio) valida,
importa e publica no site ([`base/ATUALIZAR-SITE.md`](../../ATUALIZAR-SITE.md)). À mão, como antes:

```bash
git fetch origin coletas-dados
git show origin/coletas-dados:pc/leiloeiros/pbcv-luneta.jsonl.gz | gunzip > pbcv-luneta.jsonl
npm run base:coletar -- leiloeiros --arquivo pbcv-luneta.jsonl
```

**Como anexo.** Compacte `coletas-pc\leiloeiros\pbcv-luneta.jsonl` (botão direito, "Compactar para arquivo ZIP": ~8 MB)
e anexe na conversa ou no Drive, junto com o `pbcv-resumo.json`. O arquivo já sai sem nome de parte e sem CPF (a
máscara está na seção LGPD), então pode circular como os dados do site.

## A regra de "à venda de verdade"

`ativo = 1` no PBCV não quer dizer "à venda". O exportador passa cada lote por quatro filtros, nesta ordem:

1. **É imóvel?** Pela regra de `regra_imovel.py`, que lê o título, a categoria e o começo da descrição. O `tipo_bem` do
   PBCV sozinho erra: 1.103 dos 4.174 "rural" ativos são trator, implemento, gado ou peça; "Item: mesa" e "03 ALMOFADAS.
   LOC. SALA" estão como "imovel"; e 1.263 "desconhecido" são terrenos e casas. Precisão medida à mão: 97,5% em 200 casos.
2. **Foi visto na última coleta da fonte que trouxe lotes?** É a última coleta com status ok, suspeita ou incompleta e
   com lotes (`coleta_fonte`). O que ela não viu é zumbi: a trava de queda de 60% do PBCV mantém "ativo" o que sumiu do
   site. Exemplo: o último ok do fidalgoleiloes é de 14/08 e as rodadas seguintes foram "suspeita"; os ~1.400 lotes de
   agosto que as leituras de setembro não viram ficam de fora.
3. **A situação é aberto ou agendado?** Encerrado, vendido, suspenso e "desconhecida" ficam de fora. O suspenso com
   praça futura vai ao arquivo como `suspenso`, só para a Luneta tirá-lo do site (sem isso, numa carga parcial ele
   continuaria no ar até a data passar).
4. **Tem cidade e UF?** O contrato exige. A cidade vem do código IBGE que o PBCV achou (`geo_lote`), senão do campo
   cidade, conferida com a tabela do IBGE da Luneta.

**Carga completa** (a Luneta tira do site o que sumiu do leiloeiro) só quando a última coleta da fonte foi ok e trouxe
lotes. Se foi suspeita, incompleta ou deu erro, a carga vai como parcial: a Luneta não remove nada, mas também não recebe
os zumbis.

### Por que a base de 01/10 já tem a maioria das praças vencidas

A base exportada foi lida de 24/09 a 01/10/2026 (a maior parte dos lotes à venda foi vista em 24/09). Leilão tem data:
dos 21.699 imóveis à venda no arquivo,

| Última praça do lote | Imóveis | |
| --- | ---: | ---: |
| antes de 01/10 (já tinha passado no dia da coleta; o site ainda mostrava "aberto") | 5.670 | 26% |
| entre 01/10 e 27/10 (passou depois da coleta) | 10.095 | 47% |
| depois de hoje (28/10) | 5.425 | 25% |
| sem data | 509 | 2% |

A Luneta tira do site o lote cuja praça passou há mais de 1 dia, e o que não tem lance. Por isso, **hoje só 4.992
apareceriam no site** (a conta do validador às 10h30 de 28/10; eram ~5.000 na exportação anterior). Não é defeito do
arquivo: é a idade da base. **A solução é atualizar com frequência**: com coleta e exportação toda semana, a maior parte
dos 5.425 com praça futura e dos novos leilões chega ao site antes da data.

## LGPD

- **Executado e exequente nunca saem.** As colunas não vão para o arquivo; os nomes delas são procurados no título, na
  descrição, no título do leilão e no nome dos documentos (sem diferença de maiúscula, acento e espaços) e trocados por
  `[NOME]`. Na firma individual ("FULANO DE TAL - ME"), o nome da pessoa também é mascarado; banco, condomínio e órgão
  ficam como estão.
- Depois vem **a mesma máscara da Luneta** (`base/util/lgpd.ts`, traduzida em `regras_luneta.py`): CPF, CNPJ, RG, e-mail,
  IP e nomes depois de papéis ("executado:", "ocupado por", "em face de", "arrematante:"...) viram `[CPF]`, `[NOME]`...
  O resultado é o mesmo do TypeScript: os 168 casos compartilhados conferem os dois lados, e na revisão de 28/10 128 mil
  textos reais do PBCV e 140 mil textos gerados (com emoji, letra matemática, tabulação) deram a mesma saída.
- **Endereço, bairro, complemento, comitente, vara e comarca** vão ao site sem a máscara de nomes. Passam pelo corte de
  pessoa da Luneta (o que vem depois de "proprietário", "ocupado por"... é descartado), e o campo cai inteiro se tiver
  CPF ou "A x B" (partes de processo: o corte guardaria o lado esquerdo, que pode ser uma pessoa).
- **Comitente** só quando é banco, vara, órgão ou empresa; pessoa física (ou dúvida) vai como `null`.
- **O nome do leiloeiro no site é o domínio** (`megaleiloes.com.br`): é estável e é o que o usuário vê no navegador. O
  leiloeiro oficial (profissional público) vai em `extras.leiloeiro_oficial` e a matrícula na junta em
  `leiloeiro.matricula_junta`, quando o PBCV tem.
- Mensagens de erro da coleta saem sem token, senha ou cookie, e sem os parâmetros da URL.

## O que vai em cada campo

| Contrato | Do PBCV |
| --- | --- |
| `id` | `<slug do domínio>:<id_externo só com letras minúsculas e dígitos>` (`megaleiloes:j128101`) |
| `pracas`, `praca_atual`, `lance_minimo` | `valor_lance_inicial` é o mínimo da 1ª praça e `valor_lance_minimo` o menor valor publicado (o da 2ª); datas da 1ª e 2ª praça. Com todas as datas, a Luneta deduz a praça em vigor. Leilão online com encerramento depois da última data: a última praça fica com o encerramento. Venda direta: uma praça 0 com o preço e o prazo |
| datas | o PBCV grava a hora de Brasília sem fuso; sai com `-03:00`. Datas fora de 2015 a 2035 são descartadas |
| `avaliacao`, `lance_atual`, `comissao_pct` | 0 vira `null` (a fonte não informa; nunca "de graça") |
| `natureza`, `modalidade` | `judicial`/`extrajudicial` do PBCV; venda direta vira `venda_direta`, o resto com praça vira `leilao` |
| `processo` | só o número CNJ (do campo, ou da descrição quando vem rotulado "Processo nº") |
| `tipo` | a categoria da fonte, senão o título (a mesma régua da Luneta) |
| `area_total` | `area_m2` (o PBCV não diz qual área é) |
| `lat`, `lon` | só o ponto da própria fonte ou do CNEFE pelo número (`geo_lote`) |
| `registro_imovel.numero_caixa` | o número do imóvel na Caixa (13 dígitos) achado na URL, no título ou na descrição: a chave que acha o mesmo imóvel na Caixa |
| `extras` | `tipo_bem_pbcv`, `modalidade_pbcv`, `leiloeiro_oficial`, `vara`, `comarca`, `subjudice`, `penhorado` |
| `controle.coletado_em` | quando o PBCV viu o lote pela última vez |

## Números da última exportação

Base do PBCV lida até 01/10/2026, exportada em 28/10/2026 (`pbcv-resumo.json`):

| Etapa | Lotes |
| --- | ---: |
| Lotes ativos no PBCV (todos os tipos) | 97.131 |
| não são imóveis (veículos, máquinas, diversos...) | −60.512 |
| imovel/rural do PBCV que a regra tirou (trator, "Item:", moto...; 13 de teste) | −1.891 |
| **Imóveis ativos** | **34.728** |
| não vistos na última coleta que trouxe lotes (zumbis) | −1.971 |
| suspensos sem praça futura | −5.952 |
| encerrados / vendidos | −1.773 |
| situação desconhecida | −1.052 |
| suspensos com praça futura (vão como "suspenso", só para sair do site) | −26 |
| **À venda de verdade** | **23.954** |
| sem cidade e UF | −2.255 |
| **À venda no arquivo** | **21.699** (+ 20 suspensos com cidade = 21.719 linhas de imóvel) |

- **Leiloeiros:** 483 com imóveis no arquivo e 485 linhas de coleta (2 só com o erro: um bloqueado pela Cloudflare e um
  fora do ar). Cargas completas: 383; saúde: ok 383, parcial 56, bloqueado 45, quebrado 1.
- **Tamanho:** 13 leiloeiros com 500 imóveis ou mais, 30 com 100 a 499, 167 com 10 a 99, 273 com 1 a 9. Os maiores:
  leiloesjudiciaismg 995, kleiloes 664, megaleiloes 659, trileiloes 639, globoleiloes 631, tonialleiloes 612,
  leiloeiropublico 600, lancecertoleiloes 595, clicleiloes 587, 3torresleiloes 561.
- **Como entraram:** pelo título 20.728 (mais 138 com positivo forte e 19 com palavra de lugar), pela categoria 662,
  pela descrição 79, pelo `tipo_bem` do PBCV sem outro sinal 93.
- **Ajustes:** cidade pelo código IBGE 13.911 e pelo nome 7.657 (151 ficaram com o nome da fonte; 302 nomes que não eram
  cidade foram descartados); última praça no encerramento 1.970; segunda praça com data antes da primeira 213; mínimo
  maior que o inicial (valores descartados) 125; processo achado na descrição 80; número do imóvel na Caixa 1.171.
- **LGPD:** 1.152 nomes de executado e exequente mascarados em 488 lotes, antes da máscara da Luneta.
- **Validador** (28/10, 10h30): 0 erros e 23.601 avisos, nenhum de LGPD. Os avisos: praça em vigor já passou 15.764, sem endereço 3.376,
  judicial sem processo 2.341, sem lance 1.529, coleta de mais de 30 dias 345.
- **Importação de teste** numa cópia da base da Luneta (com a Caixa de 08/10): 483 leiloeiros gravados, 0 lotes
  inválidos, as 2 coletas com erro registradas. Dos 1.171 números da Caixa, 846 são de um imóvel ativo da Caixa; com
  eles, o relatório acha 1.594 imóveis no ar (em 02/10) que também estão na Caixa, contra 1.514 só pela matrícula e pelo
  endereço.
- **Diferença com a análise da base** (24.118 à venda e 22.001 com cidade e UF): a análise contou como à venda os 164
  suspensos com praça depois de 01/10, e aceitou cidade sem conferir com o IBGE.

## Quando a máscara da Luneta mudar

`regras_luneta.py` é a tradução de código TypeScript. Se `base/util/lgpd.ts`, o `campoSemPessoa` ou o
`inferirTipoImovel` mudarem de propósito, o `npm run base:testar` falha no `pbcv.test.ts`. Então:

1. `node --experimental-strip-types base/leiloeiros/pbcv/gerar-casos.ts` (refaz as saídas pelo TypeScript);
2. acerte `regras_luneta.py` até `python3 base/leiloeiros/pbcv/testar.py` passar.

## Limites conhecidos

- A regra de imóvel deixa de fora os ~500 lotes com título só "LOTE 004" e sem descrição (só a página diz o que são).
- O PBCV não guarda o cartório: a deduplicação por matrícula com a Caixa não funciona; o número da Caixa e o endereço
  com número (35% dos à venda) fazem esse papel.
- 1.529 imóveis à venda sem lance e 509 sem data de praça: o site do leiloeiro não mostra, ou o adaptador não lê.
- A máscara da Luneta erra para mais em alguns nomes (ela é a mesma aqui e no TypeScript): um sobrenome terminado em
  "RG" vira "[NOME]RG" e um sobrenome igual a uma palavra de edital ("Casado") fica visível depois do `[NOME]`.

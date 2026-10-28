# Leiloeiros: o lado da Luneta que recebe os coletores

Os coletores dos leiloeiros entregam um **JSONL** num formato fixo; aqui ficam o contrato, o validador, a importação
na base e o relatório por leiloeiro que o site vai mostrar.

**O coletor do dono é o PBCV** ("Coletor de Leilões PBCV", em Python, num repositório privado): 670 domínios, ~35 mil
imóveis ativos no `leiloes.db`. O exportador em [`pbcv/`](pbcv/README.md) lê esse banco (só leitura) e grava o JSONL
deste contrato: **21.719 imóveis de 483 leiloeiros** na base de 01/10/2026, com 0 erros no validador. O guia para o
dono (exportar no PC, mandar pelo branch `coletas-dados` ou como anexo, a regra de "à venda de verdade" e os números)
está em [`pbcv/README.md`](pbcv/README.md). O [`PROMPT-AUDITORIA.md`](PROMPT-AUDITORIA.md) e os
[`ANEXOS-PROMPT.md`](ANEXOS-PROMPT.md) foram escritos quando se pensava que os coletores eram Apps Scripts: ficam como
histórico e como referência do formato para um coletor novo.

| Arquivo | Para quê |
| --- | --- |
| [`CONTRATO.md`](CONTRATO.md) | o formato, campo a campo: tipo, obrigatório, como normalizar, para onde vai na base, LGPD |
| `imovel.schema.json`, `coleta.schema.json` | JSON Schema (draft 2020-12) das duas linhas do JSONL |
| `relatorio-leiloeiros.schema.json` | JSON Schema do relatório por leiloeiro |
| `contrato.ts` | enums, tipos, ids (`ll_<slug>`, `ll-<slug>-<lote>`), leitura do JSONL |
| `esquema.ts` | validador pequeno de JSON Schema, sem dependência (o Ajv do `node_modules` é o 6, do ESLint, e não lê o 2020-12) |
| `validar.ts` | `npm run leiloeiros:validar`: esquema, coerência, LGPD e o resumo por leiloeiro |
| `medidas.ts` | o que está no site, divisões e qualidade, iguais para o JSONL e para a base |
| `relatorio.ts` | `npm run leiloeiros:relatorio`: o `relatorio-leiloeiros.json` |
| [`PROMPT-AUDITORIA.md`](PROMPT-AUDITORIA.md) | o prompt para o outro chat (até 25 mil caracteres, conferido por teste) e os próximos passos depois dele |
| [`ANEXOS-PROMPT.md`](ANEXOS-PROMPT.md) | os anexos do prompt (formato de dados, 26 tags, conferência sem o validador, plataformas); o dono salva como `ANEXOS-LUNETA.md`. Os testes conferem campos, enums, limites, exemplos e tags contra os esquemas |
| `../fontes/leiloeiros/` | o conector `leiloeiros_arquivo` (apelido `leiloeiros`) e a fixture de 12 lotes de 3 leiloeiros fictícios |
| [`pbcv/`](pbcv/README.md) | o exportador do PBCV (Python, só a biblioteca padrão): `exportar.py`, a regra de imóvel, a máscara da Luneta traduzida e os testes (`python3 base/leiloeiros/pbcv/testar.py`; o lado TypeScript dos casos compartilhados roda no `npm run base:testar`) |

## Como usar

```bash
# 1. conferir o arquivo que o coletor entregou (0 = pode importar; 1 = tem erro)
npm run leiloeiros:validar -- --arquivo saida.jsonl
#    no Windows (PowerShell): node --experimental-strip-types base/leiloeiros/validar.ts --arquivo saida.jsonl

# 2. importar: uma fonte por leiloeiro (ll_<slug>), com remoção pela carga completa
npm run base:coletar -- leiloeiros --arquivo saida.jsonl

# 3. tags, site e relatório por leiloeiro
npm run base:riscos
npm run base:exportar -- --site
npm run leiloeiros:relatorio -- --site          # grava base/saida/site/relatorio-leiloeiros.json

# relatório de um JSONL, antes de importar (não mexe na base)
npm run leiloeiros:relatorio -- --arquivo saida.jsonl --saida relatorio.json
```

Teste rápido com a fixture: `npm run base:coletar -- leiloeiros --arquivo base/fontes/leiloeiros/fixtures/tres-leiloeiros.jsonl --banco base/dados/teste.db`
(as praças da fixture são de novembro e dezembro de 2026: depois disso os lotes saem do site por praça vencida).

## Como foi decidido

- **Uma fonte por leiloeiro** (`ll_<slug com _>`), não uma fonte para todos. Assim o nome do leiloeiro aparece no
  cartão e no filtro de fonte do site sem mexer no site (`fonte.nome`), cada leiloeiro tem a própria coleta no log, a
  própria data de geração (carga velha é recusada) e a própria remoção: o script de um leiloeiro que falha não tira do
  ar os imóveis dos outros. O `Conector` ganhou o método opcional `desdobrar` (base/tipos.ts) e a CLI roda uma coleta
  por leiloeiro do arquivo.
- **Id no site `ll-<slug>-<lote>`**, o padrão que o exportar já monta para fonte sem prefixo próprio (o id da fonte
  com `_` trocado por `-`), como `caixa-…` e `lj-…`. O lote só tem letras e dígitos, então o que vem depois do último
  hífen é sempre o lote e dois leiloeiros nunca geram o mesmo id (o site recusa o arquivo inteiro se um id repetir).
- **O que sumiu vira `removido`**, como na Caixa, e não `encerrado`: o núcleo marca `removido` quando a carga é
  completa (linha de coleta com `completa: true` e saúde `ok`, sem lote com erro), com a trava de 50%. `encerrado` fica
  para o que o coletor diz (vendido, encerrado, suspenso, cancelado). Os dois saem do site; a diferença importa para o
  alerta: "sumiu" é "retirado ou vendido, confira", nunca "vendido".
- **Tags com as regras que já existem:** a descrição, as observações e os trechos de ocupação, dívidas e pagamento vão
  em `textos`; a ocupação de campo próprio vai em `ocupacao`; as dívidas declaradas em campo e a comissão viram uma frase
  curta (`textos` com origem `campo:debitos` e `campo:comissao_pct`) que as regras de dívida e de custos leem; o site
  mostra essas frases como "campo da fonte", sem aspas.
- **Deduplicação com a Caixa** pelo que a base já faz: matrícula + número do ofício, ou o endereço com número. O
  `normalizarCartorio` passou a reconhecer "6º Oficial de Registro de Imóveis" (o nome dos cartórios de São Paulo), que
  antes virava "u" e nunca casava com a ficha da Caixa ("6º Ofício"). O relatório conta quantos ativos de cada
  leiloeiro também estão na Caixa; o catálogo do site ainda não junta os repetidos (pendência antiga).
- **LGPD:** o validador recusa CPF/RG em qualquer campo e papel de pessoa no endereço, no cartório e no comitente; a
  importação corta esses campos com `campoSemPessoa` (a regra da Leilões Judiciais) e descarta extras com dado pessoal.
- **Número do imóvel na Caixa (`registro_imovel.numero_caixa`, campo novo e opcional da versão 1).** A Caixa da Luneta
  quase nunca tem matrícula (1 em 21 mil) e o leiloeiro escreve o endereço do jeito dele: a chave de endereço acha só
  ~61% dos repetidos. O número da Caixa (13 dígitos, achado em 1.171 lotes do PBCV, 846 deles de um ativo da Caixa) vai
  para `extras.numero_caixa`, e o relatório conta o lote como `repetidos_caixa` quando o número é de um ativo da Caixa.
  O catálogo do site ainda não junta os repetidos (item 6 abaixo); quando juntar, deve usar o mesmo número.
- **Histórico de praça: a base ainda não tem lugar.** A tabela `praca` guarda só o estado atual, e o `preco_historico`
  acompanha preço, avaliação, modalidade, praça atual e status, mas não a data nem o mínimo de cada praça. A situação de
  cada praça vai em `extras.praca_N_situacao` (entra no hash, então a mudança aparece como "atualizado"). O histórico
  completo é o item 3 de "Back-end: favoritos e alerta de mudança de praça" no `PENDENCIAS.md`; o prompt pede que o
  coletor guarde o histórico do lado dele enquanto isso.

## Próximos passos do lado da Luneta

1. **Coleta e exportação do PBCV toda semana** no PC do dono (`pbcv/README.md`): a base de 01/10 já tem 73% das
   praças vencidas, e só ~5 mil dos 21,7 mil imóveis apareceriam no site hoje.
2. **Importar o arquivo do PBCV num banco de teste** e conferir na `/previa`: nome do leiloeiro no cartão, fotos, praça,
   tags, links "Ver lote no site do leiloeiro" e "Site do leiloeiro".
3. **Importação automática:** acrescentar `coletar leiloeiros` ao workflow, lendo `pc/leiloeiros/pbcv-luneta.jsonl.gz`
   do branch `coletas-dados` (onde o `node base/coleta-pc.mjs --so-publicar` o põe), e o `leiloeiros:relatorio -- --site`
   depois do exportar.
4. **Página "Fontes e leiloeiros"** e os números do hero e do FAQ a partir de `relatorio-leiloeiros.json`
   (`totais.leiloeiros_com_ativos`, `totais.leiloes_ativos`, `totais.ativos_todas_as_fontes`). O site ainda não lê
   esse arquivo.
5. **Filtro de fonte com muitos leiloeiros:** hoje cada leiloeiro vira uma opção do filtro e uma linha em "Sobre os
   dados"; com dezenas, agrupar ("Caixa", "Leilões Judiciais", "Leiloeiros (N)") ou buscar por nome.
6. **Repetidos entre fontes no catálogo:** o mesmo imóvel na Caixa e num leiloeiro aparece duas vezes no site. As chaves
   já existem; falta escolher qual anúncio mostrar e ligar os dois.
7. **Histórico de praça na base** (migração 004), que o alerta de praça precisa.
8. **Regras que leem campos:** hoje dívidas e comissão viram frase para as regras de texto; quando houver volume, as
   regras de dívida e de custos podem ler `extras.debito_*` e `extras.comissao_pct` direto.

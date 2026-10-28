# O seu coletor de leilões (PBCV) e a Luneta: relatório completo

28/10/2026. Feito sobre o repositório privado `luneta-base` e a base `leiloes.db`, cuja última coleta é de 01/10/2026.
Nada foi alterado no seu repositório e nenhuma senha foi copiada. Os detalhes estão em `relatorios/`:

| Arquivo | O que tem |
| --- | --- |
| [`relatorios/AUDITORIA-CODIGO.md`](relatorios/AUDITORIA-CODIGO.md) | o código: o que é bom, o que melhorar, o que aposentar, a arrumação em etapas |
| [`relatorios/PLANO-ATUALIZACAO.md`](relatorios/PLANO-ATUALIZACAO.md) | de mensal para diário: faixas, coleta incremental, onde rodar, alertas |
| [`relatorios/RANKING.md`](relatorios/RANKING.md) | imóveis por leiloeiro, a curva 80/20, a classificação A/B/C e o top 50 |
| [`relatorios/ANALISE.md`](relatorios/ANALISE.md) | a regra de "é imóvel", os repetidos com a Caixa, as tags e a LGPD |
| [`relatorios/matriz-tags.csv`](relatorios/matriz-tags.csv) | para cada tag da Luneta: de onde vem, quantos imóveis ela pega, a precisão e a recomendação |
| [`relatorios/relatorio-leiloeiros.json`](relatorios/relatorio-leiloeiros.json) | o relatório por leiloeiro no formato do site |
| [`README.md`](README.md) | como exportar do seu PC para a Luneta |

## 1. O que você tem

Não são Apps Scripts: é um **coletor em Python bem feito**. São 823 sites de leiloeiros lidos por 188 "famílias" de
software (o mesmo software atende dezenas de leiloeiros), com uma base de 161 mil lotes de todo tipo de bem e um
histórico de entradas, saídas e mudanças de praça e de preço. Os Apps Scripts são só um painel sobre a planilha.

**O que é bom e fica:**
- **"Não sei" nunca vira zero.** Imóvel sem preço não aparece como "de graça".
- **Falha de site nunca vira "imóvel vendido".**
- **O robô se identifica, respeita o robots.txt e não burla bloqueio.**
- **Tudo o que foi baixado fica guardado**, para reprocessar sem rede.
- **Cada adapter novo só entra depois de provado** contra o site real.

## 2. Quantos imóveis há de verdade

| Etapa | Imóveis | Leiloeiros |
| --- | ---: | ---: |
| "Ativos" na sua base (imóvel e rural) | 35.333 | 566 |
| Corrigido pela regra de "é imóvel" (saem trator, gado, peças; entram casas que estavam como "desconhecido") | 34.728 | 558 |
| **À venda de verdade** (vistos na última coleta, abertos ou agendados) | **~24.000** | **531** |
| Com cidade e UF (o que a Luneta aceita) | 21.719 | 483 |
| Ainda com praça por vir em 28/10, sem coleta nova | **~5.000** | |

"Ativo" na sua base não quer dizer à venda. Ficam de fora:
- 5,9 mil suspensos antigos, quase todos de uma família de sites com praça entre 2018 e 2026;
- 1,8 mil encerrados ou vendidos;
- ~2 mil "zumbis": lotes que não aparecem há semanas, mas a trava de queda não deixa sair. O 1º do seu ranking tinha
  1.339 imóveis e só 25 à venda.

**A base envelhece rápido:** metade do estoque encerra em 8 dias. Por isso, a coleta mensal não serve para a Luneta.

## 3. Quem tem a maioria (e quem não vale a pena)

- 50% dos imóveis à venda estão em **24 leiloeiros**; 80% em **85**; 90% em **156**.
- **A, atualizar todo dia:** 34 leiloeiros com 12.906 imóveis (53%).
- **B, toda semana:** mais 90, que levam o total a 18.226 (76%).
- **C, não vale agora:** os outros ~500, que somam 24% dos imóveis. 281 deles têm menos de 10 imóveis. A rodada mensal
  basta para esses.
- **Consertar antes de atualizar mais** (11 leiloeiros, ~3 mil imóveis): kleiloes, trileiloes, jeleiloes, webleiloes,
  faroonline e outros chegam sem foto, avaliação, área ou endereço. jmleiloes e kronleiloes estão bloqueados pelo
  Cloudflare. Vale mais consertar o leitor do que aumentar a frequência.
- **Repetidos com a Caixa:** ~12% (quase todos em 8 leiloeiros). A matrícula não ajuda, porque a Caixa quase nunca a
  publica. A melhor chave é o número do imóvel na Caixa, e o exportador já manda esse número.

O top 50, com nome, plataforma e qualidade de cada um, está em `relatorios/RANKING.md`.

## 4. Problemas do código, por prioridade

1. **Revogue as duas chaves que estão no repositório:** a conta de serviço do Google (`google_credentials.json`) e a da
   Groq (`config_groq.py`). A da Groq serve a um código que nem roda.
2. **A rodada de 01/10 parou sozinha às 03:27**, com 246 de 823 sites, e ninguém foi avisado. A causa provável é o PC
   ter suspendido. Falta um alerta de falha.
3. **LGPD:**
   - a base guarda nomes de executados e exequentes, em ~15% dos imóveis à venda;
   - a exportação para Excel e a planilha publicam essas colunas;
   - o painel registra o IP de quem o abre.

   O exportador da Luneta nunca manda esses campos e mascara nomes nas descrições, com a mesma regra da Luneta, conferida
   em 168 casos.
4. **Os testes de regressão estão 30/30 vermelhos** e não cobrem as 174 plataformas novas. O canário de mudança de
   layout cobre 17 de 192 plataformas e não roda na rodada.
5. **Tipo do bem:** ~1,1 mil lotes classificados errado. A regra nova do exportador acerta 97,5% numa leitura de 200
   casos.
6. **Endereço:** 11 mil imóveis sem UF. A tabela de geolocalização recupera metade.
7. **Organização:** três gerações de coletor (`coletar.py`, `coletar_br.py`, `rodar_mensal.py`) e bancos e logs de
   teste soltos na raiz.

**O que aposentar, agora que o destino é só a Luneta:**
- **A IA Groq:** já não roda.
- **A planilha do Google e o painel do Apps Script:** só depois que a Luneta mostrar os leiloeiros. Antes, salve a aba
  "Triagem", com as suas decisões, e apague a aba "Acessos".

**Arrumação:** em 8 etapas pequenas, sem reescrever adapter que funciona (seção 6 da auditoria).

## 5. Tags: o que mapear agora e o que não

| Mapear agora | Como |
| --- | --- |
| Deságio alto ou baixo, lance acima da avaliação, sem fotos, 1ª praça, 2ª praça, praça única | campos da sua base (a Luneta calcula) |
| Ocupado e desocupado | pelo texto do lote: 95 a 100% de acerto |
| Condomínio em atraso, IPTU em atraso, construção irregular, só direitos, ação judicial, custos extras | pelo texto do lote |
| Cota-parte | só pelo título |
| Penhora de outros credores | pelo texto, com revisão |

**Não valem agora,** porque acertam pouco pelo texto:
- dívida que passa ao arrematante (50%);
- leilão com recurso (50%);
- direito de preferência (35%);
- área divergente (20%);
- pendência na matrícula (65%, até filtrar o texto padrão de um dos sites).

**Só lendo o edital** (fica para a leitura com IA): ocupação e dívidas ficam "não informado" em 94 a 99% dos lotes,
e o texto do lote não resolve. 43% dos imóveis têm o link do edital. Os campos `subjudice` e `penhorado` da sua base
estão vazios em ~95% dos casos e não servem.

## 6. Atualização diária ou semanal

**Proposta**, detalhada em `relatorios/PLANO-ATUALIZACAO.md`:
- **Três faixas:**
  - ~170 sites todo dia, com 90% dos imóveis vivos (os maiores, mais os que têm 2ª praça chegando);
  - ~120 toda semana;
  - o resto todo mês.
- **Coleta incremental:** ler o detalhe só de lote novo ou que mudou. Isso corta de 70 a 85% dos pedidos e faz a faixa
  diária caber em 30 a 60 minutos por noite (estimativa).
- **Onde:** começar no seu PC, que tem internet brasileira e custo zero.
  - Ajuste o Windows para não suspender: Energia → Nunca, e a tarefa marcada como "Acordar o computador".
  - Falta fazer: um vigia na Luneta que manda e-mail se a coleta do dia não chegar.
  - Em paralelo, um teste de uma semana no GitHub Actions. 72% dos imóveis da faixa diária estão atrás do Cloudflare,
    que pode barrar os servidores do GitHub.
  - Servidor pago no Brasil só se os dois falharem.
- **Como chega à Luneta:** depois da coleta, rode:
  ```
  python base/leiloeiros/pbcv/exportar.py --banco C:\caminho\leiloes.db
  node base/coleta-pc.mjs --so-publicar
  ```
  O arquivo vai comprimido (~8 MB) para o branch `coletas-dados`, e a Luneta importa de lá. O passo a passo está em
  `README.md`.

## 7. Próximos passos

**Você:**
1. **Revogar as duas chaves:** no Google Cloud, a conta de serviço; no painel da Groq, a chave.
2. **Rodar uma coleta nova** e exportar com os dois comandos acima. Com dados frescos, a Luneta importa e mostra ~16
   mil imóveis de leiloeiros, além dos 21 mil da Caixa.
3. **Decidir:**
   - a lista A/B/C;
   - onde a coleta diária roda (recomendo o PC agora, com o teste no Actions);
   - se vale contatar a Superbid e a LeilõesBR para liberar o robô identificado.

**Eu, depois da coleta nova:**
1. Importar o arquivo, localizar os imóveis no mapa (CNEFE) e calcular a nota de localização.
2. Pôr no site:
   - "[X] leiloeiros monitorados" com o número real;
   - a página "Fontes e leiloeiros", com quantos imóveis cada um tem;
   - o filtro por leiloeiro.
3. No seu coletor, se você liberar (hoje só tenho leitura):
   - a coleta diária por faixa e incremental;
   - o alerta de falha;
   - a limpeza dos zumbis e suspensos;
   - a nova regra de tipo do bem;
   - o conserto dos 11 leiloeiros grandes com dado ruim.
4. A leitura dos editais com IA, para ocupação e dívidas.

Nenhuma classificação é garantia sobre o imóvel. As tags são uma análise dos dados publicados.

# Luneta de Leilões · onde estamos e pendências

Este é o arquivo central do projeto: **onde estamos, que dados temos, o que falta e o próximo passo**. Atualizado a cada
entrega (última atualização: 14/10/2026, correções da revisão do catálogo).

- **Site:** landing em Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + GSAP 3, publicada em
  https://luneta-de-leiloes.vercel.app (fora do Google até o lançamento). Área do assinante de demonstração em `/assinante`
  (exemplos fictícios) e prévia com dados reais em `/previa` (sem link, noindex).
- **Base de dados:** pasta `base/` (SQLite do Node, sem dependências). Detalhes em `base/README.md`, fontes em
  `base/FONTES.md`, caminho até o site em `base/FASE1-SITE.md`.
- **Análise de negócio, conversão e jurídico:** https://claude.ai/artifact/RnPsHqp5eHTY9Fggiwbpd7

## Painel (14/10/2026)

### Que dados temos hoje

| Fonte | Como entra | O que temos no banco | Atualização |
| --- | --- | --- | --- |
| Caixa (lista oficial CSV) | arquivo público oficial (opção 1) | **21.226 imóveis** da lista de 08/10/2026: endereço, preço, avaliação, deságio, modalidade, financiamento, área, quartos, link e URL da foto | carga única, ainda não ao vivo (rede bloqueada neste ambiente) |
| Caixa (página de cada imóvel) | leitura da página (opção 2 leve) | **0**: leitor pronto e testado em 2 páginas reais (matrícula, regras de condomínio e IPTU, FGTS, datas de leilão, edital) | precisa da rede |
| Leilões Judiciais (API MCP pública) | API documentada (opção 1) | **10 lotes de amostra** (vários leiloeiros), com fotos, edital, matrícula e laudo | conector pronto, nunca chamado ao vivo |
| Radar de editais (PNCP, Diário da Justiça, DOU, Querido Diário) | APIs públicas (opção 1) | **0**: conectores prontos; DOU precisa de conta gratuita no INLABS | precisa da rede |
| Itaú, C6, Bradesco, Santander, BB, prefeituras, Zukerman, Mega, Superbid… | **sem API pública**: raspagem (opção 2) | **0** | ainda não construído |

Resumo: **só a Caixa está de fato no banco.** As outras fontes com API estão ligadas no código, mas esperam a rede. Bancos
privados, prefeituras e a maior parte dos leiloeiros não têm API: entram na opção 2.

**"Não acho Minas Gerais" (14/10/2026):** os dados sempre estiveram no banco (747 imóveis de MG, igual ao CSV da Caixa); a
/previa antiga mostrava só uma amostra de 60 e não tinha filtro de estado. Resolvido de vez com o app do catálogo abaixo:
a /previa agora mostra o banco inteiro, e "Minas Gerais" (filtro, busca ou mapa) dá os 747. MG pesa pouco (3,5%) porque
reflete o estoque da Caixa (RJ tem 34%); judiciais, bancos privados e leiloeiros de MG entram com o radar e a opção 2.

**App do catálogo (14/10/2026): a /previa agora mostra o banco inteiro** (21.231 imóveis, não mais a amostra de 60), com
a busca, os filtros, a ordem e a paginação no servidor; "Estado: Minas Gerais" dá os 747. O mesmo app serve a
/assinante (os 6 exemplos fictícios, selos ligados):
- lista (linhas com foto grande e o mapa numa coluna fixa à direita) ou cards (grade de 1 a 4 colunas, mapa em faixa em
  cima); a escolha fica salva no navegador; no celular, cards e o botão flutuante "Ver no mapa";
- passar o mouse num imóvel acende a cidade no mapa, e a cidade no mapa acende os imóveis dela; "Ver só esta cidade";
- a barra de filtros fica fixa (no celular some ao rolar para baixo e volta ao rolar para cima);
- a busca inteira vai na URL: o link compartilhado e o "voltar" do navegador reabrem a mesma busca, na mesma posição;
- "Ver como: Lente | Luneta" no cabeçalho; no Lente, tags, selos e favoritos travados com o convite à Luneta.
- Peso no navegador (build de produção): 209 KB de JavaScript comprimido na primeira carga (139 KB são do Next e do
  React, ~70 KB do app); o mapa (37 KB) só baixa quando aparece; a página chega pronta do servidor (HTML de 41 KB
  comprimido), sem esqueleto. Os links para a landing ("voltar ao site", "Plano Luneta") não a pré-carregam mais (eram
  ~300 KB baixados em toda visita ao catálogo).
- Revisão (14/10/2026): o mapa ao lado da lista cabe inteiro na tela já no topo da página (a legenda saía cortada pela
  faixa de aviso); saindo do "Nenhum imóvel" a lista mostra esqueletos em vez de tela vazia; busca por texto sem espera
  extra no Enter (a espera de 300 ms fica só para texto mudando seguido); a lista é pedida antes do mapa; pop-up fechado
  sem mudança não volta à página 1; com erro, a lista antiga fica esmaecida; o aviso da troca para a Luneta na prévia não
  promete selos (estão em análise); botões de toque com 44 px.

**Correções da revisão do catálogo (14/10/2026): lista, filtros, mapa, cartões, cabeçalho e rodapé.**
- **Mapa no lugar certo:** cidades só se juntam com cidades do mesmo estado (SP e RJ nunca viram uma bolha só; antes, os
  490 imóveis da capital paulista apareciam numa bolha sobre o RJ). A bolha do grupo fica sobre a maior cidade dele, e o
  grupo tem um anel por dentro (◉), explicado na legenda ("Uma cidade" · "Cidades próximas"). Só uma bolha pequena cujo
  centro a vizinha cobriria entra no grupo do outro estado (Juazeiro/BA com Petrolina/PE). No Brasil inteiro as bolhas
  ficam ~25% menores; siglas cobertas por bolhas somem; com poucas bolhas (a /assinante) todas ganham nome e 1 imóvel não
  vira a bolha máxima; um resultado fora da curva não joga o grupo principal para o canto; Esc fecha o cartão aberto pelo
  mouse; "Pular o mapa" para quem usa teclado.
- **Barra de filtros:** no computador, as pílulas só mostram o que não tem botão rápido (os botões já dizem "SP, MG",
  "Até R$ 300 mil", com um × para limpar); o total fica à esquerda. Colada no tablet ou em tela baixa, vira uma linha só
  (busca, total, ordenar, filtros); some ao rolar para baixo no celular, no toque e em tela baixa (num celular deitado a
  barra ia a 76% da tela; agora 73 px). O cabeçalho só fica fixo com altura de sobra (≥ 801 px).
- **Busca:** "ap 2 quartos", "apartamento 1 quarto", "casa 3 qts", "2+ dormitórios", "sobrado", "lote" viram tipo e quartos
  de verdade ("ap" sozinho continua sendo o Amapá); número casa a palavra inteira ("1" não acha 101). O nome exato de uma
  cidade + Enter aplica a cidade ("belo horizonte" dava 22 imóveis de Belford Roxo; agora os 37 de BH); a busca que é só um
  nome de cidade ou bairro não casa com endereço; "bh", "poa", "floripa". As sugestões de lugar não ficam presas à busca
  ou ao estado atuais ("Campinas (adiciona SP)").
- **Lista e cards:** linha do notebook com a altura da foto (foto de 328 px, tags e selo na coluna, coração no canto: 2 a
  3 imóveis por tela); no celular dá para escolher lista (linha compacta, 4 a 5 por tela) ou cards. Cidade e UF nunca
  somem do local (o bairro é que encolhe; bairro igual à cidade não se repete). "Selo em análise" não se repete em cada
  cartão. Vista Cards: mapa em faixa baixa com "Cidades com mais imóveis" ao lado e "Recolher mapa" (começa recolhido em
  tela baixa).
- **Textos:** a tag "Preço acima do mercado" virou **"Lance acima da avaliação"** (a regra só compara com a avaliação;
  slug igual, base e instantâneo atualizados). Deságio em palavras nos filtros ("Lance até 10% acima da avaliação", régua
  de "50% acima" a "90% abaixo" com a marca da avaliação), nunca "−10%" com sentido trocado. Foto: "Sem foto na fonte",
  "A foto não carregou do site da fonte" ou "Exemplo fictício: sem foto", conforme o caso. Lance acima de 5× a avaliação
  (erro da fonte, como o apartamento de R$ 69,7 mi) aparece como "valor fora do padrão: confira no anúncio", vai para o fim
  das ordens e sai das réguas. "Mais recentes" e "Praça mais próxima" aparecem desligadas com o porquê quando não mudam a
  lista.
- **Navegação:** trocar de página, aplicar o painel, buscar um texto e escolher a cidade no mapa entram no histórico (o
  "voltar" não sai mais do catálogo); o "voltar" do Android fecha a folha de filtros. "Ver no mapa" (celular) devolve ao
  mesmo imóvel ao fechar e sai da frente da paginação e dos pop-ups. Painel "Todos os filtros" com as 9 seções sempre à
  vista numa coluna à esquerda (720 px); no celular, listas sem rolagem dentro da folha ("Mostrar todos os 27 estados").
  Faixa digitada não troca mais o mínimo pelo máximo antigo.
- **Acessibilidade:** campos com 16 px no toque (sem zoom no iPhone), foco com anel de contraste, placeholders e siglas
  do mapa com 4,5:1, listas fora do Tab, "Pular para os resultados" vai direto à lista (2 Tabs, eram 38), links dos
  cartões com local e lance no nome acessível, "1 imóvel" no singular.

### Próximos passos (em ordem)

1. **Rede ou rotina de coleta** (você): liberar a rede do ambiente, ou aprovar a coleta agendada (ver "Atualização" abaixo).
   Com isso: primeira coleta ao vivo da Caixa, da Leilões Judiciais e do radar, e leitura das páginas da Caixa.
2. **Lista do LeilãoMap** (você): mandar print ou lista dos leiloeiros/bancos/prefeituras que aparecem lá, para eu
   priorizar a opção 2 pelo que o concorrente cobre.
3. **Opção 2** (eu): conectores por plataforma, começando pelas que cobrem mais bancos e leiloeiros de uma vez (ver
   "Opção 2: o que falta mapear" abaixo).
4. **Tags confiáveis** (eu + advogado): ler a página e o edital de cada imóvel com IA (custo na seção "Ler cada leilão
   com IA"); o advogado classifica 100 imóveis às cegas e escolhemos o modelo mais barato que acertar o suficiente.
5. **Leilões Judiciais** (você): ler os termos e mandar o pedido de autorização (rascunho em
   `base/contatos/leiloesjudiciais-email.md`).
6. **Decisões suas** pendentes (lista abaixo) para avançar no site (formulário, advogado, preços, título, página mais curta).
7. **Catálogo novo (14/10/2026), decisões suas:**
   - o **simulador** fica aberto no plano Lente ou só na Luneta? (hoje aberto; não está na tabela de planos da landing);
   - a **meta padrão do simulador** (hoje 20% ao ano: com o lance mínimo só ~1 em 10 apartamentos/casas atinge; opções na
     seção "Página do imóvel");
   - **preço de mercado:** autorizar o próximo passo com ITBI (Rio e SP primeiro, dados abertos e grátis) e mandar e-mail
     à Fipe pedindo autorização do FipeZAP; pedidos pela LAI nas capitais sem ITBI aberto;
   - **Querido Diário:** escrever à OKBR confirmando uso comercial (dados CC BY 4.0, mas os termos falam em "finalidade");
   - conferir no seu navegador as **fotos da Caixa** e o **PDF da matrícula** (daqui a rede não chega à Caixa).

### Atualização: como funciona

Não existe "tempo real" nas fontes: cada uma publica no seu ritmo, e a base busca de tempos em tempos. Proposta de agenda:

| O quê | Frequência | Por quê |
| --- | --- | --- |
| Lista da Caixa | 1× por dia, 7h | a Caixa gera o arquivo em dias úteis |
| Páginas da Caixa (só novos e alterados) | 1× por dia, depois da lista | poucas centenas por dia, com intervalo de 2 s entre páginas |
| Leilões Judiciais | a cada 6 h | lances e status mudam ao longo do dia |
| Radar de editais | 1× por dia | publicações diárias |
| Leilões com praça hoje ou amanhã | a cada 1 h | pegar suspensão, adiamento e resultado |
| Alerta de 2ª praça | depois de cada coleta | compara a praça de cada favorito com a coleta anterior |

Onde rodar (decisão sua): (a) **Vercel Cron** com a função na região de São Paulo gravando num Postgres gerenciado (Neon ou
Supabase): é o caminho natural quando o site for ler do banco; limites do plano grátis a confirmar na documentação da
Vercel; (b) **GitHub Actions** agendado (grátis, já existe a rotina manual `base-coleta.yml`), mas os servidores ficam fora
do Brasil e a Caixa pode bloquear; (c) um **servidor pequeno no Brasil** (custo não confirmado). O lance ao vivo continua no
site do leiloeiro: a Luneta mostra o status e leva até lá.

### As tags são confiáveis?

Com o que temos hoje (só a lista da Caixa), **em parte**:

| Confiança | Tags | Motivo |
| --- | --- | --- |
| **Alta** (dado direto da fonte) | Aceita financiamento · Devedor com direito de preferência (Leilão SFI, Lei 9.514) · Deságio alto/baixo · Ocupação não informada | campo da Caixa ou conta exata sobre preço e avaliação; o limiar de deságio (40% / 20%) é provisório e a avaliação da Caixa pode estar desatualizada |
| **Média** (inferência) | Praça única (pela modalidade) · Imóvel inteiro (venda do próprio banco, sem sinal de fração) | regra razoável, mas não está escrita no dado |
| **Em revisão** | Lance acima da avaliação (2.039 imóveis; antes "Preço acima do mercado") | compara só com a avaliação: não temos preço de mercado |
| **Sem dado ainda** | Ocupado/Desocupado · Condomínio e IPTU em atraso · Dívida passa ao arrematante · Ação judicial · Penhora · Recurso · Matrícula · Construção irregular · Área divergente · Cota-parte · Sem vistoria · Sem fotos (fotos não conferidas) | a lista da Caixa não traz isso; vem da página do imóvel, do edital e da matrícula |

As regras foram escritas com textos reais e a base tem 425 testes, mas o corpus é pequeno (10 lotes, 2 páginas da Caixa,
cláusulas de editais) e **a precisão nunca foi medida numa amostra rotulada**. Por isso: no site, só as tags de confiança
alta aparecem como fato; o resto fica "em revisão" ou "não informado" até a auditoria do advogado.

### Fontes com API ou dados públicos: custo e dificuldade

"Aberta" = sem custo e sem chave. Dificuldade = trabalho para ligar e manter (baixa/média/alta).

| Fonte | O que traz | Aberta ou custo | Dificuldade | Situação |
| --- | --- | --- | --- | --- |
| Caixa: lista oficial (CSV) | imóveis da Caixa (preço, avaliação, modalidade, financiamento) | aberta | baixa | **no banco** (21.226) |
| Caixa: página e edital de cada imóvel | matrícula, regras de condomínio/IPTU, datas, ocupação (no edital) | aberta | baixa a média (anti-robô Radware) | leitor pronto, falta rede |
| Leilões Judiciais (API MCP) | lotes de vários leiloeiros, com fotos, edital, matrícula e laudo | aberta, sem chave; **pedir autorização** | baixa (pronto), mas 10 resultados por busca | 10 lotes de amostra |
| PNCP (governo) | editais de leilão de órgãos públicos, inclusive prefeituras (ex.: São Paulo) | aberta | média (filtrar imóveis; sem foto) | pronto, falta rede |
| Comunica PJe / Diário da Justiça | editais de leilões judiciais (texto) | aberta | média a alta (texto livre, muito volume, dados pessoais) | pronto, falta rede |
| Diário Oficial da União (INLABS) | avisos federais (SPU, estatais) | aberta com cadastro gratuito | média | pronto, falta a conta |
| Querido Diário | diários oficiais de parte dos municípios | aberta (projeto da Open Knowledge) | média, cobertura parcial | pronto, falta rede |
| Resale | imóveis de Santander, BTG, Pan, BRB, BB (segundo a pesquisa) | **com chave: contrato comercial** (preço não divulgado) | baixa depois do contrato | não ligado |
| Suporte Leilões | sistema usado por ~107 leiloeiros | autorização de **cada** leiloeiro (parceria) | baixa técnica, alta comercial | não ligado |
| DataJud (CNJ) | andamento do processo (ação, recurso) | gratuita, mas **uso comercial só com termo do CNJ** | média | bloqueado até o termo |
| SPU: imóveis da União | terreno de marinha, aforamento (custos extras, "só direitos") | aberta | média (endereço do arquivo não confirmado) | não ligado |
| IPTU de SP e Fortaleza (Base dos Dados) | área construída oficial (área divergente, construção irregular) | aberta (cota gratuita) | média | não ligado |
| Banco Central (IVG-R) | tendência de preço de imóveis (não é preço de mercado) | aberta | baixa | não ligado |

Itaú, C6, Bradesco, Santander (no varejo), BB, Zukerman, Mega, Superbid e a maioria dos leiloeiros **não têm API
pública**: ver "Opção 2" abaixo.

**Leilões Judiciais: o que fazer** (você)
1. Ler os termos de uso no site (daqui não abre).
2. Mandar o pedido de autorização: rascunho pronto em `base/contatos/leiloesjudiciais-email.md` (uso comercial, fotos
   por link, limite de consultas, existência de listagem completa, atribuição).
3. Com a resposta e a rede liberada, eu rodo a primeira varredura (27 UFs × termos, cerca de 405 buscas) e medimos a
   cobertura real.

### Diários e editais em texto (DJEN, DOU, Querido Diário): o que dão

Os três são **grátis** (o DOU pede só uma conta no INLABS) e entregam **texto**, sem foto e sem campos de preço por praça. O
PNCP é a exceção: traz campos estruturados e os arquivos do edital (PDF do edital, laudo, matrícula).

| Fonte | O que vem | Link do documento (`url`) | Link do leilão (`site_leilao`, desde 14/10/2026) |
| --- | --- | --- | --- |
| Diário da Justiça (DJEN / Comunica PJe) | texto do edital, processo, vara, tribunal (MG: TJMG, TRT3 e TRF6) | comunicação no sistema do tribunal | site do leiloeiro citado no texto ou no HTML |
| DOU, seção 3 | avisos de órgãos federais (ex.: Patrimônio da União) | página da matéria no DOU | site citado no texto (muitas vezes gov.br ou o leiloeiro) |
| Querido Diário | trechos dos diários oficiais de parte dos municípios | PDF do diário | site citado nos trechos (o trecho pode cortar o site) |
| PNCP | objeto, datas, valor, órgão e arquivos do edital | página da compra no PNCP | `linkSistemaOrigem`, o sistema onde a disputa corre |

**Como chegar ao leilão:** o edital judicial quase sempre diz onde o leilão acontece ("leilão eletrônico pelo site
www..."). O CPC (art. 887, §2º) manda publicar o edital na internet, num site designado pelo juiz, em geral o do leiloeiro. A
base agora extrai esse endereço e o guarda em `site_leilao`, separado do documento oficial. Limites:
- o link costuma levar à página do leiloeiro ou do leilão, nem sempre ao lote exato; casar com o lote exige ler o site do
  leiloeiro (opção 2);
- quando o texto não cita site, sobram o nome do leiloeiro e o número do processo, para busca manual;
- o DJEN pode vir truncado (a única amostra real de edital veio cortada antes da descrição do bem), e aí o texto completo
  fica no documento do tribunal.

**Leilões que nenhum outro site tem?** Ninguém tem acesso exclusivo: os editais são públicos por lei, e o leilão judicial
também está no site do leiloeiro. A vantagem é **achar** o que os portais grandes não juntam:
- **Prefeituras pequenas** (Querido Diário): é a melhor chance. Municípios com até 20 mil habitantes ainda podem publicar só
  no diário oficial em vez do PNCP (Lei 14.133, art. 176, prazo até 2027), e terrenos e lotes de prefeitura raramente
  entram nos portais de leilão.
- **Leiloeiros pequenos e varas do interior** (DJEN): o leilão está no site do leiloeiro, mas os agregadores leem só as
  plataformas maiores. Ainda não está confirmado que todo edital de leilão passa pela Plataforma de Editais (`meio=E`).
- **Órgãos federais** (DOU): imóveis da União e de autarquias, que costumam estar também no site do órgão.
- **Fora dos diários:** os leilões extrajudiciais dos bancos (Itaú, Bradesco, Santander, C6, alienação fiduciária) não
  passam por nenhum desses diários. Saem em jornal e no site do leiloeiro: continuam sendo opção 2.

**Quantos são, não sabemos ainda.** Medir quando a rede abrir: 2 semanas de radar, depois uma amostra de 50 editais
conferida à mão no LeilãoMap e nos portais grandes, para saber quantos são "só nossos" e quantos trazem `site_leilao`.

### Radar de diários × raspagem dos leiloeiros: custo e ganho (pesquisa de 14/10/2026)

Os números de mercado conflitam e nenhum é oficial. Faixa de trabalho: **19 a 25 mil imóveis por mês** entram em leilão
no país (Abraim: 116,6 mil no 1º semestre de 2025; SPY Leilões: cerca de 300 mil "leilões" em 2025, contando praças).
Cerca de **68% são extrajudiciais** (bancos e Caixa, Lei 9.514), e esses **não passam por diário oficial**: só aparecem
em jornal e no site do leiloeiro. Os outros 32–40% (6 a 10 mil/mês) são judiciais.

| | Radar (DJEN, DOU, Querido Diário, PNCP) | Raspar os ~30 maiores (10 plataformas white-label, ~15 leiloeiros, ~5 bancos) |
| --- | --- | --- |
| Imóveis/mês (estimativa) | ~1 mil / 3 mil / 6,5 mil (baixa/média/alta), antes de tirar repetidos | estoque fora da Caixa ~6 mil / 12 mil / 20 mil |
| Quantos "só nossos" | **sem dado** (medir: amostra de 200) | ~0 em relação aos portais, mas todos novos para a Luneta |
| Traz foto e lance atual? | não (texto oficial + link) | sim |
| Construção | 40–80 h (conectores já prontos) | 160–520 h |
| Custo mensal | ~R$ 300–1.700 (manutenção 2–8 h) + €0–6 de servidor + US$ 1–20 de IA (Haiku 5.5 em lote) | ~R$ 650–24.000 (manutenção 5–120 h) + US$ 0–1.000 de proxy/anti-robô |
| Risco | baixo (atos oficiais não têm direito autoral; LGPD com máscara) | termos de uso, anti-robô (Superbid, Grupo Lance), CPF de depositário em algumas plataformas |

O que sustenta os números:
- **Querido Diário:** 440 municípios com raspador (7,9% do país), medido no repositório oficial.
- **DJEN:** a Justiça do Trabalho publica nele desde 01/08/2024; os TJs podem publicar o edital só no site do leiloeiro
  (CPC art. 887 §2), por isso a fração de editais judiciais no DJEN é **hipótese** (15% / 35% / 60%).
- **Horas e tokens:** são estimativas próprias. Tudo vem de buscas na web, porque o proxy deste ambiente bloqueou as
  páginas oficiais; conferir antes de usar em material público.

**Conclusão: não é um ou outro, é os dois, em ordem.** O radar é barato, seguro e traz o texto oficial para as tags de
risco (ônus, ocupação, débitos) e leilões judiciais e públicos de leiloeiros pequenos. A raspagem traz volume, fotos e
o extrajudicial dos bancos. Ordem proposta:
1. **Semana 1, medição** (8–16 h, < US$ 5 de IA), quando a rede abrir. Medir: volume real do DJEN, DO3, Querido Diário
   e PNCP; tokens de 50 editais; amostra de 200 para a fração de "novos". Decisão: com ≥ 2 mil/mês e > 15% novos, o
   radar vira fonte; com < 500/mês ou < 5% novos, fica só para enriquecer as tags.
2. **Semanas 2–3:** radar em produção (filtro + Haiku 5.5 em lote; Sonnet 5.5 só nos ~15% ambíguos).
3. **Semanas 2–4:** ficha, fotos e edital da Caixa (completam os 21 mil imóveis).
4. **Semanas 3–6:** plataformas white-label com JSON (~10 conectores alcançam ~490 sites de leiloeiros).
5. **Em paralelo:** pedir parceria à Resale (Santander, BB, BTG), Suporte Leilões e Superbid.
6. **Depois:** leiloeiros individuais escolhidos pelo que o radar mostrar que falta; por último, os sites com Cloudflare.

**Novidades jurídicas a vigiar** (fontes secundárias; o proxy bloqueou planalto.gov.br e cnj.jus.br):
- **PNAJ:** Provimento CN-CNJ 255/2026 (19/08/2026) criaria a Plataforma Nacional de Alienações Judiciais, obrigatória
  120 dias depois da homologação. **Não confirmado:** se valer, vira a fonte nacional única de leilão judicial eletrônico.
- **Lei 14.133, art. 176:** municípios até 20 mil habitantes publicam só em diário oficial até **01/04/2027** (depois,
  PNCP). Caixa e BB seguem a Lei 13.303 e não precisam estar no PNCP.

### Preço do m² na região e anúncios: o que dá sem custo (pesquisa de 14/10/2026)

- **Já no site (sem rede):** referência de R$/m² entre imóveis da base do mesmo tipo (bairro com ≥ 5 imóveis, senão
  cidade, senão UF), com mediana e faixa, comparando com o lance por m². Rótulo fixo: "avaliação da fonte, não é preço
  de mercado". Cobertura: 680 grupos bairro+tipo com ≥ 5 imóveis (13,6 mil imóveis); por cidade+tipo, ~18,8 mil.
- **Anúncios:** **não existe API pública e grátis de anúncios** no Brasil, e os termos do ZAP (Grupo OLX) proíbem robôs.
  O legal e sem custo é **link de busca** já filtrado, abrindo o portal em nova aba. No site, usamos busca no Google com
  "site:" para cada portal (funciona sem depender do formato de URL de cada um). Cards de anúncios dentro do site
  exigiriam contrato (DataZAP, QuintoAndar, Loft: pagos, sem preço público).
- **ITBI (transações reais) — feito em 17/10/2026 (rodada 3, dados):** coletado no GitHub Actions (`base-itbi.yml`) e
  versionado em `base/saida/site/itbi/` (418 KB): **São Paulo** 95.084 transações (set/25 a set/26), **Rio** 47.173
  (out/25 a set/26, planilha de transações da Fazenda), **Porto Alegre** 20.396, **Fortaleza** 23.635 (o arquivo do
  portal vai até fev/2026) e **Recife** 16.952. A página recebe as referências por rua, bairro e cidade
  (`fonte: "itbi"`, com período) e a tabela "temos / não temos" (`vizinhanca.cobertura`).
  **Área (revisão de 17/10/2026):** SP e Fortaleza publicam a área dos apartamentos e salas COM a parte comum do
  prédio; comparada com a área privativa da base, a avaliação parecia o dobro do preço pago na mesma rua (SP 2,0;
  Fortaleza 1,6). Esses tipos ficam sem o ITBI, com o motivo na página (`cobertura.semComparacao`); casas e terrenos
  comparam. Imóveis da base que comparam e casam (rua / bairro / cidade): Rio 1.717 / 3.087 / 3.224 de 3.224; POA
  178 / 191 / 227 de 227; Recife 22 / 25 / 26 de 26; SP 7 / 14 / 32 de 32 (dos 490); Fortaleza 0 / 18 / 22 de 22
  (dos 94). Valor: declarado em SP e no Rio; base de cálculo da prefeitura em POA e Fortaleza; avaliação da prefeitura
  no Recife (a tabela de cobertura diz qual). **BH (37 imóveis): o portal da PBH devolve HTTP 403 ao GitHub Actions** (API, páginas e
  download direto); o conector está pronto e precisa rodar de uma rede no Brasil. Licenças de SP, Rio e POA: a
  confirmar. Detalhes em `base/fontes/itbi/README.md`. Salvador, Goiânia, Brasília, Curitiba, Florianópolis, Campinas e
  Niterói: sem base aberta; pedir pela LAI.
- **Preço do m² na base por RUA, BAIRRO, CIDADE e ESTADO:** a mesma rua (n ≥ 3, mesma cidade; 8.883 imóveis têm),
  bairro (n ≥ 5), cidade (n ≥ 5) e UF, com média sem as pontas, mediana e quartis. Buscas nos portais por nível (mesma
  rua, mesmo bairro, cidade). Revisão: "Rua Três", "Rua Nova", "Rua Principal" (repetem em cada loteamento) só juntam
  imóveis do mesmo bairro; endereço que começa por lote, chácara ou quadra de Brasília não vira rua.
- **Matrícula da Caixa ("não informada" com matrícula no site):** a ficha só abre de rede no Brasil (o GitHub Actions
  recebeu o desafio anti-robô nas 5 fichas de teste; não contornamos). A página mostra "na página da Caixa" com o link.
  Caminho pronto: baixar as fichas de uma rede no Brasil (`base/fontes/caixa/baixar-fichas.ts`) e aplicar com
  `npm run base:fichas -- --arquivo fichas.json`; a exportação leva matrícula, comarca, ofício, inscrição, averbação e a
  data ao site. **Decisão do dono:** de onde rodar as fichas (o PC dele, uma VPS no Brasil).
- **Tendência:** série IVG-R do Banco Central (SGS 21340, JSON), só nacional.
- **FipeZAP** (56 cidades, mensal): consulta grátis, mas sem termos de uso comercial encontrados. **Pedir autorização à
  Fipe** antes de exibir; até lá, no máximo um link para o informe.

### Página do imóvel (14/10/2026)

`/previa/imovel/<id>` (dados reais, interna, noindex) e `/assinante/imovel/<id>` (exemplos fictícios), com `?plano=lente`
para ver como no plano Lente. Tudo o que a base tem do imóvel numa página só:
- galeria grande (setas, miniaturas, deslizar no celular, tela cheia com ← → Esc); sem foto, o desenho do tipo;
- resumo fixo à direita (no celular, barra no pé da tela): lance, avaliação, deságio, praça e data, "Ver anúncio na fonte",
  "Simular lance", favoritar e compartilhar;
- seções com navegação fixa: resumo (todos os campos; o que falta diz "não informado pela fonte"), riscos (tags por
  gravidade com a evidência ao clicar, as "em revisão" à parte, selo), simulador, preço do m² na região (faixas de
  bairro, cidade e estado, com a frase "o lance por m² é X% menor que a mediana…"), imóveis parecidos, buscas nos portais,
  localização, documentos e links, dados da fonte;
- "Voltar à busca" volta para a última busca da lista (mesma aba), no plano da página;
- id que não existe responde 404 com o caminho de volta à lista.

Pendências da página:
- [ ] **Decisão sua:** o simulador fica aberto no plano Lente por enquanto. Travar, deixar aberto ou abrir só uma parte?
- [x] Legenda do mapa pequeno: agora segue a precisão de verdade ("pela rua" nos imóveis da Leilões Judiciais, "centro
  da cidade" na Caixa).
- [ ] Fotos da Caixa: não carregam deste ambiente (rede bloqueada); a página mostra o desenho no lugar. Conferir no navegador
  (celular e computador). Se todas as fotos falharem, a galeria vira um desenho só, sem setas nem tela cheia.
- [x] Simulador, matriz "Cenários e prazos": o nome que o leitor de tela ouve em cada célula agora começa pelo número que
  aparece (WCAG 2.5.3, comando de voz).
- [ ] **Decisão sua: a meta padrão do simulador.** Com 20% ao ano, 12 meses e cenário base, só ~1 em cada 10 apartamentos e
  casas atinge a meta com o lance mínimo (7% dos apartamentos, 9% das casas, 27% dos comerciais, 42% dos terrenos): a página
  quase sempre abre com "não atinge sua meta". Opções: (a) meta de 15% ao ano; (b) meta "render mais que a aplicação"
  (10% a.a. + margem); (c) o cartão abre pelo retorno com o lance mínimo ("com o lance mínimo: 5,8% ao ano") e a meta vira
  pergunta logo abaixo. Por ora, o aviso de "não atinge" já diz o retorno com o lance mínimo e a meta lado a lado.
- [ ] Preço de mercado na região: hoje a seção compara com outros leilões e os botões dos portais são buscas no Google
  (agora rotuladas assim). Próximo passo: a mediana de R$/m² das transações reais do ITBI (dado aberto) do Rio e de São
  Paulo como uma barra a mais no gráfico ("Transações reais, ITBI, 12 meses"); cobre 3.225 imóveis do Rio e 490 de SP.
- [x] Máscara LGPD: o nome logo depois de "Rua", "Av.", "Travessa" deixou de ser mascarado (`base/util/lgpd.ts`); riscos
  recalculados e instantâneo regerado em 14/10/2026 (nenhum "Rua [NOME]" restante; os 14 nomes de pessoas seguem
  mascarados).
- [ ] Matrícula da Caixa: a página oferece o PDF no endereço padrão do site da Caixa (`/editais/matricula/{UF}/{id}.pdf`),
  sem conferir se existe (a rede daqui não chega à Caixa). Conferir alguns no navegador.
- [ ] Ao abrir um imóvel a partir da lista, o esqueleto de carregamento não aparece: a página confere o id antes (para o
  id inexistente dar 404 de verdade) e o navegador espera a resposta (~0,2 s aqui; mais no 4G). Se ficar lento no
  celular, dar um sinal no clique do cartão ou aceitar um 404 "suave".
- [ ] O 404 do imóvel é desenhado no navegador (limitação do Next com notFound() fora de um Suspense): sem JavaScript,
  fica em branco. O tema salvo é reaplicado.

Revisão (14/10/2026), corrigido: preço por hectare com o rótulo "por hectare" (e o gráfico da região em R$/ha); valor
absurdo da fonte (ex.: lance de R$ 69 mi num apartamento) não esmaga mais o gráfico e ganha o aviso "confira na fonte";
"menor que o de 0%/100%" virou frase que se lê; o resumo lateral mostra "1 possível risco grave" entre as em revisão;
contador da galeria sem pular fotos ao deslizar; tela cheia sem parada muda no Tab; título da aba sem repetir a cidade;
descrição longa já vem fechada do servidor (a página não encolhe ao carregar); 404 do imóvel no tema claro.

Revisão 2 (14/10/2026), corrigido: nada que recebe o foco fica sob o cabeçalho, a navegação ou a barra do pé (e focar o
"Ver como" não rola mais a página); celular deitado com o cabeçalho rolando junto; "Ver como Lente/Luneta" mantém a
seção à vista; "Compartilhar" abre a folha do sistema no celular; simulador com o pedido das dívidas apontadas no próprio
cartão (o número sai marcado "sem as dívidas" até a pessoa informar), galpão e prédio inteiro com reforma por m² menor e
sem condomínio (sala e loja com condomínio ligado), parcelamento da fonte (judicial: entrada e parcelas corrigidas) como
forma de pagamento, detalhe abrindo no lance mínimo, "≈"/"−0,3%" no lugar de "−0%", aviso de lance abaixo do mínimo e de
lance acima de 3 vezes a avaliação, alvos de toque de 44 px, matriz legível em 320 e 360 px; "das casas" (concordância);
R$/ha calculado do valor e da área; resumo com as várias matrículas, o site do leiloeiro e sem área privativa/vagas no
rural; explicação própria das tags da demonstração; 404 com título e sem canonical da home; landing não é mais
pré-carregada.

### Relatório em PDF (17/10/2026)

`/previa/imovel/<id>/relatorio` e `/assinante/imovel/<id>/relatorio` (botão "Exportar PDF" no fim do simulador; nunca
indexado). Página A4 "corporativa" para imprimir ou salvar em PDF pelo próprio navegador:
- barra "Salvar em PDF" (abre a impressão) com "Como salvar o PDF" no computador, no Android e no iPhone; com
  `?imprimir=1` a impressão abre sozinha quando o relatório fica pronto;
- **capa:** marca, data e hora do relatório, título, endereço, fonte e código, foto principal (se carregar), características,
  preços (avaliação, lance mínimo, deságio, praça e data) e venda (modalidade, natureza, pagamento, ocupação, matrícula; com
  a ficha da Caixa ainda não lida, "na página do imóvel no site da Caixa", nunca "não informada"); e o **resultado**: lance
  máximo para a meta, meta, cenário, prazo, pagamento, lucro total e anualizado, retorno, dinheiro necessário, comparação
  com a aplicação e "Antes de decidir" (área estimada, dívidas sem valor, ocupado, linhas tiradas). A capa sempre cabe numa
  página (fica compacta se precisar);
- **depois:** cenários e prazos (lance máximo e lucro com o lance, a célula escolhida marcada), da venda ao lucro, a conta
  linha a linha (o que a pessoa mudou sai "Ajustado", os custos dela "Criado por você", as linhas tiradas "Fora da conta"),
  premissas usadas (com o padrão da Luneta ao lado do que mudou), preço do m² na região (rua, bairro, cidade, estado e ITBI
  quando houver, de "muito abaixo" a "muito acima"), principais alertas (confirmados e em revisão, com o trecho; no Lente,
  nada de tags), avisos e fontes com as datas;
- **os números são os da tela:** o relatório lê os ajustes guardados neste navegador para o imóvel e faz a conta com a mesma
  função do simulador (`simulacaoCompleta`); conferido de ponta a ponta (meta trocada na tela = mesmo lance máximo no PDF);
- cabeçalho e "Página X de Y" no Chrome e no Edge; nos outros navegadores o PDF sai sem eles. Papel sempre claro (mesmo com o
  site no tema escuro), legível em preto e branco. No celular a folha vira coluna fluida (as tabelas largas rolam de lado).
  Em geral 5 a 6 páginas.

Pendências do relatório:
- [ ] Os ajustes ficam só neste navegador: em outro aparelho o relatório sai com a simulação padrão (guardar na conta quando
  houver login).
- [ ] Chrome com "Cabeçalhos e rodapés" ligado imprime também a data e o endereço da página, por fora dos do relatório (não
  se sobrepõem); a dica da barra pede para desmarcar.
- [ ] Foto da Caixa na capa: conferir no navegador (daqui a rede não chega à Caixa; a da Leilões Judiciais carrega). Sem
  foto, a capa fica sem ela.
- [ ] Depois de integrar com a página do imóvel nova: a régua "muito abaixo… muito acima" do relatório é a mesma da página
  (`compararComMedia`), escrita à parte no relatório para não mexer nos arquivos da página; dá para usar uma só. O mesmo
  vale para as linhas "sem média" da região (motivos iguais aos de `linhasLeiloes` da página) e para o recorte do
  simulador (`entradaDoImovel` no relatório e o objeto montado em `PaginaImovel.tsx`).
- [ ] Antes de integrar com a frente de dados, a linha "Rua" do relatório sai sempre "menos de 3 imóveis…": este branch
  ainda não calcula a referência por rua. Com a frente de dados junta, a linha passa a ter a média de verdade.
- [ ] O botão "Exportar PDF" do simulador leva o `?plano=lente` só no clique normal: aberto com o botão do meio ou "abrir
  em nova aba", o relatório sai no plano Luneta (arquivo do simulador, fora da frente do relatório).

Revisão do relatório (17/10/2026):
- **capa que passava da página:** uma margem de 24 px só da tela entrava na impressão e a capa medida não tinha folga;
  num caso real (Leilões Judiciais com parcelamento e dois avisos), o resultado inteiro ia para a página 2 e sobravam
  duas páginas pela metade (7 em vez de 6). Agora a margem é só da tela, a medida tem folga e não remede com a página
  já no desenho da impressão;
- **impressão no celular:** a capa só era medida com a folha em largura A4 (computador). Na hora de imprimir
  (`beforeprint`: botão, Ctrl+P ou menu do navegador), a tela passa por um instante ao desenho A4, mede e marca a capa
  (compacta ou "transborda"), e volta ao normal depois (`afterprint`);
- **linha "Fim do relatório" sozinha** numa página quase vazia (exemplo da /assinante): as fontes e o fim agora não se
  separam;
- **região:** a tabela dos leilões mostra sempre rua, bairro, cidade e estado (o método pedido no ponto 12); o recorte
  sem média diz por quê ("menos de 3 imóveis do mesmo tipo em leilão", "a fonte não informa o bairro", "os mesmos
  imóveis da cidade"). A nota do ITBI não diz mais "tem ITBI desta cidade" sem mostrar tabela: explica o motivo
  (`cobertura.semComparacao`, da frente de dados) ou que faltam compras parecidas;
- **matrícula:** a nota traz a averbação dos leilões negativos (ponto 1); ficha lida sem número = "não consta na ficha";
  fonte que não publica = "a fonte não publica" (as palavras da página do imóvel);
- menores: "criado por você" repetido na conta do celular; "por R$ 300.000 (R$ 300.000, valor que você definiu)" no
  cenário personalizado; hora do relatório presa à primeira visita ao voltar pelo navegador; link do anúncio abria na
  mesma aba; tabelas da região espremidas no celular; tabela de premissas colada na frase de cima.

### Ler cada leilão com IA: é viável?

Sim: em vez de preencher à mão, um robô baixa a página e os documentos de cada leilão (página da Caixa, edital,
matrícula) e o Claude, pela API, devolve as tags com o trecho de onde tirou cada uma. Roda **uma vez por leilão** e de
novo só se o edital ou a página mudar. O programa confere que o trecho citado existe mesmo no documento.

Custo estimado por imóvel, em lote (Batch API, 50% mais barato, resposta em horas), com preços de 06/10/2026
(Haiku 5.5: US$ 0,10 / 0,50 por milhão de tokens de entrada / saída; Sonnet 5.5: 2 / 10; Opus 5.5: 4 / 20). Tamanhos
estimados (não medidos): página + trecho do edital ≈ 6 mil tokens; matrícula escaneada de ~5 páginas ≈ +10 mil
(imagem ≈ 1.500 a 3.000 tokens por página); resposta ≈ 1 a 1,5 mil tokens.

| Leitura | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- |
| Página + edital (sem matrícula) | ~US$ 0,0006 por imóvel · ~US$ 12 os 21 mil | ~US$ 0,011 · ~US$ 230 | ~US$ 0,022 · ~US$ 460 |
| Com matrícula escaneada | ~US$ 0,0012 · ~US$ 25 | ~US$ 0,024 · ~US$ 500 | ~US$ 0,047 · ~US$ 1.000 |
| Edital judicial longo (20 páginas) | ~US$ 0,003 | ~US$ 0,05 | ~US$ 0,10 |

Por mês, com 300 a 1.000 leilões novos ou alterados por dia (estimativa, não medida): Haiku ~US$ 10 a 40; Sonnet
~US$ 100 a 700; Opus ~US$ 200 a 1.400. Escala sem problema (o lote processa milhares por vez).

O que decide o modelo é a **qualidade**, não o custo: montar a amostra de 100 imóveis classificada pelo advogado,
rodar os três modelos nela e ficar com o mais barato que acertar o suficiente (meta sugerida: 95% nas tags graves).
Tags graves continuam com revisão humana no começo. Cuidados: os documentos têm dados pessoais (cobrir na política
de privacidade, inclusive o envio para fora do Brasil); a Leilões Judiciais permite uso por IA como entrada
(`ai-input=yes`) e proíbe treino (`ai-train=no`).

### Opção 2: o que falta mapear (bancos, prefeituras e leiloeiros)

Não é difícil tecnicamente, mas é trabalho por plataforma (estimativa: 1 a 2 dias por conector, com testes) e tem cuidado
jurídico (termos de uso, robots.txt, anti-robô e LGPD). O caminho mais curto é pelas plataformas que atendem muitos
vendedores de uma vez (fontes em `base/FONTES.md` §5; o que está "a confirmar" ainda não foi verificado):

| Quem vende | Por onde (segundo a pesquisa) | Observação |
| --- | --- | --- |
| Itaú | Zukerman (Portal Zuk), Frazão, Mega Leilões (a confirmar) | Zuk tem ocupação no card e documentos no detalhe |
| C6, Bradesco, Santander, BB, BRB, Sicoob, Daycoval, BTG, Bari | Portal Zuk (lista de comitentes) e outros leiloeiros | o mesmo imóvel aparece em vários sites: deduplicar |
| Santander, BTG, Pan, BRB, BB | Resale (API com chave) | melhor por parceria formal |
| Prefeituras (ex.: São Paulo) | editais no PNCP (radar já pronto) e leiloeiros contratados (a confirmar) | o PNCP dá o edital, não o lote com foto |
| Superbid, Sold e ~60 leiloeiros | uma única API interna da Superbid | tem anti-robô (Cloudflare) relatado |
| ~30 leiloeiros | plataforma V-Lance | JSON aberto |
| ~107 leiloeiros cada | Suporte Leilões, SOLEON, Leilão PRO | parceria ou leitura do site |

O LeilãoMap não pôde ser aberto daqui (rede bloqueada) e a pesquisa só achou evidência da Caixa nele; como você vê vários
outros lá, a lista dele é o melhor guia de prioridade (próximo passo 2).

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
npm run lint
npm run check:publicacao   # lista o que ainda não pode ir ao ar (ver "Antes de publicar")
```

### Publicar na Vercel (link para testar no PC e no celular)

1. Em vercel.com, entre com a conta do GitHub → **Add New → Project** → importe `luneta-de-leiloes` → **Deploy**
   (a Vercel detecta Next.js; não precisa mudar nada).
2. Opcional: em **Settings → Environment Variables**, crie `NEXT_PUBLIC_SITE_URL` com o link gerado
   (ex.: `https://luneta-de-leiloes.vercel.app`) e faça **Redeploy**, para canonical, Open Graph, sitemap e
   JSON-LD apontarem para esse endereço enquanto o domínio final não existe.
3. Cada `git push` na `main` publica de novo automaticamente.

Todo o texto vem de `src/content/site.ts` (blueprint, Passo 3). Qualquer trecho entre colchetes, como `[X]`,
aparece na página como **placeholder visível** (borda tracejada em latão). Para publicar, troque o colchete
pelo valor real no arquivo de conteúdo.

## Pendências em aberto (12/10/2026)

**Decisões suas** (detalhes e recomendação na análise: https://claude.ai/artifact/RnPsHqp5eHTY9Fggiwbpd7)
- [ ] Lançar em duas fases (reservas e e-mails sem cobrar; venda só com base real, login e pagamento)?
- [ ] Advogado: manter "advogado especialista com prioridade" ou trocar por checklist/ficha até sair parecer da OAB.
- [ ] Abertura do hero: manter na primeira rolada (atual) ou automática, sem trava.
- [ ] Título novo com "imóveis" e "risco" ("Leilões de imóveis de todo o Brasil. E o risco de cada um, na mira.").
- [ ] Encurtar a página (Exemplos e Filtros dentro do Por dentro; Dados e Prova social só com números reais).
- [ ] Preços, oferta de fundador, garantia (7 ou 30 dias) e Lente paga ou grátis.

**Com você, fora do código**
- [ ] Liberar a rede do ambiente para as fontes de dados (Caixa, LeilãoMap, leiloeiros) ou colar links e textos.
- [ ] Domínio (`lunetadeleiloes.com.br` no registro.br) e marca no INPI.
- [ ] Razão social, CNPJ e endereço (rodapé e dados para o Google).
- [ ] Política de privacidade e termos de uso (o formulário não pode coletar dados sem eles).
- [ ] Ferramenta que recebe os contatos do formulário (e-mail ou CRM).
- [ ] Advogado parceiro: validar as 26 tags e suas explicações, os selos, o texto do Na Mira, o FAQ e a seção do advogado.
- [ ] Medição de visitas sem cookies (Vercel Web Analytics ou Plausible): aprovar.

**Técnico (eu, quando as decisões e a rede permitirem)**
- [ ] Base de dados de leilões: fontes com API pública primeiro (em andamento), depois raspagem de leiloeiros locais.
- [ ] Casos reais no site (Exemplos, hero, Praças, Por dentro e `/assinante`) a partir da base.
- [ ] Formulário que muda conforme o botão clicado e envia de verdade (servidor, anti-robô, LGPD).
- [ ] Alerta de 2ª praça por e-mail (hoje é promessa na página).
- [ ] Login e área do assinante com dados reais; pagamento só na fase de venda.
- [ ] No lançamento: `npm run check:publicacao` sem bloqueios e `NEXT_PUBLIC_INDEXAR=1` (passos abaixo).

**Base de dados** (detalhes em `base/README.md`, `base/FONTES.md` e `base/FASE1-SITE.md`)
- [ ] Liberar a rede (ou acionar `base-coleta.yml`) para a primeira coleta ao vivo: hoje o banco foi carregado com a lista da
  Caixa de 08/10/2026 e uma amostra de 10 lotes da Leilões Judiciais. Antes, ler os termos de uso da Caixa e da Leilões
  Judiciais (esta declara `ai-train=no`) e pedir autorização por escrito à Leilões Judiciais.
- [ ] Definir com o advogado os critérios dos selos (hoje desligados) e os limiares (deságio alto ≥ 40% e baixo < 20% são
  provisórios), e quem revisa as tags marcadas "em revisão" (2.039 imóveis hoje, todos por preço acima da avaliação).
- [ ] Conferir as fotos da Caixa ao vivo (a URL da capa segue um padrão confirmado por terceiros; nenhuma foi vista daqui).
- [ ] Município de 3 imóveis cuja cidade não existe no IBGE, a conferir na ficha da Caixa e cadastrar em
  `base/geo/apelidos.csv`: `QUEIMADAS`/CE (8444435692870), `TERRA VERMELHA`/PE (8444418921327) e `SAO LUIZ DO TAPAJOS`/PA
  (1444419144903). Até lá ficam fora do mapa, sem palpite.
- [ ] Tirar a `/previa` do ar antes do lançamento (ou protegê-la), e regerar `base/saida/` a partir da coleta oficial.
- [ ] Opção 2 (raspagem): plataformas white-label primeiro (Superbid, V-Lance, Suporte Leilões, SOLEON, Leilão PRO), depois
  leiloeiros e bancos, sempre respeitando robots.txt e termos; DataJud e Suporte Leilões só com termo/parceria.
- [x] Prévia com o banco inteiro: busca, filtros, ordem, mapa e paginação no servidor (app do catálogo, 14/10/2026).
- [x] Limpar o que sobrou da área do assinante antiga: saíram `AssinanteApp`, `AppHeader`, `DetailDrawer`, `FilterBar`,
  `ListingRow`, `MapPanel` e `parts` (14/10/2026); `shared.ts` ficou só com `BACK_TO_SITE` e `LUNETA_PRICE`.
- [ ] `LUNETA_PRICE` ainda lê `PLANS` de `src/content/site.ts` (o arquivo inteiro vai ao navegador, ~11 KB): levar o preço
  para um módulo pequeno quando o preço for decidido.
- [ ] Catálogo, técnico: o pedido do mapa já não traz facetas (`facetas=0`, ~80 KB a menos), mas o mapa do Brasil inteiro
  ainda tem ~640 KB de JSON (465 KB são os 3 `destaques` de cada cidade, com a URL da foto). Enxugar os destaques (ou
  buscá-los ao passar o mouse na cidade) e não reenviar as facetas ao trocar de página ou de ordem. Sem compressão no
  `next start` (a Vercel comprime na borda). A API responde `no-store` (dá para cachear por URL).
- [ ] Catálogo, técnico: cada cartão pesa ~15 KB de HTML (classes e o desenho SVG do "sem foto"); 24 por página dão ~400 KB de
  HTML (41 KB comprimido). Vale enxugar o desenho repetido (um `<symbol>` só) se o celular sentir.
- [x] Catálogo, visual: barra fixa alta com muitos filtros (pílulas só do que não tem botão rápido; linha única colada em
  tela baixa; 14/10/2026).
- [ ] Catálogo, mapa: o cartão do mapa ainda pode cobrir a própria bolha quando não cabe ao lado (mapa estreito), e bolhas de
  estados vizinhos podem se sobrepor (alvo livre menor que 24 px em ~6 bolhas). Avaliar prender o cartão no pé do mapa
  nesses casos.
- [ ] Base: marcar como suspeito na importação o lance acima de 5× a avaliação (hoje o site trata na tela e nas ordens) e
  gravar o nome do IBGE nas 13 cidades com a grafia crua da Caixa (Santa Isabel do Para, Ceilandia, Assu...).
- [ ] `base/saida/amostra-site.json` e `estatisticas-uf.json` não são mais lidos pelo site (a /previa usa `base/saida/site/`).
  Decidir se a exportação (`base/exportar.ts`, com teste) continua a gerá-los ou se saem (ficaram: a exportação e o
  `base/README.md` ainda os descrevem).
- [ ] Medir o radar ao vivo (quando a rede abrir): 2 semanas de PNCP, DJEN, DOU e Querido Diário; quantos editais de imóvel
  por semana e por UF, quantos com `site_leilao`, e uma amostra de 50 conferida à mão nos portais para saber quantos são
  "só nossos".
- [ ] Querido Diário: quando o trecho não trouxer o site do leiloeiro, ler o texto completo do diário (`txt_url`, já vem na
  resposta da API).
- [ ] Integração da rodada 3 (dados × tela da região): quando a cidade tem ITBI mas o imóvel fica sem a referência por
  causa da área (apartamentos e imóveis comerciais de SP e Fortaleza), a tela deve mostrar `cobertura.semComparacao`, e
  não "a prefeitura não registra compras suficientes". As referências de ITBI repetem o `escopo` das da base (rua,
  bairro, cidade): a `key` de lista na tela precisa levar a `fonte`.
- [ ] ITBI: rua de nome próprio repetido em bairros diferentes da mesma cidade (duas "Rua São José" em SP) soma as duas;
  levar o bairro de cada rua no `agregar.py` e casar rua + bairro quando a rua aparecer em bairros distantes. BH (403
  fora do Brasil) e as licenças de SP, Rio e POA continuam pendentes.

## Antes de publicar: checagem e buscadores

### `npm run check:publicacao`

Script em Node puro (`scripts/checar-publicacao.mjs`, fora do build e do lint). Varre `src/content`, `src/components` e
`src/app` lendo o texto como a página mostra, e aponta `arquivo:linha:coluna` com o trecho:

- **a) placeholders entre colchetes** (e `null` no conteúdo, que vira `[X]`): **bloqueia**;
- **b) "fictício" em texto visível**: só informa (rótulo de exemplo, ok enquanto os exemplos forem fictícios);
- **c) notas internas** ("a validar", "versão publicada", "ainda não envia", "envio for ligado"…): **bloqueia**;
- reservas de placeholder no código (`?? "[129]"`): não bloqueiam;
- com `--url http://localhost:3000`, conta os `[data-placeholder]` do HTML servido. `--json` dá a saída em JSON.

Código de saída 1 se houver item em a) ou c). **Resultado de 12/10/2026: não publicar, 24 itens bloqueiam** (os
placeholders da tabela abaixo e os dois avisos de que o formulário ainda não envia, que saem quando ele for ligado).
Limite conhecido: uma nota partida por um elemento JSX (`a <strong>validar</strong>`) não é pega.

### Buscadores: fora do Google até o lançamento

A chave `NEXT_PUBLIC_INDEXAR` (lida só em `src/content/site.ts` → `SITE.indexable`) decide.

- **Sem a chave (padrão):** todas as páginas saem `noindex, nofollow`. O `robots.txt` é só `Allow: /`, sem `Disallow`
  e sem `Sitemap`, de propósito: com Disallow o Google não abriria as páginas, não leria o noindex e manteria no índice
  o que já tivesse do vercel.app. O JSON-LD nunca publica placeholder: pergunta do FAQ com `[...]` fica de fora, e plano
  com preço `[...]` não vira oferta (hoje o JSON-LD tem só Organization e FAQPage).
- **Com `NEXT_PUBLIC_INDEXAR=1`:** a página principal sai `index, follow` e o `robots.txt` anuncia o sitemap.
- `/assinante` e a página 404 são sempre `noindex`.

Para conferir agora (opcional): no Google Search Console, verifique `luneta-de-leiloes.vercel.app` e busque
`site:luneta-de-leiloes.vercel.app`. Se algo aparecer, o noindex tira no próximo rastreio; a ferramenta **Remoções** acelera.

**No dia do lançamento:**
1. Troque os placeholders (tabela abaixo) e confira os preços: `PLANS.plans[].price` e `priceValue` juntos.
2. Na Vercel, **Settings → Environment Variables**, só no ambiente **Production**: `NEXT_PUBLIC_INDEXAR` = `1` e
   `NEXT_PUBLIC_SITE_URL` = domínio final (ex.: `https://lunetadeleiloes.com.br`). Faça **Redeploy**: variáveis
   `NEXT_PUBLIC_` entram no build. Preview e Development continuam noindex.
3. **Settings → Domains**: domínio final como principal; `luneta-de-leiloes.vercel.app` (e o `www`, se não for o
   principal) redirecionando com **308**.
4. Confira no domínio final: `view-source:` com `content="index, follow"`, `/robots.txt` com a linha `Sitemap:`,
   `/sitemap.xml` com o domínio final e o vercel.app respondendo 308.
5. **Google Search Console**: propriedade do domínio (verificação por DNS), envie o sitemap e peça a indexação da home.
   **Bing Webmaster Tools**: importe do Search Console. Confira os dados estruturados no Teste de pesquisa aprimorada.

## Placeholders `[ ]` na página

| Onde | Placeholder | Arquivo / chave |
| --- | --- | --- |
| Hero · linha de confiança | `+[X] leilões ativos · [X] leiloeiros monitorados` | `site.ts` → `HERO.trust` |
| O problema · faixa rolante | `[Leiloeiro 1]` … `[Leiloeiro 6]` (nomes dos leiloeiros monitorados) | `site.ts` → `PROBLEM.marquee` |
| Dados de deságio | deságio médio `[X]%`, maior deságio do mês `[X]%`, total de leilões ativos `[X]` | `site.ts` → `STATS.items[].value` (número; `null` mostra `[X]`) |
| Planos · preços sugeridos | Lente `R$ [49]`, Luneta `R$ [129]`, Telescópio `R$ [499]` (cartões e tabela) | `site.ts` → `PLANS.plans[].price` e `priceValue` (este alimenta o JSON-LD) |
| Área do assinante (`/assinante`) | preço da Luneta `[129]` no aviso do plano Lente e na janela de upgrade | vem do mesmo `PLANS` (não precisa trocar em outro lugar) |
| Planos · nota | `[7] dias para cancelar` | `site.ts` → `PLANS.note` |
| Prova social · garantia | `[7] dias` | `site.ts` → `SOCIAL.guarantee` |
| FAQ · "Os leilões de todo o Brasil estão aqui?" | `Hoje são [X] leiloeiros monitorados.` | `site.ts` → `FAQ.items[2].a` |
| FAQ · "Posso cancelar quando quiser?" | `[7] dias para cancelar` | `site.ts` → `FAQ.items[6].a` |
| Rodapé | links `Política de privacidade [link]` e `Termos de uso [link]` (hoje apontam para `#`) | `Footer.tsx` |
| Rodapé | `[Razão social] · CNPJ [X]` | `site.ts` → `FOOTER.company` |

## Conteúdo fictício (substituir por casos reais)

- **Casos reais com link direto** (pedido do cliente): a estrutura está pronta, mas a coleta não foi feita porque a rede
  deste ambiente bloqueia os sites dos leiloeiros. Cada imóvel em `examples.ts` aceita `source: { leiloeiro, url, coletadoEm }`
  (o título vira link para o anúncio, com "Dados de DD/MM/AAAA · confira o edital") e `point` (use `latLonToMap(lat, lon)`
  de `src/lib/brazil.ts` para pôr o pino no lugar exato). Com `source`, o rótulo muda sozinho para "Caso real · leiloeiro".
  Tags e selo de um caso real devem ser marcados como análise ilustrativa até passarem pelo critério validado.
- **Exemplos de leilão** (`src/content/examples.ts`): 6 imóveis fictícios, sempre rotulados como "Exemplo fictício".
  O blueprint pede casos reais da base com a etiqueta "exemplo de oportunidade" e fotos; o cartão já aceita
  `photo` (WebP, servido via `next/image` dentro da moldura de lente). Hoje as fotos são placeholders listrados.
  O Na Mira diz que, segundo o edital, o condomínio em atraso é quitado com o valor da arrematação: revisar com o
  advogado junto com as explicações das tags.
- **Cartão do Alvo no hero** (deságio contando até 48%) e **praças** (apartamento em Campinas/SP, R$ 400.000 → R$ 200.000,
  e o aviso "Seu favorito foi para a 2ª praça"): fictícios, rotulados.
- **"Por dentro, depois de assinar"** e **área do assinante** (`/assinante`): usam os mesmos exemplos fictícios.
- **Demo de filtros e mapa**: filtra só os 6 exemplos fictícios ("N de 6 exemplos fictícios encontrados").
- **Respostas do FAQ**: o blueprint só traz as perguntas; as respostas vieram do handoff do Claude Design. Revisar com o advogado parceiro.

## Pendências antes de publicar (blueprint, "Pontos de atenção")

- **Domínio e marca**: confirmar `lunetadeleiloes.com.br` no registro.br e a marca no INPI. A URL canônica vem de
  `NEXT_PUBLIC_SITE_URL` (padrão `https://lunetadeleiloes.com.br`), usada em canonical, Open Graph, sitemap, robots e JSON-LD.
- **Formulário**: valida nome, e-mail, WhatsApp e consentimento LGPD no front, mas **não envia nada**
  (`LeadForm.tsx`, ponto marcado no `onSubmit`). Ligar a API/CRM e a página de política de privacidade.
- **Critérios das tags e selos**: validar com o advogado parceiro (as gravidades de cada tag estão em `src/content/tags.ts`).
- **Explicações das tags** (pop-up "O que é / Na prática", `src/content/tags.ts`): linguagem simples, mas são orientações
  jurídicas. Revisar todas com o advogado, em especial dívidas de condomínio e IPTU (quem paga depende do edital), ação
  judicial pendente, penhoras de outros processos e imóvel financiado/alienação fiduciária.
- **Aviso de 2ª praça por e-mail** (Praças e plano Luneta): é uma promessa de funcionalidade. Só publicar quando o alerta existir.
- **Consultoria**: validar o texto da seção com as regras de publicidade da OAB.
- **Origem dos dados**: confirmar que a coleta nos sites dos leiloeiros respeita termos de uso e a lei.
- **Preços e garantia**: validar valores e o prazo de cancelamento. O JSON-LD Product/Offer volta sozinho quando `price`
  deixar de ter colchete (troque `price` e `priceValue` juntos).
- **Prova social**: hoje é selo de lançamento + garantia. Entrar só com depoimentos reais (nome, foto e resultado).

## O que foi verificado

- `npx tsc --noEmit`, `npm run lint` e `npm run build` sem erros nem avisos.
- Lighthouse mobile (build de produção, local, 4 execuções): Performance 92–96 (TBT 110–160 ms, CLS 0),
  Acessibilidade 100, Boas práticas 100, SEO 100.
- axe-core (WCAG 2.2 AA + boas práticas) sem violações em `/` e `/assinante` (Lente e Luneta), temas escuro e claro,
  390px e 1280px, com todas as categorias de tags abertas. Sem rolagem horizontal e sem erros no console.
- Links internos do menu e dos CTAs param exatamente no início da seção (desktop, celular e movimento reduzido). Vale
  também ao chegar de outra página com âncora ("Voltar ao site" da `/assinante` → `/#planos`, "Ver planos" do 404,
  link aberto numa aba nova): para a 72px do topo em 360, 390, 1280 e 1440.
- Página 404: responde 404, título "Página não encontrada | Luneta de Leilões", noindex, axe sem violações.
- Entradas genéricas: 250 ms depois de chegar ao bloco, opacidade de 0,83 a 0,92 (antes 0,36 a 0,55); tudo pronto em
  ~0,58 s (antes ~1,05 s). FAQ e formulário com opacidade 1 desde o primeiro quadro.
- Celular: a barra de atalhos some com os cartões de plano na tela e volta depois; Tab pela página e pelo rodapé sem
  item focado sob a barra. Planos com a tabela recolhida e aberta sem violações no axe.
- Um único `<h1>`, `lang="pt-BR"`, canonical, Open Graph/Twitter com imagem gerada, `sitemap.xml`, `robots.txt`,
  JSON-LD com Organization e FAQPage (só as perguntas sem placeholder); Product/Offer volta quando os preços forem reais.
- `prefers-reduced-motion`: a seção do hero tem 1 tela e já mostra o estado final (mira travada); nenhuma animação de apoio roda.

## Decisões de implementação

- **Hero**: a intro inteira (as 6 etapas do Passo 4) roda de uma vez no primeiro gesto de rolar (dois dedos no trackpad,
  roda do mouse, toque ou teclado): ~1,9 s até a cena montar (lente, mapa, mira e cartão do Alvo) e ~2,7 s com o brilho
  final. Enquanto a cena monta, a página fica no topo e a inércia do trackpad é absorvida; com a cena montada, um gesto
  novo já rola a página. Esc pula. Roda uma vez por visita (o "Voltar ao site" da `/assinante` leva aos planos com o
  hero já no estado final; recarregar repete).
  No celular, a lente fica entre o texto e o cartão e encolhe em telas baixas, sem cobrir os botões.
  A marcação vem do servidor, a etapa 1 vem do CSS (`html.motion`) e o GSAP é baixado no ócio (`HeroMotion.tsx`). Se o GSAP
  não carregar, a página pula direto para o estado final (`#topo[data-done]`, só CSS) e nunca trava a rolagem.
- **Animações de apoio** (entradas, números contando, anéis desenhados, tags em cascata): IntersectionObserver + transições CSS
  (`MotionLayer.tsx` e o bloco "Animações de apoio" em `globals.css`). Ficam bem mais leves que um ScrollTrigger por bloco.
  As entradas genéricas (`[data-reveal]`) são curtas: fade + 10 px em 0,45 s, cascata de no máximo 3 blocos (80 ms).
  Planos, FAQ, chamada final e formulário não têm entrada: aparecem prontos.
- **Âncoras e content-visibility**: as seções fora da tela têm altura estimada (900px) até serem desenhadas. Antes de
  rolar até uma âncora, todas são medidas de uma vez (`html[data-cv="all"]`) e voltam a ser puladas dois quadros depois:
  no clique interno e na chegada vinda de outra página (`InPageLinks.tsx`), e no carregamento com `#âncora` pelo script
  do `<head>` em `layout.tsx`.
- **Página 404** (`app/not-found.tsx`): lente vazia com o ponto de latão fora do campo, "Erro 404", "Essa página saiu do
  alcance da luneta." e dois links, "Voltar ao início" e "Ver planos".
- **Barra de atalhos do celular** (`MobileCtaBar.tsx`, abaixo de md): some enquanto os cartões de plano estão na tela
  (`[data-plan-cards]`) e perto do formulário, só com IntersectionObserver; oculta, fica `inert`. Enquanto existe,
  `html[data-cta-bar]` ganha `scroll-padding-bottom` (barra + área segura + 16px) para o foco não ficar sob ela (WCAG 2.4.11).
- **Dados de deságio**: os três números na cor neutra; na página, o verde marca só ponto positivo.
- **Vermelho das tags**: borda, fundo e ícone usam `#E5484D`; o **texto** da tag grave usa `#F26B70` no tema escuro, porque
  `#E5484D` em 12px sobre o fundo tingido da tag dá 4,0:1 (abaixo do AA). No tema claro, `#B3242A`.
- **Extras do handoff mantidos**: tema claro (botão no menu, persistido, com o ícone sol ↔ lua animado), prévia
  "Por dentro, depois de assinar" e o bloco "Atenção · Cuidado" em Níveis.
- **Por dentro**: abas Lente × Luneta. Ao ir para a Luneta, uma luneta varre a lista e acende tags e selos, e o contador de
  riscos e oportunidades sobe junto (troca sozinha 2,2 s depois que a lista aparece). A versão Lente vem do servidor; as duas
  cópias nítidas usadas na varredura só são montadas quando a seção chega perto da tela.
- **Níveis**: "Atenção" → cartão "Cuidado" animado → "Por isso, no plano Luneta…" → os três selos. Em seguida, as 26 tags
  de risco em categorias que abrem com animação; cada tag abre um pop-up (no celular, uma folha de baixo) com a explicação.
  As tags de uma categoria só entram na página quando ela é aberta.
- **Planos**: cartões no visual do handoff + tabela comparativa completa (`<table>` acessível). Abaixo de 1024px a Luneta
  vem primeiro (também no HTML, para leitura e foco seguirem a tela) e a tabela fica recolhida atrás de "Comparar todos
  os recursos" (sem JavaScript, aparece aberta). A partir de 1024px: Lente → Luneta → Telescópio (`lg:order-*` +
  `reading-flow: grid-order`; no Chrome/Edge o Tab segue a ordem visual, nos outros começa pela Luneta) e tabela aberta.
- **WhatsApp** é obrigatório e precisa ser celular com DDD (máscara `(11) 91234-5678`).

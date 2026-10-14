# Fase 1 no site: prévia e caminho para produção

Guia para o dono. "Fase 1" = dados reais das fontes com API ou arquivo público (opção 1: Caixa e Leilões Judiciais), já coletados, classificados e exportados por `base/`. Estado em 13/10/2026.

> **Atualização de 14/10/2026:** a prévia deixou de usar a amostra de 60. Agora a `/previa` é o **catálogo completo**
> (21.231 imóveis) lido de `base/saida/site/` (lista em colunas + detalhes em 32 pedaços, `.json.gz`, gerados por
> `npm run base:exportar -- --site`), com busca no servidor (`src/lib/catalogo/`, API `GET /api/catalogo`), página de cada
> imóvel em `/previa/imovel/<id>`, simulador e preço do m² na região. A seção abaixo descreve a primeira versão e fica
> como histórico; o estado atual está no PENDENCIAS.md (Painel). `amostra-site.json` e `estatisticas-uf.json` continuam
> sendo gerados, mas o site não os lê mais.

## 1. O que a prévia mostra

Endereço: **`/previa`** (Luneta) e **`/previa?plano=lente`** (Lente). Página interna: `noindex, nofollow`, fora do sitemap e sem link no menu. Quem tiver o endereço consegue abrir, porque o site é público.

- **A mesma tela da `/assinante`** (lista, filtros, busca, mapa, detalhe e troca Lente × Luneta), alimentada pelo instantâneo do banco em `base/saida/amostra-site.json`: 60 imóveis reais (57 da Caixa e 3 da Leilões Judiciais), escolhidos para variar fonte, modalidade, risco, UF e tipo. Não há componente duplicado: a `/assinante` continua com os exemplos de antes, sem mudar nada na tela.
- **Faixa no topo** com as datas das fontes (Caixa, lista de 08/10/2026; Leilões Judiciais, 11/10/2026) e o aviso de que a classificação é automática, ainda não revisada, e de que os selos estão desligados. A consulta da Leilões Judiciais foi às 01h35 de 11/10 em UTC, que em Brasília ainda era 10/10 às 22h35: por isso o detalhe dos 3 lotes diz "Dados de 10/10/2026".
- **Resumo do banco inteiro** (`base/saida/estatisticas-uf.json`): 21.231 imóveis ativos; RJ 7.193 · GO 2.897 · SP 2.843 · PE 1.158 · RS 833; deságio mediano de 42,1%; 2.468 aceitam financiamento.
- **O que os dados reais trazem de diferente** e como aparece:
  - praça desconhecida (Leilão SFI da Caixa sem ficha): "Praça não informada pela fonte";
  - lance acima da avaliação (10 dos 60): "+46%" com "lance acima da avaliação", sem sinal de menos;
  - tags que aguardam leitura humana: à parte, neutras, sob "Em revisão (classificação automática)", nunca como fato;
  - selo: "Selo em análise" em todos (critérios dependem do advogado);
  - no detalhe: modalidade, praça, data da praça (horário de Brasília) e "Ver no site da fonte ↗" com "Dados de DD/MM/AAAA · confira o edital".
- **Lente sem dados no servidor.** No Lente o servidor nem manda as tags, as tags em revisão e a explicação; trocar de plano pede a página de novo ao servidor. É a regra que vale para produção.
- **Fotos** direto da URL da fonte (`<img>` sem referrer, carregamento preguiçoso), sem passar pelo otimizador do Next, que baixaria e re-hospedaria a foto na Vercel. Se a foto não carrega, volta o desenho listrado. No ambiente de desenvolvimento as 57 fotos da Caixa não carregaram (rede bloqueada); as 2 da Leilões Judiciais carregaram. A foto real da Caixa ainda não foi vista no site.

Para atualizar a prévia: rode o pipeline (`base/README.md`, "Como rodar") e `npm run base:exportar -- --site`, faça commit de `base/saida/` e publique. A faixa e o resumo leem as datas e os números desses arquivos.

## 2. Como levar à produção (passos)

1. **Ler os termos e pedir autorização.** Caixa, Leilões Judiciais (pedir por escrito; a LJ declara `ai-train=no`), robots.txt. Nada foi chamado ao vivo até hoje (`base/README.md`, "O que ficou sem teste ao vivo").
2. **Coleta diária.** Duas opções, depois do passo 1:
   - **Servidor com IP no Brasil** (um VPS pequeno, com `cron`): é o caminho seguro para a Caixa, que pode bloquear IP de fora do país.
   - **GitHub Actions**: o workflow `.github/workflows/base-coleta.yml` já existe e só roda manualmente. Basta acrescentar um `schedule` (ex.: 1 vez por dia, de madrugada). Os runners ficam fora do Brasil: teste primeiro se a Caixa responde.
3. **Banco Postgres gerenciado**, ligado à Vercel (Neon ou Supabase pelo Marketplace da Vercel, que cria as variáveis de conexão no projeto). Use o mesmo `base/esquema.sql` com as trocas de tipo anotadas no topo do arquivo (BIGINT IDENTITY, NUMERIC, BOOLEAN, TIMESTAMPTZ, JSONB, tsvector no lugar do FTS5). A coleta grava direto no Postgres em vez do SQLite. Antes, faça a pendência "guardar só as tags 'sim' e as revisadas": hoje cada imóvel ganha 26 linhas de risco e o SQLite chegou a 176 MB.
4. **Rotas de servidor que filtram e paginam.** A página da área do assinante passa a consultar o banco no servidor (componente de servidor ou Route Handler) com os filtros da URL (UF, tipo, deságio mínimo, praça, busca) e paginação (ex.: 30 por página, ordenado por deságio). O navegador nunca recebe a base inteira. Os resultados podem ficar em cache (`'use cache'` com `cacheTag("imoveis")`, ligando `cacheComponents` no `next.config.ts`) e a coleta, ao terminar, chama uma rota protegida que faz `revalidateTag("imoveis", "max")`.
5. **Lente sem tags no servidor.** Igual à prévia, mas com o plano vindo do login, não da URL: para o Lente, a consulta nem lê as tabelas de risco nem o selo. No navegador não existe "esconder com CSS".
6. **Números do site a partir do banco.** A linha de confiança do hero (`HERO.trust` em `src/content/site.ts`: "+[X] leilões ativos · [X] leiloeiros monitorados") e os três números de "Dados de deságio" (`STATS.items`) passam a vir das mesmas estatísticas de `estatisticas-uf.json` (ou de uma consulta com cache). Antes de ligar, veja as decisões do item 4 abaixo (o rótulo de cada número).
7. **Exemplos da landing com 4 casos reais escolhidos à mão.** Escolha 4 imóveis no banco, coloque em `src/content/examples.ts` com `source` (o cartão já mostra "Caso real · leiloeiro", o link e "Dados de DD/MM/AAAA · confira o edital") e revise as tags com o advogado. Duas pendências: a seção é organizada por selo (Alvo, Na Mira, Promissor, sem selo), e os selos estão desligados; e o cartão da landing (`AuctionCard`) ainda usa o otimizador de imagem do Next para fotos, que precisa virar `<img>` como na prévia.
8. **Antes do lançamento:** tirar a `/previa` do ar (ou proteger com senha na Vercel) e trocar os exemplos da `/assinante` pela lista real, já com login.

## 3. Custos aproximados

Consulta em 13/10/2026. A rede do ambiente bloqueou as páginas oficiais de preço; os valores vêm de buscas (páginas de terceiros de 2026 e, quando indicado, da própria empresa). Confira na página oficial antes de contratar.

| Item | Valor aproximado | Fonte |
|---|---|---|
| Vercel Pro | US$ 20/mês por pessoa que publica, com US$ 20 de uso incluídos; o plano grátis (Hobby) não permite uso comercial | [makerkit.dev](https://makerkit.dev/blog/saas/vercel-cost), [schematichq.com](https://schematichq.com/blog/vercel-pricing); oficial: vercel.com/pricing (não aberta) |
| Neon (Postgres) | Grátis: 100 CU-h/mês e 0,5 a 1 GB por projeto (o blog da Neon fala em 1 GB). Launch: sem mínimo, ~US$ 0,106 por CU-h e US$ 0,35 por GB-mês | [neon.com/blog](https://neon.com/blog/neon-free-plan-1-gb-per-project), [selfhost.dev](https://selfhost.dev/neon-pricing-cost-of-serverless-postgres/), [toolradar.com](https://toolradar.com/tools/neon/pricing) |
| Supabase (Postgres) | Grátis: 500 MB, pausa após 7 dias sem uso (ruim para produção). Pro: US$ 25/mês + computação (US$ 10 de crédito cobre a menor) | [makerkit.dev](https://makerkit.dev/blog/md/saas/supabase-pricing), [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/) |
| GitHub Actions | Repositório privado: 2.000 min/mês grátis (Linux); acima disso ~US$ 0,006/min. Estimativa (não medida ao vivo): ~35 min por coleta completa (varredura da LJ nas 27 UFs), ~1.100 min/mês: cabe no grátis | [docs.github.com](https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions), [cicdcalculator.com](https://cicdcalculator.com/github-actions-pricing-changes-2026) |
| Servidor com IP no Brasil | **não confirmado** (o Lightsail da AWS chegou a São Paulo em jun/2026 com "os mesmos preços", sem valor publicado na busca) | [aws.amazon.com](https://aws.amazon.com/pt/about-aws/whats-new/2026/06/amazon-lightsail-aws-regions/) |

Ordem de grandeza (estimativa, não confirmada): Vercel Pro + Neon no plano grátis ou Launch + Actions grátis ≈ **US$ 20 a 40 por mês**, mais o servidor no Brasil se a Caixa bloquear o Actions. O tamanho do banco em Postgres não foi medido.

## 4. O que depende de decisão sua

- **Selos:** critérios de Promissor, Na Mira e Alvo, com o advogado parceiro. Até lá, "Selo em análise" e o filtro "Só com selo" fica vazio.
- **Limiares:** deságio alto e baixo e diferença de área (`base/riscos/regras/config.ts`).
- **Revisão humana:** 2.043 imóveis têm tag aguardando leitura (quase todos "Preço acima do mercado", porque avaliação não é preço de mercado). Quem revisa, com que tela e em quanto tempo; até lá elas ficam "em revisão".
- **Termos de uso das fontes:** ler os da Caixa e da Leilões Judiciais e obter a autorização por escrito da LJ antes de produção.
- **Fotos:** mostrar direto da fonte (como na prévia), mostrar só com autorização ou não mostrar. O direito de imagem não foi confirmado, e a fonte pode bloquear o uso da foto em outro site.
- **Rótulos dos números do site:** 12.143 dos 21.231 ativos são "venda direta" da Caixa, que não é leilão: "leilões ativos" fica impreciso ("imóveis ativos" é exato). O banco calcula a mediana do deságio (42,1%), e o site diz "deságio médio". "Maior deságio do mês" pode pegar erro de cadastro (sugestão: revisar à mão). E hoje são 2 fontes, não "[X] leiloeiros".

## 5. O que ainda falta (opção 2)

A fase 1 só cobre o que tem API ou arquivo público. A opção 2 usa endpoints internos ou páginas HTML, cada um com termos e robots lidos antes (lista completa em `base/README.md`, "Próximos passos (opção 2)"):

1. Caixa: ficha, fotos verificadas e edital (praça do Leilão SFI, matrícula, IPTU, ocupação);
2. V-Lance (inventário completo da LJ e de ~30 leiloeiros);
3. Superbid e plataformas que atendem muitos leiloeiros (Suporte Leilões só com parceria);
4. leiloeiros grandes e bancos, com deduplicação entre fontes;
5. enriquecimento (SPU, IPTU de capitais, índice de preços).

Fora das fontes: tela de revisão humana, critérios dos selos, referência de preço de mercado e coleta testada ao vivo.

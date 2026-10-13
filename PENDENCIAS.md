# Luneta de Leilões · pendências da landing

Landing em Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + GSAP 3 (ScrollTrigger), só front-end.

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

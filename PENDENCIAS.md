# Luneta de Leilões · pendências da landing

Landing em Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + GSAP 3 (ScrollTrigger), só front-end.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
npm run lint
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
- **Preços e garantia**: validar valores e o prazo de cancelamento; o JSON-LD Product/Offer usa `priceValue`.
- **Prova social**: hoje é selo de lançamento + garantia. Entrar só com depoimentos reais (nome, foto e resultado).

## O que foi verificado

- `npx tsc --noEmit`, `npm run lint` e `npm run build` sem erros nem avisos.
- Lighthouse mobile (build de produção, local, 4 execuções): Performance 92–96 (TBT 110–160 ms, CLS 0),
  Acessibilidade 100, Boas práticas 100, SEO 100.
- axe-core (WCAG 2.2 AA + boas práticas) sem violações em `/` e `/assinante` (Lente e Luneta), temas escuro e claro,
  390px e 1280px, com todas as categorias de tags abertas. Sem rolagem horizontal e sem erros no console.
- Links internos do menu e dos CTAs param exatamente no início da seção (desktop, celular e movimento reduzido).
- Um único `<h1>`, `lang="pt-BR"`, canonical, Open Graph/Twitter com imagem gerada, `sitemap.xml`, `robots.txt`,
  JSON-LD com Organization, Product/Offer (3 planos) e FAQPage.
- `prefers-reduced-motion`: a seção do hero tem 1 tela e já mostra o estado final (mira travada); nenhuma animação de apoio roda.

## Decisões de implementação

- **Hero**: a intro inteira (as 6 etapas do Passo 4) roda de uma vez, em ~1,1 s, no primeiro gesto de rolar (dois dedos no
  trackpad, roda do mouse, toque ou teclado). Durante a intro a rolagem fica presa no topo; depois volta ao normal. Esc pula.
  A marcação vem do servidor, a etapa 1 vem do CSS (`html.motion`) e o GSAP é baixado no ócio (`HeroMotion.tsx`). Se o GSAP
  não carregar, a página pula direto para o estado final (`#topo[data-done]`, só CSS) e nunca trava a rolagem.
- **Animações de apoio** (entradas, números contando, anéis desenhados, tags em cascata): IntersectionObserver + transições CSS
  (`MotionLayer.tsx` e o bloco "Animações de apoio" em `globals.css`). Ficam bem mais leves que um ScrollTrigger por bloco.
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
- **Tabela de planos**: cartões no visual do handoff + tabela comparativa completa (`<table>` acessível, rolável no celular).
- **WhatsApp** é obrigatório e precisa ser celular com DDD (máscara `(11) 91234-5678`).

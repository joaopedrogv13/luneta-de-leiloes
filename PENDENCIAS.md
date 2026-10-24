# Luneta de Leilões · onde estamos e pendências

Este é o arquivo central do projeto: **onde estamos, que dados temos, o que falta e o próximo passo**. Atualizado a cada
entrega (última atualização: 18/10/2026, rodada 4: nota de localização de 0 a 100 com dados, servidor e **tela pronta**
(página do imóvel, filtro, ordem, selo, PDF e a página pública `/metodologia/localizacao`); landing com as novidades do
plano Luneta ("Decida com números", "Nota de localização", tabela de planos em grupos, FAQ novo); responsividade da
prévia no celular, tablet e celular deitado; coleta no PC do dono pronta; **a trava dos planos pronta**: no Lente, cada
recurso da Luneta vira uma chamada no mesmo lugar, e os filtros avançados ficam com cadeado; ver "Rodada 4 · a trava dos
planos"; **revisão final da rodada 4**: 44 achados de três revisores corrigidos ou anotados, a landing sem promessa que o
produto ainda não cumpre e a nota recalculada; ver "Rodada 4 · revisão final"). Rodada 5 (23/10/2026): **mapa de
verdade** no catálogo e na página do imóvel (ruas, agrupamentos, preços de perto, "Buscar ao mover o mapa"), já com a
**revisão adversarial** (11 achados corrigidos: a lista não perde mais imóveis ao abrir o mapa, o "voltar" reabre o mesmo
lugar, o Lente não ganha o filtro de quartos pelo mapa, bairro nunca como ponto, celular deitado e notebook de 768 px);
ver "Rodada 5 · mapa de verdade" e "Rodada 5 · mapa: revisão adversarial". **Rodada 5 integrada (24/10/2026):** num
branch só, a landing (abertura sozinha, "especialista", alerta de praça, 7 dias, "Voltar à apresentação"), o "Ajuste o
foco" com 150 imóveis fictícios, a vitrine com os 10 melhores reais e fotos nos exemplos, o simulador (lucro primeiro,
conta limpa), a tag e o filtro de metrô e o mapa de verdade; ver "Rodada 5 · integração das frentes".

- **Site:** landing em Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + GSAP 3, publicada em
  https://luneta-de-leiloes.vercel.app (fora do Google até o lançamento). Área do assinante de demonstração em `/assinante`
  (desde a rodada 5: vitrine com os 10 melhores imóveis reais da base e os 6 exemplos fictícios à parte; ver "Rodada 5 ·
  demonstração (frente V)") e prévia com dados reais em `/previa` (sem link, noindex).
- **Base de dados:** pasta `base/` (SQLite do Node, sem dependências). Detalhes em `base/README.md`, fontes em
  `base/FONTES.md`, caminho até o site em `base/FASE1-SITE.md`.
- **Análise de negócio, conversão e jurídico:** https://claude.ai/artifact/RnPsHqp5eHTY9Fggiwbpd7

## Painel (14/10/2026)

### Que dados temos hoje

| Fonte | Como entra | O que temos no banco | Atualização |
| --- | --- | --- | --- |
| Caixa (lista oficial CSV) | arquivo público oficial (opção 1) | **21.226 imóveis** da lista de 08/10/2026: endereço, preço, avaliação, deságio, modalidade, financiamento, área, quartos, link e URL da foto | carga única, ainda não ao vivo (rede bloqueada neste ambiente) |
| Caixa (página de cada imóvel) | leitura da página (opção 2 leve) | **0**: leitor pronto e testado em 2 páginas reais (matrícula, regras de condomínio e IPTU, FGTS, datas de leilão, edital) | precisa de rede no Brasil: `node base/coleta-pc.mjs` no PC do dono (pronto para rodar) |
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
- "Ver como: Lente | Luneta" no cabeçalho. No Lente (rodada 4):
  - nos cartões, nada de tags, selo ou nota;
  - os filtros avançados e as ordens da Luneta aparecem com o cadeado e abrem a janela da Luneta;
  - na página do imóvel, a chamada da Luneta no lugar do simulador, da região, da nota e dos riscos.

  Detalhes em "Rodada 4 · a trava dos planos".
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
   - ~~o **simulador** fica aberto no plano Lente ou só na Luneta?~~ Decidido na rodada 4: Luneta (a landing e a tabela de
     planos já dizem isso; ver "Rodada 4 · site original");
   - a **meta padrão do simulador** (hoje 20% ao ano: com o lance mínimo só ~1 em 10 apartamentos/casas atinge; opções na
     seção "Página do imóvel");
   - **preço de mercado:** autorizar o próximo passo com ITBI (Rio e SP primeiro, dados abertos e grátis) e mandar e-mail
     à Fipe pedindo autorização do FipeZAP; pedidos pela LAI nas capitais sem ITBI aberto;
   - **Querido Diário:** escrever à OKBR confirmando uso comercial (dados CC BY 4.0, mas os termos falam em "finalidade");
   - conferir no seu navegador as **fotos da Caixa** e o **PDF da matrícula** (daqui a rede não chega à Caixa).

### Coleta no PC do dono (fichas da Caixa e ITBI de BH): **pronto para rodar** (17/10/2026; revisado em 18/10/2026)

Duas fontes só abrem de uma internet no Brasil: as **fichas da Caixa** (matrícula, comarca, ofício, inscrição, averbação;
o anti-robô barra o GitHub Actions) e o **ITBI de Belo Horizonte** (a prefeitura responde 403 fora do Brasil). Agora é
um comando só, no seu PC (Windows, Mac ou Linux). Guia passo a passo, para quem não programa:
**`base/COLETA-NO-PC.md`**.

Passo a passo curto (você):
1. Instalar uma vez: Node LTS (https://nodejs.org/pt-br/download), Git (https://git-scm.com/downloads) e Python 3
   (https://www.python.org/downloads/, marcando "Add python.exe to PATH"); depois `pip install pandas numpy requests openpyxl`.
2. Uma vez: `git clone https://github.com/joaopedrogv13/luneta-de-leiloes.git` e `cd luneta-de-leiloes` (não precisa de
   `npm install`).
3. Rodar (de preferência à noite, com o PC sem suspender): **`node base/coleta-pc.mjs`** (o mesmo no Windows e no Mac;
   no Windows, evite o `npm run`: o PowerShell bloqueia o npm e o Ctrl+C se perde). Na primeira vez, o GitHub pede para
   entrar na sua conta (para enviar o resultado).
4. Leva ~15 h (21 mil fichas × ~2,5 s). Pode parar com Ctrl+C e rodar de novo depois: ele continua de onde parou.
   Espere "pode fechar a janela" antes de fechar. Por estado: `node base/coleta-pc.mjs --uf RJ`. Só BH:
   `node base/coleta-pc.mjs --etapas bh` (alguns minutos).
5. Se aparecer **BLOQUEIO**: parar e tentar mais tarde (o programa mostra o horário; antes das 2 h ele nem tenta as
   fichas). Nunca contornar (nada de VPN ou programa que imite navegador). **SEM CONEXÃO** é a internet, não bloqueio.
6. Opcional: `claude remote-control` na pasta do projeto, para eu acompanhar e rodar daqui.

O que o comando faz: confere Node 22.6+, Git e Python (e diz o que falta); baixa as fichas em ordem de prioridade (praça
mais próxima, depois Leilão SFI, Licitação, Venda Online e Venda Direta) com o cliente educado (2 s entre páginas,
robots.txt, para depois de 5 bloqueios seguidos e espera 2 h antes de pedir de novo); grava o `fichas.json` a cada 100
fichas; roda o `bh.py`; e publica no branch `coletas-dados` (`pc/fichas/fichas.json`, sempre no mesmo lugar, o resumo,
o log em `pc/<data>/` e `itbi/itbi-belo-horizonte.json`), por um clone temporário, sem mexer nos seus arquivos. As
páginas HTML da Caixa ficam só no seu PC. Do meu lado, aplico com `npm run base:fichas`, `base:riscos`,
`base:exportar -- --site` e `para_site.py` (passos em `base/fontes/caixa/README.md` e `base/fontes/itbi/README.md`).

**Revisão adversarial (18/10/2026), corrigido antes de você rodar:**
- Windows: o guia passa a usar `node base/coleta-pc.mjs` em vez de `npm run` (o PowerShell bloqueia o `npm` com a
  política de execução padrão e engole o "--" das opções; e o Ctrl+C pelo npm devolvia o terminal enquanto a coleta
  seguia gravando e enviando por trás). Saiu o `npm install` do guia (não é preciso e podia mexer no
  `package-lock.json`, travando o `git pull` seguinte).
- Windows: o Git para Windows vem com `core.autocrlf=true`, e o primeiro envio regravava com CRLF arquivos que o Actions
  publicou no `coletas-dados` (visto num teste com essa configuração). O clone do envio agora desliga a conversão.
- "Faltam N: rode de novo" aparecia para sempre quando o que faltava eram fichas com falha guardada por 7 dias (rodar de
  novo não baixava nada). Agora o resumo separa o que falta de verdade das que "não abriram".
- Duas janelas ao mesmo tempo na mesma pasta dobravam o ritmo de acesso à Caixa: agora a segunda recusa (trava com
  "estou vivo" a cada 30 s; trava velha de PC desligado não prende).
- Depois de um bloqueio de verdade, rodar de novo em seguida voltava a pedir à Caixa: agora há 2 h de pausa
  (`--sem-pausa` só para quem trocou de rede). Sem internet não é mais chamado de bloqueio ("SEM CONEXÃO", sem pausa),
  e o erro de rede diz a causa (DNS, conexão recusada, certificado); certificado recusado por antivírus tem aviso próprio
  e o Node passa a confiar nos certificados do sistema (22.15+).
- Arquivo cortado (queda de energia, Ctrl+C no meio do `bh.py`) não vai mais ao GitHub por cima do bom: cada JSON é
  conferido antes do envio, o `fichas.json` quebrado é refeito dos HTML, o BH grava num `.parcial` e toda gravação da
  coleta força o disco (fsync).
- O `fichas.json` publicado fica sempre em `pc/fichas/` (uma cópia por dia faria o clone de cada envio crescer dezenas de
  MB por dia).
- O Ctrl+C duplo no meio do envio deixava um clone na pasta temporária; o log não tirava a pasta temporária do Windows
  (que pode ter parte do nome do usuário); a conferência de 21 mil fichas na retomada ficava minutos sem dar sinal.

Testado aqui sem a Caixa (a rede deste ambiente não chega lá): prioridade, retomada, regravação a partir dos HTML reais
das fixtures, bloqueio, pausa, sem conexão, trava, Ctrl+C, opções e o envio num repositório git local (clone raso,
rebase, conflito, sem login, autocrlf do Windows, JSON cortado, Ctrl+C duplo no envio); e o fluxo inteiro contra um
servidor local que imita a Caixa, no Node 22.6.0, 22.22 e 24.10 (inclusive 20 mil fichas na retomada e o BH com um
`bh.py` de teste interrompido no meio da gravação). **Não testado:** Windows de verdade (o Ctrl+C no console do
Windows, o login do GitHub pelo navegador e o antivírus), a Caixa e o portal de BH ao vivo.

### Atualização: como funciona

Não existe "tempo real" nas fontes: cada uma publica no seu ritmo, e a base busca de tempos em tempos. Proposta de agenda:

| O quê | Frequência | Por quê |
| --- | --- | --- |
| Lista da Caixa | 1× por dia, 7h | a Caixa gera o arquivo em dias úteis |
| Páginas da Caixa (só novos e alterados) | 1× por dia, depois da lista | poucas centenas por dia, com intervalo de 2 s entre páginas |
| Leilões Judiciais | a cada 6 h | lances e status mudam ao longo do dia |
| Radar de editais | 1× por dia | publicações diárias |
| Leilões com praça hoje ou amanhã | a cada 1 h | pegar suspensão, adiamento e resultado |
| Alerta de mudança de praça | depois de cada coleta | compara a praça, a data, o lance mínimo e o status de cada favorito com a coleta anterior (ver "Back-end: favoritos e alerta de mudança de praça") |

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
  download direto); o conector está pronto e roda no seu PC com `node base/coleta-pc.mjs --etapas bh` (ver "Coleta no PC do dono"). Licenças de SP, Rio e POA: a
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
  data ao site. **Decidido: no PC do dono**, com `node base/coleta-pc.mjs` (pronto para rodar; ver "Coleta no PC do dono").
  **Feito para o caso do dono (17/10/2026):** os dados do print dele (matrícula 868, São Gonçalo-RJ, 6º ofício, inscrição
  50334, averbado) estão em `base/fontes/caixa/fichas-manuais/2026-10-17-print-do-dono.json` (formato de
  `baixar-fichas.ts`, com o campo `origem`), aplicados com `npm run base:fichas` e exportados: a página mostra "Lidos na
  ficha da Caixa em 17/10/2026". Para os outros ~21 mil: `node base/coleta-pc.mjs` no seu PC.
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
- [x] ~~**Decisão sua:** o simulador fica aberto no plano Lente?~~ Decidido na rodada 4: simulador e PDF são da Luneta. No
  Lente, a chamada fica no lugar e o código do simulador nem é baixado (ver "Rodada 4 · a trava dos planos").
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
- [x] Preço de mercado na região: a seção mostra também o preço pago nas compras registradas na prefeitura (ITBI), em
  linhas à parte das de leilão, nas cidades que temos (rodada 3, 17/10/2026; ver abaixo).
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

### Rodada 4 · responsividade da prévia (18/10/2026)

Pedido do dono: "Revise a responsividade da prévia, dá para melhorar a disposição das informações". Base: a auditoria
`r4-auditoria-responsiva.md` (30 achados; nenhum dado novo, nada em `src/lib/catalogo`). Os 4 altos e os 13 médios foram
feitos; dos baixos, os rápidos. Medido com o mesmo script antes e depois (Playwright, `next start`, toque emulado):

| Medida | Antes | Depois |
| --- | --- | --- |
| Página do imóvel (casa de São Gonçalo), em telas | 360: 20,9 · 390: 17,9 · 430: 15,7 · 768: 11,9 · 834: 10,1 · 844×390: 30,8 | 360: 11,7 · 390: 10,6 · 430: 9,3 · 768: 7,7 · 834: 6,4 · 844×390: 19,1 |
| Simulador no celular (390), em telas | 6,7 | 2,7 |
| Onde aparece o preço (390 / 768 / 844×390) | 669 / 872 / 920 px | 587 / 543 / 421 px |
| Barras fixas cobrindo a tela, lendo o imóvel (360 / 390 / 768 / 844×390) | 23% / 22% / 19% / 29% | 16% / 15% / 12% / 15% |
| Catálogo: início do 1º imóvel (360 / 390 / 768 / 1024×768 / 844×390) | 309 / 257 / 379 / 307 / 327 px | 239 / 239 / 275 / 263 / 192 px |
| Catálogo: altura do cartão no celular (360 / 390 / 430) | 570 / 575 / 605 px | 474 / 494 / 520 px |
| Barra de filtros colada em 1024×768 | 22% da tela | 9% |
| Texto corrido abaixo de 14 px no imóvel (390, caracteres) | 3.992 | 865 (notas de uma linha) |
| Alvos de toque abaixo de 44 px (imóvel, 390) | 7 | 1 (o "Pular para o conteúdo", que só aparece no Tab) |

Zero rolagem horizontal continua; nenhum número partido. Desktop de 1280 a 1920: mesma disposição (com o resumo da
direita recolhido, o simulador ganhou duas colunas e o texto para em 880 px); a página fica 2% a 8% mais curta.

**O que mudou, por página:**
- **Imóvel, celular:**
  - "Voltar à busca" virou um ícone ← no cabeçalho; o cabeçalho sai de cena ao rolar para baixo (volta ao subir) e a
    navegação das seções sobe para o topo.
  - **Cartão de decisão:** título com Favoritar e Compartilhar em ícones, local numa linha com "Ver endereço", selos,
    preço grande, praça, "Ver anúncio" e "Simular" lado a lado e "Riscos e alertas".
  - **"Em resumo"** com 6 fatos (área, quartos, vagas, preço por m², financiamento, ocupação) e "Ver todos os dados (N)"
    abre o resto (no computador, tudo aberto como antes). Fatos sempre em 2 colunas (também em 360 px); os campos que a
    fonte não informa ficam numa linha por grupo ("Não informados pela fonte: área total, FGTS…", cada um com o (i)).
  - **Simulador:** a resposta primeiro; as três perguntas ("Quanto quer ganhar? 20% ao ano ✎", prazo, cenário) abrem
    numa folha com os mesmos atalhos e a resposta ao vivo no rodapé; **abas Tabela · Conta · Gráfico** (a aberta fica
    salva); a tabela mostra **um prazo por vez** em linhas largas (16 px); o aviso numa linha com "Saiba mais";
    "Exportar PDF" no fim, mais curto. Nenhuma função saiu.
  - **Região:** a tabela rua/bairro/cidade fica em "Comparar por rua, bairro e cidade" (aberta do tablet para cima), com
    a rua numa linha, cabeçalho "Diferença" e as linhas sem dado juntas ("Rua e bairro: sem dados suficientes");
    **portais com o seletor Rua | Bairro | Cidade** e 6 botões em 3 colunas (eram 18 botões; vale em todas as larguras).
  - **Documentos:** "Dados da fonte" virou o rodapé do bloco, numa linha (a âncora `#fonte` continua; a navegação perdeu
    a aba "Fonte").
  - Texto corrido em 14 px no celular (simulador, região, riscos, localização, documentos, rodapé).
- **Imóvel, tablet em pé (768 a 1023):** galeria (4:3) e título lado a lado; o resumo do preço na largura toda com duas
  colunas por dentro (preço e praça | ações); fatos em 3 colunas; simulador com as abas.
- **Imóvel, 1024 a 1279:** resumo da direita com 336 px (a coluna do conteúdo foi de 552 para 592 px); fatos em 2
  colunas (a grade segue a largura da própria coluna); as seções que não cabem na navegação vão para "Mais ▾".
- **Imóvel, computador:** com o resumo recolhido, Resumo/Riscos/Região/Documentos param em 880 px e o simulador fica
  em duas colunas (perguntas à esquerda, resposta colada à direita); em 1920, a página vai a 1.440 px.
- **Celular deitado (844×390 e qualquer tela até 500 px de altura):** pop-ups viram folha que sobe de baixo (o filtro
  rápido abria sem a lista); as janelas do simulador ("Como usar", editores) ocupam a tela toda (o corpo tinha 148 px);
  a barra do lance some e o preço fica numa pílula na barra das seções; no imóvel, faixa numa linha, "Voltar à busca"
  como ícone no cabeçalho e a galeria até 62% da altura; no catálogo, faixa numa linha, sem o título, e a barra já
  nasce em uma linha só.
- **Catálogo (/previa e /assinante):**
  - celular: a vista (Lista | Cards) foi para a linha da busca (em 360 px caía sozinha numa 3ª linha); cartão mais
    compacto (foto 3:2, deságio só no selo da foto, 2 tags e "+N", "Preço de venda" na venda direta); bairro inteiro na
    linha de baixo da lista compacta; pílulas de filtro com o fim esmaecido; **mapa em tela cheia** ("Ver no mapa" →
    "Ver lista"), botões em linha, legenda no "?", o 1º toque num grupo mostra o cartão (o 2º aproxima);
  - tablet em pé: a barra do celular (busca + "Filtros"; total, ordenar e vista; pílulas roláveis), sem os rápidos que
    quebravam em 4 linhas; o título do cabeçalho sem a linha cortada;
  - 1024 a 1279: busca de 280 px e 4 rápidos numa linha (Deságio e Quartos ficam em "Todos os filtros" até 1280); a
    barra colada vira uma linha em telas até 820 px de altura;
  - "×" dos rápidos, tags e "Plano Luneta" com 44 px no toque; "sem data" na linha estreita.
- **Relatório no celular:** letra base de 14 px e nenhum rótulo abaixo de 11 px; a tabela de cenários vira um bloco por
  cenário (sem "arraste para o lado"); "Como salvar o PDF" aberto na primeira visita. O PDF impresso não muda.

**Adaptei ou deixei de fora (e por quê):**
- **Tablet em pé continua abrindo na lista** (a proposta era cards em 2 colunas): o servidor não distingue tablet de
  computador, e trocar a vista depois de carregar faria a lista inteira pular. A densidade é parecida (3 imóveis por
  tela nos dois) e o seletor está à vista.
- **"Em resumo", abas do simulador e folhas das perguntas só abaixo de lg (1024 px)**: no computador o dono já aprovou
  a página aberta; lá a mudança foi só de largura (1024, recolhido, 1920).
- **Mapa do celular:** sem a gaveta com carrossel de imóveis (o cartão da cidade já traz até 3 destaques e "Ver só esta
  cidade"); bolha mínima de 32 px e raio de agrupamento maior não foram mexidos (mexem no agrupamento testado em
  `agrupar.ts`).
- **Opcionais/baixos não feitos:** cartões com 340 px de mínimo (R4-RESP-24), resumo lateral trocando "Simular" por
  "Exportar PDF" com o simulador à vista (R4-RESP-29), parecidos em grade de 4 em 1920.
- **Landing (R4-RESP-18, texto do topo encostando no globo no tablet):** fora da prévia; fica com a frente D (landing).
- **Celular deitado:** o texto segue nos tamanhos do computador (a largura é de 844 px); só o que quebrava foi
  corrigido.

**Pendências desta parte:**
- Conferir num iPhone e num Android de verdade (aqui tudo foi emulado; as fotos da Caixa não carregam neste ambiente,
  então os prints mostram o desenho no lugar da foto, do mesmo tamanho).
- Prints, medidas e folhas de contato: `scratchpad/prints/r4-B/` (antes, depois e `folhas/`); scripts em
  `scratchpad/r4B/` (`medir.mjs`, `dobras.mjs`, `interacoes.mjs`, `extra.mjs`, `comparar.py`, `folhas.py`).

#### Revisão adversarial da responsividade (18/10/2026)

Testado num `next start` com os scripts da auditoria (`r4aud/`) nas 10 larguras e nos dois temas (220 combinações),
mais: axe-core (WCAG 2.2 AA), o Tab pela página inteira (foco coberto pelas barras), CLS no carregamento e o PDF A4
comparado, página por página, com um build de antes da rodada (0dde08b).

**O que a frente B quebrou ou deixou pior, e o que foi feito:**
- **Alta · celular deitado e qualquer tela até 500 px de altura** (também notebook com zoom de 200%): a barra do
  catálogo perdeu a troca de vista (Lista | Cards), o botão do mapa (de 640 px de largura para cima, onde não há o
  botão flutuante) e o total; com filtros, as pílulas também sumiam (só restava o número em "Filtros"). Agora a linha
  única leva a vista e o mapa, o total (de 820 px de largura para cima) e, com filtro ativo, a fileira das pílulas
  volta embaixo (cada uma com o ×, e "Limpar tudo").
- **Média · mapa do computador:** de 1024 a 1440 a coluna do mapa tem menos de 560 px, e o modo "estreito" do celular
  valia ali também: botões em linha, legenda escondida no "?" e o Brasil sem folga (as bolhas do Nordeste cortadas na
  borda direita). O modo estreito agora vale só no toque; com mouse, o mapa ficou como antes da rodada. No celular, mais
  folga à direita (as bolhas grandes do litoral encostavam na borda).
- **Média · relatório:** "Como salvar o PDF" abria depois de carregar (lia o navegador) e empurrava o relatório 89 px:
  CLS de 0,05 a 0,09 no computador (antes da rodada, 0,02 a 0,03). O servidor decide por um cookie e a primeira pintura
  já sai aberta: CLS de 0,01 a 0,025.
- **Média · teclado nas folhas da tela baixa:** a folha fica no fim da página; o Tab além do último controle ia para o
  fim do documento e dava a volta pela página por trás da folha aberta. Agora o Tab (ou o Shift+Tab) que sai da folha
  fecha e devolve o foco ao botão que a abriu.
- **Baixa · mapa em tela cheia:** com o cartão de uma cidade aberto pelo toque, o Esc fechava o mapa inteiro; agora
  fecha o cartão, e o segundo Esc fecha o mapa.
- **Baixa · relatório no celular:** com a letra de 14 px, "R$ 251.000,00" de um trecho da fonte partia entre "R$" e o
  número; as tabelas que rolam de lado não recebiam o foco (o axe acusava). Os dois corrigidos (as tabelas viraram
  regiões com nome, alcançáveis pelo Tab).
- **Baixa · alvos de toque:** o logo do cabeçalho do imóvel abaixo de 380 px ficou com 22 px de largura (o nome some
  ali); a pílula do preço da tela baixa tinha 38 px; os itens de "Mais" na navegação, 40 px no toque. Todos com 44 px.

**Conferido e sem problema:**
- **PDF A4** (casa de São Gonçalo, LJ e apartamento de SP, gerados no celular e no computador): mesmas páginas, mesmo
  texto e mesmos pixels que antes da rodada (só a hora do relatório muda).
- Rolagem horizontal: nenhuma. Números partidos: só o do relatório (corrigido).
- axe nos dois temas (360, 390, 768, 844×390, 1280; com "Ver todos os dados", as abas Conta e Gráfico e a comparação
  da região abertas): nenhum problema de contraste nem de ARIA. Ficam os de antes: bolhas do mapa sobrepostas e o link
  "PDF da matrícula" com 17 px de altura no mouse.
- Teclado: "Ver todos os dados" e "Comparar" abrem pelo Enter e "Mostrar menos" devolve o foco ao botão; as abas do
  simulador andam com as setas, Home e End; as folhas das perguntas e o mapa em tela cheia fecham com Esc e devolvem o
  foco. O Tab pela página inteira (390, 768 e 844×390, para baixo e para cima) não parou nenhuma vez debaixo do
  cabeçalho, da navegação das seções ou da barra do lance.
- Simulador no celular: nenhuma função ficou fora de alcance (perguntas nas folhas; tabela, % dos cenários, "Como
  usar", prazos e "meu lance" na aba Tabela; editores, "Adicionar custo" e "Restaurar" na aba Conta; o gráfico na aba
  Gráfico; "Exportar PDF" no fim).
- Computador (1280 a 1920): a mesma disposição; as diferenças são as anunciadas (seletor de portais em todas as
  larguras, "Diferença" na tabela da região, os vazios agrupados numa linha). O CLS do imóvel no computador até caiu
  (0,044–0,051 → 0,021–0,032; é a galeria trocando a foto que não carrega neste ambiente pelo desenho).

**Fica para depois:**
- Em 1024 a busca tem 280 px e o texto de exemplo sai cortado ("Cidade, bairro, estado ou |"); na tela baixa de 683 px
  de largura, a busca fica com ~90 px.
- Bolhas do mapa sobrepostas no Sudeste e no Nordeste (de antes; o agrupamento não foi mexido).
- Conferir num celular de verdade.
- Prints e medidas: `scratchpad/prints/r4-B-rev/` (`base/`, `fatias/`, `metricas/`, `axe/`, `tab/`, `cls/`, `pdf2/`,
  `verifica/`, `lado/` com antes | depois); scripts em `scratchpad/r4Brev/`.

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
  site no tema escuro), legível em preto e branco. No celular a folha vira coluna fluida (desde a rodada 4, a tabela de
  cenários vira um bloco por cenário).
  Em geral 5 a 6 páginas.

Pendências do relatório:
- [ ] Os ajustes ficam só neste navegador: em outro aparelho o relatório sai com a simulação padrão (guardar na conta quando
  houver login).
- [ ] Chrome com "Cabeçalhos e rodapés" ligado imprime também a data e o endereço da página, por fora dos do relatório (não
  se sobrepõem); a dica da barra pede para desmarcar.
- [ ] Foto da Caixa na capa: conferir no navegador (daqui a rede não chega à Caixa; a da Leilões Judiciais carrega). Sem
  foto, a capa fica sem ela.
- [x] A referência da frase da região é uma só (`src/lib/catalogo/referencia.ts`, `referenciaPrincipal`) na página, no
  simulador e no relatório (17/10/2026).
- [ ] Técnico: a régua "muito abaixo… muito acima" do relatório (`compararRel`) repete a da página (`compararComMedia`), e
  as linhas "sem média" repetem os motivos de `linhasLeiloes`; dá para usar uma só. O mesmo para o recorte do simulador
  (`entradaDoImovel` no relatório e o objeto montado em `PaginaImovel.tsx`).
- [ ] Antes de integrar com a frente de dados, a linha "Rua" do relatório sai sempre "menos de 3 imóveis…": este branch
  ainda não calcula a referência por rua. Com a frente de dados junta, a linha passa a ter a média de verdade.
- [x] O botão "Exportar PDF" leva o `?plano=lente` no próprio link (botão do meio, "abrir em nova aba" e "copiar link"
  também), 17/10/2026.

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

Rodada 3 (17/10/2026), página do imóvel:
- **Matrícula e registro:** matrícula, comarca, ofício, inscrição imobiliária e averbação dos leilões negativos vêm do
  registro do imóvel. Ficha lida: os valores ("Comarca de São Gonçalo/RJ · 6º Ofício", "Averbado"). Caixa com a ficha
  ainda não lida: "Na ficha da Caixa · ainda não lida pela Luneta", com "Abrir a ficha no site da Caixa" e o PDF da
  matrícula (nunca mais "não informado"). Leilões Judiciais: os números do campo e dos PDFs.
- **(i) que explica o valor:** ao lado de modalidade, praça, financiamento, FGTS, parcelamento, ocupação, natureza,
  matrícula, cartório/comarca, inscrição, averbação, leiloeiro, comitente e da tag "direito de preferência". Abre o
  texto do glossário (`src/content/glossario.ts`: o que é, na prática, base legal em letra menor), com "Veja também"
  (ex.: execução extrajudicial → direito de preferência).
- **Preço do m² na região, mais simples:** uma frase grande ("A avaliação deste imóvel, R$ 2.682/m², está 11% abaixo da
  média da cidade"), o selo de 5 níveis (muito abaixo · abaixo · na média · acima · muito acima) e uma tabela curta com as
  médias da rua, do bairro, da cidade e do estado (n de cada; "sem dados suficientes" quando falta) e, à parte, as do
  ITBI. O gráfico de faixas foi para "Ver detalhes". Saiu o aviso "muito fora da faixa da região". Logo abaixo, os
  anúncios nos portais por nível (na mesma rua, no mesmo bairro, na cidade) e "De onde vêm os preços" (no lugar do "Em
  breve"): temos, coleta pendente, sem dado aberto (LAI) e FipeZAP (autorização).
- **Resumo da direita recolhível:** botão discreto no canto; recolhido, vira uma pílula com o lance na barra das seções
  e o conteúdo ocupa a largura (escolha salva no navegador e num cookie, para a página já abrir assim). No celular, a
  barra do lance pode ser minimizada (fica uma pílula no canto).
- **Ordem:** Resumo · Riscos · Localização · Simulador · Região · Documentos · Fonte · Parecidos (os parecidos no fim).
- [ ] **Decisão sua:** os limites do selo da região (hoje: muito abaixo até −30%; abaixo de −10% a −29%; na média de −9%
  a +9%; acima de +10% a +29%; muito acima a partir de +30%).
- [ ] Revisar os textos do glossário (os (i)) com o advogado parceiro.
- Revisão da página (17/10/2026): quando a cidade tem ITBI mas a comparação não vale para o imóvel (apartamentos e
  comerciais em São Paulo e Fortaleza: a área publicada inclui a parte comum), a tabela diz o motivo em vez de "não
  registra compras suficientes"; a fila das seções (8 abas) esmaece nas pontas e ganha setas no mouse quando não cabe
  (celular e telas de 1024 a ~1200 px com o resumo aberto); o rótulo "Muito acima" do selo não é mais cortado no
  celular; bairro ou rua que a fonte não informa aparecem como tal na tabela (e não como "sem dados suficientes").
- [ ] Técnico (dados): quando o bairro tem exatamente os mesmos imóveis da rua, o servidor não repete o recorte e a
  tabela mostra "sem dados suficientes" no bairro (não dá para distinguir de "poucos imóveis"). Uma marca no recorte
  ("igual ao da rua") resolveria.

Rodada 3, correções integradas (17/10/2026), depois da revisão dos 16 pontos, do celular e dos bugs:
- **Venda direta (57% da base, o caso do dono):** o simulador não fala mais em lance. Título "Vale a pena comprar por
  R$ 25.100?"; o número grande é o **lucro pelo preço pedido** ("Lucro de R$ 134.057 em 12 meses · 174% ao ano"), com
  "Atinge a sua meta" e a **margem de segurança**: quanto de custo imprevisto (reforma maior, dívida, outro gasto) ainda
  cabe mantendo a meta (R$ 98.857 no caso do dono; conta nova em `margemDeCusto`, busca binária como o lance máximo). A
  tabela abre em "Lucro pelo preço" e a outra visão virou "Margem para imprevistos"; o Detalhe diz "Com o preço de" e a
  linha "Preço"; "Lance mínimo" vira "Preço pedido" no simulador e "Preço de venda" no resumo, na barra do celular, na
  pílula e na capa do PDF; "Simular lance" vira "Simular compra"; o PDF abre pelo lucro e pela margem. Leilão, venda
  online e licitação seguem como antes (há disputa). A escolha da visão da tabela agora é guardada só quando a pessoa
  troca (`visao: null` = o padrão do imóvel).
- **Venda direta no resumo:** "Leiloeiro: não há (venda direta)", "Processo: não se aplica (venda extrajudicial)" e um (i)
  próprio na natureza ("Execução extrajudicial (venda direta)": a fase de leilão já acabou, sem leiloeiro nem direito de
  preferência).
- **Região: uma referência só.** A frase, a "Região" do simulador e a seção 05 do PDF usam a mesma referência e o mesmo
  número (a média): primeiro o **preço pago (ITBI)** no recorte mais local com compras suficientes (rua e bairro ≥ 10,
  cidade ≥ 30); sem ITBI comparável (apartamentos de SP e Fortaleza, cidades sem o dado), a média de avaliação dos
  leilões mais local com 5 ou mais imóveis. Com o ITBI na frase, os leilões vêm numa segunda linha ("Entre os imóveis em
  leilão, a avaliação deste está 33% abaixo da média da cidade"), e a tabela dele vem primeiro. Sacomã: "12% abaixo do
  preço médio pago no bairro" (era "33% abaixo, muito abaixo", pela média de 22 casas em leilão); Mooca: 24% acima;
  Ramos (Rio): ITBI do bairro (60 compras), não a rua com 5. O simulador escreve de onde vem o número ("preço médio pago
  em 10 compras registradas na prefeitura (ITBI) no bairro Sacoma" ou "avaliação média de 813 casas em leilão na cidade"),
  e o chip mostra o recorte ("R$ 3.960/m² · bairro, ITBI").
- **Custos em reais:** ITBI, escritura e registro, comissão, reserva e corretagem têm "Como informar: em % | valor em R$"
  (a guia do ITBI, o orçamento do cartório). O valor substitui a fórmula e os que abatem o IR continuam abatendo.
- **Textos:** a leitura da célula escolhida na tabela mostra só os números (o cartão já disse a frase); "já sem o IR" vira
  "sem descontar o IR (você tirou da conta)" ou "com isenção do IR" conforme a premissa (tela e PDF); o lucro anualizado
  explica "média: lucro ÷ 18 × 12 · 91,7% ao ano em juros compostos"; personalizado em R$ sem repetir o valor.
- **Celular e toque:** campos do simulador com 16 px no toque (o iPhone não amplia ao focar); % dos cenários com área de
  toque de 44 px; chips de prazo 44×44; "Veja também" e "voltar" do glossário, o link do leiloeiro e o chip travado do
  Lente com 44 px; barra do pé com o deságio na linha do rótulo (nunca sob o botão, nem com R$ 1.901.112 em 360 px);
  "Lucro anualizado" de 7 dígitos cabe no cartão de 360 px; "no total / ao ano / ao mês" numa linha no tablet; a dica
  da tabela não cria rolagem para o lado numa janela estreita com mouse; lápis do Detalhe à vista no computador (40%,
  acende no hover).
- **Lente:** "Conhecer a Luneta" dentro do pop-up das dívidas fecha o pop-up e abre o convite por cima (antes ficava
  atrás e um Esc fechava os dois); o PDF no Lente diz "dívidas não analisadas no plano Lente: confira no edital" (dizia
  "nenhuma apontada").
- **Relatório:** no tema escuro, o PDF não sai mais com moldura preta nas margens; no celular, a barra fixa é uma linha só
  ("Voltar ao imóvel" e "Salvar PDF", 65 px em 360) e "Como salvar o PDF" rola com a página; o /relatorio não baixa mais
  o JavaScript da página do imóvel (582 KB contra 843 KB: o layout da rota importava a página inteira; o carregamento foi
  para `imovel/carregar.ts` e o aviso da classificação para `src/content/avisos.ts`).
- [ ] **Decisão sua:** a amostra mínima do ITBI para valer como referência (hoje rua e bairro 10 compras, cidade 30).
- [ ] **Decisão sua:** na venda direta, o texto da margem de segurança ("cabem mais R$ X de custos imprevistos e você
  ainda consegue render 20% ao ano") e se o preço pode ser trocado "para comparar" (hoje pode, com aviso).
- [x] Matrícula 868 do caso do dono: aplicada a partir do print (ver "Matrícula da Caixa" acima). As demais dependem de
  rodar as fichas de uma rede no Brasil.
- [ ] **Com você:** rodar a coleta no seu PC (`node base/coleta-pc.mjs`; guia em `base/COLETA-NO-PC.md`). Pronto para rodar:
  as ~21 mil fichas da Caixa e o ITBI de BH. Depois eu aplico o que chegar no branch `coletas-dados`.
- [ ] O JavaScript da página do imóvel subiu ~35 KB sem compressão (venda direta, custos em reais, margem). Dá para
  carregar o simulador com `next/dynamic` perto da seção (ele fica abaixo da dobra).

### Ranking de localização: dá para fazer com precisão? (pergunta 13, 17/10/2026)

Sim, mas em duas etapas, e a primeira é a precisão do ponto:
1. **Posição exata do imóvel.** Hoje a Caixa só dá a cidade (o ponto é o centro do município). Sem o endereço virar
   coordenada, qualquer ranking mede a cidade, não o imóvel. Caminhos sem custo: geocodificar o endereço pelo
   **Nominatim/OpenStreetMap** (limite de 1 pedido por segundo e uso moderado: os 21 mil levam ~6 h, uma vez, depois só os
   novos; ou uma instância própria do Nominatim para volume) e conferir pelo **CEP** quando a ficha trouxer. Precisão
   esperada: rua/número na maioria das capitais; bairro no interior.
2. **Nota de localização (0 a 100) com dados abertos**, por raio de 500 m a 1 km do ponto:
   - **acesso e serviços** (OpenStreetMap/Overpass): escolas, saúde, mercado, farmácia, parques, transporte (estações,
     pontos de ônibus); distância ao centro e a polos de emprego;
   - **renda e perfil do entorno** (IBGE, Censo 2022, por setor censitário): renda média, escolaridade, domicílios;
   - **preço da região:** ITBI (preço pago por m² na rua/bairro, já na base para 5 capitais) e a média dos leilões;
   - **riscos:** áreas de inundação e deslizamento (CEMADEN e planos municipais, onde publicados), criminalidade por
     bairro onde a secretaria publica (ex.: ISP no RJ, SSP em SP), ruído de grandes vias (OSM);
   - a nota sai por **percentil dentro da cidade** (comparar Copacabana com o Centro do Rio, não com Uberlândia) e mostra
     os componentes ("acesso 82 · serviços 75 · preço 40 · risco de alagamento: atenção").
   Custo: só engenharia (≈ 30–50 h) e processamento; todas as fontes são abertas. Cuidados: a nota não pode virar
   promessa ("não é garantia"), dados de crime por bairro são irregulares e sujeitos a viés, e cada fonte pede atribuição.
- [ ] **Decisão sua:** fazer o ranking (e se entra na Luneta ou no Telescópio). Ordem sugerida: geocodificação → acesso e
  serviços (OSM) → renda (IBGE) → preço (ITBI) → riscos.

### Ranking de localização (rodada 4): o que já está pronto

**A1 · posição do imóvel pelo endereço (18/10/2026).** Era o primeiro passo da resposta acima: o ponto deixa de ser a
sede do município. Feito sem Nominatim, com o **geocodebr (IPEA, MIT) sobre o CNEFE 2022 do IBGE**, que roda neste
contêiner (os releases do GitHub abrem daqui) e no Actions. Detalhes em `base/fontes/localizacao/README.md`; números em
`base/saida/localizacao/medicao-geocode.md`.

| Precisão do ponto | Imóveis | % | No site | Nota de localização (decisão 2) |
|---|---|---|---|---|
| número (exato, interpolado ou quadra e lote; até 150 m) | 10.481 | 49,4% | `exata` | normal |
| rua (até 500 m) | 3.211 | 15,1% | `rua` | normal |
| bairro (centro da localidade, até 2,5 km) | 4.655 | 21,9% | `bairro` | aproximada, com faixa |
| cidade (sede do município) | 2.883 | 13,6% | `cidade` | sem nota |

- Número ou rua: **64,5%** (a verificação previa 59,0% só com as regras de rebaixamento; os degraus novos somaram o resto).
  Por porte: 44,5% nas cidades com menos de 20 mil moradores, 77,4% nas de mais de 500 mil.
- **Regras de segurança** (C2 a C5 da verificação): empate longe, casamento sem bairro com nome genérico ("Rua 06") ou
  longe do bairro, nome parecido conferido palavra a palavra, ponto fora do município ou a mais de 1 km do bairro do
  IBGE → rebaixa; rural → sem nota; rodovia com km → no máximo rua.
- **Dois erros achados e corrigidos na validação:** (1) o geocodebr 0.2.0 põe o número além do fim da rua perto do meio
  dela com desvio de 6 m: o ponto é refeito entre os vizinhos do CNEFE (1,4 mil imóveis saíram de "número");
  (2) o `raio_km` da malha do Rio de Janeiro era 19 km, e Santa Cruz fica a 50 km do Centro: `base/geo/raios-cnefe.csv`
  corrige 24 municípios, também na exportação.
- **No banco e no site:** `npm run base:geocode -- --arquivo base/saida/localizacao/geocode.json` grava lat, lon e
  precisão (e `extras.geo` com desvio, setor censitário, motivo e degrau), sem piorar o ponto que a fonte trouxe; a
  próxima coleta mantém o ponto enquanto o endereço for o mesmo. O instantâneo do site (`base/saida/site/`) já foi
  regerado com os pontos novos.
- **Atualização:** a cada lista nova da Caixa, rodar `geocodificar.py` (cerca de 90 s) e `base:geocode`; ou o workflow
  `base-localizacao.yml` com `etapa=geocode`, que publica o geocode.json no branch `coletas-dados`.

Pendências da A1:
- [ ] **Quem integra:** o banco (`base/dados/luneta.db`) não vai para o git. No banco principal, rodar
  `npm run base:geocode -- --arquivo base/saida/localizacao/geocode.json` antes do próximo `base:exportar -- --site`;
  senão o instantâneo volta para a sede.
- [x] **Site (frente C):** o mapa dizia "Posição informada pela fonte" para toda precisão `exata`. Agora, com o ponto do
  CNEFE, diz "Endereço localizado no número, no cadastro de endereços do IBGE (CNEFE 2022)"; o da Leilões Judiciais
  continua "informada pela fonte" (18/10/2026).
- [ ] **Decisão sua:** bairro muito grande (desvio acima de 2,5 km, como Santa Cruz e Campo Grande no Rio) fica "cidade"
  quando a rua não casa (cerca de 1,1 mil imóveis). O centro do bairro está mais perto que a sede; dá para mostrá-lo como
  "bairro aproximado" no mapa sem dar nota.
- [ ] **Conferir à mão** (Street View) os suspeitos listados na medição (10 na amostra de 120) e, depois, uma amostra
  maior: é a única validação do ponto exato.
- [ ] **CEP das fichas da Caixa** (item 4 da rodada): com ele entram os níveis com CEP do geocodebr; rodar de novo.
- [ ] **DF:** "Quadra 312" sem o tipo (QR, QS...) não casa com o CNEFE; quadras com conjunto casam.
- [ ] **Fora do código:** avisar o IPEA (github.com/ipea/geocodebr) da interpolação pela média de todos os números da rua.
- [ ] Rodar o workflow uma vez no Actions (`gh workflow run base-localizacao.yml --ref <branch> -f etapa=geocode`) para
  confirmar o caminho de lá.

**A2 · nota de localização (18/10/2026).** Uma nota de 0 a 100 para o entorno de cada imóvel, comparado com os
**moradores da própria cidade** (quadrados de 200 m da grade do IBGE com moradores, pesados pela população): "melhor
localizado que 78% dos moradores de São Gonçalo". Seis partes, cada uma com a sua nota: serviços do dia a dia 25%,
infraestrutura da rua 25%, transporte 20%, renda do entorno 20%, comércio e movimento 5%, lazer 5%. O método completo,
em português simples para a página pública, está em `base/fontes/localizacao/README.md`; os números em
`base/saida/localizacao/medicao-nota.md`.

| Situação | Imóveis | % | O que a tela mostra |
|---|---|---|---|
| nota calculada (ponto no número ou na rua) | 13.293 | 62,6% | a nota e as 6 partes |
| nota aproximada (só o bairro) | 4.386 | 20,7% | uma faixa e o meio dela |
| sem nota: endereço só na cidade | 2.836 | 13,4% | o motivo |
| sem nota: cidade pequena (menos de 20 mil moradores ou 50 quadrados) | 666 | 3,1% | os números do entorno e a posição em terços |
| sem nota: rural ou cidade fora da base | 49 | 0,2% | o motivo |

- **Dados:** CNEFE 2022 (domicílios e estabelecimentos; mercado, farmácia e padaria pelo nome, que nunca é publicado),
  Censo 2022 por setor (renda mediana confirmada no dicionário do IBGE, pavimentação, calçada, iluminação, esgoto, ponto
  de ônibus), Inep (escolas), CNES (saúde), OpenStreetMap (estações, pontos de ônibus, parques e praças, só pelo
  Actions) e o BATER (áreas de risco, só alerta). Atribuições e licenças em `base/FONTES.md`.
- **Distribuição:** imóveis com nota calculada: mediana 37 (p10 9, p90 78). Os imóveis da Caixa ficam mais na periferia
  do que o morador típico; nas células da cidade a média é 50 por construção.
- **Conferência com o preço (ITBI de 5 capitais, 5.108 ruas e tipos):** Spearman mediano de **0,32** entre a nota e o
  preço pago por m² na rua (SP apartamentos 0,55). Comércio puxava contra o preço; os pesos da decisão (30/20/20/15/10/5)
  viraram 25/20/20/25/5/5 (mediana 0,24 → 0,32). Isso não valida o interior.
- **Arquivos do site** (commitados): `base/saida/site/localizacao.json.gz` (616 KB), `localizacao-osm.json.gz` (216 KB,
  ODbL) e `localizacao-cidades.json.gz` (50 KB). O servidor (`src/lib/catalogo/localizacao.ts`) monta a
  `LocalizacaoImovel` da página e a `notaLocal` da lista; ordem "Melhor localização" e filtro `notaLocalMin` na URL.
- **Plano:** a nota é da Luneta. No Lente o servidor não manda a nota, o preço da região nem as buscas nos portais
  (`travas` lista o que falta; a tela da trava é da frente D). A /assinante tem notas fictícias coerentes, marcadas como
  exemplo.
- **Atualização:** `gh workflow run base-localizacao.yml --ref <branch> -f etapa=tudo` roda geocode, OSM, IBGE e nota (cerca
  de 40 min) e publica em `coletas-dados/localizacao/<run_id>/`; aqui, `pois.py` + `nota.py` levam 10 min. Rodado no
  Actions em 18/10: `osm` (execução 39088496433, 14 min, 246 mil pontos), `ibge` (39090046510) e `nota` (39091626698, 10
  min; os arquivos saíram iguais byte a byte aos gerados aqui). A etapa `geocode` e o `tudo` ainda não rodaram lá.

Pendências da A2:
- [x] **Site (frente C):** a nota na tela (seção, filtro, ordem, selo, resumo, PDF) e a página "Como a nota é calculada".
  Feito em 18/10/2026: ver "C · a nota na tela" abaixo.
- [x] **Planos (frente D):** a tela da trava no Lente para `localizacao`, `regiao`, `portais`, `simulador` e `relatorio`
  (o servidor já não manda os dados) e os filtros avançados. Feito em 18/10/2026: ver "Rodada 4 · a trava dos planos".
- [ ] **Quem integra:** depois do `base:geocode` e do exportar no banco principal, rodar `pois.py` e `nota.py` (ou copiar
  os `localizacao*.json.gz` do Actions); imóvel novo fica "pendente" até a próxima rodada.
- [ ] **v1.1:** setores de risco do SGB (alto e muito alto) quando a camada e a licença forem confirmadas no Actions; o CEP
  das fichas da Caixa (mais imóveis no número); a conferência à mão no mapa (Street View) de uma amostra de notas e dos
  pontos de ônibus do OSM nas cidades com cobertura baixa.
- [ ] **Decisão sua:** os pesos (hoje 25/20/20/25/5/5, depois do ajuste pelo ITBI) e se a nota da cidade pequena deve
  usar a região imediata (hoje: terços na própria cidade, para não punir a cidade pequena contra o polo).
- [ ] **Licença (confirmar com o jurídico):** a nota final usa as partes de transporte e lazer, que vêm do OSM. Ela foi
  tratada como "produced work" (atribuição na tela); as colunas derivadas do OSM estão no arquivo à parte, sob a ODbL.

**Revisão adversarial do ranking (18/10/2026).** Código, dados, LGPD, ODbL, vazamento para o Lente e reprodutibilidade
conferidos antes de você ver. O pipeline rodado do zero com o cache deu os mesmos arquivos byte a byte, antes e depois
das correções (duas execuções seguidas de `nota.py` com o mesmo sha256). O que foi achado e corrigido:

| Severidade | O que era | O que foi feito |
|---|---|---|
| Alta | **Renda e infraestrutura sumiam em cidades inteiras.** O CNEFE grava o setor da malha da coleta, e os resultados por setor do Censo usam a malha final: 6,9% dos domicílios das cidades da base não achavam o setor (96% em Nossa Senhora do Socorro/SE, 69% em Criciúma/SC, 23% em Campinas/SP). 294 imóveis com nota (203 calculadas, 163 delas em Socorro) estavam sem a parte de renda e, quase todos, sem a de infraestrutura (até 45% do peso redistribuído sem aviso) e 1.172 tinham a renda incompleta. | O domicílio sem setor recebe o setor do polígono da Malha de Setores 2022 em que cai (C6, opção a; nova entrada no manifesto com sha256, +381 MB). 99,3% recuperados; ficam 0,1% sem setor. Renda incompleta: 1.172 → 169; nota sem renda: 294 → 1. 486 notas mudaram 10 pontos ou mais. |
| Média | **A cobertura do OSM de ônibus contava as vizinhas.** A regra dos 10% comparava os pontos da caixa da cidade (com a capital ao lado) com as quadras do município: Ceará-Mirim dava 7,8 e Belford Roxo 0,30, sem o próprio território mapeado. | Contam só os pontos dentro das células habitadas da própria cidade. Os pontos do OSM entram em 265 cidades (eram 501); Belford Roxo cai para 0,02 e passa a usar só o Censo. |
| Média | **Risco "conferido" sem ponto.** Imóvel com endereço só na cidade, numa cidade mapeada, vinha com `coberturaRisco: true` e nenhum alerta: a tela leria "nenhuma área de risco perto". | Novo campo `riscoRaioM` no contrato (`LocalizacaoImovel`): 100 m do imóvel, até 500 m do centro do bairro, ou null quando não houve procura. A frente C usa para dizer o que foi conferido. |
| Baixa | Distância até a área de risco medida em graus com o fator da longitude: encurtava em 8% (13% no Sul) o sentido norte-sul; uma área a 105 m ao norte dava alerta "a 97 m". | Plano local em metros, com teste. Alertas: 1.195 → 1.185. |
| Baixa | O meio da faixa da nota aproximada arredondava o meio para o par (48,5 → 48, 49,5 → 50). | Meio para cima, como na escola, com teste. |
| Baixa | Textos: "áreas habitadas de 200 m" na cidade pequena (a grade rural tem quadrados de 1 km); na aproximada, nada dizia que as partes foram medidas no centro do bairro. | Textos corrigidos, com teste. |
| Baixa | `notaLocalMin=0.4` na URL virava "nota 0+" na pílula e contava como filtro. | Arredonda antes de conferir a faixa (1 a 100), com teste. |

Conferido e sem problema:
- **Geocode:** 40 imóveis sorteados em número ou rua, conferidos no CNEFE e no polígono do bairro. Nenhum caiu na rua
  errada; 3 ficaram incertos (número que não existe no CNEFE, posto perto de outro número da mesma rua). Dos 10 em
  bairro, um em cidade pequena (Mucurici/ES) tem a rua num distrito a 17 km do "Centro" informado. Os 398 rebaixados por
  conflito entre a rua e o bairro ganham a nota aproximada do bairro informado: escolha da A1, mantida.
- **LGPD:** nenhum nome, CPF ou razão social nos três `.gz`, no `coletas-dados/localizacao/` e no branch
  `coleta-localizacao`. Só números, códigos e nomes de cidade.
- **ODbL:** as colunas do OSM estão só no `localizacao-osm.json.gz`, com o aviso.
- **sha256:** o cache bate com o `manifesto.json` nas 18 entradas (19 com a malha).
- **Lente:** a API com `plano=lente&ordem=localizacao&notaLocalMin=80` devolve a mesma lista e a mesma ordem do padrão,
  com `notaLocal: null`; a página e o RSC do imóvel no Lente não trazem a nota, o preço da região nem os portais.
- **Desempenho:** os três `.gz` carregam em cerca de 80 ms na primeira requisição (+12 MB de memória). `nota.py` passou
  de 3 para 6 min por causa do polígono do setor.
- **Textos:** nada de "garantia", "segura", "risco zero" ou "sem risco".

Pendências da revisão:
- [x] **Frente C:** `riscoRaioM` no texto sem alerta ("Nenhuma área de risco mapeada a menos de 100 m do imóvel"; com
  `coberturaRisco` e raio null: "não deu para conferir"); na aproximada, "As partes foram medidas no centro do bairro,
  não no imóvel" (18/10/2026).
- [ ] **Decisão sua:** a regra dos 10% do OSM conta agora só o território habitado da cidade. Bairro sem morador (zona
  industrial, avenida comercial) fica fora, e São Paulo cai de 0,62 para 0,47. Se quiser mais cidades com os pontos de
  ônibus do OSM, dá para baixar o limite ou contar até 300 m das áreas habitadas.
- [ ] **Decisão sua (A1):** o imóvel cuja rua fica longe do bairro informado ganha a nota aproximada do bairro (398
  imóveis). Com o bairro "Centro" (29 deles), o "Centro" pode ser só o padrão da Caixa.

**C · a nota na tela (18/10/2026): tela pronta.** O que aparece no plano Luneta (simples primeiro, detalhe num toque):
- **Página do imóvel, seção Localização:** o cartão "Nota de localização" vem antes do mapa. Nele:
  - o número grande num anel e a frase: "Melhor localizado que 22% dos moradores de São Gonçalo/RJ". Nas pontas, "Entre
    os 1% mais bem localizados" ou "menos de 1%", nunca 100% nem 0%;
  - o selo da precisão. Um toque explica cada caso: no número (±10 m), na rua, "Só no bairro: nota aproximada" (com a
    faixa, "~59" e "48% a 70%") ou só na cidade;
  - as 6 partes em barras, com a nota e o peso. Um toque abre o que é medido, os números com o comum na cidade
    ("Mercados a até 500 m: 13 · comum na cidade: 8") e a fonte com a data. A parte sem dado mostra "sem dado nesta
    cidade, peso redistribuído";
  - a área de risco. O alerta do BATER diz onde procuramos ("até 100 m do imóvel"). Sem alerta, diz o que foi conferido.
    Na cidade sem mapeamento: "isso não quer dizer que não haja risco". Nunca "sem risco";
  - "Como a nota é calculada" e o rodapé com as fontes, incluindo "© colaboradores do OpenStreetMap" com o link. Que a
    nota não é garantia, ele diz uma vez.
- **Cidade pequena:** os terços ("acima da maioria") e o número principal de cada parte, sem nota de 0 a 100.
- **Sem nota:** o motivo e o que ver no lugar: o endereço no Google Maps e o preço do m² da região.
- **Mapa:** usa o ponto mais preciso, o do CNEFE. O texto "Posição informada pela fonte" virou "Endereço localizado no
  número, no cadastro de endereços do IBGE (CNEFE 2022)". O link "Ver o ponto no OpenStreetMap" abre a coordenada.
- **Resumo lateral** (no celular, o cartão de decisão): a nota pequena, a linha curta e o alerta de risco, com link para
  a seção.
- **Catálogo:**
  - o filtro "Nota de localização": Qualquer, 40+, 60+ e 80+, cada um com a contagem, ou um valor livre de 1 a 100;
  - a ordem "Melhor localização";
  - o selo "Local 78" ("~45" na aproximada) no cartão e na linha. Quando não cabe ao lado do bairro e da cidade, ele
    desce de linha em vez de cortar o bairro. No celular, fica na linha do bairro, e a cidade longa quebra ao lado do
    ícone em vez de virar "Cocalzinho de Goiás/...";
  - na URL, `notaLocalMin` e `ordem=localizacao`;
  - no Lente, filtro, ordem e selo ficam escondidos. A trava visual é da frente D.
- **PDF:** a seção 06 "Localização" tem a nota, a frase, a precisão, as 6 partes em tabela com os números, o alerta e as
  fontes. No Lente, só a frase de que a nota é da Luneta. As seções seguintes passaram a 07, 08 e 09.
- **Página pública `/metodologia/localizacao`:** estática. Entra nos buscadores e no sitemap só quando `SITE.indexable`
  for verdadeiro. Explica:
  - o que a nota responde, com a régua e os 100 moradores;
  - como achamos o ponto: 49,4% no número, 15,1% na rua, 21,9% no bairro e 13,6% na cidade, lidos do arquivo;
  - as 6 partes: o que entra, o raio, a fonte, a data e o peso. Os pesos vêm do arquivo, não de um texto;
  - como vira a nota, com um exemplo;
  - cidade pequena e bairro;
  - áreas de risco;
  - o que não entra (preço, crime, favela) e por quê;
  - a conferência com o ITBI e o que ela não valida;
  - limites, atualização, fontes e licenças, perguntas.

  Quem vem de um imóvel (`?de=<id>`) vê "Voltar ao imóvel". No celular, o detalhe de cada parte abre num toque.
- **Exemplos da /assinante:** o cartão diz "Exemplo fictício".
- **Lente:** o mapa e o endereço continuam; embaixo, a chamada da Luneta (`RecursoLuneta`, com a nota desenhada, nunca a
  do imóvel), "Conhecer a Luneta" e o link "Como a nota é calculada".
- **Conferido no navegador** (`next start`, 360, 390, 768, 1024 e 1440 px, os dois temas), em 10 imóveis:
  - o seu: 22 em São Gonçalo;
  - 97 em São Paulo;
  - aproximado em Santos;
  - sem nota em Caldas;
  - cidade pequena em Cocal do Sul;
  - dentro de área de risco em Pelotas;
  - risco a 90 m no Rio;
  - lazer sem dado em Santa Luzia do Paruá;
  - um exemplo;
  - o Lente.

  Em nenhum houve rolagem lateral, cartão vazando ou "sem risco", "risco zero", "100%" e "0%" na frase. O PDF A4 saiu
  com a seção inteira numa página.

Pendências da C:
- [x] **Frente D:** trocar `ChamadaNotaLuneta` pela chamada única do Lente (`RecursoLuneta`); no Lente, o filtro e a ordem
  da nota aparecem com o cadeado; a landing tem o link para `/metodologia/localizacao` (D2).
- [ ] **Decisão sua:** o mapa mini da página mostra o estado com o ponto, sem as ruas. Com o ponto no número, um mapa de
  ruas mostraria o quarteirão: tiles do OSM com atribuição ou outro provedor, e o limite de uso entra na conta.
- [ ] **Técnico:** os números da conferência com o ITBI na página do método estão em `src/lib/catalogo/metodologia.ts`
  (`VALIDACAO_ITBI`), copiados de `medicao-nota.md`. Se o `nota.py` mudar a validação, atualizar ali, ou gravar a
  validação no `localizacao.json.gz`. Os outros números da página vêm do arquivo, lidos no build.

### Rodada 4 · site original (landing): o plano Luneta e as novidades (18/10/2026)

Pedido: "Todas as novas implementações vão para o plano Luneta; arrume o site original adicionando as informações e o
marketing." A landing de antes desta rodada está no branch `versao-site-v1`. A divisão dos planos é a da rodada 4
(`src/lib/catalogo/planos.ts`): **Lente = encontrar; Luneta = decidir; Telescópio = a Luneta para a equipe.**

**O que mudou na landing (`/`):**
- **Duas seções novas** entre "Filtros e mapa" e "Dados de deságio" (a alternância de fundo continua):
  - **"Decida com números"** (`#decida`, `src/components/sections/Decida.tsx`): o simulador de lance máximo, o preço do
    m² com os leilões da base e as compras reais do ITBI em 5 capitais, o relatório em PDF e a página completa do imóvel,
    com matrícula e glossário (esta, de todos os planos). A miniatura do simulador usa o exemplo fictício da
    demonstração (apartamento na Vila Mariana, `ex-alvo-sp`): **"Dê no máximo R$ 362.178"**, calculado no build pelo
    simulador de verdade (`src/lib/simulador`), com a matriz de 3 cenários × 4 prazos. O link "Ver este exemplo na
    demonstração" abre a página do imóvel com o mesmo número.
  - **"Nota de localização"** (`#localizacao`, `Localizacao.tsx`): o que é ("melhor localizado que X% dos moradores da
    cidade"), os passos 01 a 03, a miniatura da nota do mesmo exemplo (91, com as seis partes e a linha de risco) e as
    seis partes com os pesos **25/20/20/25/5/5**, lidos de `PESOS_PADRAO` (`src/lib/catalogo/localizacao.ts`), nunca
    digitados. O link "Como a nota é calculada" vai para `/metodologia/localizacao` (a página é da frente C).
  - São componentes do servidor, sem JavaScript novo no navegador. As animações são as do `MotionLayer`: entrada, número
    contando, células da matriz em cascata, arco e barras da nota. Com menos movimento, tudo já aparece pronto.
  - Os textos das duas ficam em `src/content/ferramentas.ts` (só no servidor; `site.ts` vai ao navegador).
- **Tabela de planos em 4 grupos** (Encontrar · Decidir · Acompanhar · Equipe):
  - **Lente:** todos os leilões, fotos e mapa, os 6 filtros (estado, cidade, tipo, faixa de preço, deságio e data), a
    página do imóvel com os dados da fonte, a matrícula e o glossário, e os parecidos. Tags e selos não aparecem (nem
    desfocados; a página do imóvel mostra onde eles estariam): ver "Rodada 4 · revisão final".
  - **Luneta:** tudo do Lente e mais tags e selos, filtros avançados, simulador, preço do m² com o ITBI, buscas nos
    portais, nota de localização, PDF, favoritos e prioridade no contato com advogado (o alerta de praça só entra na
    landing quando existir: `PRODUTO.alertaPraca`).
  - **Telescópio:** tudo da Luneta, mais a base em planilha, vários usuários e suporte.
  - Nos cartões, linhas com o mesmo rótulo curto viram uma só ("Tags de risco e selos", "Favoritos com alerta de praça").
    A coluna da Luneta segue destacada entre os grupos.
- **FAQ:** novas "O que o plano Lente inclui?", "O simulador diz quanto vou lucrar?" (não é promessa de lucro nem
  recomendação de investimento), "De onde vem o preço do m²?" e "Como funciona a nota de localização?". A da garantia
  virou "A classificação, a nota e o simulador são garantia?". As novas não têm placeholder e entram no JSON-LD.
- **Textos:**
  - Hero ("…reúne cada oportunidade, mostra o risco e faz a conta do lance") e a descrição da página;
  - Solução: a página inteira do imóvel; saiu "sem você precisar ler cada edital";
  - Filtros: o que é do Lente e o que é da Luneta;
  - Planos: a frase de abertura e o público de cada plano ("decidir com mais informação", no lugar de "com segurança");
  - "Por dentro": saiu **"Análise profissional, caso a caso… revisados para você"**. As tags são automáticas e ficam
    "em revisão" até a auditoria do advogado; agora é "Cada leilão lido para você… com o trecho de onde veio cada
    alerta";
  - rodapé (o aviso do simulador e o da nota, e o link "Como a nota é calculada") e o JSON-LD.
- **Menu:** "Ferramentas" (`#decida`) entre "Níveis" e "Planos". No computador, só a partir de 1280 px (entre 1024 e
  1279 px não cabe ao lado dos botões); no menu do celular, sempre.
- **R4-RESP-18 (hero no tablet):** de 640 a 1023 px a lente fica menor e o botão secundário usa o texto curto. O texto
  não encosta mais na lente (folga de 29 a 35 px entre 700 e 844 px) e o cartão "Alvo" fica abaixo dela.
- Na demonstração de filtros, "2ª praça" e "Desocupado" levam a marca "Luneta" (são filtros avançados).

**Testes** (`src/content/site.test.ts`, 12 casos, no `test:site`):
- a tabela é crescente (o que a Lente tem, a Luneta tem; o que a Luneta tem, o Telescópio tem) e vem em grupos;
- cada recurso de `planos.ts` tem a sua linha, e o Lente não leva nenhum;
- os filtros prometidos ao Lente são `FILTROS_LENTE`, e todo filtro do catálogo tem lugar na landing (dá erro de tipo se
  faltar);
- os pesos são `PESOS_PADRAO` e batem com o arquivo da nota; a renda é a V06006;
- o lance máximo do exemplo é R$ 362.178 no motor real;
- as 5 capitais do ITBI batem com os arquivos;
- nenhuma palavra proibida ("risco zero", "garantido", "sugerido", "revisados para você", "sem risco"...);
- os avisos de garantia e de recomendação; o aviso do simulador da landing é o mesmo da tela;
- as âncoras do menu e a ordem das seções.

O `check:publicacao` não lê mais os `*.test.ts` (não vão ao ar).

**Conferido no navegador** (`next start`; 360, 390, 768, 1024 e 1440 px; dois temas; a página inteira rolada):
- sem rolagem horizontal e sem erro no console;
- todas as entradas animadas terminam, com os números finais certos (362.178 e 91);
- axe sem violações nas seções novas, nos planos, no FAQ e no rodapé.

Prints em `scratchpad/prints/r4-D2/`.

**Decisões suas (landing):**
- [ ] **Preço da Luneta** `R$ [129]` (continua placeholder): com a Luneta mais completa, rever.
- [ ] **Número de compras do ITBI** em "Decida com números": hoje `[X]`. O total (~203 mil) é lido dos arquivos no build.
  Publicar só depois de confirmar as licenças de São Paulo, do Rio de Janeiro e de Porto Alegre. Para ligar:
  `DECIDA.mostrarTotalItbi = true` em `src/content/ferramentas.ts`.
- [ ] **Link "Ferramentas" no menu:** manter (hoje a partir de 1280 px no computador, sempre no celular) ou tirar.

**Falta (técnico):**
- [ ] Depois da integração com a frente C: conferir o link "Como a nota é calculada" (seção e rodapé; até lá dá 404) e
  que a página do imóvel da demonstração (`ex-alvo-sp`) mostra a mesma nota 91 da miniatura.
- [ ] A miniatura da nota copia o visual do cartão da frente C, sem importar `src/components/catalogo/**`. Se o cartão
  mudar, alinhar.
- [ ] O aviso do simulador tem duas cópias: `src/content/avisos.ts` e `src/components/simulador/Simulador.tsx`. O teste
  confere que dizem o mesmo; juntar quando alguém mexer no simulador.

### Rodada 4 · a trava dos planos no catálogo e na página do imóvel (18/10/2026)

Pedido: "Todas as novas implementações vão para o plano Luneta". Antes, no Lente, várias coisas só sumiam ou apareciam
vazias (a região dizia "ainda não há imóveis suficientes", a nota sumia, o simulador ficava aberto). Agora cada recurso
da Luneta tem uma chamada, no mesmo lugar, e o servidor não manda o dado.

**A regra (uma só, em `src/lib/catalogo/planos.ts`):**
- `pode(plano, recurso)`: o plano vê o recurso se tiver pelo menos o plano mínimo dele (`MINIMO`, hoje tudo "luneta").
  - O Telescópio, quando existir no catálogo, entra no tipo `Plano` e em `NIVEL` com nível 2 e vê tudo da Luneta.
  - Nenhuma tela compara com `plano === "luneta"`: um 3º plano não quebra nada.
  - Plano desconhecido vale como o Lente.
- **Filtros do Lente** (`FILTROS_LENTE`): os 6 prometidos (estado, cidade e bairro, tipo, faixa de preço e avaliação,
  deságio, data) e a busca por texto.
  - O resto é "filtro avançado": área, quartos, vagas, R$/m², modalidade, praça, financiamento, FGTS, parcelamento,
    ocupação, natureza, fonte e foto.
  - Também são da Luneta os filtros de tags, de selo e de nota (`recursoDoFiltro`).
- **Ordens do Lente:** deságio, preço, data, área, R$/m² e recentes. "Menos alertas", "Melhor selo" e "Melhor
  localização" são da Luneta (`RECURSO_DA_ORDEM`).
- **No servidor** (`consulta.ts`, `pagina.ts`):
  - no Lente, os filtros e as ordens da Luneta são ignorados (`filtrosDoPlano`, `ordemDoPlano`);
  - as facetas dos filtros avançados saem vazias;
  - os itens saem sem tags, selo e nota;
  - a página do imóvel sai sem tags, selo, o porquê do selo, nota, preço da região (o ITBI nem é calculado) e portais;
  - fica a cobertura de preços (de quais cidades a Luneta tem o ITBI), que é pública.
- **A tela** usa a mesma regra (`filtros-rotulos.ts`: `gruposIgnorados`, `grupoPermitido`, `gruposForaDoPlano`).
- **De onde vem o plano:** na prévia e na demonstração, do `?plano=lente` (qualquer um tira o parâmetro e vê a Luneta).
  Com login, as mesmas funções recebem o plano da sessão.

**O que o Lente vê:**
- **Componente único `RecursoLuneta`** (`src/components/catalogo/planos/`), em três formas:
  - "secao": prévia **desenhada** e borrada (formas fixas, nunca o dado, nem no HTML), "Plano Luneta", o nome e a
    chamada de `RECURSOS_LUNETA`, "Conhecer a Luneta" e "Comparar os planos" (`/#planos`);
  - "compacto": o mesmo, menor, no painel de filtros;
  - "linha": um filtro avançado com o cadeado.

  Ele substituiu a chamada da nota (`ChamadaNotaLuneta`), o bloco das tags, o `Travado` do painel, as tags borradas dos
  cartões e o `BotaoConhecerLuneta`.
- **Janela da Luneta** (`UpgradeModal`) com o texto do recurso que a abriu (`planos/textos.ts`: "O simulador é da
  Luneta.", "Os filtros avançados são da Luneta."...), mais "Comparar os planos".
  - Agora usa a mesma pilha de diálogos do catálogo: aberta sobre o painel de filtros, o Esc fecha só ela, e o foco volta
    ao filtro.
- **Página do imóvel**, com as chamadas no mesmo lugar e o título da seção mantido (a navegação e as âncoras funcionam):
  - riscos (tags e selo);
  - a nota, embaixo do mapa e do endereço, que continuam;
  - o simulador, com o PDF;
  - o preço do m² na região, com os portais. Se a cidade tem ITBI, a chamada diz "A Luneta tem compras reais de
    <cidade>", e "De onde vêm os preços" continua.
  - O simulador vem por `next/dynamic` e só é desenhado na Luneta: o pedaço dele (~150 KB) não é baixado no Lente
    (conferido nos chunks).
  - Navegação das seções com o cadeado em Riscos, Simulador e Região.
  - Resumo da direita: "Simular" vira "Conhecer a Luneta"; linhas com o cadeado para riscos e nota.
  - Barra do celular: nos exemplos sem anúncio, "Conhecer a Luneta" no lugar de "Simular".
  - Continua tudo do Lente: dados da fonte, fotos, registro, glossário, mapa, parecidos e links.
- **`/relatorio` no Lente:** página travada simples ("Relatório do imóvel", a chamada do PDF, "Voltar ao imóvel"), sem
  simulação, região nem alertas. "Assinar Luneta" abre o relatório de verdade.
  - A simulação do relatório também vem por `next/dynamic` (`SimulacaoAdiada.tsx`) e não é baixada no Lente.
  - A impressão automática (`?imprimir=1`) espera a simulação ficar pronta.
- **Catálogo:**
  - no painel, cada filtro avançado aparece no lugar dele com o cadeado e abre a janela, sem filtrar;
  - Nota, Riscos e Selo têm a chamada compacta;
  - as seções inteiras da Luneta têm o cadeado na navegação e no título;
  - "Quartos" na barra do computador vira um botão com o cadeado;
  - em "Ordenar", as três ordens da Luneta aparecem com "LUNETA" (inclusive "Melhor localização", que antes sumia);
  - nos cartões e nas linhas, nada de selo, tags ou nota;
  - aviso do topo: "Você está vendo como Lente. Na Luneta: tags de risco e selos, filtros avançados, simulador de lance,
    preço da região, nota de localização e favoritos", com "Comparar os planos".
- **Link da Luneta aberto no Lente** (ex.: `?plano=lente&quartosMin=2&ordem=localizacao`):
  - a lista não usa o filtro, e a tela avisa "Este filtro é do plano Luneta: 2+ quartos. A lista abaixo mostra os imóveis
    sem esse filtro", e o mesmo para a ordem;
  - botões "Conhecer a Luneta" e "Tirar da busca";
  - a URL guarda o filtro: trocando para a Luneta, ele volta.

**Testes** (no `test:site`, 253 casos):
- `planos.test.ts`: `MINIMO`/`pode`/`travasDo`, o recurso de cada filtro, `filtrosDoPlano`/`filtrosForaDoPlano`, as
  ordens, `paraPlano`, `aplicarPlanoPagina` e o espelho em `filtros-rotulos`;
- `consulta.test.ts`: cada filtro avançado filtra na Luneta e não filtra no Lente, as ordens, e as facetas avançadas
  vazias no Lente;
- `url.test.ts`: um link da Luneta aberto no Lente (a URL guarda, a busca ignora);
- **`pagina.test.ts` (novo):** monta a `PaginaImovel` pelo mesmo caminho do servidor (`conjuntos.ts` + `pagina.ts`, que
  o `servidor.ts` chama) no Lente e na Luneta. Roda nos 6 exemplos e no instantâneo real (a casa de São Gonçalo e uma
  casa de São Paulo com ITBI).
  - Confere que o JSON do Lente não leva nenhum pedaço que só a Luneta tem: slugs e trechos das tags, o porquê do selo,
    componentes da nota, referências e ITBI, URLs dos portais.
  - Confere também que o que é do Lente continua igual.

**Conferido** (`next start` na porta 3315, Playwright):
- páginas: `/previa` (lista, painel de filtros, ordem, link com filtro avançado), a casa de São Gonçalo e uma casa de São
  Paulo com ITBI, `/relatorio`, `/assinante` e um exemplo, nos dois planos;
- larguras e temas: 360, 390, 768, 1024 e 1440 px, claro e escuro. São 160 estados, prints em
  `scratchpad/prints/r4-D1/`;
- sem rolagem lateral e sem erro no console (fora as fotos da Caixa, que a rede daqui não abre);
- no Lente, o simulador nunca é baixado;
- pelo `curl` do HTML e do RSC, nenhum dado da Luneta sai no Lente: nada de componentes da nota, ITBI, portais, tags,
  selo ou "Melhor localizado que";
- pela API, `plano=lente` com `quartosMin`, `comFoto`, `notaLocalMin` e `ordem=localizacao` devolve a mesma lista do
  filtro só por estado, sem as facetas avançadas;
- teclado: Enter abre a janela com o foco em "Assinar Luneta"; Esc fecha só ela e o foco volta a quem abriu;
  "Assinar Luneta" troca para a Luneta e põe o foco no título do simulador.

**Decisões suas (planos):**
- [x] **Busca por texto com quartos no Lente:** resolvido na revisão final (R4-VAZ-06): no Lente, a parte "2 quartos" da
  busca é ignorada no servidor e a tela avisa "Este filtro é do plano Luneta: 2 quartos (na busca)", com "Tirar da
  busca". Se preferir dar quartos ao Lente, é passar "quartos" para `FILTROS_PROMETIDOS.lente` e `FILTROS_LENTE`.
- [ ] **Recurso que nem a Luneta teria para o imóvel:** hoje a chamada aparece sempre. Por exemplo, a nota de um endereço
  localizado só na cidade, ou a região sem amostra; a chamada da nota diz que depende de o endereço ser localizado.
  - Proposta: o servidor diz "sem dado" e o Lente vê a mesma frase neutra da Luneta, sem convite.
  - Custo: ler a nota e o ITBI também no Lente (só para saber se existem).
- [ ] Na prévia não há login: a trava é demonstração (`?plano=lente`). Não anunciar "dados protegidos" antes do login.

**Falta (técnico):**
- [ ] Com login: o plano vem da sessão (`base/FASE1-SITE.md`, passo 5). As funções de `planos.ts` já recebem o plano.
- [ ] Ramos do Lente que ficaram sem uso (o aviso das dívidas no `Editores.tsx`, as linhas "plano Lente" do PDF): agora
  passam por `pode`. Voltam a valer se o `MINIMO` mudar (ex.: simulador no Lente e tags na Luneta).

### Rodada 4 · revisão final (18/10/2026)

Três revisores independentes (UX no navegador; vazamento de plano e coerência landing × produto; conteúdo e números da
nota) acharam 44 problemas. Cada um foi conferido (reproduzido no navegador, na API ou nos dados) antes de corrigir. Base:
o commit da trava dos planos (D1). Conferido com `next start` (porta 3330), Playwright, axe e o PDF A4; prints em
`scratchpad/prints/r4-final/`.

**O que mudou para quem usa:**
- **Folhas e janelas sem travar a tela no celular** (UX-01, alta). A trava de rolagem ia no `<html>`, e qualquer estilo no
  `<html>` recalcula a página inteira (os tokens de cor são variáveis no `:root`). Agora vai no `<body>` (a rolagem continua
  travada, por roda e por toque). Medido a 390 px com CPU 4×: "Filtros" de 1,33–1,54 s para 0,90 s (o estilo de 0,6–0,9 s
  para 0,23 s; o resto é desenhar o painel); as folhas do simulador de 632/360/360 ms para 320/128/120 ms. A ilustração por
  baixo da foto sai do DOM quando a foto aparece (~900 nós de SVG a menos por página).
- **A janela da Luneta cabe no celular deitado** (UX-02): altura máxima com rolagem própria, sem o anel em tela baixa
  (844×390: de −40/430 px para 25/365 px).
- **Página do imóvel no Lente sem parede de convites** (UX-03): só a primeira chamada (Riscos) é o cartão grande; a nota,
  o simulador e a região viram uma faixa curta ("Na Luneta: …" e "Ver na Luneta", em contorno), sem o título repetido. No
  celular, o dourado fica só para "Ver anúncio". 390 px: de 8 para 7,2 telas. A chamada do simulador numa venda direta ganhou
  o aviso de que a simulação não é recomendação (R4-VAZ-11).
- **"De onde vêm os preços" só com o que existe** (UX-07): as cidades com compras registradas e uma frase para a cidade do
  imóvel. Saíram da tela do cliente o FipeZAP, a "coleta pendente" e a LAI. A fonte de SP, Rio e POA diz "licença a confirmar
  com a prefeitura" (R4-VAZ-10).
- **O valor do ITBI com o nome certo** (R4-VAZ-04): "preço médio declarado" em SP e no Rio, "base de cálculo média do ITBI"
  em POA e Fortaleza, "avaliação média da prefeitura para o ITBI" no Recife (página, gráfico, frase e PDF); na landing e no
  FAQ, "o valor das compras registradas no ITBI".
- **Plano na URL:** `?plano=LENTE`, ` lente`, vazio ou desconhecido ficam no Lente (antes abriam a Luneta); só a ausência
  do parâmetro abre a Luneta da demonstração (R4-VAZ-07, `lerPlano` em `planos.ts`). O layout da página do imóvel só
  confere se o id existe, sem montar a página da Luneta (R4-VAZ-08).
- **Teclado e foco:** a aba focada na faixa das seções não fica mais embaixo da seta (UX-08); os campos do formulário da
  landing têm anel de foco de 2 px (UX-09).
- **CLS:** a galeria mantém a caixa quando as fotos da Caixa falham (imóvel 1440: CLS 0); a data do relatório reserva o
  lugar (0,006, era 0,011–0,025); a largura medida vai num cookie e o servidor acerta a vista da lista da 2ª página em diante
  (tablet de 7" com UA de computador: 0,53 na 1ª visita, 0 na 2ª) (UX-12, UX-13).

**Landing × produto (não vender o que ainda não existe):**
- Nova constante `src/lib/catalogo/produto.ts`: `PRODUTO.leituraDoEdital` e `PRODUTO.alertaPraca`, as duas em `false`.
  - Leitura do edital (R4-VAZ-01, alta): hoje as 86 mil tags vêm dos campos da lista da Caixa e de ausência (nenhuma do
    edital, da ficha ou do processo; "ocupação não informada" em 100% dos imóveis). Com `false`, a landing, "Por dentro", o
    FAQ, a chamada e a janela dizem o que a Luneta lê hoje (financiamento, direito de preferência, deságio, praça) e que
    ocupação, dívidas e matrícula entram com a leitura do edital. O teste `site.test.ts` só deixa ligar com pelo menos 10% das
    tags vindas de texto e menos da metade dos imóveis sem a ocupação.
  - Alerta de praça (R4-VAZ-09): saem a linha "Alerta por e-mail" da tabela, a pergunta do FAQ, o cartão do e-mail em
    "Primeira e segunda praça", "Favoritos e alerta de 2ª praça" em "Por dentro", o aviso ao favoritar e as menções na janela
    e no aviso do catálogo. Fica "favoritos".
- Tags e selos "desfocados" no Lente (UX-04, R4-VAZ-02, M14): escolhido o caminho (a) do revisor, o mais honesto para o
  comprador: a tabela marca "—" para o Lente, o cartão não diz mais "(aparecem desfocados)", "Por dentro" diz "Riscos e
  selos só na Luneta". A animação de "Por dentro" continua borrando as tags como metáfora do que a Lente não vê (ver
  decisões).
- Relatório "numa página A4" (R4-VAZ-03, M8): o PDF tem 6 a 7 folhas; agora "num relatório em folhas A4" (teste proíbe a frase).
- Nota "para cada imóvel" (R4-VAZ-05): "para cada imóvel com endereço localizado" (62,6% calculada, 20,7% aproximada).
- A busca da janela "Por dentro" dizia "leiloeiro" (o campo não vem da fonte): agora "Cidade, bairro, estado ou palavra".
- Filtros avançados com uma lista só (UX-10): `FILTROS_PROMETIDOS` mudou para `planos.ts`; a chamada e a janela citam 5
  ("área, quartos, vagas, praça, forma de pagamento e mais"); "natureza" saiu.
- Landing no celular (UX-05): a seção "Nota de localização" de 3.890 para 2.164 px a 360 px (as seis partes ficam só a partir
  do tablet; o exemplo já mostra as seis com o peso; o passo 03 virou uma frase; as duas notas, uma linha). Landing a 360 px:
  de 38 para 35,7 telas. "cabem R$ 39.778 de disputa" virou "sobram R$ 39.778 acima do lance mínimo".
- Link "Abrir a área do assinante" com 44 px de altura (UX-14); "política de privacidade [link]" no formulário (UX-15).

**A nota de localização (recalculada com `nota.py` em 18/10/2026):**
- **Pontos de ônibus do OSM** (M1, alta): além dos 10% do Censo, o morador típico precisa ter pelo menos 1 ponto mapeado a
  500 m. 265 → 141 cidades usam os pontos do OSM (as 5 capitais do ITBI continuam; a validação não mudou). Goiânia, São
  Gonçalo, Duque de Caxias e as outras 121 com o "comum" igual a 0 ficam com a estação e o ponto na quadra do Censo. 3.474
  notas mudaram (591 em 10 pontos ou mais, no máximo 26). Onde o OSM entra e o imóvel tem 0 pontos, a tela diz "nenhum no
  mapa aberto (pode estar incompleto)". Os textos dizem a regra real (saiu "razoavelmente completo").
- **Área de risco pela margem do ponto** (M2): no número e na rua, a procura vai até a incerteza do ponto (100 a 500 m),
  como no bairro. Alertas: 1.185 → 1.272 (86 na rua). Fora do número exato, o texto fala "do ponto da rua do endereço",
  nunca "o imóvel fica dentro".
- **Rua espalhada** (M3): 793 imóveis "bairro" eram, na verdade, o meio de uma rua achada com os endereços espalhados
  (coluna nova `rua_espalhada`). A tela diz "Rua espalhada: nota aproximada" e "o meio da rua do endereço", nunca "centro
  do bairro". O mapa diz "Posição aproximada: pelo bairro". Os 2 imóveis de Monte Mor com o setor do Censo em Hortolândia
  ficaram sem nota ("cidade").
- **Textos:** a faixa da aproximada é a do meio, "Nota provável entre 46 e 86 (faixa do meio)" (M4); cidade pequena com as
  três contagens no topo, no cartão e no PDF, "1 parte acima da maioria, 3 no meio e 2 abaixo" (M5); o porquê da cidade
  pequena é o critério que valeu (M6); o recálculo é "de tempos em tempos", com a data do último (M7); "Por que esses pesos"
  coerente com a conferência (M9); BH também publica o ITBI (M10); "quando falta um dado, o peso vai para as outras partes"
  (M11); a página do método diz "Nota para 17.679 dos 21.230 imóveis", "666 imóveis com ponto" e "em geral a menos de 100 m"
  (M12); o rótulo do ponto pela precisão, não pela situação (M13); cidade fora da base e rural: "não conferida" (M16); o PDF
  mostra todos os números de cada parte (M17); jargão trocado (casamento, acesso, empate, pesada, setor, natureza) e
  artigos da Serra, da Praia Grande e do Guarujá (M18); os 8 recortes da conferência, com a ressalva da área dos
  apartamentos de SP e Fortaleza, e sem "por definição" (M15).
- Contraste da barra dos pesos no escuro (UX-06): axe sem violações na página do método e na landing, nos dois temas.

**Não era problema ou ficou como está (e por quê):**
- `content-visibility` nos itens da lista (opcional da UX-01): não aplicado. Com a lista e os cards de alturas diferentes,
  o tamanho reservado (520 px) erra a altura antes de desenhar, e a volta para o mesmo imóvel ("voltar" e "Ver no mapa")
  pararia no lugar errado. O ganho principal (a trava no body) já veio.
- UX-03 "juntar simulador e região numa chamada só": ficaram duas faixas curtas, porque as seções têm âncora e navegação
  próprias (`#simulador`, `#regiao`).
- UX-12 na primeira visita: o servidor ainda não sabe a largura (sem dica do navegador). Desenhar as duas vistas pelo CSS
  seria refazer a lista; ficou o cookie.

**Decisões suas:**
- [ ] **Animação "Por dentro" no Lente:** ela ainda borra as tags dos exemplos (metáfora). Manter, ou trocar por cartões sem
  tags com o cadeado (mais fiel ao produto)?
- [ ] **Ligar `PRODUTO.leituraDoEdital`** quando as fichas da Caixa e a leitura do edital entrarem na base (o teste confere a
  proporção). ~~**Ligar `PRODUTO.alertaPraca`** quando houver login e envio de e-mail.~~ Ligado no marketing pelo dono
  na rodada 5 (23/10/2026); o envio depende do back-end (`PRODUTO.envioDeEmail`, "Back-end: favoritos e alerta de
  mudança de praça").
- [ ] **ITBI de SP, Rio e POA** aparece na Luneta (prévia e demonstração) com "licença a confirmar com a prefeitura".
  Confirmar as licenças (base/FONTES.md) ou segurar essas três cidades atrás da mesma decisão do total (`mostrarTotalItbi`).
- [ ] **"Atualizada todos os dias"** (hero, "Por dentro" e FAQ) é a promessa do lançamento; hoje a base é uma carga só.
- [ ] Selos na landing: a prévia mostra "selos desligados" (critérios pendentes); a landing os vende.

**Falta (técnico):**
- [ ] Os 2 imóveis de Monte Mor sem nota ainda aparecem no mapa no ponto de Hortolândia (o ponto vem do instantâneo):
  rebaixar no `geocodificar.py` (setor de outro município) e rodar `base:geocode` + `base:exportar -- --site`.
- [ ] Testar a trava no `<body>` no Safari do iPhone (a propagação do overflow é a mesma do `<html>`, mas não houve iPhone).
- [ ] Recálculo da nota encadeado na atualização da base (hoje manual; o texto diz isso).
- [ ] O relatório ainda cresce ~45 px quando a simulação adiada chega (CLS 0,006).

### Rodada 5 · landing (frente L): abertura automática, especialista, alerta de praça, 7 dias e a volta da demonstração (23/10/2026)

Pedidos do dono atendidos aqui: (1) a animação inicial roda sozinha, (2) "advogado" virou "especialista", (8) mais foco
nos favoritos com aviso de mudança de praça, (10) todo "ver na demonstração" vai direto à área certa e tem o botão de
voltar, (12) saiu "Suporte dedicado", (13) "Cancele grátis em até 7 dias" em destaque. O site antes desta rodada está
no branch `versao-site-v2`.

**(1) A abertura do hero roda sozinha** (`HeroMotion.tsx`):
- ao abrir ou recarregar a página no topo, a luneta chega ao alvo sozinha (~2,5 s), sem esperar a rolagem e sem travar
  a página (a trava de rolagem e a dica "Role para mirar" saíram);
- o GSAP é pedido assim que a página hidrata (antes era no ócio, à espera do gesto); a etapa 1 fica pelo menos 0,45 s na
  tela antes de a luneta se mover; aba aberta em segundo plano espera ficar visível;
- não roda (vai direto ao estado final) com menos movimento, sem JavaScript, na página aberta já rolada, na volta da
  demonstração e se o GSAP não chegar em 2,2 s; Esc pula; rolar até o hero quase sair da tela também;
- o número do cartão do Alvo conta com largura fixa (2 algarismos tabulares): sem deslocamento de layout.
- **Medido**: o LCP ficou igual (dentro da variação) e o CLS foi a 0; ver "Rodada 5 · landing: LCP, CLS e navegador".

**(2) Advogado → especialista, no site todo:** menu ("Falar com especialista", âncora `#especialista`), hero, seção
"Consultoria com especialista" ("Quero falar com um especialista"), formulário (assunto "Falar com um especialista"),
barra do celular ("Especialista"), tabela de planos ("Prioridade para falar com um especialista"), janela da Luneta,
FAQ ("Como falo com um especialista?"), descrição do site, avisos ("não substitui a avaliação de um especialista":
landing, rodapé, página do imóvel, relatório, "Por dentro"), textos das tags ("com um especialista"), PDF ("de
preferência, converse com um especialista") e "critérios dos selos em definição com o especialista parceiro". A linha
da OAB: "Quando o especialista for advogado, a publicidade segue as regras da OAB." Ficaram de propósito: os
comentários internos ("advogado parceiro") e, no simulador, o custo "a ação na Justiça (advogado e custas)", que é o
honorário da ação de despejo, não um contato. O teste varre `src/` e só aceita essas duas exceções.

**(8) Favoritos e aviso de mudança de praça:**
- `PRODUTO.alertaPraca` ligado (decisão do dono). Novo `PRODUTO.envioDeEmail` (hoje `false`): o marketing promete o
  alerta, a demonstração diz a verdade sobre o envio.
- Landing: a seção "Primeira e segunda praça" (`#pracas`) ganhou o e-mail de exemplo ("Seu favorito foi para a 2ª
  praça", com o novo lance mínimo e a data) e o bloco "Como funciona o alerta de praça" em 3 passos (marque o
  favorito → a Luneta confere a cada atualização → você recebe o e-mail com o novo lance mínimo e a data), com "Ver o
  favorito com aviso na demonstração" e "Confira sempre o edital".
- FAQ "Como recebo o aviso quando a praça muda?" (logo depois de "O que é primeira e segunda praça?"); na tabela de
  planos, "Alerta por e-mail quando a praça de um favorito muda: 2ª praça, nova data ou novo lance mínimo" (Luneta e
  Telescópio); no cartão, "Favoritos com alerta de praça"; "Por dentro" e a janela da Luneta falam do alerta.
- Demonstração (`FavoritoAlerta.tsx`): o coração favorita e abre a opção **"Avisar por e-mail quando a praça mudar"**
  (desligada: e-mail é consentimento), com a explicação e "Demonstração: a preferência fica só neste navegador; o envio
  de e-mails começa no lançamento". Nos favoritos, o coração abre a mesma janelinha com "Tirar dos favoritos". O sino
  aparece no coração com o aviso ligado. Nada é coletado: a preferência fica no `localStorage`
  (`luneta-alerta-praca`). O link da landing (`#alerta-praca`) já abre a opção na chegada.
- O que o back-end precisa fazer: seção "Back-end: favoritos e alerta de mudança de praça" logo abaixo.

**(10) "Ver na demonstração" vai direto, e "Voltar à apresentação" volta ao mesmo ponto** (`src/lib/apresentacao.ts`,
`SaidaDaApresentacao.tsx` na landing, `VoltarApresentacao.tsx` na demonstração e na página do método):
- os links da landing para a demonstração, todos com a área certa: "Ver este exemplo" (Decida) →
  `ex-alvo-sp#simulador` (o simulador com a conta); "Ver esta nota na demonstração" (Nota de localização, novo) →
  `ex-alvo-sp#localizacao`; "Ver um caso assim na demonstração" (cartão "Cuidado", novo) → `ex-semselo-rj#riscos` (−55%
  com três riscos graves); "Abrir na demonstração" sob cada cartão de Exemplos (novo) → a página do exemplo; "Ver o
  favorito com aviso" (Praças, novo) → `ex-namira-pr#alerta-praca`; e os que já iam à lista (`/assinante`: "Por
  dentro", Planos, menu, rodapé) e ao método da nota;
- na demonstração, o botão fixo e discreto "← Voltar à apresentação" (canto de baixo à esquerda; sobe sozinho acima da
  barra do lance e do "Ver no mapa" no celular) só aparece para quem veio da landing por um desses links (registro na
  `sessionStorage` da aba, vale 12 h); quem entra direto não vê;
- a volta: na primeira página depois da landing, `history.back()`; depois de navegar na demonstração, um link para "/"
  sem rolar; nos dois casos a landing devolve o link clicado ao mesmo lugar da tela (se a página mudou de altura, o link
  é que manda), ou a mesma rolagem quando o link era do menu fixo; o hero já vem pronto;
- a chegada com âncora confere a posição por até 3 s: no Chrome, quando a página do imóvel chegava aos pedaços (o
  esqueleto do carregamento encolhe a página), o navegador devolvia a rolagem antiga da landing e a página parava no
  simulador em vez de nos riscos (1 em ~4 idas);
- é um link de verdade: Tab, Enter, clique do meio (abre a landing do começo numa aba nova); some na impressão e no
  relatório em PDF.

**(12)** Saiu "Suporte dedicado" (a tabela e os cartões; o Telescópio fica com a base em planilha e vários usuários).

**(13) "Cancele grátis em até 7 dias":** selo (escudo com o visto) logo abaixo do "Ver planos" no hero (no celular, uma
linha sem moldura, e a lente cede o mesmo espaço), em pílula antes dos preços e sob o botão de cada um dos três planos,
sob "Começar agora" na chamada final, como segunda linha do "Ver planos" da barra do celular, na nota dos planos, em "Por dentro" e
na janela da Luneta. Prova social: "7 dias para cancelar grátis". FAQ "Posso cancelar quando quiser?" subiu para a 3ª
posição: "Nos primeiros 7 dias depois de assinar, o cancelamento é grátis: é o direito de arrependimento das compras pela
internet (Código de Defesa do Consumidor, art. 49). Depois desse prazo, você também pode cancelar quando quiser." O
`[7]` perdeu os colchetes em todo lugar; sem pagamento ainda, nada promete reembolso de outro jeito (o teste confere).

**Testes** (`npm run -s test:site`): `site.test.ts` ganhou 5 casos (nenhuma frase da tela com "advogado"; sem "Suporte
dedicado"; o selo e o FAQ dos 7 dias sem colchete nem promessa a mais; o alerta no marketing com a demonstração
honesta e esta seção no PENDENCIAS; os links da landing apontam para exemplos e seções que existem) e
`src/lib/apresentacao.test.ts` (3 casos: destinos, o registro e a conta da volta).

**Conferido no navegador** (`next start`, Playwright; prints em `scratchpad/prints/r5-L/`): ver "Rodada 5 · landing:
LCP, CLS e navegador".

**Decisões suas:**
- [ ] O selo do hero no celular é uma linha simples (a pílula com moldura não cabe sem cobrir a lente em telas de 360 a
  375 px de largura); no computador e no tablet, a pílula.
- [ ] "Falar com especialista": o especialista é advogado? Se for, a linha da OAB vale; se não, ela pode sair.
- [ ] O selo também sob "Assinar Luneta" de "Decida com números"? (hoje não: ficou nos botões que o pedido lista)

**Falta (técnico):**
- [ ] O back-end do alerta (seção abaixo) antes de tirar o "demonstração" do texto do favorito: com o envio de verdade,
  `PRODUTO.envioDeEmail = true` troca os textos sozinho.
- [ ] A volta da demonstração foi testada no Chromium (desktop e celular emulado). Conferir no Safari do iPhone (o
  `history.back()` e a `sessionStorage` com a aba restaurada do bfcache).

### Back-end: favoritos e alerta de mudança de praça (obrigatório antes do lançamento)

A landing promete, desde a rodada 5 (decisão do dono), que o assinante Luneta marca os favoritos e **recebe um e-mail
quando a praça muda** (2ª praça, nova data ou novo lance mínimo), "com o novo lance mínimo e a data". Hoje isso só
existe na demonstração, no navegador (`PRODUTO.envioDeEmail = false`). Antes de lançar (e antes de tirar o
"demonstração" do texto), o back-end precisa de:

1. **Contas e login** (FASE1-SITE, passo 5): o e-mail do assinante confirmado (link de confirmação), o plano da sessão
   (`planos.ts` já recebe o plano) e a exclusão da conta.
2. **Favoritos no servidor**: tabela `favorito (usuario_id, imovel_id, criado_em, avisar_por_email, avisado_em)`; a
   lista do navegador (`luneta-favoritos:*` e `luneta-alerta-praca`) é importada no primeiro login. Limite por conta (ex.:
   500), como hoje no navegador.
3. **Histórico de praça de cada imóvel, gravado por quem atualiza a base** (é isso que permite detectar a mudança):
   a cada coleta, para cada imóvel, guardar praça (1ª, 2ª, única), data e hora da praça, lance mínimo, status (ativo,
   vendido, retirado, suspenso) e a data da coleta, numa tabela `praca_historico` (ou eventos `praca_mudou`), sem
   apagar o anterior. A coleta da Caixa hoje sobrescreve o imóvel: precisa guardar o "antes".
4. **Comparação a cada atualização da base** (depois de cada coleta; agenda em "Atualização: como funciona"): para cada
   favorito com aviso ligado, comparar a última leitura com a anterior e gerar um evento quando mudar a praça (1ª → 2ª),
   a data ou a hora da praça, o lance mínimo, ou o status (vendido, retirado, suspenso: avisar e parar de acompanhar).
   Imóvel que sumiu da fonte = "retirado ou vendido, confira no site do leiloeiro", nunca "vendido" sem confirmação.
   Um evento por mudança (idempotente: a mesma mudança não gera dois e-mails se a coleta rodar de novo).
5. **Fila de e-mails** com provedor transacional (ex.: Amazon SES, Resend, Postmark; custo e escolha: decisão do
   dono): modelo "Seu favorito foi para a 2ª praça" com o imóvel, o novo lance mínimo, a data e o link da página;
   agrupar as mudanças do dia num e-mail só por pessoa; limite de envio por pessoa e por dia; novas tentativas com
   espera; registro do que foi enviado (`avisado_em`).
6. **LGPD e consentimento**: o aviso só com a opção ligada pela pessoa (nunca ligado por padrão), registro do
   consentimento (quando e o texto aceito), link de descadastro de um clique em todo e-mail (desliga o aviso daquele
   imóvel ou de todos), política de privacidade publicada antes, e e-mails só com o necessário (sem dados de terceiros:
   nada de nome de ocupante ou devedor, a máscara LGPD da base vale para o e-mail).
7. **Testes**: a comparação (mudou a praça, a data, o lance; vendido; sumiu; nada mudou), a idempotência, o agrupamento
   diário, o descadastro, o limite de envio e o texto (sem "risco zero", "confira o edital").
8. **Tela**: a lista "Meus favoritos" com a praça atual e o histórico de cada um ("1ª praça em 14/11 → 2ª praça em
   28/11, lance de R$ 400 mil para R$ 200 mil"); com o envio ligado, `PRODUTO.envioDeEmail = true` tira o
   "demonstração" do texto do favorito.

Quem atualiza a base (frente de dados): **gravar o histórico de praça (item 3) a partir da próxima coleta**, mesmo
antes do login existir; sem o histórico, a primeira comparação só começa depois de duas coletas.

### Rodada 5 · landing: LCP, CLS e navegador

**LCP e CLS da landing** (`next start` de `origin/main` e desta frente lado a lado, intercalados, 9 rodadas de cada;
celular 390 × 844 com a CPU 4× mais lenta; computador 1440 × 900; scripts `scratchpad/r5L/vitals-ab.mjs`):

| | Antes (main) | Depois (frente L) |
| --- | --- | --- |
| LCP no celular (mediana) | 364 ms | 372 ms |
| LCP no computador (mediana) | 228 ms | 232 ms |
| CLS (pior rodada, com a intro rodando) | 0,0006 (o número do Alvo contando) | 0 |

O LCP é o título do hero nos dois casos, pintado antes da hidratação; as diferenças ficam dentro da variação entre
rodadas (numa primeira série de 7, o "depois" saiu melhor: 380 × 384 ms e 272 × 288 ms). O GSAP é pedido depois da
primeira pintura (~0,9 s no celular lento), sem disputar com ela. O "antes" só mostra o CLS da intro quando ela é
disparada (tecla ↓), porque sozinha ela não rodava.

**Navegador** (`next start`, Playwright, Chromium; prints em `scratchpad/prints/r5-L/`):
- **Hero** (`hero/`): 360 × 640, 360 × 780, 375 × 667, 390 × 844, 768, 1024 e 1440, nos dois temas: a cena roda sozinha
  (1,5 s depois de abrir está no meio; aos 4 s, no fim, com o 48%), sem rolagem lateral nem erro no console. No celular,
  a folga entre o texto e a lente é a mesma de antes (3 a 5 px a 360, 23 px a 375, 19 px a 390); "Ver planos" e "Falar
  com especialista" na mesma linha de 360 px em diante. Com menos movimento, o estado final direto.
- **Seções** (`secoes/`): hero, cartão "Cuidado", exemplos, praças, Decida, nota, planos, especialista, prova social,
  FAQ (com a pergunta do cancelamento aberta), chamada final e a barra do celular; 360, 390, 768, 1024 e 1440, dois
  temas: sem rolagem lateral, sem erro, nenhum "advogado", nenhum "[7]", nenhum "Suporte dedicado".
- **Ida e volta** (`ida-e-volta/`; `scratchpad/r5L/ida-e-volta.mjs`): os 11 links da landing para a demonstração (10 no
  celular, sem o do menu do computador) em 360, 390, 768, 1024 e 1440: a seção certa no topo (abaixo das barras fixas),
  a opção do favorito aberta no `#alerta-praca`, o botão de voltar visível, e a volta no **mesmo ponto: diferença de 0 px**
  em todos (limite pedido: 20 px). Também: voltar depois de navegar na demonstração (lista → outro imóvel), pelo teclado
  (Enter no link, Enter no botão), e quem entra direto não vê o botão.
- **Favorito** (`favorito/`): na lista e na página do imóvel, 390 e 1440, dois temas: o coração abre a opção, a chave
  liga e desliga (fica em `luneta-alerta-praca`), Esc devolve o foco ao coração, "Tirar dos favoritos" tira os dois, e no
  Lente o coração continua com o cadeado e a janela da Luneta.
- **axe** (WCAG 2.2 AA), 390 e 1440, dois temas: sem violações no hero, praças, planos, especialista, chamada final,
  cartão "Cuidado" e nota da landing, nem no botão de voltar e na opção do favorito da demonstração.

### Rodada 5 · landing (frente F): "Ajuste o foco" com 150 imóveis fictícios (23/10/2026)

Pedido do dono (9): "deixe uma simulação com dados fictícios, porém com muito mais dados e muito mais responsiva, com
mais tipos de filtros, igual estava na prévia". A seção "Ajuste o foco. A lista responde na hora." deixou de filtrar os
6 exemplos e virou uma demonstração com **150 imóveis fictícios** e os filtros da prévia.

**Os dados** (`src/lib/demo-foco/dados.ts`; fictícios, sempre os mesmos, gerados no navegador a partir de uma semente):
- 31 cidades reais em 17 UFs, com bairros reais (São Paulo 20 imóveis, Rio 14, BH 9, Brasília 8…);
- preço = R$/m² típico da cidade (referência fictícia arredondada) × nível do bairro × tipo (casa 0,8; terreno, o m²
  do lote); deságio pela praça (1ª 5–30%, 2ª 35–60%, única 15–50%; ocupado +4 pontos); lance abaixo da avaliação;
- quartos e área conforme o tipo (comercial e terreno sem quartos), ocupação, financiamento (raro em terreno);
- nota de localização fictícia que acompanha o nível do bairro, e ~1 em 10 sem nota (sem endereço preciso, como na
  base);
- **metrô** só nas 7 capitais com metrô (SP, RJ, BH, DF, Recife, Salvador, Fortaleza), nos bairros que têm estação de
  verdade e só com endereço preciso: 37 imóveis a até 1 km. Porto Alegre ficou sem: o Trensurb é trem (a decisão (11)
  separa metrô, trem e VLT).
- Na tela: selo "Demonstração · 150 imóveis fictícios", a frase "Cidades e bairros reais; preços, praças, notas e
  distâncias inventados" e o total "de 150 imóveis fictícios".

**Os filtros** (`src/lib/demo-foco/busca.ts` + `src/components/sections/foco/`), com as mesmas peças da prévia (lista com
busca, chips com contagem, faixa com barrinhas, Qualquer/Sim/Não, folha):
- estado e cidade (vários), tipo (vários), preço, deságio e área (faixas com histograma, cursores, campos e atalhos),
  praça, quartos, ocupação, financiamento, nota de localização e "Metrô perto" (um toque);
- busca por texto sem acento ("tatuape 2 quartos": o "2" vai com "quartos", não com "2ª praça"); 5 ordens (Melhor
  localização com o selo); o total corre até o número novo; "Limpar"; × em cada botão; lista vazia sugere tirar o
  filtro que mais devolve imóveis;
- as contagens de cada opção valem com os outros filtros (tocar dá exatamente aquele número), como na prévia;
- **selo Luneta pela regra do produto** (`FILTROS_LENTE` em `planos.ts`): além dos quatro pedidos (ocupação,
  financiamento, nota e metrô), praça, quartos e área também são da Luneta no produto, então levam o selo (é o que já
  dizem o texto da seção e a tabela de planos). Na demonstração, todos funcionam;
- computador: botões rápidos com pop-up (como na prévia) e "Todos os filtros" (folha à direita); celular e tablet: os
  botões numa linha que rola de lado, cada um abre a folha na seção dele, com "Ver N imóveis" no rodapé;
- lista com animação (quem continua desliza, quem entra sobe; parada enquanto se arrasta um cursor; sem animação com
  "reduzir movimento"); no celular, 6 por vez com "Mostrar mais"; do tablet para cima, rola dentro do quadro;
- mapinha por estado: as bolhas crescem, encolhem e apagam; passar o mouse num imóvel acende o estado, passar numa bolha
  acende os imóveis dela, clicar filtra o estado (pelo teclado, o mesmo filtro está em "Estado").

**Carregamento**: o código e os dados só vêm quando a seção está a 1.200 px da tela (`IntersectionObserver` + `import()`,
sem o `next/dynamic`, cujo carregador custava 3,6 KB no JS inicial). Antes disso fica a **moldura**
(`foco/Moldura.tsx`, componente de servidor, já no HTML), feita com a mesma casca (`foco/Casca.tsx`): a troca muda
**0 px** de altura em 360, 390, 768, 1024, 1280 e 1440 (importa para o "Voltar à apresentação" e para os links #planos).
Sem o pedaço (rede caiu), a moldura fica, sem erro.

**Medido** (`next start` do 3736c2e e desta frente, intercalados, 7 rodadas; scripts em `scratchpad/r5F/`):

| | Antes (3736c2e) | Depois (frente F) |
| --- | --- | --- |
| JS inicial da landing (scripts do HTML, gzip) | 218,0 KB | 217,0 KB |
| JS baixado ao abrir (rede) | 206,5 KB | 205,4 KB |
| JS que chega perto da seção (4 pedaços) | 0 (estava no inicial) | ~42 KB |
| HTML de / (gzip) | 79,4 KB | 82,4 KB (a moldura vai pronta no HTML) |
| LCP no celular, CPU 4× (mediana) | 356 ms | 340 ms |
| LCP no computador (mediana) | 256 ms | 216 ms |
| CLS rolando do topo até depois da seção | 0 | 0 |

O LCP é o hero nos dois casos; as diferenças ficam dentro da variação. Filtrar, ordenar e contar os 150 leva menos de
1 ms (teste).

**Testes**: `src/lib/demo-foco/dados.test.ts` (determinismo, preço pelo m² da cidade e do bairro, deságio pela praça,
quartos e área pelo tipo, metrô só onde há, nota, escalas das faixas, distância entre as bolhas do mapinha) e
`busca.test.ts` (cada filtro, combinações, contagens com os outros filtros, histogramas, ordens, estado tira as cidades
de fora, sugestão da lista vazia, resumos dos botões, selo Luneta, velocidade). `npm run test:site`: 292 testes passando.

**Navegador** (Playwright; prints em `scratchpad/prints/r5-F/`): 360, 390, 768, 1024 e 1440 nos dois temas, a moldura
(390 escuro, 1440 claro) e as interações (`interacao/`): pop-up de preço (tocar numa barrinha filtra; Esc fecha e volta
o foco ao botão), × limpa, metrô (37), bolha de SP no mapa, hover na lista acende o estado, ordem por nota, lista vazia
com sugestão, folha "Todos os filtros", teclado (Tab até "Estado", Enter abre com o foco na busca, "bahia" + Enter
filtra), celular (6 linhas, "Mostrar mais", o botão "Deságio" abre a folha na seção, "≥ 40%", "Ver 79 imóveis" igual
ao total da lista), sem rolagem lateral e sem erro no console. **axe** (WCAG 2.2 AA), 390 e 1440, dois temas: sem
violações (quadro inicial, com metrô, pop-up e folha).

**Pendências desta frente**:
- **Metrô**: o botão "Metrô perto" da demonstração vale o filtro "Metrô a até 1 km" que a frente do metrô (decisão
  (11)) põe nos filtros avançados do produto. Quando ele entrar, pôr o filtro em `FILTROS_PROMETIDOS` (`planos.ts`) e
  trocar `metro: null` em `FILTRO_DO_CATALOGO` (`src/lib/demo-foco/busca.ts`) pela chave do catálogo; se ele não entrar,
  tirar o botão da demonstração (`RAPIDOS_LUNETA` em `foco/FocoDemo.tsx` e o "Metrô perto" de `foco/Moldura.tsx`).
- Os R$/m² das cidades em `dados.ts` são referências fictícias arredondadas: não usar como dado.
- O mapinha é por estado, não por cidade (com 150 imóveis, cidades vizinhas como São Paulo e Campinas se encostariam);
  o mapa de verdade (MapLibre, com ruas e zoom) é o da prévia e da área do assinante.
- Técnico: o `next build` deste ambiente para na primeira vez com o aviso "Your version of Next.js is affected by a
  known security vulnerability" (Next 16.4.0) e passa ao repetir. Vale avaliar a atualização do Next (`next upgrade`)
  antes do lançamento; não foi feita aqui.

### Rodada 5 · demonstração (frente V): vitrine com 10 imóveis reais e fotos nos exemplos (24/10/2026)

Pedidos do dono: (3) "Todos os pontos sem foto: adicione as melhores fotos que temos. Uma por caso." e (4) "No 'Abrir
demonstração completa' pode sempre mostrar parte dos uns 10 imóveis (os melhores) da base real e deixe claro que para
mostrar mais só assinando."

**A vitrine (`/assinante`)**. O servidor escolhe os **10 melhores imóveis reais** da base a cada carga do instantâneo (e
de novo a cada dia), por um critério objetivo em `src/lib/catalogo/vitrine.ts` (testado em `vitrine.test.ts`):
1. **Regras** (todas valem):
   - deságio de 35% a 75% (alto, sem o desconto extremo que costuma ser erro da fonte);
   - avaliação coerente: R$/m² da avaliação até 1,8 vez a mediana do mesmo tipo na cidade (ou no estado);
   - lance de R$ 40 mil a R$ 3 milhões e, em casa e apartamento, de R$ 500 a R$ 25 mil por m²;
   - nota de localização de 70 para cima, com o endereço achado no número ou na rua;
   - cidade com 300 mil moradores ou mais (IBGE);
   - com foto, fora das fotos olhadas e recusadas (`src/lib/catalogo/vitrine-fotos.ts`);
   - sem tag grave, nem em revisão;
   - preço claro (venda direta, venda online, licitação ou leilão com a praça informada);
   - praça ainda não passada, quando a fonte dá a data; área informada.
2. **Pontuação** = deságio + nota ÷ 2 + 3 se o endereço foi achado no número (desempate: mais dados, depois o id).
3. **Variedade**: no máximo 2 por estado, 1 por cidade, 4 apartamentos, 4 casas e 1 de cada outro tipo.
4. Se faltar imóvel, as vagas que sobram usam regras afrouxadas em duas etapas (cada escolhido guarda a etapa e o
   motivo). Hoje os 10 passam nas regras estritas (643 dos 21.229 passam; o teste com o instantâneo confere).

**Os 10 de hoje** (instantâneo da lista da Caixa de 08/10; todos venda direta ou venda online, praça única, "Ocupação
não informada", sem tag grave):

| # | Imóvel | Deságio | Nota | Endereço | Pontos | A foto (a do próprio imóvel, vista no Actions) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Casa 1 quarto · Mutondo, São Gonçalo/RJ (R$ 58.764) | 70% | 98 | número | 122 | fachada com portão, nítida |
| 2 | Apartamento 2 quartos · Areia Branca, Belford Roxo/RJ (R$ 64.001) | 63% | 89 | número | 110,5 | condomínio de torres |
| 3 | Casa 3 quartos · Nazaré, Salvador/BA (R$ 81.070) | 56% | 100 | número | 109 | a viela com plantas |
| 4 | Apartamento 2 quartos · Rua Nova, Feira de Santana/BA (R$ 52.217) | 62% | 94 | rua | 109 | entrada do condomínio |
| 5 | Apartamento 1 quarto · Jardim Atlântico, Olinda/PE (R$ 45.065) | 60% | 91 | número | 108,5 | prédio de 4 andares |
| 6 | Apartamento 4 quartos, 506 m² · Vila Bom Jesus, São José do Rio Preto/SP (R$ 1,02 mi) | 59% | 98 | rua | 108 | a torre, de baixo |
| 7 | Loja 545 m² · Floresta, Porto Alegre/RS (R$ 755.609) | 50% | 98 | número | 102 | fachada com portas de garagem |
| 8 | Casa 109,73 m² · Centro, Pelotas/RS (R$ 200.999) | 46% | 91 | número | 94,5 | fileira de casas antigas |
| 9 | Casa 258 m² · Mooca, São Paulo/SP (R$ 934.217) | 45% | 92 | número | 94 | o sobrado (foto pequena, 252 px) |
| 10 | Terreno 454,88 m² · Amambai, Campo Grande/MS (R$ 681.926) | 36% | 95 | número | 86,5 | muro e portão, de madrugada |

Variedade: RJ, BA, SP e RS com 2; PE e MS com 1; 4 apartamentos, 4 casas, 1 loja, 1 terreno. A casa de São João de
Meriti (69%, era a 2ª) saiu porque uma van cobre a fachada na foto; entraram o apartamento de Belford Roxo e a casa da
Mooca. O terreno de Campo Grande ficou: os outros terrenos que passam nas regras estritas têm foto pior (preto e branco,
entulho); sem ele, a 10ª vaga iria para as regras afrouxadas.

**Na tela**:
- topo da lista: "**Você está vendo 10 de 21.229 imóveis reais da base.** Para ver todos, com filtros, mapa e alertas,
  assine.", o botão "Ver os planos", o "Cancele grátis em até 7 dias" e, no clique, "Como escolhemos estes 10";
- com filtro ou busca (valem só dentro dos 10): "Com estes filtros: 2 dos 10 aqui e 2.841 imóveis na base completa.";
- fim da lista: o mesmo convite, maior; página de cada imóvel real: faixa "imóvel real da vitrine", o aviso no topo e
  no rodapé, e os parecidos só os da vitrine, com "Na base completa há pelo menos 6 imóveis parecidos com este, fora
  da vitrine";
- a troca Lente/Luneta continua: no Lente, sem tags, nota e simulador; no Luneta, tags em revisão, nota e o simulador
  com os dados da base inteira (região, ITBI). Selos: desligados nos reais (critérios pendentes), como na prévia;
- o "Como a nota é calculada" de um imóvel da vitrine volta para a demonstração (`?c=assinante`);
- sem a base (instantâneo faltando), a `/assinante` volta a mostrar só os 6 exemplos, como antes.

**Os 6 exemplos fictícios** ficam num bloco à parte, abaixo do convite: "**Exemplos fictícios (para ver os selos)**",
fora dos filtros, da contagem e do mapa, com as mesmas páginas `/assinante/imovel/ex-*` (os links da landing e o "Voltar
à apresentação" continuam iguais). Escolhi o bloco, e não só um link, porque os selos só aparecem neles e quem chega
pela landing reconhece os cartões; no celular é uma fila que rola de lado (empilhados, os 6 alongavam a página em
~3.500 px).

**Fotos (decisão 3)**. Todo cartão que aparecia sem foto ganhou uma:
- os 6 fictícios (os 4 cartões da landing, os 3 do "Por dentro", o cartão do Alvo no hero, a demonstração, a página e o
  PDF de cada um) usam a foto de um **imóvel real compatível** da base, sempre com o rótulo **"Foto ilustrativa"**
  ("Exemplo fictício · foto ilustrativa" no cartão da landing; "Foto ilustrativa · de um imóvel real parecido, de outro
  endereço" na galeria). O endereço do imóvel real nunca aparece (teste);

  | Exemplo | Foto de (imóvel real, mesmo tipo e UF, sem tag grave) | O que mostra |
  | --- | --- | --- |
  | Alvo · Apto 3 quartos, Vila Mariana, São Paulo/SP | `caixa-1444423428333`, apto 3 quartos, São Paulo/SP | prédio com sacadas e árvores |
  | Na Mira · Casa 2 quartos, Água Verde, Curitiba/PR | `caixa-8444429616989`, casa 2 quartos, Fazenda Rio Grande/PR | fachada com garagem (a única de 35 casas do PR olhadas sem data, coordenadas ou rua gravadas na foto) |
  | Promissor · Apto 2 quartos, Pituba, Salvador/BA | `caixa-1444404514777`, apto 3 quartos, Salvador/BA | prédios de 4 andares numa rua |
  | Sem selo · Sala comercial, Centro, Rio/RJ | `caixa-0000010139772`, sala comercial, Centro, Rio/RJ | prédios altos do Centro (o prédio inteiro, nunca a unidade) |
  | Na Mira · Apto 1 quarto, Savassi, BH/MG | `caixa-1787702387750`, apto 2 quartos, Belo Horizonte/MG | duas torres residenciais |
  | Sem selo · Terreno, Setor Bueno, Goiânia/GO | `caixa-1444417582466`, terreno, Águas Lindas de Goiás/GO | terreno plano em rua asfaltada, com recorte (zoom de 1,3 a partir do canto esquerdo de baixo) que tira a marca de data e coordenadas |

- compatibilidade: a Caixa não informa a ocupação de nenhum imóvel ("não informada"), então nenhum real contradiz o
  exemplo; no exemplo "ocupado" (sala no Rio), a foto é a fachada do prédio inteiro;
- os casos reais usam a foto deles (a vitrine e a prévia);
- o `AuctionCard` da landing trocou o `next/image` por `<img>` de 84 px (64 no compacto) com largura e altura fixas (sem
  CLS), `loading="lazy"`, `referrerPolicy="no-referrer"` e o desenho listrado por baixo, que fica se a foto falhar;
- o cartão do Alvo no hero leva a mesma foto, preguiçosa e de baixa prioridade (o LCP continua o título);
- o mapa não usa a foto ilustrativa na miniatura (não caberia o rótulo);
- ficaram sem foto, de propósito: as 150 linhas do "Ajuste o foco" (linha com o ícone do tipo, sem moldura de foto;
  seriam 150 pedidos à Caixa) e as miniaturas do "Decida com números" e da "Nota de localização" (não têm moldura de
  foto).

**Escolha das fotos no Actions** (`scripts/prints/actions.mjs`, roteiro `fotos` → `scripts/prints/fotos.mjs`): baixa as
candidatas de `scripts/prints/fotos-candidatas.json` (um pedido por vez, 1,2 s de pausa, User-Agent que diz quem somos;
para depois de 5 bloqueios seguidos, sem contornar anti-robô), reduz a 320 px com o sharp e monta folhas de contato em
`coletas-dados/prints/<execução>/`. **A Caixa não bloqueou**: execuções 40042341202 (114 candidatas: a vitrine, a fila
e as fotos para cada exemplo), 40042911905 (88) e 40098277361 (40, a fila da vitrine); 242 pedidos, 234 fotos, 8 com
404. As fotos ruins para a vitrine ficaram em `vitrine-fotos.ts` (40: página de documento, mapa de satélite, colagem do
laudo, 404, van na frente, entulho ou lixo em primeiro plano, preto e branco, tremida). O roteiro `fotos-site` (`scripts/prints/fotos-site.mjs`) tira os prints
com as fotos de verdade: execução 40098702645, `/assinante`, um imóvel real, `ex-alvo-sp` e a landing em 360, 390,
768, 1024 e 1440, nos dois temas. **Todas as fotos da Caixa abriram** no navegador (16 de 16 na `/assinante`, 2 de 2
em cada página de imóvel, 14 de 14 na landing a partir de 1024 px; abaixo disso, o 3º cartão do "Por dentro" fica
escondido e a foto dele, preguiçosa, nem é pedida).

**Navegador** (Playwright local, `next start`; daqui a Caixa não abre, então as fotos vieram das miniaturas baixadas no
Actions; prints em `scratchpad/prints/r5-V/`, com as do Actions em `acoes-fotos-reais/` e as folhas de contato em
`folhas-de-contato/`): `/assinante` (topo, fim da lista, exemplos, filtro SP com "Como escolhemos" aberto, Lente, sem
fotos), imóvel real, `ex-alvo-sp`, `ex-semselo-go` e a landing (hero e exemplos), em 360, 390, 768, 1024 e 1440, nos
dois temas: sem rolagem lateral e sem erro no console. **axe** (WCAG 2.2 AA) sem violações na `/assinante` (Luneta,
Lente e com filtro), no imóvel real, no exemplo e nos cartões da landing, em 390 e 1440, nos dois temas. O "Abrir na
demonstração" de um cartão da landing cai em `ex-namira-pr`, e o "Voltar à apresentação" volta ao mesmo ponto (0 px de
diferença, em 390 e 1440).

**Testes**: `vitrine.test.ts` (cada regra, pontuação, variedade, etapas, contagem dos ativos, textos sem "vendendo",
fotos ilustrativas, e o instantâneo real: 10 no critério estrito, filtros só dentro deles, página de um real e de um
fictício, Lente sem nada da Luneta), `exemplos.test.ts` e `src/components/fotos-ilustrativas.test.ts` (renderiza no
Node o cartão da landing, o hero, o cartão e a galeria da demonstração: a foto ilustrativa sempre com o rótulo, `<img>`
simples de tamanho fixo, e o endereço do real fora).

**Pendências desta frente**:
- **Fotos da vitrine a cada atualização da base**: a escolha se refaz sozinha, mas a olhada nas fotos não. Imóvel novo
  entra com a foto que tiver. Depois de cada atualização: `node --import jiti/register scripts/prints/gerar-candidatas.ts`
  (a vitrine e a fila dela), push num `acoes-*`, `gh workflow run site-prints.yml --ref <branch> -f roteiro=fotos`,
  olhar as folhas e anotar as ruins em `vitrine-fotos.ts`.
- **Imóvel vendido continua na vitrine** enquanto a base não se atualiza sozinha (a lista da Caixa é de 08/10): o
  mesmo problema da prévia (ver "Atualização: como funciona").
- **Fotos ilustrativas**: confirmar com o especialista que usar a foto pública de um imóvel da Caixa, rotulada e sem o
  endereço, para ilustrar um exemplo fictício está ok (a foto fica na Caixa; o site não a copia). Se a Caixa tirar a
  foto do ar, o cartão volta ao desenho listrado; trocar a foto em `src/content/examples.ts` (`photoIlustrativa`).
- **"Ajuste o foco"** continua sem foto nas linhas (decisão acima); se o dono quiser, dá para pôr a foto ilustrativa
  por tipo e cidade, ao custo de ~30 fotos da Caixa carregadas na landing.
- ~~Técnico (integração): a frente do mapa também criou `scripts/prints/actions.mjs`~~ **Feito na integração
  (24/10/2026):** o `actions.mjs` é o do mapa (roteiros `mapa`, `tudo`, `desempenho`, `revisao`) e desvia `fotos`,
  `fotos:<sub>` e `fotos-site` para `fotos.mjs` e `fotos-site.mjs` antes de abrir o navegador.

### Rodada 5 · simulador e metrô (frente S): lucro com o lance primeiro, conta limpa e a tag "Metrô a 450 m" (24/10/2026)

Pedidos do dono: (6) "No cenário e prazos, quero que a versão 'Lucro com o meu lance' seja a principal. Se quiser, muda
para a outra."; (7) "No 'A conta linha a linha', quero que a parte de alterar a conta linha a linha seja escondida; se eu
clico, ela abre."; (11) "Para cidade grande, quero que metrô perto seja uma flag (< 1 km). Dá para fazer?"

**(6) "Cenários e prazos" abre em "Lucro com o meu lance".**
- A opção vem primeiro no seletor e é o padrão (`VISAO_PADRAO` em `src/lib/simulador/completa.ts`). "Lance máximo para
  a meta" fica a um toque.
- **Quem já escolheu mantém a escolha**: o estado salvo (`luneta:simulador:v2:<id>`) guarda `visao: null` enquanto a
  pessoa não toca no seletor, então dá para distinguir. Quem nunca escolheu (ou tem só ajustes) passa a ver o lucro;
  quem escolheu o lance máximo continua nele.
- O PDF segue a mesma vista: a tabela da tela vem primeiro e a outra depois.
- Venda direta sem mudança: "Vale a pena comprar por R$ X?", a tabela abre no "Lucro pelo preço" e a outra vista é a
  margem para imprevistos.
- O "Como usar" explica as duas visões na ordem nova, a legenda das cores é a da visão aberta (com uma linha sobre a
  outra) e o exemplo começa pelo lucro com o lance.

**(7) "A conta, linha a linha" abre limpa.**
- Os lápis, o "+ Adicionar custo", a lista "Fora da conta" (com o "Religar") e o "Restaurar tudo" ficam atrás de um
  botão discreto ao lado do título, **"Editar a conta"**.
- Aberta, tudo funciona como antes (os pop-ups por tipo de despesa) e o botão vira "Concluir".
- **Com ajustes salvos**, o botão diz **"Conta ajustada · ver ajustes"**, com um ponto de latão. As linhas ajustadas
  mantêm o selo "ajustado" mesmo fechada. Custo tirado da conta aparece numa linha discreta ("1 custo fora da conta:
  registro").
- Teclado e leitor de tela: é o mesmo botão nos três estados (`aria-expanded`, `aria-controls`), então o foco fica nele
  ao abrir e ao fechar. O lápis abre o pop-up, e o Esc devolve o foco ao lápis.
- Celular: as abas Tabela / Conta / Gráfico e as folhas dos pop-ups continuam iguais. A conta fica aberta enquanto a
  pessoa estiver na página.
- O "Restaurar tudo" saiu do cabeçalho do Detalhe e foi para dentro da edição da conta.

**(11) Metrô perto: a tag "Metrô a 450 m" (e "Trem a…", "VLT a…").**
- **Dados**: `base/fontes/localizacao/osm.py` separa a antiga categoria `trilho` em `metro`, `trem`, `vlt` e
  `monotrilho`, pelas tags subway, train, light_rail, tram, monorail e station=*.
  - O arquivo do OSM ganhou o nome e a rede de cada estação.
  - Estação de dois modos sai nas duas categorias.
  - Etapa `osm` rodada de novo no Actions (execuções 40099760538 e 40100163122, branch `coleta-localizacao`, OSM de
    23/10/2026): 970 pontos de metrô, 788 de trem, 376 de VLT e 45 de monotrilho, em `coletas-dados/localizacao/40100163122/`.
- **Cálculo**: `base/fontes/localizacao/estacoes.py`.
  - Calcula, para cada imóvel com endereço no número ou na rua, a distância em linha reta até a estação mais perto de
    metrô, de trem e de VLT, com o nome da estação.
  - Grava as colunas `metro_m`, `trem_m`, `vlt_m`, `<modo>_nome` e `metro_mono` no `localizacao-osm.json.gz` (ODbL).
  - **A nota não mudou**: só as colunas novas entraram, o resto do arquivo ficou igual.
  - A etapa `nota` do Actions já chama o `estacoes.py` depois do `nota.py`.
- **Só estação de passageiros de transporte urbano**: o OSM marca como estação muita parada antiga do interior, linha
  de carga, trem turístico, bonde e funicular. Para a tag:
  - saem os nomes com "antiga", "desativada", "turística", "bonde", "funicular", "plano inclinado" etc.;
  - sai a linha Teresina–Parnaíba, marcada ao mesmo tempo como metrô, trem e VLT em cada estação;
  - sai o acesso de metrô "órfão", longe de qualquer estação (havia um no Méier, a 2,6 km do metrô mais perto);
  - trem e VLT só contam de rede urbana conhecida (CPTM, ViaMobilidade, TIC Trens, SuperVia, Trensurb, CBTU,
    Metrofor, VLT, EMTU...) e das estações vizinhas dela;
  - o monotrilho só conta o do Metrô de São Paulo (vira "Metrô a…", com a frase "estação de monotrilho"); o de
    santuário e o de parque ficam fora.

  Conferi à mão, cidade por cidade, as estações que dão tag: nomes de estações da SuperVia, da CPTM, dos metrôs e dos
  VLTs.
- **Quantos ganham a tag** (detalhe por cidade em `base/saida/localizacao/medicao-nota.md`, seção "Estação de metrô,
  trem e VLT perto"):

  | Tag (abaixo de 1 km) | Imóveis | % dos 13.692 com número ou rua |
  | --- | --- | --- |
  | Metrô | 369 | 2,7% |
  | Trem | 604 | 4,4% |
  | VLT | 46 | 0,3% |
  | Pelo menos uma | 907 | 6,6% |

  Rio de Janeiro: 543 (144 metrô, 473 trem). São Paulo: 132. Jaboatão: 41. Salvador: 23. Camaragibe: 21. Nilópolis: 17.
  Fortaleza: 13. Canoas, São Vicente, São Leopoldo e Brasília: 10 a 11.
- **No site** (`src/lib/catalogo/estacoes.ts`):
  - a tag é calculada no servidor ao montar o resumo e o detalhe (`conjuntos.ts`). É positiva e confirmada, vem antes
    das outras positivas no cartão e é do plano Luneta: no Lente sai com as outras tags;
  - na página, a tag tem a evidência ("Estação de metrô Carioca / Centro a 150 m, em linha reta do ponto do endereço
    (no número). Fonte: OpenStreetMap...") e a confiança: alta no número, média na rua;
  - a explicação está em `src/content/tags.ts` (`TAGS_LOCALIZACAO`), fora das 8 categorias da landing;
  - a faceta de tags usa o rótulo fixo "Metrô a até 1 km";
  - **filtro avançado "Metrô a até 1 km"** (Luneta), com a contagem. Fica na seção **"Entorno"** do painel de filtros,
    que antes se chamava "Nota de localização" e agora tem a nota e o metrô. URL `metro=1`, pílula, consulta no
    servidor. No Lente aparece com o cadeado e é ignorado;
  - na seção de localização da página do imóvel, o cartão do endereço diz "Estação de metrô Carioca / Centro a 150 m"
    (sem nome, se o OSM não trouxer), em linha reta e com a atribuição do OSM. O PDF tem a mesma frase, em
    "Transporte sobre trilhos perto";
  - nas fontes da nota, o OSM cita as duas datas: a da nota (17/10) e a das estações (23/10).

**Navegador** (`next start`, Playwright, prints em `scratchpad/prints/r5-S/`). Larguras 360, 390, 768, 1024 e 1440, nos
dois temas: 218 conferências, sem erro (o script está em `scratchpad/r5s-prints.mjs`).
- **Simulador**: abre no lucro; quem tinha escolhido o lance máximo continua nele; a conta fechada não tem lápis nem
  "Adicionar custo". Enter no "Editar a conta" abre e o foco fica no botão. O lápis abre o pop-up, e o Esc volta ao
  lápis. "Conta ajustada · ver ajustes" aparece com ajustes salvos. No celular, a aba Conta.
- **Metrô**: a tag e a explicação no imóvel, a frase na localização, o filtro na URL, a pílula e o chip marcado no
  painel. O Lente fica sem a estação e sem a tag, e o filtro aparece com o cadeado.
- **PDF**: a tabela da vista escolhida vem primeiro, e a localização diz a estação.
- Sem rolagem lateral.

**Testes**: `src/lib/catalogo/estacoes.test.ts` (textos, leitura das colunas, conferência do arquivo, filtro com
contagem, Lente, URL e pílula, dados reais), um caso real em `pagina.test.ts` (a tag com a evidência na Luneta, nada no
Lente), a visão padrão em `simulador-v2.test.ts` e as regras do `estacoes.py` e do `osm.py` no `testar.py`.

**Pendências desta frente**:
- **Decisões do dono** (o que escolhi):
  - monotrilho do Metrô de SP conta como metrô;
  - o bonde de Santa Teresa e os trens de longa distância (Vitória a Minas, Carajás) não contam;
  - a tag vale com endereço na rua (o ponto é o meio da rua: confiança média), não só no número;
  - Trensurb (Porto Alegre) aparece como metrô, porque o OSM a marca assim.
- **Atualização**: a cada etapa `osm` + `nota` do Actions a tag se refaz sozinha. Fora dela, depois de uma etapa `osm`
  nova: `estacoes.py --osm osm-pois.csv.gz` (2 s) e commitar o `localizacao-osm.json.gz` e o `medicao-nota.md`.
  Estação nova (uma linha que abre) entra quando o OSM a marcar; se a rede dela não estiver em `REDES_PASSAGEIROS`
  nem perto de uma que esteja, acrescentar lá.
- **Nota de localização**: o transporte da nota ainda usa a categoria inteira de 17/10, com as estações antigas do
  interior, como na rodada 4. No próximo recálculo da nota, vale usar as mesmas regras da tag. Isso muda a nota de
  algumas cidades pequenas, por isso não fiz agora.
- A página pública "Como a nota é calculada" (`/metodologia/localizacao`) ainda não fala da tag de metrô. Dá para pôr
  um parágrafo quando o dono aprovar as regras acima.
- O Next avisou no `next build` que a versão 16.4.0 tem uma vulnerabilidade conhecida e recomendou atualizar. Não
  mexi: fica para uma frente própria.

### Rodada 5 · mapa de verdade (23/10/2026)

Pedido (ponto 14): "um carinho maior com o mapa": filtrar os casos conforme o zoom, mostrar o nome da rua de perto,
estado da arte, responsivo e rápido. Feito com **MapLibre GL JS 6.15.0** (código aberto, BSD) e os ladrilhos vetoriais
do **OpenFreeMap** (grátis, sem chave). `package.json` e `package-lock.json` ganharam `maplibre-gl`.

**O que mudou para quem usa:**
- **Vista "Mapa" no catálogo** (/previa e /assinante, Lente e Luneta), ao lado de Lista e Cards (`?vista=mapa`). Fundo
  claro e escuro nas cores do site, nomes em português; trocar o tema não mexe na câmera nem recarrega os imóveis.
- **De longe, agrupamentos** com a contagem ("1,4 mil") e a cor do deságio médio (legenda embaixo); **de perto (zoom 14+),
  cada endereço com o lance num balão** ("R$ 43 mil", ou "3 imóveis" no mesmo prédio). Nomes das avenidas a partir do
  zoom 13, das ruas a partir do 14,5, número das casas a partir do 17,5; estações de trem e metrô a partir do 13; os demais
  pontos de interesse, discretos, a partir do 16. Os nomes de cidade do fundo desviam das bolhas (não ficam cortados).
- **"Buscar ao mover o mapa"** (ligado por padrão): depois que a pessoa mexe no mapa (arrastar, pinça, roda, teclado ou
  os botões), a lista ao lado mostra só os imóveis da área visível (filtro `bbox` na URL, aplicado no servidor, nos dois
  planos). Ao abrir o mapa ou trocar de lugar na busca, a lista é a busca inteira (o enquadramento automático não vira
  área). Desligado: "Buscar nesta área" e "Ver a busca inteira (N)". O centro e o zoom vão na URL
  (`centro=lat,lon&zoom=`): o link e o "voltar" reabrem o mesmo lugar, com a mesma área.
- **Cartão do lugar:** ao passar o mouse (foto, lance, deságio, bairro, link) e preso ao clicar ou tocar. O mouse num
  cartão da lista acende o ponto no mapa, e o lugar no mapa acende os cartões da lista.
- **Precisão do endereço, nunca um alfinete falso:** no número ou na rua, o ponto (na rua, aberto no cartão ou na página
  do imóvel, com a área de incerteza em volta); **só o bairro**, um círculo de pelo menos 300 m ("em algum ponto do
  círculo"), que some de perto e deixa o rótulo "N imóveis no bairro"; **só a cidade**, o marcador "sem endereço exato" no
  centro, com "N imóveis sem endereço exato em <cidade>" e "Ver os N na lista" no cartão.
- **Botões:** aproximar, afastar, ver o Brasil e "minha região" (localização do navegador, só ao clicar; a posição não é
  enviada ao site). Teclado: setas, + e −, Esc fecha o cartão. Leitor de tela: o mapa tem descrição, e a lista é a
  alternativa completa.
- **Celular:** o mapa ocupa a tela abaixo da barra e a lista fica numa folha que se puxa (espiada, meio, cheia); pinça e
  arrasto no mapa. Créditos e escala sempre acima da folha.
- **Sem WebGL** (ou se a placa de vídeo derrubar o mapa): o mapa do Brasil em SVG de antes.
- **Página do imóvel:** a seção Localização ganhou o mapa de verdade (só baixa quando a seção chega perto), com o ponto
  e o lance, ou o círculo do bairro (desenhado em qualquer zoom), ou o marcador da cidade. A roda do mouse rola a página
  (Ctrl/⌘ + roda aproxima); no toque, dois dedos movem o mapa. "Ver o ponto no OpenStreetMap" continua.

**Como funciona (técnico):**
- `GET /api/catalogo/pontos` (os mesmos filtros da lista, sem a área) devolve os **lugares** (imóveis no mesmo ponto e
  precisão juntos), em ordem de Morton, latitude e longitude em diferenças × 100.000, lance em centenas. Brasil inteiro:
  **9.741 lugares, 537 KB de JSON, 182 KB em gzip, 161 KB em brotli**; ~50 ms no servidor na primeira vez e ~5 ms depois
  (cache por instância). Compressão feita na rota (o `next start` não comprime rotas). `/api/catalogo/pontos/itens`
  devolve os imóveis de um lugar (até 40), com a versão da lista (409 se ela mudou).
- **Peso:** o MapLibre (1.057 KB, **287 KB em gzip**) e o worker dele (519 KB, 147 KB em gzip, servido pelo próprio site
  em `/mapa/maplibre-gl-worker.mjs`) só baixam na vista de mapa ou perto do mapa da página do imóvel. Conferido no build
  de produção: a landing, a lista, os cards e o topo da página do imóvel não baixam nada do mapa.
- **Desempenho:** os pontos entram no mapa (`setData`) só quando os filtros mudam; arrastar e aproximar não passam pelo
  React (o MapLibre desenha na placa de vídeo e agrupa num worker); o cartão preso acompanha o mapa mexendo só na posição;
  a área visível sai uma vez por movimento. O círculo do bairro some entre 140 e 220 px de raio e sai do desenho por
  zoom: no Rio, no zoom 16, seriam 169 círculos com raio mediano de 760 px, um sobre o outro. As bolhas têm até 28 px de
  raio e se agrupam num raio de 60 px (no celular, com 42 a 50 px, elas se cobriam).
- **Medição no Actions** (Chromium sem placa de vídeo: o WebGL roda no SwiftShader, na CPU, e os quadros por segundo são
  piores que os de qualquer celular; vale a comparação com e sem as camadas dos imóveis):

  | Percurso (1440×900), quadros/s | 1ª rodada (40033977496): com imóveis / sem | Última (40037083842): com / sem |
  | --- | --- | --- |
  | Brasil → São Paulo (voo de 3 s) | 16 / 12 | 14 / 15 |
  | arrasto São Paulo → Rio (2 s) | 6 / 8 | 6 / 6 |
  | Rio, zoom 12 → 16 (1,5 s), 1ª vez na sessão | 2 / 12 | 1 / 8 |
  | Rio, zoom 12 → 16, de novo (ladrilhos já baixados) | — | **12 / 11**, sem tarefa longa |

  O tranco de ~1,8 s na primeira ida ao zoom de rua não vem das camadas dos imóveis: repetido com tudo baixado, escondendo
  uma camada por vez, todas as combinações deram 11 a 12 quadros/s e nenhuma tarefa longa (só os preços, só os
  círculos, sem nada). É o custo de primeira vez (ladrilhos novos e os programas da placa de vídeo, que no SwiftShader são
  compilados na CPU); como a medição "com imóveis" vem antes da "sem", só ela paga. O sumiço dos círculos grandes de
  perto não muda esse número no SwiftShader; ele evita pintar dezenas de círculos maiores que a tela, um sobre o outro,
  na placa de vídeo do celular. Última rodada: pontos na tela 2,4 s depois de abrir a página; `setData` dos
  9.741 lugares até desenhar, 480 ms; pedido dos pontos, 13 ms (538 KB, brotli). Rodadas: 40033977496, 40036326671 e
  40037083842 (prints em `coletas-dados`, `prints/<id>/`).
- **Prints:** `git push -f origin HEAD:acoes-mapa` e `gh workflow run site-prints.yml --ref acoes-mapa -f roteiro=mapa`
  (roteiro em `scripts/prints/actions.mjs`); os PNGs e o `relatorio.txt` vão para o branch `coletas-dados`, pasta
  `prints/<id da rodada>/`. Daqui (este ambiente) a rede não chega aos ladrilhos; no Actions, sim.

**OpenFreeMap: termos e endereços (conferidos em 23/10/2026, openfreemap.org):**
- Grátis, sem chave, sem cadastro, sem limite de uso e sem cookies; uso comercial permitido (FAQ: "Yes").
- Pede a atribuição "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (a parte do OpenFreeMap é opcional). O site
  mostra, sempre aberta no canto do mapa: "OpenFreeMap © OpenMapTiles © colaboradores do OpenStreetMap", com os links.
- Termos: serviço "como está", sem garantia, e **pode acabar a qualquer momento**; servido pela Cloudflare; lei da Hungria.
  Privacidade: dizem não guardar o IP nos registros de acesso.
- Endereços usados: `https://tiles.openfreemap.org/planet` (TileJSON; ladrilhos em `/planet/<versão>/{z}/{x}/{y}.pbf`) e
  `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (Noto Sans). Sem sprite (os balões são desenhados na hora).
  O estilo é nosso, feito a partir do Positron do OpenFreeMap (BSD-3 / CC BY 4.0).

**Decisões suas:**
- [ ] **Política de privacidade:** citar o OpenFreeMap. O navegador do visitante pede os ladrilhos direto a eles (via
  Cloudflare), o que entrega o IP e a região vista no mapa; "minha região" usa a localização do navegador só ao clicar.
- [ ] **Doação ao OpenFreeMap** (o projeto vive de doações e pede apoio de quem usa em produção) ou plano pago de reserva.
- [ ] Vista padrão: hoje a lista (ou cards, a que ficou salva); o mapa é um modo de explorar que entra no histórico (o
  "voltar" volta à lista) e não vira a preferência salva. Abrir no mapa por padrão em algum caso?

**Falta (técnico):**
- [ ] **Plano B dos ladrilhos:** se o OpenFreeMap sair do ar, o mapa avisa "As ruas do mapa não carregaram agora" e os
  imóveis continuam no lugar. Alternativas: os mesmos ladrilhos do Brasil num arquivo PMTiles (Protomaps) num
  armazenamento nosso, ou um serviço pago (MapTiler, Stadia).
- [ ] **Testar num celular de verdade** (o Actions não tem placa de vídeo; aqui a rede não chega aos ladrilhos).
- [ ] O worker do MapLibre sai sem compressão no `next start` (na Vercel a CDN comprime).
- [ ] O print da folha do celular no Chromium sem placa de vídeo saía com faixas brancas (partes da página não pintadas
  pelo SwiftShader); com a rasterização na CPU (como no roteiro agora) some. Conferir num celular.

### Rodada 5 · mapa: revisão adversarial (23/10/2026)

Pedido do dono (ponto 14): "o mapa no estado da arte, muito responsivo, rápido, respondendo bem aos zooms; de acordo com
o zoom ele vai filtrando os casos; com zoom, mostra o nome da rua". A revisão tentou quebrar o mapa da frente M (commits
9f7d20c a 865961b): desempenho com a CPU 4× mais lenta, memória depois de 50 zooms, troca de filtros e de tema, voltar e
avançar, "Buscar nesta área" (vazia, no limite do Brasil, com texto), Lente × Luneta, teclado, celular deitado, sem WebGL,
CLS, peso do JS da lista, precisão do endereço e créditos. Conferido com `next start` + Playwright aqui (sem os ladrilhos:
o proxy bloqueia) e com os ladrilhos de verdade no Actions (roteiro `revisao` em `scripts/prints/actions.mjs`; rodadas
40041271354, com o roteiro `mapa` inteiro, e 40042226074; prints em `coletas-dados`, `prints/<id>/`). Nos prints: nomes de
rua a partir do zoom 13–14,5 nos dois temas (Rua Boqueirão, Rua Sabedoria, Avenida Abílio Augusto Távora em Nova Iguaçu;
Rua da Assembléia, Rua da Carioca e Avenida República do Chile no Centro do Rio), cores do fundo e dos balões coerentes com o site no claro e no
escuro; o número das casas (zoom 17,5) só aparece onde o OpenStreetMap tem o dado (em Nova Iguaçu, não tem).

**Achados e correções** (todos com o código no commit da revisão; os números de CPU 4× são do Chromium daqui, sem placa de
vídeo):
1. **Alto · a lista perdia imóveis ao abrir o mapa.** Com "Buscar ao mover o mapa" ligado, o enquadramento automático
   (percentis 2 a 98 dos pontos) virava a área da lista: abrir o Brasil escondia 12 imóveis no computador e **254 no
   celular** (o oeste do país não cabia), sem aviso. Agora só o movimento da pessoa (gesto, teclado, botões, clique no
   agrupamento) vira a área (`movimentoDaPessoa`, com teste); abrir, trocar de lugar ou voltar no histórico mostram a busca
   inteira. Link antigo com a área e sem a câmera abre o mapa na área.
2. **Alto · Lente ganhava um filtro da Luneta pelo mapa.** Os pontos eram pedidos sem o plano (o servidor entende a
   Luneta): "casa 2 quartos" na busca filtrava os quartos no mapa do Lente (5.624 no mapa contra 7.896 na lista). O plano vai
   no pedido e na chave quando muda os pontos (`consultaPontos`, `chaveMapa`, com teste). O mesmo valia para a chave do mapa
   do Brasil em SVG.
3. **Médio · voltar no histórico com o mapa aberto** reenquadrava o Brasil e a lista virava o Brasil inteiro: agora o mapa
   pula para a câmera daquela entrada e a lista volta à área dela (conferido: arrastar em SP → buscar "Recife" → voltar =
   SP, 279 imóveis).
4. **Médio · "só o bairro" parecia endereço exato.** 30 lugares de bairro com desvio de 10 a 50 m na base viravam um ponto
   de 7 px. Raio mínimo de 300 m no bairro (`raioDoNivel`, com teste); o imóvel de bairro sob o mouse na lista acende a área
   do bairro, não um anel no centro; na cidade, um anel largo em volta do marcador "sem endereço exato".
5. **Médio · notebook de 768 px de altura (1366×768, 1024×768):** com o cabeçalho que rola junto, a coluna do mapa passava
   ~110 px do pé da tela: legenda, escala e créditos fora da tela até rolar (e 1 px em toda tela, pelo marco de 1 px acima
   da barra). A conta da altura agora desconta tudo o que está à vista acima da barra; conferido no Actions: créditos à
   vista em 1366×768 e 844×390. Ao rolar a lista, a coluna cresce junto com o cabeçalho saindo (CLS 0,008 em 1366×768;
   0,002 em 1440×900, como já era com a faixa de aviso).
6. **Médio · celular deitado (844×390):** a folha espiava 132 px de um mapa de 212, os botões de Brasil e minha região
   ficavam embaixo dela, a escala caía em cima da chave e os créditos sumiam. Agora a folha espia só o título (78 px, por
   consulta de mídia: sem pulo), e os botões vão para uma linha no alto.
7. **Médio · desempenho na parada do mapa (CPU 4×, celular):** depois de cada arrasto, a lista nova travava o thread
   principal por 215–260 ms (React) + 37–136 ms (layout dos 24 cartões, quase todos escondidos sob a folha). Agora o
   resultado da vista de mapa é desenhado em segundo plano (`useDeferredValue`) e os cartões fora da tela não têm layout
   (`content-visibility`): 105–140 ms + 43–54 ms. No Actions (CPU 4×, com os ladrilhos), as tarefas longas depois de três
   paradas seguidas ficaram em [103, 115], [64, 51] e [56, 73] ms (antes: [216, 100] na primeira). Arrastar e aproximar
   continuam fora do React.
8. **Baixo · CLS da folha no tablet (até 0,10):** a folha nascia no topo padrão e descia ~120 px quando a barra era medida
   um quadro depois; agora a medida sai antes da pintura (CLS 0 em 390, 667×375, 768, 844×390, 1366).
9. **Baixo · sem WebGL o MapLibre (1 MB, 287 KB gzip) era baixado mesmo assim:** agora o teste vem antes; sem WebGL, cai no
   mapa SVG sem baixar nada do mapa (conferido com `--disable-webgl`, no computador e no celular).
10. **Baixo · teclado:** no computador o mapa vinha depois dos 24 cartões (~50 Tabs): novo atalho "Pular para o mapa" (2
    Tabs, Enter, foco no mapa; + e − aproximam, setas movem, Esc fecha o cartão).
11. **Baixo:** pontos pedidos de novo sem o cache HTTP quando o catálogo muda (409 no cartão); "Ver a busca inteira (N)"
    conta também os imóveis sem posição; o zoom do mapa da página do imóvel respeita "reduzir movimento".

**Conferido sem achado:** memória depois de 50 zooms (14,5 → 16,8 MB de heap, mesmo número de ouvintes); trocar o tema não
mexe na câmera nem nos imóveis (9 lugares antes e depois); "Buscar nesta área" com a chave desligada (aparece só depois de
arrastar; "Ver a busca inteira" tira a área); área no mar mostra "Nenhum imóvel nesta parte do mapa"; texto novo com área
tira a área; bbox fora do Brasil, invertida ou fora do globo é ignorada no servidor; `/api/catalogo/pontos/itens` no Lente
sem tags, selo e nota; a lista, os cards e a landing não baixam o MapLibre (só a vista de mapa e a página do imóvel perto do
mapa).

**Falta:**
- [ ] O desenho da lista nova ainda ocupa 105–140 ms do thread principal com a CPU 4× (uma tarefa só: a parte que o React
  não fatia). Se no celular de verdade o mapa engasgar logo depois de soltar o dedo, o próximo passo é desenhar a lista da
  folha só quando ela for puxada (na espiada só o título aparece).
- [ ] Conferir num celular de verdade: pinça, folha, celular deitado e a parada do mapa.

### Rodada 5 · integração das frentes (24/10/2026)

Um branch só com as duas faixas da rodada 5: a faixa 2 (`a91fafc`: landing L, "Ajuste o foco" F, vitrine V, simulador e
metrô S) e o mapa de verdade com a revisão adversarial (`e47c8d8`). Nada foi para o main.

**Como juntou:**
- `maplibre-gl` 6.15.0 entrou com o `package-lock.json` do mapa (`npm install` no worktree; o lock não mudou).
- Os dois filtros novos convivem:
  - `Filtros.metroPerto` (Luneta, URL `metro=1`, pílula "Metrô a até 1 km");
  - `Filtros.bbox` ("Buscar nesta área", dos dois planos, URL `bbox=`).
  - No índice, o metrô usa o bit 25 e a área o 30.
  - Os pontos do mapa saem da mesma passada de filtros da lista. Com "Metrô a até 1 km" na prévia, são 369 na lista e
    369 no mapa. No Lente o filtro é ignorado nos dois: 21.229 na lista, 21.226 no mapa e 3 sem posição.
- A lista da vista de mapa (coluna no computador, folha no celular) ganhou o que a vitrine pôs na lista: o aviso "Você
  está vendo 10 de 21.229 imóveis reais da base", o rodapé com os planos e os exemplos fictícios.
- `scripts/prints/actions.mjs`: o do mapa, com o desvio para os roteiros `fotos` e `fotos-site` da vitrine.

**Ajustes da integração (decisões minhas; o dono pode mudar):**
- **O mapa da /assinante só tem os 10 reais.** Os pontos e o cartão do mapa usam as posições da lista do índice. Antes,
  pedir a posição 10 ao `/api/catalogo/pontos/itens` devolvia o primeiro exemplo fictício, que não está no mapa.
  Agora ela é ignorada; o teste dos endpoints cobre isso.
- A vitrine ganhou a incerteza de cada ponto (`desvios`), tirada do conjunto de origem, para o círculo do mapa.
- Na vista de mapa da /assinante, o bloco "Exemplos fictícios (para ver os selos)" não aparece, porque eles não têm
  lugar no mapa. O aviso e o rodapé da vitrine continuam. Na lista e nos cards, nada mudou.
- "Com estes filtros: N dos 10 aqui e M na base completa" também aparece quando só a área do mapa recorta a vitrine.
- `pontos.test.ts` agora vale para a vitrine (10 reais, no número ou na rua) e para os 6 fictícios (quando não há o
  instantâneo da base).

**Conferido:**
- typegen + tsc, eslint, `test:site` (347 de 347), `base:testar` (487 de 487) e `next build`. O build parou na 1ª vez
  com o aviso de segurança do Next 16.4.0 e passou na 2ª. Não rodei o `next upgrade`: fica para o dono decidir.
- `next start` na porta 3340, Playwright com WebGL no SwiftShader:
  - **landing** (1440 escuro, 390 claro): sem erro e sem rolagem lateral; o "Ajuste o foco" carrega; o MapLibre não
    é baixado;
  - **ida e volta**: landing → `ex-alvo-sp#simulador` (1440) e → `ex-semselo-rj#riscos` (390), com a seção certa no
    topo e o "Voltar à apresentação" na tela; ao voltar, o link fica a 1 px e a 0 px de onde estava;
  - **/previa**: na lista com `metro=1`, a pílula e 369 imóveis, sem MapLibre. Na vista de mapa, testei 1440 e 390
    nos dois temas e o Lente com `metro=1`;
  - **/assinante**: na lista e no mapa, em 1440 e 390 nos dois temas;
  - **páginas de imóvel**: o real da vitrine em Salvador mostra o mapa de verdade e "Estação de metrô Campo da Pólvora
    a 90 m"; um da prévia no Rio, no celular, mostra a estação a 210 m e o mapa ao rolar até ele; o exemplo
    `ex-alvo-sp` tem o simulador abrindo no lucro e o "Editar a conta";
  - **resultado**: sem erros no console e sem rolagem lateral.
  - Os ladrilhos do mapa não abrem neste contêiner (proxy): os prints mostram o aviso "As ruas do mapa não carregaram
    agora".
- Prints em `scratchpad/prints/r5-int/`.

**Falta:**
- [ ] Prints do branch integrado no Actions (roteiros `mapa` e `fotos-site`, num branch `acoes-*`). Neste contêiner os
  ladrilhos e as fotos da Caixa não abrem.
- [ ] O botão "Metrô perto" do "Ajuste o foco" ainda tem `metro: null` em `FILTRO_DO_CATALOGO`
  (`src/lib/demo-foco/busca.ts`). O filtro do catálogo já existe (`metroPerto`): trocar pela chave. Hoje o selo da Luneta
  já aparece certo, porque o null conta como Luneta.
- [ ] Avaliar o `next upgrade` que o aviso de segurança do Next 16.4.0 recomenda, antes do lançamento.

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
- [x] ~~Advogado: manter "advogado especialista com prioridade" ou trocar por checklist/ficha até sair parecer da OAB.~~
  Rodada 5: o site fala em "especialista" (pedido do dono); a linha da OAB vale quando o especialista for advogado.
- [x] ~~Abertura do hero: manter na primeira rolada (atual) ou automática, sem trava.~~ Rodada 5: automática, sem trava.
- [ ] Título novo com "imóveis" e "risco" ("Leilões de imóveis de todo o Brasil. E o risco de cada um, na mira.").
- [ ] Encurtar a página (Exemplos e Filtros dentro do Por dentro; Dados e Prova social só com números reais).
- [ ] Preços, oferta de fundador e Lente paga ou grátis (a garantia ficou em 7 dias: "Cancele grátis em até 7 dias",
  rodada 5). Com a Luneta mais completa (rodada 4),
  rever o `R$ [129]`.
- [ ] Landing (rodada 4): publicar o número de compras do ITBI só depois das licenças de SP, Rio e POA; manter o link
  "Ferramentas" no menu? (detalhes em "Rodada 4 · site original").

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
- [ ] Casos reais no site (Exemplos, hero, Praças e Por dentro) a partir da base. A `/assinante` já mostra a vitrine
  com 10 imóveis reais, e os cartões fictícios da landing têm foto ilustrativa de um imóvel real (rodada 5, frente V).
- [ ] Formulário que muda conforme o botão clicado e envia de verdade (servidor, anti-robô, LGPD).
- [ ] Alerta de mudança de praça por e-mail: a landing promete (decisão do dono, rodada 5); o back-end é obrigatório antes
  do lançamento (ver "Back-end: favoritos e alerta de mudança de praça").
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
  fora do Brasil: pronto para rodar no PC do dono, `node base/coleta-pc.mjs --etapas bh`) e as licenças de SP, Rio e POA continuam
  pendentes.

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
| FAQ · "Os leilões de todo o Brasil estão aqui?" | `Hoje são [X] leiloeiros monitorados.` | `site.ts` → `FAQ.items[2].a` |
| Decida com números · preço do m² | `preço pago em [X] compras registradas na prefeitura` (o total do ITBI, ~203 mil, sai dos arquivos; liga depois das licenças de SP, Rio e POA) | `ferramentas.ts` → `DECIDA.mostrarTotalItbi` |
| Rodapé | links `Política de privacidade [link]` e `Termos de uso [link]` (hoje apontam para `#`) | `Footer.tsx` |
| Rodapé | `[Razão social] · CNPJ [X]` | `site.ts` → `FOOTER.company` |

## Conteúdo fictício (substituir por casos reais)

- **Casos reais com link direto** (pedido do cliente): a estrutura está pronta, mas a coleta não foi feita porque a rede
  deste ambiente bloqueia os sites dos leiloeiros. Cada imóvel em `examples.ts` aceita `source: { leiloeiro, url, coletadoEm }`
  (o título vira link para o anúncio, com "Dados de DD/MM/AAAA · confira o edital") e `point` (use `latLonToMap(lat, lon)`
  de `src/lib/brazil.ts` para pôr o pino no lugar exato). Com `source`, o rótulo muda sozinho para "Caso real · leiloeiro".
  Tags e selo de um caso real devem ser marcados como análise ilustrativa até passarem pelo critério validado.
- **Exemplos de leilão** (`src/content/examples.ts`): 6 imóveis fictícios, sempre rotulados como "Exemplo fictício".
  O blueprint pede casos reais da base com a etiqueta "exemplo de oportunidade" e fotos; o cartão aceita `photo` (a foto
  do caso real, num `<img>` simples direto da fonte, sem `next/image`). Desde a rodada 5, cada exemplo tem uma **foto
  ilustrativa** de um imóvel real parecido (`photoIlustrativa`), sempre rotulada e sem o endereço do real (frente V).
  O Na Mira diz que, segundo o edital, o condomínio em atraso é quitado com o valor da arrematação: revisar com o
  advogado junto com as explicações das tags.
- **Cartão do Alvo no hero** (deságio contando até 48%) e **praças** (apartamento em Campinas/SP, R$ 400.000 → R$ 200.000,
  e o aviso "Seu favorito foi para a 2ª praça"): fictícios, rotulados.
- **"Por dentro, depois de assinar"** usa os mesmos exemplos fictícios. A **área do assinante** (`/assinante`) mostra a
  vitrine com 10 imóveis reais e, à parte, os 6 exemplos fictícios (rodada 5, frente V).
- **Demo de filtros e mapa** ("Ajuste o foco"): 150 imóveis fictícios gerados (`src/lib/demo-foco`), rotulados
  "Demonstração · 150 imóveis fictícios"; cidades e bairros reais, preço, praça, ocupação, nota e metrô inventados
  (rodada 5, frente F).
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
- **Aviso de mudança de praça por e-mail** (Praças, FAQ e plano Luneta): o dono decidiu promover (rodada 5). É promessa
  de funcionalidade: o back-end precisa existir antes do lançamento ("Back-end: favoritos e alerta de mudança de praça").
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

- **Hero** (rodada 5): a intro inteira (as 6 etapas do Passo 4) roda sozinha ao abrir ou recarregar a página no topo,
  sem esperar a rolagem e sem travar a página: ~2,5 s, com a etapa 1 pelo menos 0,45 s na tela. Esc pula; rolar até o
  hero sair da tela também. Na volta da demonstração (o roteador do Next) o hero já vem no estado final; recarregar
  repete. (Até a rodada 4, a intro esperava o primeiro gesto de rolar e segurava a rolagem enquanto montava.)
  No celular, a lente fica entre o texto e o cartão e encolhe em telas baixas, sem cobrir os botões.
  A marcação vem do servidor, a etapa 1 vem do CSS (`html.motion`) e o GSAP é pedido assim que a página hidrata
  (`HeroMotion.tsx`). Se o GSAP não chegar em 2,2 s, a página pula direto para o estado final (`#topo[data-done]`, só CSS).
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

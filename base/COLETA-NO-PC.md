# Coleta no seu PC: fichas da Caixa e ITBI de Belo Horizonte

Guia para rodar, no seu computador, as coletas que só funcionam a partir de uma internet no Brasil. É **um comando só**;
ele baixa, guarda e, no fim, envia o resultado para o GitHub, de onde eu aplico no site.

**Por que no seu PC.** Duas fontes recusam os servidores de fora do Brasil (onde rodam as coletas automáticas):

- as **fichas da Caixa** (a página de cada imóvel, com matrícula, comarca, ofício, inscrição e averbação): o anti-robô
  da Caixa barra os servidores do GitHub;
- o **ITBI de Belo Horizonte** (o preço pago nas compras de imóveis da cidade): o portal da prefeitura responde
  "proibido" (HTTP 403) para quem está fora do Brasil.

Da sua internet de casa, o programa acessa como um visitante comum: se identifica, respeita as regras do site
(robots.txt), espera 2 segundos entre uma página e outra e **para sozinho** se o site recusar 5 vezes seguidas. Depois
de uma recusa, ele espera 2 horas antes de tentar de novo. Ele nunca tenta enganar o anti-robô.

## 1. Instalar (uma vez só)

Instale os três programas abaixo. Depois de instalar, **feche e abra de novo o terminal**.

| Programa | Para quê | Onde baixar | Dica |
|---|---|---|---|
| **Node.js** (versão LTS) | roda a coleta | https://nodejs.org/pt-br/download | escolha a versão "LTS"; aceite as opções padrão |
| **Git** | baixa o projeto e envia o resultado | https://git-scm.com/downloads | no Windows, aceite as opções padrão |
| **Python 3** | só para o ITBI de BH | https://www.python.org/downloads/ | no Windows, marque **"Add python.exe to PATH"** na primeira tela |

Depois do Python, instale os pacotes que o ITBI usa. No terminal:

```
pip install pandas numpy requests openpyxl
```

Se o terminal disser que não conhece o `pip`, use `py -3 -m pip install pandas numpy requests openpyxl` (Windows) ou
`python3 -m pip install pandas numpy requests openpyxl` (Mac).

**Onde fica o terminal:** no Windows, abra o menu Iniciar e digite "PowerShell" (ou "Prompt de Comando"; os dois
servem); no Mac, abra o app "Terminal" (Aplicativos > Utilitários).

## 2. Baixar o projeto (uma vez só)

No terminal, escolha uma pasta (por exemplo, a sua pasta pessoal, que é onde o terminal já abre) e rode:

```
git clone https://github.com/joaopedrogv13/luneta-de-leiloes.git
cd luneta-de-leiloes
```

Não precisa de `npm install`: a coleta só usa o Node, o Git e o Python. Evite uma pasta sincronizada com a nuvem
(OneDrive, Google Drive, iCloud): a coleta grava 21 mil arquivos, e a sincronização deixa tudo lento ou segura os
arquivos.

**Nas outras vezes**, abra o terminal, entre na pasta e atualize o projeto antes de rodar:

```
cd luneta-de-leiloes
git pull
```

## 3. Rodar

Dentro da pasta `luneta-de-leiloes`:

```
node base/coleta-pc.mjs
```

(É o mesmo comando no Windows, no Mac e no Linux. Quem já conhece o npm pode usar `npm run coleta:pc`, mas no Windows
prefira o comando acima: veja o item 9.)

O programa:

1. confere o que é preciso (Node, Git, Python) e diz, em português, o que falta e como resolver;
2. mostra o que vai fazer;
3. baixa as fichas da Caixa, começando pelas mais urgentes (leilão com data mais próxima), uma a cada ~2,5 segundos,
   mostrando quantas já foram, quantas faltam e quanto tempo falta, por exemplo:
   `[1.234/21.226 · 5,8% · faltam ~14 h 10 min] 1444419640129: ok · matrícula 868 · SAO GONCALO-RJ`;
4. baixa o ITBI de Belo Horizonte (alguns minutos);
5. envia o resultado para o GitHub e mostra um resumo. Quando aparecer **"Pronto: pode fechar a janela"**, terminou.

Tudo fica guardado na pasta `coletas-pc/` dentro do projeto, com um registro de tudo em `coletas-pc/log.txt`.

**Uma janela só.** Rode em uma janela do terminal por vez. Se você abrir outra e rodar de novo enquanto a primeira
trabalha, a segunda avisa "Já tem uma coleta rodando neste PC" e não faz nada (duas ao mesmo tempo acessariam a Caixa
no dobro do ritmo combinado).

## 4. Quanto tempo leva, e como parar e continuar

São cerca de **21 mil fichas × ~2,5 segundos ≈ 15 horas** na primeira vez. Não precisa ser de uma vez:

- **Para parar:** aperte `Ctrl+C` (no Mac também é `Ctrl+C`). O programa guarda o que já baixou, envia isso para o
  GitHub e avisa quando pode fechar. **Espere aparecer "pode fechar a janela"** antes de fechar. Se tiver pressa, um
  segundo `Ctrl+C` sai na hora (o que já foi baixado continua salvo; para enviar depois:
  `node base/coleta-pc.mjs --so-publicar`).
- **Para continuar:** rode o mesmo comando (`node base/coleta-pc.mjs`). Ele confere as fichas que já baixou (com
  milhares delas, isso leva de meio minuto a alguns minutos, e ele mostra "conferidas 2.000 de 21.000...") e segue de
  onde parou. Se o PC desligar ou a janela fechar no meio, também é só rodar de novo: perde no máximo a ficha que estava
  baixando.
- **Fichas que "não abriram":** algumas páginas não têm a ficha (o imóvel saiu da venda, por exemplo). O resumo diz
  quantas foram; o programa tenta essas de novo sozinho depois de 7 dias. Não precisa fazer nada, e não adianta rodar
  de novo por causa delas.
- **Sugestão:** deixe rodando à noite. Antes, configure o PC para **não suspender** enquanto estiver na tomada (Windows:
  Configurações > Sistema > Energia; Mac: rode `caffeinate -i node base/coleta-pc.mjs`, que impede o Mac de dormir
  enquanto a coleta roda).
- **Por estado:** para fazer aos poucos, um estado por vez: `node base/coleta-pc.mjs --uf RJ` (troque RJ pela sigla).
- **Só um pouco, para testar:** `node base/coleta-pc.mjs --limite 50` (no máximo 50 fichas novas; depois roda BH e
  envia). Um bom primeiro teste, de uns 5 minutos.
- **Espaço:** as fichas ocupam uns 600 MB no disco.

## 5. Se aparecer "BLOQUEIO" ou "SEM CONEXÃO"

O programa escreve **BLOQUEIO** quando o site recusa o acesso (página de verificação anti-robô, "proibido" ou "muitas
requisições"). Depois de 5 recusas seguidas ele para sozinho e mostra um quadro explicando, com o horário em que pode
tentar de novo.

O que fazer:

- **Não tente contornar.** Nada de VPN, outro navegador, extensão ou programa que "imita" uma pessoa. O combinado é
  acessar só como um visitante comum.
- **Pare e tente mais tarde**, com o mesmo comando, a partir do horário que o quadro mostra (2 horas depois; amanhã
  também serve). Antes disso, o programa nem tenta as fichas: ele avisa "As fichas estão em pausa" e só roda o resto
  (BH e o envio). O que já foi baixado não é baixado de novo.
- Se você estiver numa **VPN** ou numa rede de empresa, desligue a VPN e use a internet de casa (o acesso precisa sair
  do Brasil). Só nesse caso, se quiser tentar logo, use `node base/coleta-pc.mjs --sem-pausa`.
- Se o bloqueio acontecer sempre, me avise e mande o arquivo `coletas-pc/log.txt`.

**SEM CONEXÃO** não é bloqueio: o site não abriu. Confira a internet e rode de novo (não há pausa). Se o quadro falar
em **certificado de segurança**, costuma ser um antivírus que inspeciona sites seguros (HTTPS): não desligue o antivírus
por conta própria; me mande o `coletas-pc/log.txt`.

## 6. Só o ITBI de Belo Horizonte

```
node base/coleta-pc.mjs --etapas bh
```

Leva alguns minutos. Precisa do Python com os pacotes do passo 1. Se o portal da prefeitura recusar (BLOQUEIO), vale o
mesmo do item 5.

Outros atalhos: `node base/coleta-pc.mjs --etapas fichas` (só as fichas) e `node base/coleta-pc.mjs --so-publicar` (só
envia o que já foi coletado, por exemplo depois de resolver o login do GitHub). Todas as opções:
`node base/coleta-pc.mjs --ajuda`.

## 7. O envio para o GitHub (e o login)

No fim, o programa envia o resultado para o branch `coletas-dados` do repositório (uma área separada, que não mexe no
site nem nos seus arquivos). **Na primeira vez, o GitHub pede para você entrar na sua conta:**

- **Windows:** o Git abre uma janela do navegador; entre com a conta dona do repositório (joaopedrogv13).
- **Mac ou se o envio falhar:** instale o GitHub CLI (https://cli.github.com), rode `gh auth login` (escolha GitHub.com,
  HTTPS e "Login with a web browser"), depois `gh auth setup-git`, e por fim `node base/coleta-pc.mjs --so-publicar`.

Se o envio falhar, o programa diz exatamente o que fazer; os dados continuam salvos em `coletas-pc/`.

**O que vai para o GitHub:** só os dados lidos das fichas (`fichas.json`, com nomes e documentos de pessoas mascarados),
o resumo, o ITBI de BH (só médias por cidade, bairro e rua) e o registro da execução, sem os caminhos de pastas do seu
PC. Se você exportou o seu coletor de leilões (o PBCV) para a pasta `coletas-pc/leiloeiros/`, vão também o arquivo dos
leiloeiros (comprimido) e o resumo dele: o passo a passo está em
[`base/leiloeiros/pbcv/README.md`](leiloeiros/pbcv/README.md). Antes de enviar, o programa confere que cada arquivo está inteiro (um arquivo cortado por queda de energia não vai,
e o que já estava no GitHub fica). **O que fica só no seu PC:** as páginas da Caixa em HTML (`coletas-pc/fichas/*.html`).

## 8. Para eu acompanhar daqui (opcional)

Se você quiser que eu acompanhe a coleta e rode os comandos por você:

1. Instale o Claude Code: https://claude.com/claude-code (na primeira vez, ele pede para entrar na sua conta do Claude).
2. Abra um terminal **na pasta do projeto** (`cd luneta-de-leiloes`) e rode:

   ```
   claude remote-control
   ```

3. A sessão do seu PC aparece no app do Claude (no site claude.ai ou no celular). Deixe essa janela aberta enquanto
   quiser que eu tenha acesso; para encerrar, feche a janela ou aperte `Ctrl+C` nela.

## 9. Problemas comuns

- **"node não é reconhecido" / "git não é reconhecido" / "command not found":** o programa não foi instalado, ou o
  terminal foi aberto antes da instalação. Feche e abra o terminal; se continuar, instale de novo (passo 1).
- **"Cannot find module ... coleta-pc.mjs":** o terminal não está na pasta do projeto. Rode `cd luneta-de-leiloes` e o
  comando de novo (se aparecer "não encontrado", faça o passo 2).
- **"Seu Node é o 18..." (ou outra versão antiga):** instale a versão LTS do Node (passo 1) e abra um terminal novo.
- **"Python 3: FALTA":** instale o Python (no Windows, com "Add python.exe to PATH") e os pacotes do passo 1. Sem o
  Python, as fichas rodam normalmente; só o ITBI de BH fica de fora.
- **"Já tem uma coleta rodando neste PC":** outra janela do terminal ainda está rodando a coleta. Espere ela terminar,
  ou aperte `Ctrl+C` nela, e rode de novo. (Se o PC desligou no meio, o aviso some sozinho em 2 minutos.)
- **"As fichas estão em pausa":** a Caixa recusou o acesso há pouco; veja o item 5.
- **Usou `npm run coleta:pc` no PowerShell e apareceu "a execução de scripts foi desabilitada neste sistema":** é uma
  trava do Windows para o `npm` no PowerShell. Use `node base/coleta-pc.mjs` (não precisa mudar nada no Windows).
- **Usou `npm run` e as opções foram ignoradas** (por exemplo, `--uf RJ` não aparece em "Vai fazer"), ou apareceu
  **"Deseja finalizar o arquivo em lotes (S/N)?"** depois do `Ctrl+C`: são coisas do npm no Windows. Use
  `node base/coleta-pc.mjs` com as mesmas opções. Se já apareceu a pergunta, responda `N` e espere "pode fechar a
  janela": a coleta continua gravando e enviando por trás.
- **O antivírus perguntou sobre o Node, o Git ou o Python:** pode permitir; o programa só acessa a Caixa, a prefeitura
  de BH e o GitHub.
- **Qualquer outra coisa:** mande para o Claude a mensagem da tela e o arquivo `coletas-pc/log.txt`.

**Depois da coleta, a atualização do site:** com o banco no seu PC, um segundo comando leva tudo ao site, todo dia:
`node base/atualizar-site.mjs`. Guia: [`ATUALIZAR-SITE.md`](ATUALIZAR-SITE.md).

Para quem programa: o comando é `base/coleta-pc.ts` (Node 22.6+, sem dependências), chamado por `base/coleta-pc.mjs`;
`node base/coleta-pc.mjs --ajuda` lista as opções. Como aplicar o resultado na base: `base/fontes/caixa/README.md`
("Fichas que voltaram do PC") e `base/fontes/itbi/README.md` ("Belo Horizonte pelo PC do dono").

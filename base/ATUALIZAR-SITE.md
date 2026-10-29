# Atualizar o site todo dia

O site mostra uma "foto" dos imóveis (o instantâneo em `base/saida/site/`). Para ela ficar em dia, duas máquinas
trabalham, cada uma com a sua parte:

| Onde | Quando | O que faz |
|---|---|---|
| **Seu PC** | todo dia | `node base/atualizar-site.mjs`: baixa a lista da Caixa, importa o arquivo dos leiloeiros (o do PBCV), aplica as fichas, refaz as tags, monta a foto nova do site e publica. Uma vez por semana, guarda uma cópia do banco no repositório privado. |
| **GitHub Actions** | todo domingo, 06:00 | a parte pesada: acha o ponto de cada endereço no mapa (geocode) e calcula a nota de localização. O resultado fica no branch `coletas-dados`, e o seu PC aplica no dia seguinte. |
| **GitHub Actions** | todo dia, 12:00 | o **vigia**: confere se o seu PC mandou os dados. Se não, você recebe um e-mail. |

## Rodar

Na pasta `luneta-de-leiloes` (a mesma da coleta no PC: guia `base/COLETA-NO-PC.md`, passos 1 e 2):

```
node base/atualizar-site.mjs
```

Leva de 10 a 20 minutos (a lista da Caixa é a parte mais demorada; sem ela, ~5 minutos). No fim aparece um resumo, linha por linha, e **"Pronto."**. O comando já faz o `git pull`
sozinho no começo. Outras formas:

- `node base/atualizar-site.mjs --sem-publicar`: faz tudo, mas não envia nada (para testar). A foto nova fica em
  `coletas-pc/atualizar-site/saida/site/`.
- `node base/atualizar-site.mjs --backup`: faz a cópia do banco hoje.
- `node base/atualizar-site.mjs --forcar`: publica mesmo que a trava de segurança recuse (veja abaixo).
- `node base/atualizar-site.mjs --etapas leiloeiros,riscos,exportar,publicar`: só algumas etapas. As etapas são
  `banco, caixa, leiloeiros, fichas, riscos, localizacao, exportar, publicar, copia`.
- Todas as opções: `node base/atualizar-site.mjs --ajuda` (ou `npm run site:atualizar -- --ajuda`).

**Para rodar sozinho todo dia** (Windows): Agendador de Tarefas > Criar Tarefa Básica > Diariamente (por exemplo, às
7:00, depois da coleta do PBCV) > Iniciar um programa: `node`, com o argumento `base\atualizar-site.mjs` e "Iniciar em"
a pasta `luneta-de-leiloes`. Marque "Executar com privilégios mais altos" só se o Git pedir.

## Onde fica cada dado

| Dado | Onde |
|---|---|
| O banco (`luneta.db`) e o cache das fichas (`caixa/`) | só no seu PC, em `base/dados/` |
| A cópia semanal do banco | repositório **privado** `luneta-base`, branch `backup-luneta-db` (uma cópia só, a mais nova) |
| O arquivo dos leiloeiros e as fichas | `coletas-pc/` no seu PC; o envio (`node base/coleta-pc.mjs --so-publicar`) põe no branch `coletas-dados` |
| Geocode e nota de localização | branch `coletas-dados`, pasta `localizacao/` (o Actions grava) |
| A foto do site | `base/saida/site/`, no `main`: cada commit "Dados: atualização de ..." vira o site novo em alguns minutos |
| O registro de cada execução | `coletas-pc/atualizar-site.log` e `coletas-pc/atualizar-site.json` |

Se o banco não existir no PC (PC novo, formatado), o comando o **restaura sozinho** da cópia no `luneta-base` (o Git
pede o login da conta joaopedrogv13). À mão: entre em
https://github.com/joaopedrogv13/luneta-base/tree/backup-luneta-db, baixe o `luneta-dados.tar.gz` para a pasta do projeto
e rode `tar -xzf luneta-dados.tar.gz -C base/dados`.

## A trava de segurança

Antes de publicar, o comando compara a foto nova com a que está no site. **Ele não publica** se o total de imóveis cair
mais de 30%, ou se uma fonte que tinha mais de 1.000 imóveis (a Caixa, ou os leiloeiros juntos) ficar sem nenhum. Isso
quase sempre é uma coleta que falhou pela metade: o site continua com a foto anterior, e o comando termina com erro e
explica o motivo. Se a queda for de verdade (a Caixa tirou muitos imóveis de uma vez), rode com `--forcar`.

Se a lista da Caixa não baixar, o comando segue com os imóveis da Caixa que o banco já tem e avisa. Se o validador
recusar o arquivo dos leiloeiros, ele não importa e segue com os leiloeiros que o banco já tem.

## Se chegar o e-mail do vigia

O e-mail diz "Vigia dos dados" e "failed". Abra o link e leia o que houve:

- **"O PC parou de enviar o arquivo dos leiloeiros"**: a coleta do PBCV, o exportador ou o envio não rodou. No PC:
  rode o coletor, o exportador e `node base/coleta-pc.mjs --so-publicar` (`base/leiloeiros/pbcv/README.md`).
- **"O site não recebe dados novos"**: a atualização diária não rodou, parou na trava ou não conseguiu enviar. No PC:
  rode `node base/atualizar-site.mjs` e leia o resumo.
- **"O coletor avisou erro"**: o coletor gravou o motivo no `status.json`; o e-mail mostra o texto.
- **"Não consegui conferir"**: o GitHub falhou na hora; se repetir no dia seguinte, avise o Claude.

O PC desligado por um dia não chega a disparar: o limite é 36 horas. Na dúvida, mande para o Claude o arquivo
`coletas-pc/atualizar-site.log`.

## Limites conhecidos

- Imóvel novo entra no mapa na sede do município até o geocode do domingo seguinte, e fica com a nota "ainda não
  calculada" até a nota da semana seguinte (o site já mostra essas duas situações).
- O geocode só vale para a Caixa e a Leilões Judiciais; os leiloeiros ficam com o ponto que o PBCV trouxe ou a sede.
- Detalhes técnicos: `base/atualizar-site.ts` (topo do arquivo) e `base/vigia-dados.ts`.

# Regras de risco (26 tags)

Uma regra por grupo de tags, registradas em `index.ts`. Cada tag é decidida por **uma** regra, que olha campo estruturado e texto juntos, e toda regra responde em todo imóvel:

- `sim`: há evidência (campo da fonte ou frase do texto), com o trecho mascarado;
- `nao`: há contrassinal (ex.: "sub-rogação no preço") ou o campo da fonte diz que não;
- `desconhecido`: a fonte não informa. **Nunca se afirma risco sem evidência.**

O motor grava 26 linhas por imóvel na tabela `risco` (regra, confiança, origem, trecho, `precisa_revisao`); a exportação para o site leva só as `sim`. `precisa_revisao` é o "H" do dicionário do catálogo: a tag precisa de leitura humana antes de aparecer como fato.

Base: catálogo de fontes §4, com as correções da crítica. Limiares em `config.ts` (todos **sem validação**). Corpus de teste com textos reais mascarados em `corpus.ts`.

## Como cada tag é decidida

| Tag | Regra | `sim` quando | Contrassinal / `nao` | Confiança e revisão |
|---|---|---|---|---|
| ocupado | posse/ocupacao | campo `ocupacao`; "imóvel (está/encontra-se) ocupado", "ocupado pelo/por", "Ocupam/Residem no imóvel", "Ocupação Atual: o próprio executado" (ou um nome), imóvel invadido/locado | "desocupado" do outro lado; "não está ocupado" | campo alta; texto média; sinais fracos ("desocupação por conta do arrematante", "atualmente servindo de depósito") baixa + revisão |
| desocupado | posse/ocupacao | campo; "imóvel desocupado/vago/livre de pessoas", "Ocupação: desocupado", "Situação: Desocupado" | ocupado | texto média, **sempre revisão** |
| ocupacao-nao-informada | posse/ocupacao | nenhum sinal de ocupação (CSV da Caixa: sempre); "não há informações se o imóvel está ocupado"; **só sinal fraco** (média + revisão) | sinal claro de ocupação ou desocupação | alta ("a fonte não diz") |
| desagio-alto | preco/desagio | `desconto_pct` ≥ 40% | abaixo do limiar | Caixa alta, LJ média; `avaliacao_confere = false` → baixa + revisão |
| desagio-baixo | preco/desagio | `desconto_pct` < 20% (inclui preço acima da avaliação) | acima do limiar | idem |
| preco-acima-mercado | preco/acima-avaliacao | preço > avaliação | — (sem referência de mercado: `desconhecido`) | média, **sempre revisão**; > 3× a avaliação: baixa (provável erro de cadastro) |
| custos-extras-altos | preco/custos-extras | comissão > 5%; laudêmio/foro/terreno de marinha; regularização de construção a cargo do arrematante; baixa de gravames a cargo do arrematante **quando há gravames declarados** (inclui o "Regularização por conta do adquirente" da Caixa); dívidas que passam ≥ 10% da avaliação | — (a regra não tem caminho de "não") | baixa a média, sempre revisão |
| condominio-em-atraso | dividas/condominio | dívida declarada: "Há débitos de condomínio no valor de R$...", "Débito Condominial: R$...", "cotas em atraso", "o condomínio informou débito de R$...", **mesmo que se sub-rogue no preço**; pressuposta: "quitação integral dos débitos condominiais" | "em dia com as cotas", "não há débitos", "R$ 0,00" | com valor média, sem valor baixa; sempre revisão |
| iptu-em-atraso | dividas/iptu | "Há débitos de IPTU em aberto...", "Débitos fiscais (IPTU) ... em Dívida Ativa: R$...", "IPTU em atraso" (fora de cláusula genérica de isenção), **mesmo que se sub-rogue no preço** | "não há débitos", certidão negativa, "IPTU quitado" | idem |
| divida-passa-arrematante | dividas/passa-arrematante | dívida do imóvel + "por conta / a cargo / sob responsabilidade do arrematante" sem contrassinal **na mesma parte da cláusula** | sub-rogação no preço, isenção, art. 130 CTN, art. 908 §1º CPC, "não serão transferidos", "meramente informativos", arrematação originária, "livre de ônus" dito da venda | ficha da Caixa (regra dos 10%) alta sem revisão; resto média + revisão |
| acao-judicial | juridico/acao-judicial | ação anulatória/revisional/reivindicatória/possessória, embargos de terceiro, usucapião, fraude à execução (média); "imóvel objeto de ação", "ação judicial em curso" (baixa) | "não há ... processos pendentes" | sempre revisão; ação já julgada não conta |
| penhora-outros-credores | juridico/penhora | "Há outras penhoras", "penhoras em outros processos", "penhora no rosto dos autos" (média) | "não há outras penhoras" | média sem revisão; ato de matrícula "R.5 - Penhora" baixa + revisão (a penhora desta execução, "nestes autos", "exequenda", e ato cancelado não contam) |
| leilao-com-recurso | juridico/recurso | agravo, recurso pendente/interposto, efeito suspensivo, embargos à arrematação | "não há recursos pendentes" | baixa, sempre revisão |
| direito-preferencia | juridico/preferencia | modalidade "Leilão SFI" (alta); alienação fiduciária em venda extrajudicial (média); preferência atribuída a alguém ou venda com reserva de cota (art. 843) afirmada sobre o imóvel, no judicial (baixa + revisão) | venda direta/online/licitação da Caixa (média: a preferência acaba no 2º leilão) | — |
| matricula-pendencia | documentacao/matricula | "Há indisponibilidade/bloqueios", "objeto de HIPOTECA", "Imóvel com gravame", hipoteca/alienação "não baixada" (média); atos "R.12 Hipoteca", "AV.10 - INDISPONIBILIDADE" (baixa); averbação dos leilões negativos ≠ "Averbado" (baixa) | "não há registro de ônus" | sempre revisão; ato cancelado depois ("AV.6 Cancelamento da hipoteca do R.5") não conta |
| construcao-irregular | documentacao/construcao | benfeitoria/construção "não averbada", "sem habite-se", "irregular perante a prefeitura" (média); terreno "sem benfeitoria" na matrícula com construção constatada (baixa) | — (a regra não tem caminho de "não") | sempre revisão; com ressalva antes ou depois ("eventual", "se houver") não conta |
| area-divergente | documentacao/area | "divergência de área", "área não confere"; área do título fora da tolerância (10%) de todas as áreas dos campos | — (a regra não tem caminho de "não") | baixa, sempre revisão |
| imovel-inteiro | propriedade/objeto | "100% do imóvel", totalidade (média); venda extrajudicial de banco sem sinal (média); art. 843 (baixa + revisão); judicial com texto ≥ 150 caracteres e sem sinal (baixa + revisão) | sinal de cota ou de só direitos | texto curto no judicial: `desconhecido` |
| cota-parte | propriedade/objeto | título com "Fração de 50%", "Fração ideal 1/12", "Parte ideal"; "50% do imóvel", "fração ideal de 50% do bem", "metade ideal" | art. 843 (vende-se o inteiro); "100%"; banco vendendo imóvel próprio | média + revisão; fração ideal do terreno de unidade em condomínio não conta |
| so-direitos | propriedade/objeto | título "Direitos - ..." / "Direitos sobre casa" (alta); "direitos sobre o apartamento", "direitos do executado sobre o imóvel", direitos aquisitivos/possessórios (média + revisão); domínio útil, terreno de marinha, aforamento (média + revisão); nua-propriedade (baixa + revisão) | banco vendendo imóvel próprio | direitos de outra pessoa ("o arrematante exercerá todos os direitos", "o fiduciante perdeu seus direitos") não contam |
| sem-fotos | condicao/fotos | fonte publica fotos e a lista veio vazia, ou todas as fotos verificadas como ausentes (`ok = false`) | foto da API/ficha ou verificada | alta; fonte sem fotos ou só capa por padrão de URL não verificada: `desconhecido` |
| sem-vistoria | condicao/vistoria | "não foi possível vistoriar", "vistoria externa", "sem acesso ao interior", "avaliação feita externamente", "visitação não permitida" | laudo de vistoria entre os documentos; "vistoria realizada em...", "visitação permitida" | média + revisão; com condição depois ("sem agendamento prévio", "quando não for possível") não conta |
| aceita-financiamento | condicao/financiamento | campo `aceita_financiamento` (Caixa: coluna Financiamento) alta; "aceita financiamento" no texto (média + revisão) | campo `false`; "NÃO aceita financiamento", "exclusivamente à vista" | parcelamento judicial (art. 895) **não conta** |
| primeira-praca, segunda-praca | praca/rodada | `praca_atual` (do conector ou deduzida pelas datas) | as outras praças | média; só pelo título ("2º Leilão", "1ª Praça") baixa + revisão |
| praca-unica | praca/rodada | venda direta, venda online, licitação; praça 0 | — | média; LJ com `vl_lanceinicialsegundoleilao` nulo (`regra_praca = "seg_nulo"`): baixa + revisão, e 1ª/2ª ficam `desconhecido` |

## Decisões que se afastam do catálogo (e por quê)

- **"Imissão na posse" não é sinal de ocupado.** Está no texto-modelo de todo edital judicial ("o mandado de imissão na posse será expedido depois..."): daria ocupado em quase tudo.
- **Negação da informação não é negação da ocupação.** "Não há informações se o imóvel está ocupado" e "o leiloeiro não garante que o imóvel esteja desocupado" viram ressalva: a ocupação segue "não informada", e não "desocupado".
- **Sinal fraco não é informação.** Com só "desocupação por conta do adquirente" (texto-modelo da Lei 9.514) ou "atualmente servindo de depósito", "Ocupado" sai com confiança baixa e revisão, e "Ocupação não informada" continua `sim` (com revisão). As duas juntas vão para revisão pelo grupo exclusivo.
- **Benfeitoria não é ocupante.** "Terreno ocupado por edificação", "área ocupada pela construção" não dão "Ocupado". "Para a aquisição do imóvel ocupado" (edital da Caixa) também não: é adjetivo numa regra geral.
- **"Situação:" só conta com valor de ocupação.** "Situação: livre de ônus" e "Situação: vaga de garagem" não falam de posse.
- **"Remição" não é sinal de direito de preferência no judicial.** A remição da execução (art. 826 do CPC) existe em todo leilão judicial; só conta preferência atribuída a alguém ou o art. 843 afirmado sobre o imóvel (a regra condicional "caso o bem seja indivisível..." não conta).
- **Venda com reserva da cota do coproprietário (art. 843 do CPC) não é cota-parte.** Vende-se o imóvel inteiro e a cota é paga em dinheiro; mas o coproprietário tem preferência (art. 843, §1º). Visto num lote real (221879).
- **Fração ideal do terreno de unidade em condomínio não é cota-parte.** É a descrição padrão de apartamento ("cabendo-lhe a fração ideal de 2,5763% no terreno", "correspondendo-lhe a fração ideal de 2,0833% do terreno", "participação de 1,25% do terreno e coisas comuns"); apareceu em 5 dos 10 lotes da sonda. "50% do terreno" de um lote de terreno continua cota-parte.
- **Nua-propriedade vira "Só direitos" (baixa, revisão).** Quem arremata não leva o uso enquanto houver usufruto; não é exatamente "direitos de quem estava pagando", por isso a revisão.
- **"Desocupado" de texto sempre vai para revisão** (o site avisa que a situação muda) e **"Sem fotos" da Caixa só com HEAD**: a capa montada por padrão de URL (`F{id13}21.jpg`) sem verificação não prova nem a presença nem a ausência de foto.
- **"Preço acima do mercado" nunca sai "não"**: preço abaixo da avaliação não prova nada sobre o mercado.
- **Contrassinal de dívida vale só para a parte da cláusula em que está.** A cláusula é partida nos conectivos (", e os", "mas", "bem como", "assim como", ", cabendo..."). No regime atual dos editais (Tema 1.134/STJ para tributo, propter rem para condomínio) a mesma frase diz "o IPTU sub-roga-se no preço (CTN 130), e os débitos condominiais são do arrematante": sai "Dívida passa" = `sim` (revisão), pelo condomínio. Na mesma parte, o contrassinal vence ("ônus por conta do arrematante, exceto os débitos de IPTU, que se sub-rogam no preço").
- **Dívida declarada continua declarada quando se sub-roga.** "Há débitos de IPTU de R$ 8.000,00, que serão sub-rogados no preço" dá "IPTU em atraso" = `sim` e "Dívida passa" = `não`: a primeira diz que a dívida existe; a segunda, quem paga.
- **"Eventuais débitos" sem objeto não é dívida do imóvel** (lista de despesas de transferência); "eventuais débitos de condomínio a cargo do arrematante" é. "Débitos de IPTU até 2025" e "vencidos até a arrematação" sozinhos não declaram dívida (precisam de valor, "em aberto", "em atraso", "não pagos" ou inscrição em dívida ativa).
- **A regra de despesas da ficha da Caixa** ("Condomínio: sob responsabilidade do comprador, até 10% da avaliação") dá **Dívida passa ao arrematante** (alta), não "Condomínio em atraso" (diz quem paga, não que a dívida existe) nem "Custos extras" (é o padrão de toda ficha).
- **Custos extras pela cláusula de baixa de gravames** ("eventuais despesas cartorárias... inclusive a baixa de eventuais gravames... poderão ficar a cargo do arrematante", texto padrão do TRT-2) só quando o próprio texto declara gravames ("Há indisponibilidade", "Há outras penhoras"), com confiança baixa e revisão.
- **Ação já julgada não é ação em curso** ("por sentença proferida nos autos da ação de usucapião, transitada em julgado"; "embargos de terceiro julgados improcedentes").

## LGPD nos trechos

O trecho de evidência vai para a tabela `risco` e para o JSON exportado (`TagExportada.trecho`). Ele passa por duas máscaras:

1. A do núcleo (`mascararDadosPessoais`, em `util/lgpd.ts`), em todo texto: documentos, e-mail, IP e nomes depois de papel ("executada, Fulana", com dois-pontos, espaço ou vírgula), de frase de posse ("ocupado por/pelo", "Residem no imóvel", "locado a", "moradia para", "Ocupação Atual:"), de parentesco ("e sua irmã, Fulana") e antes de ", irmã do executado", ", ex-mutuário" ou "e família ocupam o imóvel".
2. A reforçada (`mascararNomesSoltos`), aplicada pelo motor aos trechos tirados do texto das tags de Posse e de qualquer tag cujo recorte pegue uma frase de ocupação: toda sequência de duas ou mais palavras com inicial maiúscula vira `[NOME]`, mesmo sem gatilho ("…está ocupado; Lúcia Ferreira Prado informou…"). Mascara de mais (nome de rua, de cidade) de propósito.

Os casos `lgpd-*` do corpus usam nomes inventados **sem** máscara e o teste confere que nenhum chega a trecho algum. Limite conhecido: nome em CAIXA ALTA sem gatilho nenhum perto (a máscara reforçada só pega inicial maiúscula com minúsculas) e a `descricao` do imóvel, que é exportada e usa só a máscara 1.

## Medição de falsos positivos (13/10/2026)

`node --experimental-strip-types base/riscos/medir.ts --caixa <csv> --lj <resposta.json>` (sem banco e sem rede; adaptadores mínimos, só o que as regras leem).

**CSV completo da Caixa de 08/10/2026 (21.226 imóveis, só campos do CSV):**

| Tag | sim | não | desconhecido |
|---|---|---|---|
| ocupacao-nao-informada | 21.226 (100%) | 0 | 0 |
| desagio-alto (≥ 40%) | 13.918 (65,6%) | 7.308 | 0 |
| desagio-baixo (< 20%) | 4.109 (19,4%) | 17.117 | 0 |
| preco-acima-mercado | 2.039 (9,6%, todas com revisão) | 0 | 19.187 |
| direito-preferencia | 4.567 (Leilão SFI) | 16.659 | 0 |
| aceita-financiamento | 2.468 | 18.758 | 0 |
| praca-unica | 16.659 | 0 | 4.567 (SFI: o CSV não diz a praça) |
| imovel-inteiro | 21.226 | 0 | 0 |
| cota-parte, so-direitos | 0 | 21.226 | 0 |
| sem-fotos | 0 | 0 | 21.226 (capa não verificada) |
| as 13 tags de texto (ocupado, desocupado, dívidas, jurídico, documentação, vistoria, custos) | **0** | 0 | 21.226 |

Nenhum "sim" de texto no CSV: a coluna Descrição só traz tipo, áreas e cômodos (o catálogo já media 0 linhas com ocupação, condomínio, IPTU, penhora, fração ou direitos). É uma medida fraca de falso positivo: o CSV não tem frase de risco. As contagens estruturadas batem com o catálogo (2.468/18.758 de financiamento; 4.567 SFI; 2.039 com preço acima da avaliação). Igual à medição de 12/10: as mudanças desta revisão são todas de texto.

**10 lotes reais da Leilões Judiciais (sonda de 11/10/2026):** 31 "sim" de texto, conferidos à mão um a um (os mesmos 31 da medição anterior).

- Corretos (25): ocupado 2 (218848 "Ocupam o imóvel..."; 218901 "Ocupação Atual: o próprio executado"), penhora 5, matrícula 6, condomínio 3, IPTU 1, dívida passa 3 (e 3 "não" por sub-rogação, corretos), construção irregular 2, custos extras 2 (217032: dívidas declaradas de 45% da avaliação; 220169: regularização das benfeitorias a cargo do arrematante), só direitos 1 (222069, título "Direitos - Apartamento").
- Discutíveis (6), todos marcados para revisão: ocupado 220169 ("atualmente servindo de depósito"; agora também "Ocupação não informada" com revisão, por ser sinal fraco), custos extras 3 (cláusula-padrão do TRT-2 de baixa de gravames, com gravames declarados), só direitos 221879 (nua-propriedade), preferência 221879 (art. 843 afirmado: "lance mínimo calculado ... reservando a cota parte do coproprietário").
- Falso positivo claro: 0. Falso negativo visto: 0.
- Sem fotos: 5 lotes (o catálogo diz "6 de 10", mas a própria lista [0, 5, 0, 4, 0, 0, 13, 0, 5, 24] tem 5 zeros).

A primeira versão (12/10) também foi conferida rodando os conectores de verdade (branches feat/base-caixa e feat/base-leiloesjudiciais, fixtures) + `riscos` numa cópia de integração, com as mesmas distribuições; nesta revisão a medição foi só com `medir.ts`.

## Corpus

98 casos (`corpus.ts`): **37 reais** (18 da Leilões Judiciais, 5 da Caixa — 3 fichas e 2 do edital de Licitação Aberta —, 14 de editais: minuta do TJPA, frases de 3 editais e um edital de vara cível de SP) e **61 construídos** (`real: false`), dos quais 10 de LGPD com nomes inventados sem máscara. `corpus.test.ts` exige, para cada tag de texto, caso positivo e caso sem sinal (`desconhecido`) e, nas tags cuja regra tem contrassinal, caso de `não`.

- **Tags cujo único caso positivo é construído** (o material real não trouxe a frase; lista conferida por teste em `SO_POSITIVO_CONSTRUIDO`): desocupado, acao-judicial, leilao-com-recurso, area-divergente, sem-vistoria, aceita-financiamento (pelo texto; pelo campo da Caixa há milhares).
- **Tags sem caminho de "não" na regra** (o dicionário não traz contrassinal): custos-extras-altos, construcao-irregular, area-divergente. Para elas o teste exige só positivo e `desconhecido`.

## Limites conhecidos

- Corpus pequeno: 10 lotes judiciais de SP (8 do TRT-2/TRT-15), 3 fichas e um edital da Caixa, 1 minuta e 2 editais de leilão judicial e frases de 3 editais. Faltam editais da Caixa de Leilão SFI, de bancos privados e de varas cíveis de outros estados.
- Regex não entende sintaxe: dupla negação, referência a outro imóvel do mesmo lote ("Lote c/ 03 imóveis") e texto de OCR podem enganar. Por isso quase tudo que vem de texto sai com revisão.
- Tags sem fonte estruturada hoje (ação judicial, recurso, vistoria, construção, área) dependem de o edital trazer a frase. DataJud (situação do processo) e o laudo de vistoria da Suporte Leilões não estão ligados.
- Limiares de deságio, comissão, dívida relevante e tolerância de área não foram validados (ver `config.ts`).

## Selo provisório: não implementado

Os critérios dos selos dependem do advogado parceiro. Quando existirem, o selo deve ser calculado **a partir das tags consolidadas** (`consolidarTags` em `../motor.ts`), nunca direto do texto, e só com tags revisadas ou de confiança alta. Nada aqui calcula selo.

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
| ocupado | posse/ocupacao | campo `ocupacao`; "imóvel (está/encontra-se) ocupado", "ocupado pelo/por", "Ocupam/Residem no imóvel", "Ocupação Atual: o próprio executado", imóvel invadido/locado | "desocupado" do outro lado; "não está ocupado" | campo alta; texto média; sinais fracos ("desocupação por conta do arrematante", "atualmente servindo de depósito") baixa + revisão |
| desocupado | posse/ocupacao | campo; "imóvel desocupado/vago/livre de pessoas", "Ocupação: desocupado" | ocupado | texto média, **sempre revisão** |
| ocupacao-nao-informada | posse/ocupacao | nenhum sinal de ocupação (CSV da Caixa: sempre) | qualquer sinal | alta ("a fonte não diz") |
| desagio-alto | preco/desagio | `desconto_pct` ≥ 40% | abaixo do limiar | Caixa alta, LJ média; `avaliacao_confere = false` → baixa + revisão |
| desagio-baixo | preco/desagio | `desconto_pct` < 20% (inclui preço acima da avaliação) | acima do limiar | idem |
| preco-acima-mercado | preco/acima-avaliacao | preço > avaliação | — (sem referência de mercado: `desconhecido`) | média, **sempre revisão**; > 3× a avaliação: baixa (provável erro de cadastro) |
| custos-extras-altos | preco/custos-extras | comissão > 5%; laudêmio/foro/terreno de marinha; regularização de construção a cargo do arrematante; baixa de gravames a cargo do arrematante **quando há gravames declarados**; dívidas que passam ≥ 10% da avaliação | — | baixa a média, sempre revisão |
| condominio-em-atraso | dividas/condominio | dívida declarada: "Há débitos de condomínio no valor de R$...", "Débito Condominial: R$...", "cotas em atraso"; pressuposta: "quitação integral dos débitos condominiais" | "em dia com as cotas", "não há débitos", "R$ 0,00" | com valor média, sem valor baixa; sempre revisão |
| iptu-em-atraso | dividas/iptu | "Há débitos de IPTU em aberto...", "IPTU em atraso", "inscrição na dívida ativa" (fora de cláusula de isenção) | "não há débitos", certidão negativa | idem |
| divida-passa-arrematante | dividas/passa-arrematante | cláusula com dívida do imóvel + "por conta / a cargo / sob responsabilidade do arrematante" sem contrassinal **na mesma cláusula** | sub-rogação no preço, isenção, art. 130 CTN, art. 908 §1º CPC, "não serão transferidos", "meramente informativos", arrematação originária | ficha da Caixa (regra dos 10%) alta sem revisão; resto média + revisão |
| acao-judicial | juridico/acao-judicial | ação anulatória/revisional/reivindicatória/possessória, embargos de terceiro, usucapião, fraude à execução (média); "imóvel objeto de ação", "ação judicial em curso" (baixa) | "não há ... processos pendentes" | sempre revisão |
| penhora-outros-credores | juridico/penhora | "Há outras penhoras", "penhoras em outros processos", "penhora no rosto dos autos" (média) | "não há outras penhoras" | média sem revisão; ato de matrícula "R.5 - Penhora" baixa + revisão |
| leilao-com-recurso | juridico/recurso | agravo, recurso pendente/interposto, efeito suspensivo, embargos à arrematação | "não há recursos pendentes" | baixa, sempre revisão |
| direito-preferencia | juridico/preferencia | modalidade "Leilão SFI" (alta); alienação fiduciária em venda extrajudicial (média); preferência atribuída a alguém ou venda com reserva de cota (art. 843) no judicial (baixa + revisão) | venda direta/online/licitação da Caixa (média: a preferência acaba no 2º leilão) | — |
| matricula-pendencia | documentacao/matricula | "Há indisponibilidade/bloqueios", "objeto de HIPOTECA", hipoteca/alienação "não baixada" (média); atos "R.12 Hipoteca", "AV.10 - INDISPONIBILIDADE" (baixa); averbação dos leilões negativos ≠ "Averbado" (baixa) | "não há registro de ônus" | sempre revisão |
| construcao-irregular | documentacao/construcao | benfeitoria/construção "não averbada", "sem habite-se", "irregular perante a prefeitura" (média); terreno "sem benfeitoria" na matrícula com construção constatada (baixa) | — | sempre revisão |
| area-divergente | documentacao/area | "divergência de área", "área não confere"; área do título fora da tolerância (10%) de todas as áreas dos campos | — | baixa, sempre revisão |
| imovel-inteiro | propriedade/objeto | "100% do imóvel", totalidade (média); venda extrajudicial de banco sem sinal (média); art. 843 (baixa + revisão); judicial com texto ≥ 150 caracteres e sem sinal (baixa + revisão) | sinal de cota ou de só direitos | texto curto no judicial: `desconhecido` |
| cota-parte | propriedade/objeto | título com "Fração de 50%", "Fração ideal 1/12", "Parte ideal"; "50% do imóvel", "fração ideal de 50% do bem", "metade ideal" | art. 843 (vende-se o inteiro); "100%"; banco vendendo imóvel próprio | média + revisão |
| so-direitos | propriedade/objeto | título "Direitos - ..." / "Direitos sobre casa" (alta); "direitos sobre o apartamento", direitos aquisitivos/possessórios (média); domínio útil, terreno de marinha, aforamento (média + revisão); nua-propriedade (baixa + revisão) | banco vendendo imóvel próprio | — |
| sem-fotos | condicao/fotos | fonte publica fotos e a lista veio vazia, ou todas as fotos verificadas como ausentes (`ok = false`) | foto da API/ficha ou verificada | alta; fonte sem fotos ou só capa por padrão de URL não verificada: `desconhecido` |
| sem-vistoria | condicao/vistoria | "não foi possível vistoriar", "vistoria externa", "sem acesso ao interior", "avaliação feita externamente", "visitação não permitida" | laudo de vistoria entre os documentos; "visitação permitida" | média + revisão |
| aceita-financiamento | condicao/financiamento | campo `aceita_financiamento` (Caixa: coluna Financiamento) alta; "aceita financiamento" no texto (média + revisão) | campo `false`; "NÃO aceita financiamento", "exclusivamente à vista" | parcelamento judicial (art. 895) **não conta** |
| primeira-praca, segunda-praca | praca/rodada | `praca_atual` (do conector ou deduzida pelas datas) | as outras praças | média; só pelo título ("2º Leilão") baixa + revisão |
| praca-unica | praca/rodada | venda direta, venda online, licitação; praça 0 | — | média; LJ com `vl_lanceinicialsegundoleilao` nulo (`regra_praca = "seg_nulo"`): baixa + revisão, e 1ª/2ª ficam `desconhecido` |

## Decisões que se afastam do catálogo (e por quê)

- **"Imissão na posse" não é sinal de ocupado.** Está no texto-modelo de todo edital judicial ("o mandado de imissão na posse será expedido depois..."): daria ocupado em quase tudo.
- **"Remição" não é sinal de direito de preferência no judicial.** A remição da execução (art. 826 do CPC) existe em todo leilão judicial; só conta preferência atribuída a alguém ou o art. 843.
- **Venda com reserva da cota do coproprietário (art. 843 do CPC) não é cota-parte.** Vende-se o imóvel inteiro e a cota é paga em dinheiro; mas o coproprietário tem preferência (art. 843, §1º). Visto num lote real (221879).
- **Fração ideal NO TERRENO não é cota-parte.** É a descrição padrão de apartamento ("cabendo-lhe a fração ideal de 2,5763% no terreno"); apareceu em 5 dos 10 lotes da sonda.
- **Nua-propriedade vira "Só direitos" (baixa, revisão).** Quem arremata não leva o uso enquanto houver usufruto; não é exatamente "direitos de quem estava pagando", por isso a revisão.
- **"Desocupado" de texto sempre vai para revisão** (o site avisa que a situação muda) e **"Sem fotos" da Caixa só com HEAD**: a capa montada por padrão de URL (`F{id13}21.jpg`) sem verificação não prova nem a presença nem a ausência de foto.
- **"Preço acima do mercado" nunca sai "não"**: preço abaixo da avaliação não prova nada sobre o mercado.
- **A regra de despesas da ficha da Caixa** ("Condomínio: sob responsabilidade do comprador, até 10% da avaliação") dá **Dívida passa ao arrematante** (alta), não "Condomínio em atraso" (diz quem paga, não que a dívida existe) nem "Custos extras" (é o padrão de toda ficha).
- **Custos extras pela cláusula de baixa de gravames** ("eventuais despesas cartorárias... inclusive a baixa de eventuais gravames... poderão ficar a cargo do arrematante", texto padrão do TRT-2) só quando o próprio texto declara gravames ("Há indisponibilidade", "Há outras penhoras"), com confiança baixa e revisão.

## Medição de falsos positivos (12/10/2026)

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

Nenhum "sim" de texto no CSV: a coluna Descrição só traz tipo, áreas e cômodos (o catálogo já media 0 linhas com ocupação, condomínio, IPTU, penhora, fração ou direitos). É uma medida fraca de falso positivo: o CSV não tem frase de risco. As contagens estruturadas batem com o catálogo (2.468/18.758 de financiamento; 4.567 SFI; 2.039 com preço acima da avaliação).

**10 lotes reais da Leilões Judiciais (sonda de 11/10/2026):** 31 "sim" de texto, conferidos à mão um a um.

- Corretos (25): ocupado 2 (218848 "Ocupam o imóvel..."; 218901 "Ocupação Atual: o próprio executado"), penhora 5, matrícula 6, condomínio 3, IPTU 1, dívida passa 3 (e 3 "não" por sub-rogação, corretos), construção irregular 2, custos extras 2 (217032: dívidas declaradas de 45% da avaliação; 220169: regularização das benfeitorias a cargo do arrematante), só direitos 1 (222069, título "Direitos - Apartamento").
- Discutíveis (6), todos marcados para revisão: ocupado 220169 ("atualmente servindo de depósito"), custos extras 3 (cláusula-padrão do TRT-2 de baixa de gravames, com gravames declarados), só direitos 221879 (nua-propriedade), preferência 221879 (art. 843).
- Falso positivo claro: 0. Falso negativo visto: 0 (depois de incluir "quitação integral dos débitos condominiais" como dívida pressuposta).
- Sem fotos: 5 lotes (o catálogo diz "6 de 10", mas a própria lista [0, 5, 0, 4, 0, 0, 13, 0, 5, 24] tem 5 zeros).

O mesmo resultado sai rodando os conectores de verdade (branches feat/base-caixa e feat/base-leiloesjudiciais, fixtures) + `riscos` numa cópia de integração: as distribuições coincidem e a ficha real da Caixa dá "Dívida passa ao arrematante" (alta) e não dá "Desocupado" (o "Situação: Desocupado" está em comentário HTML).

## Limites conhecidos

- Corpus pequeno: 10 lotes judiciais de SP (8 do TRT-2/TRT-15), 2 fichas da Caixa, 1 minuta de edital e frases de 3 editais. Faltam editais da Caixa (Leilão SFI, Licitação Aberta), de bancos privados e de varas cíveis de outros estados. Os casos marcados `real: false` são variações construídas para cobrir contrassinais que o material não trouxe.
- Regex não entende sintaxe: dupla negação, referência a outro imóvel do mesmo lote ("Lote c/ 03 imóveis") e texto de OCR podem enganar. Por isso quase tudo que vem de texto sai com revisão.
- Tags sem fonte estruturada hoje (ação judicial, recurso, vistoria, construção, área) dependem de o edital trazer a frase. DataJud (situação do processo) e o laudo de vistoria da Suporte Leilões não estão ligados.
- Limiares de deságio, comissão, dívida relevante e tolerância de área não foram validados (ver `config.ts`).

## Selo provisório: não implementado

Os critérios dos selos dependem do advogado parceiro. Quando existirem, o selo deve ser calculado **a partir das tags consolidadas** (`consolidarTags` em `../motor.ts`), nunca direto do texto, e só com tags revisadas ou de confiança alta. Nada aqui calcula selo.

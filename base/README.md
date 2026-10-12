# Base de imóveis da Luneta

Coleta, normaliza e guarda imóveis de leilão (e editais para o radar) num SQLite local, com histórico de preço, tags de risco com evidência e exportação em JSON para o site.

TypeScript executado direto pelo Node 22 (`--experimental-strip-types`), sem build e sem dependências: `node:sqlite`, `fetch`, `node:test`. O site (Next.js, em `src/`) não compila nada daqui.

## Como rodar

```bash
npm run base:migrar                                   # cria/atualiza base/dados/luneta.db
npm run base:coletar -- caixa_csv --uf AC             # coleta uma fonte (rede)
npm run base:coletar -- caixa_csv --arquivo lista.csv # mesma coisa, de arquivo local (sem rede)
npm run base:riscos                                   # roda as regras de risco
npm run base:exportar -- --saida /tmp/imoveis.json    # JSON para o site
npm run base:status                                   # contagens e última coleta de cada fonte
npm run base:testar                                   # testes
npx tsc -p base/tsconfig.json --noEmit && npx eslint base --max-warnings=0
```

Opções de `coletar`: `--uf`, `--arquivo` (ou `--fixture`), `--limite`, `--detalhes`. Em qualquer comando, `--banco <arquivo>` ou `LUNETA_DB` troca o banco; `LUNETA_USER_AGENT` troca o User-Agent. `base/dados/` é ignorada pelo git.

## Estrutura

```
base/
  tipos.ts            contratos: ImovelNormalizado, EditalNormalizado, Praca, Foto, Documento,
                      RiscoDetectado, Conector, ImovelGravado
  esquema.sql         esquema v1 (SQLite, portável para Postgres; notas no topo)
  db.ts               abrir, migrar (PRAGMA user_version), transacao()
  validar.ts          validarImovel / validarEdital (use nos testes dos conectores)
  gravar.ts           upsert transacional, histórico, remoção, editais
  coleta.ts           orquestra uma coleta: conector → validação → gravação → log
  consultas.ts        leitura em lote (para riscos e exportação)
  exportar.ts         JSON para o site
  status.ts           relatório
  cli.ts              linha de comando
  fontes/index.ts     registro de conectores (um import por conector)
  riscos/tags.ts      as 26 tags (slug estável, rótulo/categoria/severidade iguais ao site)
  riscos/motor.ts     interface de regra, avaliação, gravação e consolidação das tags
  riscos/evidencia.ts ferramentas para escrever regras (textos normalizados, recorte de trecho)
  riscos/regras/      regras das 26 tags, limiares (config.ts), corpus real de teste (corpus.ts)
  riscos/medir.ts     distribuição das tags sobre o CSV da Caixa e respostas da Leilões Judiciais
  util/               numero, data, texto, hash, dedup, lgpd, http, robots, csv, arquivo, uf, classificar
  testes/apoio.ts     banco em memória, imóvel de exemplo, conector falso
  migracoes/          (crie quando precisar) 002-descricao.sql, 003-...
```

## Contrato de um conector

Um conector por pasta, `base/fontes/<id>/index.ts`, registrado em `base/fontes/index.ts`.

```ts
import type { Conector } from "../../tipos.ts";
import { lerArquivoTexto } from "../../util/arquivo.ts";

export const minhaFonte: Conector<LinhaBruta> = {
  id: "minha_fonte",                 // slug estável: vira fonte.id
  nome: "Minha Fonte",
  tipo: "banco_publico",             // régua do catálogo de fontes
  acesso: "arquivo_oficial",
  finalidade: "vitrine",             // vitrine | radar | enriquecimento
  capacidades: { fotos: false, documentos: false, ocupacao: false, listaCompleta: true },
  volumeMinimo: 1000,                // abaixo disso a coleta completa é recusada
  async *coletar(op) {
    const texto = op.arquivo
      ? await lerArquivoTexto(op.arquivo)
      : await op.http.texto(URL, { validar: (r) => (r.texto.startsWith("Lista de Im") ? null : "assinatura ausente") });
    op.informar({ geradoEm: "2026-10-08", origem: op.arquivo ?? URL });
    for (const linha of interpretar(texto)) yield linha;
  },
  normalizar(bruto) {
    return { registro: "imovel", id_na_fonte: bruto.id, /* ... */ pracas: [], fotos: [], documentos: [] };
  },
};
```

- `coletar` lê os registros brutos, da rede (sempre por `op.http`) ou de `op.arquivo`. Valida o conteúdo (assinatura, formato, volume) e **lança erro** se vier uma página de bloqueio ou um arquivo truncado. Não grava nada.
- `normalizar` converte um registro: devolve `null` para descartar (fora de escopo) e lança erro só se o registro estiver quebrado. Sem rede, sem banco.
- Datas: `AAAA-MM-DD` ou ISO UTC (`util/data.ts` converte "08/10/2026 10:00" de Brasília). Dinheiro em reais, áreas em m². Campo que a fonte não informa fica `null`.
- `preco` = valor mínimo vigente; se faltar, o núcleo usa a praça atual. `praca_atual` é deduzida pelas datas se faltar; com `praca_incerta: true` (a fonte não diz qual praça vale), ela fica `null` e, havendo uma praça só, a data dela vai para `data_praca`. O desconto é sempre calculado pelo núcleo (preço × avaliação), nunca copiado da fonte.
- Fotos e documentos: só a URL da fonte, com `origem` ("api", "ficha", "padrao_url") e, quando houver, `verificada_em`/`ok`. Nada é baixado.
- Utilitários prontos: `lerNumeroBR`, `lerDataBR`/`lerDataHoraBR`, `semHtml`, `capitalizarNome`, `normalizarUf`, `inferirTipoImovel`, `classificarModalidade`, `lerCsv`, `decodificar` (CP1252 correto; o `TextDecoder("windows-1252")` do Node 22 erra os bytes 0x80–0x9F).
- Teste com `validarImovel` e com o conector rodando sobre uma fixture pequena (dados pessoais mascarados), sem rede.

## O que o núcleo garante

- **Nada é gravado se a coleta falhar.** Tudo é lido e validado em memória e gravado numa transação só. Coleta com erro, sem registros, com mais de 5% de registros inválidos (até 2 sempre passam), abaixo do `volumeMinimo` ou com arquivo mais antigo que o último gravado vira `invalida`/`erro` no log e não toca nos dados. Exceção: fonte sem lista completa (radar, busca por janela) que respondeu normalmente e não tinha nada no período informa `vazioLegitimo: true` e a coleta vazia fecha como `sucesso` (ex.: domingo sem DOU, PNCP respondendo 204).
- **Imóveis nunca são apagados.** Numa coleta completa e válida (`listaCompleta`, sem `--limite`, sem falha de normalização), o que estava ativo e sumiu vira `removido` (só dentro da UF com `--uf`). Se mais de 50% dos ativos sumirem de uma vez, a remoção é bloqueada e fica um aviso (o conector pode mudar o limite com `maxFracaoRemocao`). Quem reaparece é reativado.
- **Histórico** (`preco_historico`): uma linha quando o imóvel entra e a cada mudança de preço, avaliação, modalidade, praça ou status.
- **Geração da fonte**: um imóvel gravado a partir de um arquivo mais novo nunca é alterado, reativado nem removido por um arquivo mais antigo (ex.: CSV geral da Caixa, que atrasa um dia em relação ao da UF).
- **Deduplicação**: `chave_dedup` (matrícula + cartório, senão endereço) e `chave_endereco` (endereço normalizado + cidade + UF) em todo imóvel.
- **Coleta educada** (`util/http.ts`): User-Agent `LunetaDeLeiloes/0.1 (+contato)`, timeout (30 s por tentativa, com o corpo; ajustável por requisição com `timeoutMs`, para arquivos grandes), até 3 tentativas com espera exponencial e `Retry-After`, 2 s entre requisições ao mesmo host (mais, se o `Crawl-delay` pedir), robots.txt respeitado (RFC 9309: robots inacessível por erro do servidor bloqueia por precaução), limite de tamanho e validação antes de devolver. Não contorna anti-robô.

## Regras de risco

`riscos/regras/index.ts` lista as regras; cada uma é um `RegraRisco` (`riscos/motor.ts`): recebe o imóvel gravado e os textos prontos para regex e devolve tags com valor (`sim`/`nao`/`desconhecido`), confiança, origem, trecho e `precisa_revisao`. Escreva os regex em minúsculas e sem acento e use `buscar`/`buscarPrimeira` de `riscos/evidencia.ts` para recortar a evidência. O motor confere a tag, mascara o trecho, marca para revisão tags conflitantes (ex.: ocupado e desocupado) e nunca sobrescreve linhas revisadas por humano. Não marque "Sem fotos" quando `fonte.capacidades.fotos` for `false`. Para testar uma regra sem banco: `avaliarImovel(entradaPara(imovelDeTeste(normalizado), fonte), [regra])`.

As 26 tags já têm regra (uma regra por tag, que olha campo e texto juntos). Todo imóvel recebe as 26 linhas: `sim` com evidência, `nao` com contrassinal ou campo da fonte, `desconhecido` quando a fonte não informa; a exportação leva só as `sim`. Critérios, decisões, limites e a medição de falsos positivos: `riscos/regras/README.md`. Para medir uma mudança de regra sem banco:

```bash
node --experimental-strip-types base/riscos/medir.ts --caixa Lista_imoveis_geral.csv --lj resposta_search_leiloes.json
```

O que os conectores podem preencher para as regras: `ocupacao` (campo estruturado), `textos` com origem `ficha`, `edital`, `titulo_leilao`, `alerta`; `extras.regra_praca` ("seg_nulo" = praça única ou desconhecida), `extras.avaliacao_confere` (false rebaixa o deságio), `extras.averbacao_leiloes_negativos`; fotos com `ok`/`verificada_em`; documento com "vistoria" no título. Selo provisório: não existe ainda (critérios dependem do advogado).

## Banco

Tabelas: `fonte`, `coleta` (log de cada execução), `imovel`, `praca`, `preco_historico`, `foto`, `documento`, `risco`, `edital`, mais `imovel_busca`/`edital_busca` (FTS5, sem acento). Migrações: `esquema.sql` é a versão 1 e não muda mais depois de publicado; cada mudança nova vai em `base/migracoes/NNN-descricao.sql` (002, 003...) e `migrar` aplica em ordem, cada uma na sua transação. `002-edital-documentos.sql` acrescenta `edital.documentos` (JSON com os links dos arquivos do edital); uma coleta que não consulta os arquivos (`documentos` ausente) mantém os gravados. O topo de `esquema.sql` diz como portar para Postgres.

## LGPD

- Nunca mapear nome, CPF/CNPJ, e-mail ou IP de devedor, executado, exequente, depositário, licitante ou arrematante (ex.: `nm_usuario`, `id_usuario`, lances com IP).
- O núcleo limpa e mascara (`util/lgpd.ts`) título, descrição, textos extras, resumos de edital e trechos de evidência antes de gravar: CPF, CNPJ, RG, e-mail e IP viram `[CPF]`, `[CNPJ]`, `[RG]`, `[E-MAIL]`, `[IP]`; nomes depois de papéis ("Executado:", "devedor fiduciante", "em face de", "Sr."...), de quem ganhou o leilão ("arrematado por", "adjudicado a", "adquirido por", "vencedor"), de frases de ocupação ("ocupado por", "na posse de", "locado para", "reside no imóvel") e partes em "FULANO x BELTRANO" viram `[NOME]`. É heurística e prefere mascarar demais.
- Endereço, bairro, cartório, matrícula e comitente **não** passam pela máscara de nomes (só pela de documentos, no comitente). Se o conector tira esses campos de texto livre, ele mesmo precisa garantir que não levam nomes (ver `campoSemPessoa` no conector da Leilões Judiciais).
- Registros brutos não são guardados. Fixtures commitadas devem ser pequenas e já mascaradas.
- Dados com `ai-train=no` (Leilões Judiciais) não podem treinar modelos.

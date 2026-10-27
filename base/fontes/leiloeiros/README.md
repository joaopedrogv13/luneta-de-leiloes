# Conector `leiloeiros_arquivo` (apelido `leiloeiros`)

Importa o JSONL dos coletores dos leiloeiros: `npm run base:coletar -- leiloeiros --arquivo saida.jsonl`. Só lê
arquivo local; quem lê os sites é o coletor. O arquivo se desdobra em uma fonte por leiloeiro (`ll_<slug>`), cada uma
com a própria coleta, data de geração e remoção.

- `index.ts`: o conector, o `desdobrar` e o agrupamento por leiloeiro;
- `normalizar.ts`: linha do JSONL → `ImovelNormalizado` (o mesmo exame do validador; LGPD; frases de dívida e comissão
  para as regras de tag; extras que o site usa);
- `fixtures/tres-leiloeiros.jsonl`: 12 lotes fictícios de 3 leiloeiros (sem avaliação, praça única, judicial com
  processo, endereço só em texto, vendido, suspenso, cancelado, carga incompleta);
- `leiloeiros.test.ts`: normalização, importação ponta a ponta, remoção, carga velha, coletor bloqueado, tags,
  deduplicação com a Caixa, exportação e relatório.

Contrato, validador, relatório, decisões e próximos passos: [`base/leiloeiros/README.md`](../../leiloeiros/README.md).

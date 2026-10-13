-- Arquivos do edital do radar (ex.: /arquivos do PNCP): só links da fonte, sem download.
-- JSON: [{"tipo": "edital|matricula|laudo|avaliacao|outro", "titulo": ..., "url": ..., "publicado_em": ...}].
-- NULL = a fonte nunca foi consultada sobre os arquivos; '[]' = consultada, sem arquivos.
-- Uma coleta que não consulta os arquivos mantém o que já estava gravado.
ALTER TABLE edital ADD COLUMN documentos TEXT;

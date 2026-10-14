-- Site do leilão (leiloeiro ou plataforma) de um edital do radar: o lugar onde se dá o lance.
-- Vem do texto do aviso ("leilão eletrônico pelo site www...") ou da fonte (PNCP: linkSistemaOrigem).
-- `url` continua sendo o documento oficial (diário, DOU, comunicação do PJe, compra no PNCP).
-- NULL = o texto não cita um site que sirva. Uma coleta sem site mantém o que já estava gravado.
ALTER TABLE edital ADD COLUMN site_leilao TEXT;

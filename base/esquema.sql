-- Esquema da base da Luneta de Leilões: versão 1 (PRAGMA user_version = 1).
--
-- Executado por base/db.ts dentro de uma transação. Mudanças futuras NÃO editam este arquivo:
-- vão em base/migracoes/NNN-descricao.sql (NNN >= 002), aplicadas em ordem pelo db.ts.
--
-- Portabilidade para Postgres (o resto é SQL comum):
-- - INTEGER PRIMARY KEY  → BIGINT GENERATED ALWAYS AS IDENTITY
-- - REAL (dinheiro)      → NUMERIC(14,2); REAL (área, coordenada) → DOUBLE PRECISION
-- - INTEGER 0/1 com CHECK → BOOLEAN
-- - TEXT com data ISO    → TIMESTAMPTZ (data-hora) ou DATE (só dia)
-- - TEXT com JSON        → JSONB
-- - bloco FTS5 no fim    → coluna tsvector com unaccent + índice GIN
--
-- Convenções: datas em ISO 8601 ("AAAA-MM-DD" para dia, UTC com "Z" para data e hora);
-- dinheiro em reais; áreas em m². Nenhuma tabela guarda nome, CPF/CNPJ de pessoa física,
-- e-mail ou IP de partes, devedores, depositários ou licitantes (LGPD).

-- Fontes de dados (um conector por linha).
CREATE TABLE IF NOT EXISTS fonte (
  id                  TEXT PRIMARY KEY,               -- slug estável do conector, ex.: caixa_csv
  nome                TEXT NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('agregador','banco_privado','banco_publico','governo','judicial','leiloeiro','plataforma','outro')),
  acesso              TEXT NOT NULL CHECK (acesso IN ('api_documentada','arquivo_oficial','dados_abertos','endpoint_interno','html','desconhecido')),
  finalidade          TEXT NOT NULL CHECK (finalidade IN ('vitrine','radar','enriquecimento')),
  url                 TEXT,
  publica_fotos       INTEGER NOT NULL DEFAULT 0 CHECK (publica_fotos IN (0,1)),
  publica_documentos  INTEGER NOT NULL DEFAULT 0 CHECK (publica_documentos IN (0,1)),
  informa_ocupacao    INTEGER NOT NULL DEFAULT 0 CHECK (informa_ocupacao IN (0,1)),
  lista_completa      INTEGER NOT NULL DEFAULT 0 CHECK (lista_completa IN (0,1)),
  criada_em           TEXT NOT NULL,
  atualizada_em       TEXT NOT NULL
);

-- Log de cada execução de coleta.
-- status: executando | sucesso (gravou) | parcial (gravou com ressalvas, sem marcar removidos)
--         | invalida (conteúdo reprovado, nada gravado) | erro (falha, nada gravado).
CREATE TABLE IF NOT EXISTS coleta (
  id                  INTEGER PRIMARY KEY,
  fonte_id            TEXT NOT NULL REFERENCES fonte(id),
  iniciada_em         TEXT NOT NULL,
  terminada_em        TEXT,
  status              TEXT NOT NULL CHECK (status IN ('executando','sucesso','parcial','invalida','erro')),
  completa            INTEGER NOT NULL DEFAULT 0 CHECK (completa IN (0,1)),  -- marcou removidos?
  escopo_uf           TEXT,                           -- UF pedida (--uf), ou NULL para a fonte toda
  parametros          TEXT,                           -- JSON: arquivo, limite, detalhes
  origem              TEXT,                           -- URL ou arquivo lido
  gerado_na_fonte_em  TEXT,                           -- data de geração declarada pela fonte
  lidos               INTEGER NOT NULL DEFAULT 0,     -- registros brutos lidos
  descartados         INTEGER NOT NULL DEFAULT 0,     -- fora de escopo (normalizar devolveu null)
  invalidos           INTEGER NOT NULL DEFAULT 0,     -- erro de normalização ou validação
  novos               INTEGER NOT NULL DEFAULT 0,
  atualizados         INTEGER NOT NULL DEFAULT 0,
  inalterados         INTEGER NOT NULL DEFAULT 0,
  reativados          INTEGER NOT NULL DEFAULT 0,
  removidos           INTEGER NOT NULL DEFAULT 0,
  antigos             INTEGER NOT NULL DEFAULT 0,     -- ignorados: o gravado veio de geração mais nova
  editais             INTEGER NOT NULL DEFAULT 0,
  erro                TEXT,
  avisos              TEXT                            -- JSON: lista de avisos
);
CREATE INDEX IF NOT EXISTS coleta_fonte ON coleta (fonte_id, iniciada_em);

-- Imóveis. Nunca são apagados: o que some da fonte vira status 'removido'.
CREATE TABLE IF NOT EXISTS imovel (
  id                    INTEGER PRIMARY KEY,
  fonte_id              TEXT NOT NULL REFERENCES fonte(id),
  id_na_fonte           TEXT NOT NULL,
  url                   TEXT NOT NULL,
  titulo                TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('apartamento','casa','terreno','comercial','rural','vaga','outro')),
  uf                    TEXT NOT NULL CHECK (length(uf) = 2),
  cidade                TEXT NOT NULL,
  cidade_norm           TEXT NOT NULL,                -- slug da cidade, para filtro e agrupamento
  bairro                TEXT,
  endereco              TEXT,
  cep                   TEXT CHECK (cep IS NULL OR length(cep) = 8),
  lat                   REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lon                   REAL CHECK (lon IS NULL OR lon BETWEEN -180 AND 180),
  precisao_geo          TEXT CHECK (precisao_geo IS NULL OR precisao_geo IN ('exata','rua','cep','bairro','cidade')),
  area_total            REAL,
  area_privativa        REAL,
  area_terreno          REAL,
  quartos               INTEGER,
  vagas                 INTEGER,
  descricao             TEXT,                         -- texto limpo e mascarado (LGPD)
  textos                TEXT,                         -- JSON [{origem, texto}] mascarado, para as regras
  extras                TEXT,                         -- JSON {campo: valor} da fonte
  modalidade            TEXT NOT NULL CHECK (modalidade IN ('leilao','venda_direta','venda_online','licitacao_aberta','outro')),
  modalidade_fonte      TEXT,
  judicial              INTEGER CHECK (judicial IS NULL OR judicial IN (0,1)),
  aceita_financiamento  INTEGER CHECK (aceita_financiamento IS NULL OR aceita_financiamento IN (0,1)),
  aceita_fgts           INTEGER CHECK (aceita_fgts IS NULL OR aceita_fgts IN (0,1)),
  aceita_parcelamento   INTEGER CHECK (aceita_parcelamento IS NULL OR aceita_parcelamento IN (0,1)),
  ocupacao              TEXT CHECK (ocupacao IS NULL OR ocupacao IN ('ocupado','desocupado')),
  leiloeiro             TEXT,
  comitente             TEXT,
  numero_processo       TEXT,
  matricula             TEXT,
  cartorio              TEXT,
  valor_avaliacao       REAL,
  preco                 REAL,                         -- valor mínimo vigente
  desconto_pct          REAL,                         -- 100 * (1 - preco/avaliacao); negativo se preço > avaliação
  praca_atual           INTEGER CHECK (praca_atual IS NULL OR praca_atual IN (0,1,2,3)),
  data_praca            TEXT,                         -- data da praça atual (próxima, ou a última se todas passaram)
  status                TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado','removido')),
  primeira_vez_em       TEXT NOT NULL,
  ultima_vez_em         TEXT NOT NULL,                -- última coleta em que apareceu
  atualizado_em         TEXT NOT NULL,                -- última mudança de conteúdo
  gerado_na_fonte_em    TEXT,                         -- data de geração do dado gravado (nunca troca por um mais antigo)
  removido_em           TEXT,
  hash_conteudo         TEXT NOT NULL,
  chave_dedup           TEXT,                         -- matrícula+cartório, senão endereço
  chave_endereco        TEXT,                         -- endereço normalizado+cidade+UF
  UNIQUE (fonte_id, id_na_fonte)
);
-- Filtros do site: sempre por status e mais um critério.
CREATE INDEX IF NOT EXISTS imovel_uf_cidade ON imovel (status, uf, cidade_norm);
CREATE INDEX IF NOT EXISTS imovel_tipo ON imovel (status, tipo, uf);
CREATE INDEX IF NOT EXISTS imovel_desconto ON imovel (status, desconto_pct);
CREATE INDEX IF NOT EXISTS imovel_preco ON imovel (status, preco);
CREATE INDEX IF NOT EXISTS imovel_data_praca ON imovel (status, data_praca);
CREATE INDEX IF NOT EXISTS imovel_modalidade ON imovel (status, modalidade);
CREATE INDEX IF NOT EXISTS imovel_fonte_status ON imovel (fonte_id, status);
CREATE INDEX IF NOT EXISTS imovel_chave_dedup ON imovel (chave_dedup);
CREATE INDEX IF NOT EXISTS imovel_chave_endereco ON imovel (chave_endereco);

-- Praças do leilão (ou a oferta única, número 0). Refletem o estado atual da fonte.
CREATE TABLE IF NOT EXISTS praca (
  imovel_id     INTEGER NOT NULL REFERENCES imovel(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL CHECK (numero IN (0,1,2,3)),
  data          TEXT,
  valor_minimo  REAL,
  PRIMARY KEY (imovel_id, numero)
);
CREATE INDEX IF NOT EXISTS praca_data ON praca (data);

-- Histórico: uma linha por imóvel novo e a cada mudança de preço, avaliação, modalidade,
-- praça ou status. Cada linha é o retrato a partir de `registrado_em`.
CREATE TABLE IF NOT EXISTS preco_historico (
  id               INTEGER PRIMARY KEY,
  imovel_id        INTEGER NOT NULL REFERENCES imovel(id) ON DELETE CASCADE,
  coleta_id        INTEGER REFERENCES coleta(id),
  registrado_em    TEXT NOT NULL,
  evento           TEXT NOT NULL CHECK (evento IN ('novo','mudanca','removido','reativado')),
  campos           TEXT,                              -- campos que mudaram, separados por vírgula
  preco            REAL,
  valor_avaliacao  REAL,
  modalidade       TEXT,
  praca_atual      INTEGER,
  status           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS preco_historico_imovel ON preco_historico (imovel_id, registrado_em);

-- Fotos: só a URL na fonte (sem download nem re-hospedagem), com a verificação.
CREATE TABLE IF NOT EXISTS foto (
  id             INTEGER PRIMARY KEY,
  imovel_id      INTEGER NOT NULL REFERENCES imovel(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  ordem          INTEGER NOT NULL DEFAULT 0,
  tamanho        TEXT,
  origem         TEXT NOT NULL,                       -- api | ficha | padrao_url ...
  verificada_em  TEXT,
  ok             INTEGER CHECK (ok IS NULL OR ok IN (0,1)),  -- NULL = não verificada
  UNIQUE (imovel_id, url)
);

-- Documentos publicados pela fonte (link, sem download).
CREATE TABLE IF NOT EXISTS documento (
  id            INTEGER PRIMARY KEY,
  imovel_id     INTEGER NOT NULL REFERENCES imovel(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('edital','matricula','laudo','avaliacao','outro')),
  titulo        TEXT,
  url           TEXT NOT NULL,
  publicado_em  TEXT,
  UNIQUE (imovel_id, url)
);

-- Tags de risco com evidência. Linhas revisadas por humano (revisado_por preenchido) nunca
-- são sobrescritas pelo motor; as automáticas são refeitas a cada `riscos`.
CREATE TABLE IF NOT EXISTS risco (
  id               INTEGER PRIMARY KEY,
  imovel_id        INTEGER NOT NULL REFERENCES imovel(id) ON DELETE CASCADE,
  tag              TEXT NOT NULL,                     -- slug de base/riscos/tags.ts
  valor            TEXT NOT NULL CHECK (valor IN ('sim','nao','desconhecido')),
  confianca        TEXT NOT NULL CHECK (confianca IN ('alta','media','baixa')),
  precisa_revisao  INTEGER NOT NULL DEFAULT 0 CHECK (precisa_revisao IN (0,1)),
  origem           TEXT NOT NULL,                     -- campo:..., descricao, ficha, edital...
  trecho           TEXT,                              -- evidência já mascarada (LGPD)
  regra            TEXT NOT NULL,                     -- id da regra, ou 'manual'
  detectado_em     TEXT NOT NULL,
  revisado_por     TEXT,                              -- identificador interno do revisor
  revisado_em      TEXT,
  UNIQUE (imovel_id, tag, regra)
);
CREATE INDEX IF NOT EXISTS risco_tag ON risco (tag, valor);

-- Editais e avisos para o radar (PNCP, DJEN, DOU, Querido Diário...).
CREATE TABLE IF NOT EXISTS edital (
  id               INTEGER PRIMARY KEY,
  fonte_id         TEXT NOT NULL REFERENCES fonte(id),
  id_na_fonte      TEXT NOT NULL,
  titulo           TEXT NOT NULL,
  orgao            TEXT,
  uf               TEXT CHECK (uf IS NULL OR length(uf) = 2),
  cidade           TEXT,
  cidade_norm      TEXT,
  publicado_em     TEXT,
  data_leilao      TEXT,
  url              TEXT NOT NULL,
  resumo           TEXT,                              -- texto resumido e mascarado
  imovel_id        INTEGER REFERENCES imovel(id),
  primeira_vez_em  TEXT NOT NULL,
  ultima_vez_em    TEXT NOT NULL,
  hash_conteudo    TEXT NOT NULL,
  UNIQUE (fonte_id, id_na_fonte)
);
CREATE INDEX IF NOT EXISTS edital_uf_data ON edital (uf, publicado_em);
CREATE INDEX IF NOT EXISTS edital_imovel ON edital (imovel_id);

-- [Somente SQLite] Busca textual (FTS5, sem acento). Em Postgres: tsvector + GIN.
CREATE VIRTUAL TABLE IF NOT EXISTS imovel_busca USING fts5(
  titulo, descricao, endereco, bairro, cidade,
  content = 'imovel', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS imovel_busca_ai AFTER INSERT ON imovel BEGIN
  INSERT INTO imovel_busca (rowid, titulo, descricao, endereco, bairro, cidade)
  VALUES (new.id, new.titulo, new.descricao, new.endereco, new.bairro, new.cidade);
END;
CREATE TRIGGER IF NOT EXISTS imovel_busca_ad AFTER DELETE ON imovel BEGIN
  INSERT INTO imovel_busca (imovel_busca, rowid, titulo, descricao, endereco, bairro, cidade)
  VALUES ('delete', old.id, old.titulo, old.descricao, old.endereco, old.bairro, old.cidade);
END;
CREATE TRIGGER IF NOT EXISTS imovel_busca_au AFTER UPDATE OF titulo, descricao, endereco, bairro, cidade ON imovel BEGIN
  INSERT INTO imovel_busca (imovel_busca, rowid, titulo, descricao, endereco, bairro, cidade)
  VALUES ('delete', old.id, old.titulo, old.descricao, old.endereco, old.bairro, old.cidade);
  INSERT INTO imovel_busca (rowid, titulo, descricao, endereco, bairro, cidade)
  VALUES (new.id, new.titulo, new.descricao, new.endereco, new.bairro, new.cidade);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS edital_busca USING fts5(
  titulo, orgao, resumo, cidade,
  content = 'edital', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS edital_busca_ai AFTER INSERT ON edital BEGIN
  INSERT INTO edital_busca (rowid, titulo, orgao, resumo, cidade)
  VALUES (new.id, new.titulo, new.orgao, new.resumo, new.cidade);
END;
CREATE TRIGGER IF NOT EXISTS edital_busca_ad AFTER DELETE ON edital BEGIN
  INSERT INTO edital_busca (edital_busca, rowid, titulo, orgao, resumo, cidade)
  VALUES ('delete', old.id, old.titulo, old.orgao, old.resumo, old.cidade);
END;
CREATE TRIGGER IF NOT EXISTS edital_busca_au AFTER UPDATE OF titulo, orgao, resumo, cidade ON edital BEGIN
  INSERT INTO edital_busca (edital_busca, rowid, titulo, orgao, resumo, cidade)
  VALUES ('delete', old.id, old.titulo, old.orgao, old.resumo, old.cidade);
  INSERT INTO edital_busca (rowid, titulo, orgao, resumo, cidade)
  VALUES (new.id, new.titulo, new.orgao, new.resumo, new.cidade);
END;

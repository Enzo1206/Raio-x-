CREATE TABLE IF NOT EXISTS analises (
  username TEXT PRIMARY KEY,
  estado TEXT NOT NULL,
  run_id TEXT,
  dados TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  respostas TEXT NOT NULL,
  origem TEXT,
  consentimento_em TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- Uma linha por pedido de coleta: controla o limite do mês (pago = 1) e o limite por IP.
CREATE TABLE IF NOT EXISTS inicios (
  ip_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  pago INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS inicios_criado ON inicios (criado_em);

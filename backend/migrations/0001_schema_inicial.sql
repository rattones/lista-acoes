-- Schema inicial (tarefa 010), a partir de .context/SCHEMA.sql com os ajustes:
-- exclusão lógica em todas as tabelas (excluido_em: NULL = registro ativo), sinais ligados
-- a ativos por ativo_id, ativos.status no lugar de monitorar, e as tabelas precos_diarios,
-- noticias e agentes_tokens. Convites e recuperação de senha não têm tabela (links sem estado).
-- Datas em TEXT no horário local: 'AAAA-MM-DD' ou 'AAAA-MM-DD HH:MM:SS'.

-- Lista de ativos monitorados, com links de dados acessíveis sem login nem chave de API
CREATE TABLE ativos (
  id             INTEGER PRIMARY KEY,
  ativo          TEXT NOT NULL UNIQUE,           -- como no relatório (PETR4, USDT-BRL)
  nome           TEXT,
  tipo           TEXT NOT NULL CHECK (tipo IN ('acao','etf','moeda','cripto','stablecoin','indice')),
  bolsa          TEXT,                           -- NASDAQ, NYSE, BVMF...
  ticker_google  TEXT,                           -- TICKER:BOLSA do Google Finance
  ticker_yahoo   TEXT,                           -- usado nos indicadores técnicos
  url_historico  TEXT NOT NULL,                  -- API JSON com histórico diário (indicadores)
  url_cotacao    TEXT,                           -- API JSON alternativa, cotação atual
  url_pagina     TEXT,                           -- página para leitura humana
  status         TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),  -- ativo = entra no relatório
  adicionado_em  TEXT NOT NULL DEFAULT (date('now','localtime')),
  observacao     TEXT,
  excluido_em    TEXT
);

-- Execuções do relatório (uma por dia)
CREATE TABLE execucoes (
  id              INTEGER PRIMARY KEY,
  data_execucao   TEXT NOT NULL UNIQUE,      -- dia em que o relatório foi gerado
  fonte_lista     TEXT NOT NULL,             -- google_finance | lista_salva
  lista_lida_em   TEXT,                      -- data da leitura da Lista de interesses
  relatorio_url   TEXT,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  excluido_em     TEXT
);

-- Sinais por ativo em cada execução, gravados pelo agente de decisão
CREATE TABLE sinais (
  id                  INTEGER PRIMARY KEY,
  execucao_id         INTEGER NOT NULL REFERENCES execucoes(id) ON DELETE CASCADE,
  ativo_id            INTEGER NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
  ativo               TEXT NOT NULL,          -- código como na lista (PETR4), para leitura
  ticker_yahoo        TEXT NOT NULL,          -- ticker usado nos indicadores (PETR4.SA, BRL=X)
  bolsa               TEXT,
  tipo                TEXT,                   -- acao | moeda | cripto | stablecoin
  referencia          TEXT,                   -- observação quando o ticker é substituto
  data_preco          TEXT NOT NULL,          -- data do fechamento usado
  moeda               TEXT,
  fechamento          REAL,
  -- leitura e nota
  noticias            TEXT NOT NULL CHECK (noticias IN ('positivo','misto_pos','misto','misto_neg','negativo')),
  grafico             TEXT NOT NULL CHECK (grafico IN ('alta','lateral','recuperacao','baixa')),
  pontos_noticias     REAL NOT NULL,
  pontos_grafico      REAL NOT NULL,
  pontos_extremos     REAL NOT NULL,          -- ajuste por IFR/%B
  soma                REAL NOT NULL,
  nota                INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
  concordam           INTEGER NOT NULL,       -- 1 = notícias e gráfico concordam
  tendencia           TEXT,
  proximo_evento      TEXT,
  proximo_evento_data TEXT,
  destaque            TEXT,
  -- indicadores técnicos
  ret_5d REAL, ret_1m REAL, ret_3m REAL, ret_6m REAL, ret_1a REAL,
  mm20 REAL, mm50 REAL, mm200 REAL,
  dist_mm20 REAL, dist_mm50 REAL, dist_mm200 REAL,
  mm50_subindo INTEGER, mm200_subindo INTEGER,
  rsi14 REAL, macd REAL, macd_sinal REAL, macd_hist REAL,
  bollinger_pctb REAL, max_52s REAL, min_52s REAL,
  dist_max_52s REAL, dist_min_52s REAL, volume_5d_50d REAL,
  excluido_em         TEXT,
  UNIQUE (execucao_id, ativo_id)
);
CREATE INDEX idx_sinais_ativo ON sinais(ativo_id, data_preco);

-- Cotações diárias, gravadas pelo agente coletor de preços
CREATE TABLE precos_diarios (
  id          INTEGER PRIMARY KEY,
  ativo_id    INTEGER NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,                  -- dia do pregão
  abertura    REAL,
  maxima      REAL,
  minima      REAL,
  fechamento  REAL,
  volume      REAL,
  moeda       TEXT,
  fonte       TEXT,                           -- yahoo, binance, brapi...
  criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  excluido_em TEXT,
  UNIQUE (ativo_id, data)
);
CREATE INDEX idx_precos_diarios_ativo ON precos_diarios(ativo_id, data);

-- Notícias, gravadas pelo agente coletor de notícias (ativo_id NULL = notícia geral)
CREATE TABLE noticias (
  id           INTEGER PRIMARY KEY,
  ativo_id     INTEGER REFERENCES ativos(id) ON DELETE SET NULL,
  titulo       TEXT NOT NULL,
  resumo       TEXT,
  fonte        TEXT,
  url          TEXT NOT NULL UNIQUE,
  publicada_em TEXT,
  sentimento   TEXT CHECK (sentimento IN ('positivo','neutro','negativo')),
  coletada_em  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  excluido_em  TEXT
);
CREATE INDEX idx_noticias_ativo ON noticias(ativo_id, publicada_em);

-- Usuários com acesso ao app (login por e-mail e senha)
CREATE TABLE usuarios (
  id                INTEGER PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- usado no login; não pode ser alterado
  nome              TEXT NOT NULL,
  senha_hash        TEXT NOT NULL,                  -- argon2id com sal; nunca a senha em texto
  papel             TEXT NOT NULL DEFAULT 'leitor' CHECK (papel IN ('admin','leitor')),
  ativo             INTEGER NOT NULL DEFAULT 1,     -- 1 = pode entrar; 0 = bloqueado
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,     -- zera a cada login bem-sucedido
  bloqueado_ate     TEXT,                           -- bloqueio temporário após tentativas falhas
  ultimo_login_em   TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em     TEXT,
  excluido_em       TEXT
);

-- API keys dos agentes: só o hash do segredo é guardado; revogado_em encerra o uso
CREATE TABLE agentes_tokens (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL,                      -- identificação do agente
  prefixo       TEXT NOT NULL UNIQUE,               -- parte pública da chave, usada na busca
  token_hash    TEXT NOT NULL,                      -- SHA-256 do segredo
  escopos       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(escopos) AND json_type(escopos) = 'array'),
  criado_por    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ultimo_uso_em TEXT,
  revogado_em   TEXT,
  excluido_em   TEXT
);

-- Tabela-resumo da execução mais recente (não excluída)
CREATE VIEW v_resumo_atual AS
SELECT e.data_execucao, s.ativo, s.nota, s.noticias, s.grafico, s.concordam,
       s.tendencia, s.proximo_evento, s.proximo_evento_data, s.fechamento, s.moeda,
       s.rsi14, s.bollinger_pctb
FROM sinais s
JOIN execucoes e ON e.id = s.execucao_id
JOIN ativos a ON a.id = s.ativo_id
WHERE e.id = (SELECT id FROM execucoes WHERE excluido_em IS NULL ORDER BY data_execucao DESC LIMIT 1)
  AND s.excluido_em IS NULL
  AND a.excluido_em IS NULL
ORDER BY s.ativo;

-- Histórico da nota por ativo, com a variação em relação à execução anterior
CREATE VIEW v_historico_nota AS
SELECT s.ativo, e.data_execucao, s.data_preco, s.fechamento, s.nota,
       s.nota - LAG(s.nota) OVER (PARTITION BY s.ativo_id ORDER BY e.data_execucao) AS variacao_nota,
       s.noticias, s.grafico, s.rsi14
FROM sinais s
JOIN execucoes e ON e.id = s.execucao_id
JOIN ativos a ON a.id = s.ativo_id
WHERE s.excluido_em IS NULL
  AND e.excluido_em IS NULL
  AND a.excluido_em IS NULL
ORDER BY s.ativo, e.data_execucao;

-- Próximos eventos (a partir de hoje)
CREATE VIEW v_proximos_eventos AS
SELECT s.proximo_evento_data, s.ativo, s.proximo_evento, s.nota
FROM sinais s
JOIN ativos a ON a.id = s.ativo_id
WHERE s.execucao_id = (SELECT id FROM execucoes WHERE excluido_em IS NULL ORDER BY data_execucao DESC LIMIT 1)
  AND s.excluido_em IS NULL
  AND a.excluido_em IS NULL
  AND s.proximo_evento_data >= date('now','localtime')
ORDER BY s.proximo_evento_data;

-- Ativos que entram no próximo relatório
CREATE VIEW v_ativos_monitorados AS
SELECT id, ativo, nome, tipo, ticker_yahoo, url_historico, url_cotacao
FROM ativos
WHERE status = 'ativo' AND excluido_em IS NULL
ORDER BY ativo;

-- Notícias que pesaram na nota de cada sinal (tarefa 040), informadas pelo agente de decisão e
-- usadas pela landing (034). Tabela de ligação: sem exclusão lógica; apagar o sinal ou a notícia
-- apaga a ligação.
CREATE TABLE sinais_noticias (
  sinal_id   INTEGER NOT NULL REFERENCES sinais(id) ON DELETE CASCADE,
  noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
  PRIMARY KEY (sinal_id, noticia_id)
);
CREATE INDEX idx_sinais_noticias_noticia ON sinais_noticias(noticia_id);

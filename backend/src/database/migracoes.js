import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Migrations do projeto: backend/migrations (vale para src/ e para dist/).
export const PASTA_MIGRACOES = join(__dirname, '..', '..', 'migrations');

const NOME_VALIDO = /^(\d{4})_[a-z0-9_-]+\.sql$/i;

// Lê a pasta e devolve as migrations ordenadas por versão: { versao, nome, arquivo }.
// Arquivos que não são .sql são ignorados; .sql fora do padrão NNNN_descricao.sql é erro.
export function listarMigracoes(pasta) {
  const migracoes = readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .map((arquivo) => {
      const casamento = NOME_VALIDO.exec(arquivo);
      if (!casamento) {
        throw new Error(`Migration fora do padrão NNNN_descricao.sql: ${arquivo}`);
      }
      return {
        versao: Number(casamento[1]),
        nome: arquivo.slice(0, -'.sql'.length),
        arquivo: join(pasta, arquivo),
      };
    })
    .sort((a, b) => a.versao - b.versao);

  migracoes.forEach((migracao, i) => {
    if (i > 0 && migracoes[i - 1].versao === migracao.versao) {
      throw new Error(`Migration com versão ${String(migracao.versao).padStart(4, '0')} duplicada`);
    }
  });
  return migracoes;
}

function criarTabelaControle(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao     INTEGER PRIMARY KEY,
      nome       TEXT NOT NULL,
      aplicada_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
}

function lerAplicadas(db) {
  const existe = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!existe) return new Map();
  const linhas = db.prepare('SELECT versao, aplicada_em FROM schema_migrations').all();
  return new Map(linhas.map((linha) => [linha.versao, linha.aplicada_em]));
}

// Aplica, em ordem, as migrations ainda não registradas, cada uma na sua transação.
// Na primeira que falhar, desfaz a dela e interrompe (as anteriores ficam aplicadas).
// Devolve as migrations aplicadas nesta execução.
export function aplicarMigracoes(db, pasta) {
  criarTabelaControle(db);
  const aplicadas = lerAplicadas(db);
  const pendentes = listarMigracoes(pasta).filter((m) => !aplicadas.has(m.versao));
  const registrar = db.prepare('INSERT INTO schema_migrations (versao, nome) VALUES (?, ?)');

  for (const migracao of pendentes) {
    const sql = readFileSync(migracao.arquivo, 'utf8');
    try {
      db.transaction(() => {
        db.exec(sql);
        registrar.run(migracao.versao, migracao.nome);
      })();
    } catch (erro) {
      throw new Error(`Falha na migration ${migracao.nome}: ${erro.message}`, { cause: erro });
    }
  }
  return pendentes;
}

// Situação de cada migration da pasta, sem alterar o banco: aplicadaEm é null se pendente.
export function statusMigracoes(db, pasta) {
  const aplicadas = lerAplicadas(db);
  return listarMigracoes(pasta).map(({ versao, nome }) => ({
    versao,
    nome,
    aplicadaEm: aplicadas.get(versao) ?? null,
  }));
}

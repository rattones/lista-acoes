import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

// Espera até 5 s por um lock de escrita de outro processo (ex.: CLI e API juntos).
const BUSY_TIMEOUT_MS = 5000;

// Abre o banco SQLite com as configurações exigidas pela aplicação.
// ':memory:' cria um banco temporário (testes); nele o journal_mode fica 'memory'.
export function abrirConexao(arquivo) {
  if (arquivo !== ':memory:') {
    mkdirSync(dirname(arquivo), { recursive: true });
  }
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.pragma('foreign_keys = ON');
  return db;
}

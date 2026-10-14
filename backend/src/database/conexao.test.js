import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirConexao } from './conexao';

describe('abrirConexao', () => {
  let db;

  afterEach(() => db?.close());

  it('liga foreign_keys e define busy_timeout', () => {
    db = abrirConexao(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('usa journal_mode WAL em arquivo e cria a pasta do banco', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'conexao-'));
    try {
      db = abrirConexao(join(pasta, 'sub', 'teste.db'));
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    } finally {
      db.close();
      db = null;
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('rejeita escrita em tabela filha sem o registro pai', () => {
    db = abrirConexao(':memory:');
    db.exec(`
      CREATE TABLE pai (id INTEGER PRIMARY KEY);
      CREATE TABLE filho (id INTEGER PRIMARY KEY, pai_id INTEGER REFERENCES pai(id));
    `);
    expect(() => db.prepare('INSERT INTO filho (pai_id) VALUES (99)').run()).toThrow(/FOREIGN KEY/);
  });
});

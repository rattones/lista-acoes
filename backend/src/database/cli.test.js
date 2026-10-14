import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirConexao } from './conexao';
import { executar } from './cli';

describe('CLI do banco', () => {
  let db;
  let pasta;
  let linhas;
  const saida = (linha) => linhas.push(linha);

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'cli-'));
    writeFileSync(join(pasta, '0001_cria_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
    db = abrirConexao(':memory:');
    linhas = [];
  });

  afterEach(() => {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('migrate aplica as pendentes e informa cada uma', () => {
    executar('migrate', { db, pasta, saida });
    expect(linhas).toEqual(['aplicada: 0001_cria_a', '1 migration(s) aplicada(s).']);

    linhas = [];
    executar('migrate', { db, pasta, saida });
    expect(linhas).toEqual(['Nenhuma migration pendente.']);
  });

  it('status lista aplicadas e pendentes', () => {
    executar('status', { db, pasta, saida });
    expect(linhas).toEqual(['pendente  0001_cria_a', '1 pendente(s).']);

    executar('migrate', { db, pasta, saida: () => {} });
    linhas = [];
    executar('status', { db, pasta, saida });
    expect(linhas[0]).toMatch(/^aplicada {2}0001_cria_a {2}\(\d{4}-\d{2}-\d{2} [\d:]{8}\)$/);
    expect(linhas[1]).toBe('0 pendente(s).');
  });

  it('comando desconhecido gera erro com o uso', () => {
    expect(() => executar('xyz', { db, pasta, saida })).toThrow(/Uso: .*migrate\|status/);
  });
});

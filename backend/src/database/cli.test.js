import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirConexao } from './conexao';
import { executar } from './cli';
import { aplicarMigracoes, PASTA_MIGRACOES } from './migracoes';

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

  it('migrate aplica as pendentes e informa cada uma', async () => {
    await executar('migrate', { db, pasta, saida });
    expect(linhas).toEqual(['aplicada: 0001_cria_a', '1 migration(s) aplicada(s).']);

    linhas = [];
    await executar('migrate', { db, pasta, saida });
    expect(linhas).toEqual(['Nenhuma migration pendente.']);
  });

  it('status lista aplicadas e pendentes', async () => {
    await executar('status', { db, pasta, saida });
    expect(linhas).toEqual(['pendente  0001_cria_a', '1 pendente(s).']);

    await executar('migrate', { db, pasta, saida: () => {} });
    linhas = [];
    await executar('status', { db, pasta, saida });
    expect(linhas[0]).toMatch(/^aplicada {2}0001_cria_a {2}\(\d{4}-\d{2}-\d{2} [\d:]{8}\)$/);
    expect(linhas[1]).toBe('0 pendente(s).');
  });

  it('admin cria o administrador com a senha lida à parte', async () => {
    aplicarMigracoes(db, PASTA_MIGRACOES);
    const lerSenha = jest.fn().mockResolvedValue('senha-forte-123');

    await executar('admin', {
      db,
      saida,
      lerSenha,
      args: ['--email', 'admin@teste.com', '--nome', 'Administrador Geral'],
    });

    expect(lerSenha).toHaveBeenCalled();
    expect(linhas).toEqual([expect.stringMatching(/^Admin criado: admin@teste\.com \(id \d+\)$/)]);
    expect(db.prepare('SELECT nome, papel FROM usuarios').get()).toEqual({
      nome: 'Administrador Geral',
      papel: 'admin',
    });
  });

  it('admin sem --email ou --nome gera erro com o uso, sem pedir a senha', async () => {
    const lerSenha = jest.fn();
    await expect(executar('admin', { db, saida, lerSenha, args: ['--nome', 'X'] })).rejects.toThrow(
      /Uso: .*db:admin.* --email <e-mail> --nome <nome>/,
    );
    expect(lerSenha).not.toHaveBeenCalled();
  });

  it('comando desconhecido gera erro com o uso', async () => {
    await expect(executar('xyz', { db, pasta, saida })).rejects.toThrow(
      /Uso: .*migrate\|status\|admin/,
    );
  });
});

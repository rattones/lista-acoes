import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { abrirConexao } from './conexao';
import { executar } from './cli';
import { fazerBackup, verificarBackup } from './backup';
import { aplicarMigracoes, PASTA_MIGRACOES } from './migracoes';

// Backup do SQLite (tarefa 028): API online do SQLite (consistente com WAL), sem o sqlite3 CLI.
describe('backup do banco', () => {
  let pasta;
  let db;

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'backup-'));
    db = abrirConexao(join(pasta, 'monitor.db'));
    aplicarMigracoes(db, PASTA_MIGRACOES);
  });

  afterEach(() => {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('copia o banco, inclusive o que ainda está só no WAL, e a restauração recupera os dados', async () => {
    db.prepare(
      "UPDATE ativos SET observacao = 'gravado antes do backup' WHERE ativo = 'PETR4'",
    ).run();
    const destino = join(pasta, 'copia.db');

    const resultado = await fazerBackup(db, destino);
    expect(resultado).toEqual({ destino, integridade: 'ok' });

    // "Restaurar" = abrir a cópia no lugar do original.
    const restaurado = new Database(destino, { readonly: true });
    expect(restaurado.prepare('SELECT COUNT(*) AS n FROM ativos').get().n).toBe(6);
    expect(
      restaurado.prepare("SELECT observacao FROM ativos WHERE ativo = 'PETR4'").get().observacao,
    ).toBe('gravado antes do backup');
    restaurado.close();
  });

  it('não sobrescreve um arquivo existente', async () => {
    const destino = join(pasta, 'existe.db');
    writeFileSync(destino, 'qualquer coisa');
    await expect(fazerBackup(db, destino)).rejects.toThrow(/já existe/);
  });

  it('verificarBackup aponta arquivo corrompido', () => {
    const corrompido = join(pasta, 'corrompido.db');
    writeFileSync(corrompido, 'isto não é um banco SQLite'.repeat(200));
    expect(() => verificarBackup(corrompido)).toThrow(/integridade|not a database/i);
  });

  describe('CLI', () => {
    let linhas;
    const saida = (linha) => linhas.push(linha);

    beforeEach(() => {
      linhas = [];
    });

    it('backup <destino> grava a cópia e informa a integridade', async () => {
      const destino = join(pasta, 'backups', 'monitor-2026-10-18.db');
      await executar('backup', { db, saida, args: [destino] });
      expect(existsSync(destino)).toBe(true);
      expect(linhas).toEqual([`Backup gravado: ${destino} (integridade: ok)`]);
    });

    it('backup sem destino mostra o uso', async () => {
      await expect(executar('backup', { db, saida, args: [] })).rejects.toThrow(/Uso:/);
    });

    it('verificar <arquivo> confere a integridade de uma cópia', async () => {
      const destino = join(pasta, 'copia.db');
      await fazerBackup(db, destino);
      await executar('verificar', { db, saida, args: [destino] });
      expect(linhas).toEqual([`${destino}: integridade ok, 6 ativo(s), 0 usuário(s)`]);
    });
  });
});

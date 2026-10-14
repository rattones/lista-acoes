import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirConexao } from './conexao';
import { aplicarMigracoes, listarMigracoes, statusMigracoes } from './migracoes';

describe('migrations', () => {
  let db;
  let pasta;

  const escrever = (arquivo, sql) => writeFileSync(join(pasta, arquivo), sql);
  const tabelas = () =>
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
  const registradas = () =>
    db.prepare('SELECT versao, nome FROM schema_migrations ORDER BY versao').all();

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'migrations-'));
    db = abrirConexao(':memory:');
  });

  afterEach(() => {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  });

  describe('listarMigracoes', () => {
    it('lista os arquivos NNNN_descricao.sql em ordem de versão e ignora os demais', () => {
      escrever('0002_segunda.sql', 'SELECT 1;');
      escrever('0001_primeira.sql', 'SELECT 1;');
      escrever('.gitkeep', '');
      escrever('LEIAME.md', '');
      expect(listarMigracoes(pasta).map(({ versao, nome }) => [versao, nome])).toEqual([
        [1, '0001_primeira'],
        [2, '0002_segunda'],
      ]);
    });

    it('rejeita duas migrations com a mesma versão', () => {
      escrever('0001_a.sql', 'SELECT 1;');
      escrever('0001_b.sql', 'SELECT 1;');
      expect(() => listarMigracoes(pasta)).toThrow(/versão 0001 duplicada/);
    });

    it('rejeita arquivo .sql fora do padrão de nome', () => {
      escrever('schema.sql', 'SELECT 1;');
      expect(() => listarMigracoes(pasta)).toThrow(/schema\.sql/);
    });
  });

  describe('aplicarMigracoes', () => {
    it('aplica as pendentes em ordem e registra em schema_migrations', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      escrever(
        '0002_cria_b.sql',
        'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id REFERENCES a(id));',
      );

      const aplicadas = aplicarMigracoes(db, pasta);

      expect(aplicadas.map((m) => m.nome)).toEqual(['0001_cria_a', '0002_cria_b']);
      expect(tabelas()).toEqual(['a', 'b', 'schema_migrations']);
      expect(registradas()).toEqual([
        { versao: 1, nome: '0001_cria_a' },
        { versao: 2, nome: '0002_cria_b' },
      ]);
      const { aplicada_em: aplicadaEm } = db
        .prepare('SELECT aplicada_em FROM schema_migrations')
        .get();
      expect(aplicadaEm).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('não reaplica migration já registrada', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      aplicarMigracoes(db, pasta);
      escrever('0002_cria_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY);');

      const aplicadas = aplicarMigracoes(db, pasta);

      expect(aplicadas.map((m) => m.nome)).toEqual(['0002_cria_b']);
      expect(registradas()).toHaveLength(2);
    });

    it('executar duas vezes seguidas não altera o banco na segunda vez', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      escrever('0002_insere.sql', 'INSERT INTO a (id) VALUES (1);');
      aplicarMigracoes(db, pasta);
      const antes = db.serialize();

      expect(aplicarMigracoes(db, pasta)).toEqual([]);
      expect(db.serialize().equals(antes)).toBe(true);
    });

    it('migration com erro faz rollback e interrompe a execução', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      escrever(
        '0002_quebrada.sql',
        'CREATE TABLE b (id INTEGER PRIMARY KEY); INSERT INTO nao_existe VALUES (1);',
      );
      escrever('0003_cria_c.sql', 'CREATE TABLE c (id INTEGER PRIMARY KEY);');

      expect(() => aplicarMigracoes(db, pasta)).toThrow(
        /0002_quebrada.*no such table: nao_existe/s,
      );

      expect(tabelas()).toEqual(['a', 'schema_migrations']);
      expect(registradas()).toEqual([{ versao: 1, nome: '0001_cria_a' }]);
    });

    it('sem migrations, só cria a tabela de controle', () => {
      expect(aplicarMigracoes(db, pasta)).toEqual([]);
      expect(tabelas()).toEqual(['schema_migrations']);
    });
  });

  describe('statusMigracoes', () => {
    it('indica as aplicadas (com a data) e as pendentes', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      aplicarMigracoes(db, pasta);
      escrever('0002_cria_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY);');

      expect(statusMigracoes(db, pasta)).toEqual([
        { versao: 1, nome: '0001_cria_a', aplicadaEm: expect.any(String) },
        { versao: 2, nome: '0002_cria_b', aplicadaEm: null },
      ]);
    });

    it('não altera o banco', () => {
      escrever('0001_cria_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
      statusMigracoes(db, pasta);
      expect(tabelas()).toEqual([]);
    });
  });
});

import { criarApp } from '../src/criar-app';
import { CONEXAO_DB } from '../src/database/database.module';

describe('DatabaseModule (e2e)', () => {
  let app;

  beforeAll(async () => {
    app = await criarApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('expõe a conexão com foreign_keys ligado', () => {
    const db = app.get(CONEXAO_DB);
    expect(db.open).toBe(true);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('usa o banco configurado em DB_ARQUIVO (em memória nos testes)', () => {
    expect(app.get(CONEXAO_DB).memory).toBe(true);
  });

  it('fecha a conexão quando a aplicação encerra', async () => {
    const outra = await criarApp();
    await outra.init();
    const db = outra.get(CONEXAO_DB);
    await outra.close();
    expect(db.open).toBe(false);
  });
});

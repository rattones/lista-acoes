import { criarAppTeste, idAtivo } from './utils/app-teste';

// Matriz de permissões (tarefa 012): leitor só lê; admin escreve, exclui e gerencia usuários.
const RECURSOS = ['ativos', 'execucoes', 'sinais', 'precos', 'noticias'];

describe('permissões', () => {
  let ctx;
  let leitor;
  let anonimo;

  beforeEach(async () => {
    ctx = await criarAppTeste();
    leitor = ctx.http(ctx.tokens.leitor);
    anonimo = ctx.http(null);
  });
  afterEach(() => ctx.app.close());

  it('GET /v1/health é público', async () => {
    expect((await anonimo.get('/v1/health')).status).toBe(200);
  });

  it('sem token, todas as rotas do CRUD → 401', async () => {
    for (const recurso of [...RECURSOS, 'usuarios']) {
      expect((await anonimo.get(`/v1/${recurso}`)).status).toBe(401);
      expect((await anonimo.get(`/v1/${recurso}/1`)).status).toBe(401);
      // POST /usuarios não existe (cadastro por convite): 404, não 401.
      if (recurso !== 'usuarios') {
        expect((await anonimo.post(`/v1/${recurso}`).send({})).status).toBe(401);
      }
      expect((await anonimo.patch(`/v1/${recurso}/1`).send({})).status).toBe(401);
      expect((await anonimo.delete(`/v1/${recurso}/1`)).status).toBe(401);
    }
    expect((await anonimo.post('/v1/precos/lote').send({})).status).toBe(401);
  });

  it('leitor lê os recursos (lista e obter)', async () => {
    for (const recurso of RECURSOS) {
      expect((await leitor.get(`/v1/${recurso}`)).status).toBe(200);
    }
    expect((await leitor.get('/v1/ativos/1')).status).toBe(200);
  });

  it('leitor recebe 403 em POST/PATCH/DELETE, restaurar e lotes, sem alterar nada', async () => {
    for (const recurso of RECURSOS) {
      for (const res of [
        await leitor.post(`/v1/${recurso}`).send({}),
        await leitor.patch(`/v1/${recurso}/1`).send({ nome: 'x' }),
        await leitor.delete(`/v1/${recurso}/1`),
        await leitor.delete(`/v1/${recurso}/1`).query({ permanente: true }),
        await leitor.post(`/v1/${recurso}/1/restaurar`),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.erro).toBe('proibido');
      }
    }
    const lote = { itens: [{ ativo_id: idAtivo(ctx.db, 'PETR4'), data: '2026-10-13' }] };
    expect((await leitor.post('/v1/precos/lote').send(lote)).status).toBe(403);
    expect((await leitor.post('/v1/noticias/lote').send({ itens: [] })).status).toBe(403);
    expect(
      ctx.db.prepare('SELECT COUNT(*) FROM ativos WHERE excluido_em IS NULL').pluck().get(),
    ).toBe(6);
  });

  it('leitor não vê registros excluídos (incluir_excluidos → 403)', async () => {
    expect((await leitor.get('/v1/ativos').query({ incluir_excluidos: true })).status).toBe(403);
    expect((await leitor.get('/v1/ativos/1').query({ incluir_excluidos: true })).status).toBe(403);
    expect((await leitor.get('/v1/ativos').query({ incluir_excluidos: false })).status).toBe(200);
  });

  it('leitor não acessa /usuarios', async () => {
    expect((await leitor.get('/v1/usuarios')).status).toBe(403);
    expect((await leitor.get('/v1/usuarios/1')).status).toBe(403);
  });

  it('leitor acessa /auth/eu e faz logout', async () => {
    expect((await leitor.get('/v1/auth/eu')).status).toBe(200);
    expect((await leitor.post('/v1/auth/logout')).status).toBe(204);
  });

  it('admin escreve, exclui, restaura e vê excluídos', async () => {
    const admin = ctx.http();
    expect((await admin.patch('/v1/ativos/1').send({ nome: 'x' })).status).toBe(200);
    expect((await admin.delete('/v1/ativos/1')).status).toBe(204);
    expect((await admin.get('/v1/ativos').query({ incluir_excluidos: true })).status).toBe(200);
    expect((await admin.post('/v1/ativos/1/restaurar')).status).toBe(200);
    expect((await admin.get('/v1/usuarios')).status).toBe(200);
  });
});

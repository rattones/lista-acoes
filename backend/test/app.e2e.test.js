import request from 'supertest';
import { criarApp } from '../src/criar-app';
import { version } from '../package.json';

describe('App (e2e)', () => {
  let app;

  beforeAll(async () => {
    app = await criarApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health responde 200 com status ok e versão', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', versao: version });
  });

  it('rota inexistente responde 404 no formato padrão de erro', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      erro: 'nao_encontrado',
      mensagem: expect.any(String),
      detalhes: null,
    });
  });

  it('rota sem o prefixo /v1 não existe', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(404);
  });

  it('devolve o x-request-id recebido ou gera um novo', async () => {
    const recebido = await request(app.getHttpServer())
      .get('/v1/health')
      .set('x-request-id', 'abc-123');
    expect(recebido.headers['x-request-id']).toBe('abc-123');

    const gerado = await request(app.getHttpServer()).get('/v1/health');
    expect(gerado.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CORS libera somente as origens configuradas', async () => {
    const permitida = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'http://app.teste');
    expect(permitida.headers['access-control-allow-origin']).toBe('http://app.teste');

    const negada = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'http://outro.site');
    expect(negada.headers['access-control-allow-origin']).toBeUndefined();
  });
});

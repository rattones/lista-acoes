import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { opcoesPinoHttp } from './log';

// Logs sem credenciais (tarefa 029): a linha de cada requisição só tem os campos da POLICY.
describe('log das requisições', () => {
  let linhas;
  let log;

  const servidor = () =>
    createServer((req, res) => {
      log(req, res);
      res.setHeader('Set-Cookie', 'sessao=segredo-resposta');
      res.end('ok');
    });

  beforeEach(() => {
    linhas = [];
    const destino = new Writable({
      write(pedaco, _codificacao, pronto) {
        linhas.push(JSON.parse(pedaco));
        pronto();
      },
    });
    log = pinoHttp(opcoesPinoHttp('info'), destino);
  });

  const requisitar = async () => {
    await request(servidor())
      .get('/v1/ativos?pagina=2')
      .set('Authorization', 'Bearer segredo-authorization')
      .set('Cookie', 'refresh=segredo-cookie')
      .set('X-Api-Key', 'la_segredo-api-key')
      .set('User-Agent', 'agente-teste/1.0')
      .set('X-Request-Id', 'req-123');
    await new Promise((resolve) => setImmediate(resolve));
    return linhas.find((linha) => linha.req);
  };

  it('não grava credenciais (Authorization, Cookie, X-Api-Key, Set-Cookie)', async () => {
    await requisitar();
    expect(JSON.stringify(linhas)).not.toMatch(/segredo/);
  });

  it('grava só id, método, URL, IP e user agent da requisição, e o status da resposta', async () => {
    const linha = await requisitar();
    expect(linha.req).toEqual({
      id: 'req-123',
      method: 'GET',
      url: '/v1/ativos?pagina=2',
      remoteAddress: expect.any(String),
      userAgent: 'agente-teste/1.0',
    });
    expect(linha.res).toEqual({ statusCode: 200 });
    expect(linha.responseTime).toEqual(expect.any(Number));
  });

  it('reaproveita um x-request-id válido ou gera um novo', async () => {
    expect((await requisitar()).req.id).toBe('req-123');

    linhas = [];
    await request(servidor()).get('/').set('X-Request-Id', 'inválido com espaço');
    await new Promise((resolve) => setImmediate(resolve));
    expect(linhas[0].req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mascara senha, senha_hash e token em objetos registrados pelo código', () => {
    log.logger.info(
      {
        usuario: { senha: 'segredo-senha', senha_hash: 'segredo-hash' },
        dados: { token: 'segredo-token' },
      },
      'teste',
    );
    expect(JSON.stringify(linhas)).not.toMatch(/segredo/);
    expect(linhas[0].usuario.senha).toBe('[oculto]');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { criarCliente, ErroApi } from './cliente.js';

const respostaJson = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cliente HTTP', () => {
  it('usa VITE_API_URL como base', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.teste:3000');
    const fetch = vi.fn().mockResolvedValue(respostaJson({ status: 'ok' }));
    vi.stubGlobal('fetch', fetch);
    vi.resetModules();

    const { api } = await import('./cliente.js');

    await expect(api.get('/v1/health')).resolves.toEqual({ status: 'ok' });
    expect(fetch).toHaveBeenCalledWith(
      'http://api.teste:3000/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('não duplica a barra entre a base e o caminho', async () => {
    const fetch = vi.fn().mockResolvedValue(respostaJson({}));
    const cliente = criarCliente({ baseUrl: 'http://api.teste/', fetch });

    await cliente.get('v1/ativos');

    expect(fetch.mock.calls[0][0]).toBe('http://api.teste/v1/ativos');
  });

  it('envia o corpo em JSON no POST', async () => {
    const fetch = vi.fn().mockResolvedValue(respostaJson({ id: 1 }, 201));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });

    await expect(cliente.post('/v1/ativos', { ativo: 'PETR4' })).resolves.toEqual({ id: 1 });

    const [, opcoes] = fetch.mock.calls[0];
    expect(opcoes.method).toBe('POST');
    expect(opcoes.body).toBe(JSON.stringify({ ativo: 'PETR4' }));
    expect(opcoes.headers['content-type']).toBe('application/json');
  });

  it('devolve null em resposta sem conteúdo (204)', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });

    await expect(cliente.delete('/v1/ativos/1')).resolves.toBeNull();
  });

  it('converte o erro da API ({ erro, mensagem, detalhes }) em ErroApi', async () => {
    const corpo = { erro: 'nao_encontrado', mensagem: 'Ativo não encontrado', detalhes: null };
    const fetch = vi.fn().mockResolvedValue(respostaJson(corpo, 404));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });

    const erro = await cliente.get('/v1/ativos/99').catch((e) => e);

    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(404);
    expect(erro.codigo).toBe('nao_encontrado');
    expect(erro.message).toBe('Ativo não encontrado');
    expect(erro.detalhes).toBeNull();
  });

  it('gera ErroApi genérico quando a resposta de erro não é JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });

    const erro = await cliente.get('/v1/health').catch((e) => e);

    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(502);
    expect(erro.codigo).toBe('erro_http');
  });

  it('busca o fetch global na hora da chamada (os testes o trocam depois)', async () => {
    const cliente = criarCliente({ baseUrl: 'http://api.teste' });
    const fetch = vi.fn().mockResolvedValue(respostaJson({ ok: 1 }));
    vi.stubGlobal('fetch', fetch);
    await expect(cliente.get('/v1/health')).resolves.toEqual({ ok: 1 });
  });

  it('envia o cookie (credentials: include) e o token de acesso da sessão', async () => {
    const fetch = vi.fn(async () => respostaJson({}));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    await cliente.get('/v1/ativos');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(fetch.mock.calls[0][1].headers.authorization).toBeUndefined();

    cliente.configurarSessao({ obterToken: () => 'abc', renovar: vi.fn() });
    await cliente.get('/v1/ativos');
    expect(fetch.mock.calls[1][1].headers.authorization).toBe('Bearer abc');
  });

  it('DELETE pode levar corpo (ex.: exclusão de conta com a senha)', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    await cliente.delete('/v1/auth/eu', { senha: 'x' });
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ senha: 'x' }));
  });

  it('em 401, renova a sessão uma vez e repete a requisição com o token novo', async () => {
    let token = 'velho';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ erro: 'nao_autenticado', mensagem: 'x' }, 401))
      .mockResolvedValueOnce(respostaJson({ dados: [] }));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    const renovar = vi.fn(async () => {
      token = 'novo';
      return true;
    });
    cliente.configurarSessao({ obterToken: () => token, renovar });

    await expect(cliente.get('/v1/ativos')).resolves.toEqual({ dados: [] });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[1][1].headers.authorization).toBe('Bearer novo');
  });

  it('se a renovação falha, propaga o 401 sem repetir', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(respostaJson({ erro: 'nao_autenticado', mensagem: 'x' }, 401));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    const renovar = vi.fn(async () => false);
    cliente.configurarSessao({ obterToken: () => 't', renovar });

    const erro = await cliente.get('/v1/ativos').catch((e) => e);
    expect(erro.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rotas /v1/auth/ (login, refresh...) e sem sessão não tentam renovar', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(respostaJson({ erro: 'nao_autenticado', mensagem: 'x' }, 401));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    const renovar = vi.fn(async () => true);
    cliente.configurarSessao({ obterToken: () => 't', renovar });
    await cliente.post('/v1/auth/login', {}).catch(() => {});
    await cliente.post('/v1/auth/refresh').catch(() => {});
    expect(renovar).not.toHaveBeenCalled();

    cliente.configurarSessao({ obterToken: () => null, renovar });
    await cliente.get('/v1/ativos').catch(() => {});
    expect(renovar).not.toHaveBeenCalled();
  });

  it('falha de rede vira ErroApi com código sem_conexao', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const cliente = criarCliente({ baseUrl: 'http://api.teste', fetch });
    const erro = await cliente.get('/v1/health').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.codigo).toBe('sem_conexao');
    expect(erro.status).toBe(0);
  });
});

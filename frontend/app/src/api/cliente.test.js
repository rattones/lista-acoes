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
});

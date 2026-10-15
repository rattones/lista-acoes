import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { api } from '../api/cliente.js';
import { apiComSessao, criarApiFalsa, sessao, USUARIOS } from '../../../test/utils.js';
import { useAuthStore } from './auth.js';

const CREDENCIAIS_INVALIDAS = [
  401,
  { erro: 'nao_autenticado', mensagem: 'E-mail ou senha inválidos' },
];

describe('store auth', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('login guarda o usuário e o token (só em memória) e o cliente passa a enviá-lo', async () => {
    const falsa = criarApiFalsa({
      'POST /v1/auth/login': [200, sessao('leitor')],
      'GET /v1/ativos': [200, { dados: [] }],
    });
    const auth = useAuthStore();
    await auth.login('leitor@teste.com', 'senha-forte-123');

    expect(falsa.chamou('POST /v1/auth/login')[0].corpo).toEqual({
      email: 'leitor@teste.com',
      senha: 'senha-forte-123',
    });
    expect(auth.logado).toBe(true);
    expect(auth.usuario).toEqual(USUARIOS.leitor);
    expect(auth.ehAdmin).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    await api.get('/v1/ativos');
    expect(falsa.chamou('GET /v1/ativos')[0].opcoes.headers.authorization).toBe(
      'Bearer token-leitor',
    );
  });

  it('login com erro propaga o ErroApi e continua deslogado', async () => {
    criarApiFalsa({ 'POST /v1/auth/login': CREDENCIAIS_INVALIDAS });
    const auth = useAuthStore();
    const erro = await auth.login('x@teste.com', 'errada').catch((e) => e);
    expect(erro.status).toBe(401);
    expect(auth.logado).toBe(false);
  });

  it('iniciar restaura a sessão pelo refresh (cookie), uma vez só', async () => {
    const falsa = apiComSessao('admin');
    const auth = useAuthStore();
    await Promise.all([auth.iniciar(), auth.iniciar()]);
    await auth.iniciar();
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(1);
    expect(auth.ehAdmin).toBe(true);
  });

  it('iniciar sem cookie válido termina deslogado, sem erro', async () => {
    criarApiFalsa();
    const auth = useAuthStore();
    await expect(auth.iniciar()).resolves.toBeUndefined();
    expect(auth.logado).toBe(false);
  });

  it('logout chama a API e limpa a sessão, mesmo se a API falhar', async () => {
    const falsa = criarApiFalsa({
      'POST /v1/auth/login': [200, sessao('admin')],
      'POST /v1/auth/logout': [500, { erro: 'erro_interno', mensagem: 'x' }],
    });
    const auth = useAuthStore();
    await auth.login('admin@teste.com', 'senha');
    await auth.logout();
    expect(falsa.chamou('POST /v1/auth/logout')).toHaveLength(1);
    expect(auth.logado).toBe(false);
    expect(auth.usuario).toBeNull();
  });

  it('token expirado: o cliente renova pelo refresh e repete a requisição', async () => {
    let tentativas = 0;
    const falsa = criarApiFalsa({
      'POST /v1/auth/login': [200, sessao('admin', 'token-velho')],
      'POST /v1/auth/refresh': [200, sessao('admin', 'token-novo')],
      'GET /v1/ativos': (corpo, opcoes) =>
        (tentativas += 1) === 1
          ? [401, { erro: 'nao_autenticado', mensagem: 'expirado' }]
          : [200, { dados: [], token: opcoes.headers.authorization }],
    });
    const auth = useAuthStore();
    await auth.login('admin@teste.com', 'senha');
    await expect(api.get('/v1/ativos')).resolves.toEqual({ dados: [], token: 'Bearer token-novo' });
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(1);
  });

  it('renovações simultâneas fazem um refresh só', async () => {
    const falsa = apiComSessao('admin');
    const auth = useAuthStore();
    await Promise.all([auth.renovar(), auth.renovar(), auth.renovar()]);
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(1);
  });

  it('refresh recusado ao renovar encerra a sessão local', async () => {
    criarApiFalsa({ 'POST /v1/auth/login': [200, sessao('admin')] });
    const auth = useAuthStore();
    await auth.login('admin@teste.com', 'senha');
    expect(await auth.renovar()).toBe(false);
    expect(auth.logado).toBe(false);
  });

  it('renova sozinha um minuto antes de o token expirar', async () => {
    vi.useFakeTimers();
    const falsa = criarApiFalsa({
      'POST /v1/auth/login': [200, sessao('admin', 'a')],
      'POST /v1/auth/refresh': [200, sessao('admin', 'b')],
    });
    const auth = useAuthStore();
    await auth.login('admin@teste.com', 'senha');
    await vi.advanceTimersByTimeAsync(839_000);
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(1);
    expect(auth.token).toBe('b');

    await auth.logout();
    await vi.advanceTimersByTimeAsync(900_000);
    expect(falsa.chamou('POST /v1/auth/refresh')).toHaveLength(1);
  });
});

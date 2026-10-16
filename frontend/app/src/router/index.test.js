import { describe, it, expect, afterEach, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { apiComSessao, criarApiFalsa } from '../../../test/utils.js';
import { criarRouter } from './index.js';

async function navegar(caminho) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = criarRouter(createMemoryHistory(), pinia);
  await router.push(caminho);
  return router.currentRoute.value;
}

describe('router', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('logado, / leva ao dashboard', async () => {
    apiComSessao('leitor');
    expect((await navegar('/')).name).toBe('inicio');
  });

  it('rota desconhecida mostra a 404, mantendo o endereço digitado', async () => {
    criarApiFalsa();
    const rota = await navegar('/nao/existe?x=1');
    expect(rota.name).toBe('nao-encontrado');
    expect(rota.fullPath).toBe('/nao/existe?x=1');
  });

  it('rota privada sem login redireciona a /login, guardando o destino', async () => {
    criarApiFalsa();
    for (const caminho of ['/', '/ativos', '/perfil', '/usuarios']) {
      const rota = await navegar(caminho);
      expect(rota.name).toBe('login');
      expect(rota.query.volta).toBe(caminho);
    }
  });

  it('login, recuperação e redefinição de senha são públicas', async () => {
    criarApiFalsa();
    expect((await navegar('/login')).name).toBe('login');
    expect((await navegar('/recuperar-senha')).name).toBe('recuperar-senha');
    expect((await navegar('/redefinir-senha#t=abc')).name).toBe('redefinir-senha');
  });

  it('logado, /login leva ao dashboard', async () => {
    apiComSessao('leitor');
    expect((await navegar('/login')).name).toBe('inicio');
  });

  it('leitor não acessa rotas de admin (volta ao dashboard)', async () => {
    apiComSessao('leitor');
    expect((await navegar('/usuarios')).name).toBe('inicio');
    expect((await navegar('/api-keys')).name).toBe('inicio');
    expect((await navegar('/ativos')).name).toBe('ativos');
    expect((await navegar('/ativos/1')).name).toBe('ativo');
    expect((await navegar('/ativos/novo')).name).toBe('inicio');
    expect((await navegar('/perfil')).name).toBe('perfil');
  });

  it('admin acessa as rotas de admin', async () => {
    apiComSessao('admin');
    expect((await navegar('/usuarios')).name).toBe('usuarios');
    expect((await navegar('/api-keys')).name).toBe('api-keys');
    expect((await navegar('/ativos/novo')).name).toBe('ativo-novo');
  });
});

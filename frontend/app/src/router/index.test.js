import { describe, it, expect } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { criarRouter } from './index.js';

describe('router', () => {
  it('leva / para a página inicial', async () => {
    const router = criarRouter(createMemoryHistory());
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('leva rota desconhecida para a página 404, mantendo o endereço digitado', async () => {
    const router = criarRouter(createMemoryHistory());
    await router.push('/nao/existe?x=1');
    expect(router.currentRoute.value.name).toBe('nao-encontrado');
    expect(router.currentRoute.value.fullPath).toBe('/nao/existe?x=1');
  });
});

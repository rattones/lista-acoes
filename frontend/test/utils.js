import { vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import App from '../app/src/App.vue';
import { criarVuetify } from '../app/src/plugins/vuetify.js';
import { criarRouter } from '../app/src/router/index.js';
import { useAuthStore } from '../app/src/stores/auth.js';

const resposta = (status, corpo) =>
  new Response(status === 204 || corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const USUARIOS = {
  admin: { id: 1, email: 'admin@teste.com', nome: 'Admin da Silva', papel: 'admin' },
  leitor: { id: 2, email: 'leitor@teste.com', nome: 'Leitor Souza', papel: 'leitor' },
};

// Corpo do login/refresh da API para o papel dado.
export const sessao = (papel = 'admin', token = `token-${papel}`) => ({
  token_acesso: token,
  tipo: 'Bearer',
  expira_em_segundos: 900,
  usuario: USUARIOS[papel],
});

const SEM_SESSAO = [401, { erro: 'nao_autenticado', mensagem: 'Sessão inválida ou expirada' }];

// API falsa: rotas { 'POST /v1/auth/login': [status, corpo] | (corpo, opcoes, url) => [status, corpo] }.
// Sem sessão por padrão (refresh → 401). Instala-se como fetch global.
export function criarApiFalsa(rotas = {}) {
  const chamadas = [];
  const todas = { 'POST /v1/auth/refresh': SEM_SESSAO, 'POST /v1/auth/logout': [204], ...rotas };
  const fetch = vi.fn(async (url, opcoes = {}) => {
    const { pathname } = new URL(url, 'http://app.teste');
    const chave = `${opcoes.method ?? 'GET'} ${pathname}`;
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : undefined;
    chamadas.push({ chave, url, corpo, opcoes });
    const rota = todas[chave];
    if (!rota)
      return resposta(404, { erro: 'nao_encontrado', mensagem: `sem rota falsa: ${chave}` });
    const [status, dados] = typeof rota === 'function' ? await rota(corpo, opcoes, url) : rota;
    return resposta(status, dados);
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    chamadas,
    rotas: todas,
    chamou: (chave) => chamadas.filter((c) => c.chave === chave),
  };
}

// API falsa já com sessão aberta (o refresh devolve a sessão do papel).
export const apiComSessao = (papel, rotas = {}) =>
  criarApiFalsa({ 'POST /v1/auth/refresh': [200, sessao(papel)], ...rotas });

// App completo (Vuetify, router em memória, Pinia) na rota dada.
export async function montarApp(rota = '/') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = criarRouter(createMemoryHistory(), pinia);
  router.push(rota);
  await router.isReady();
  const vuetify = criarVuetify();
  const wrapper = mount(App, { global: { plugins: [vuetify, router, pinia] } });
  await flushPromises();
  return { wrapper, router, vuetify, auth: useAuthStore(pinia) };
}

// Preenche um v-text-field pelo data-teste.
export async function preencher(wrapper, teste, valor) {
  await wrapper.find(`[data-teste="${teste}"] input`).setValue(valor);
}

export async function enviar(wrapper, teste) {
  await wrapper.find(`[data-teste="${teste}"]`).trigger('submit');
  await flushPromises();
}

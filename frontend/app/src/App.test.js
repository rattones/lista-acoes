import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';
import { criarVuetify } from './plugins/vuetify.js';
import { criarRouter } from './router/index.js';

async function montar(rota = '/') {
  const vuetify = criarVuetify();
  const router = criarRouter(createMemoryHistory());
  router.push(rota);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [vuetify, router, createPinia()] } });
  return { wrapper, vuetify };
}

describe('App', () => {
  it('monta e renderiza o layout com barra superior e conteúdo', async () => {
    const { wrapper } = await montar('/');
    expect(wrapper.find('.v-application').exists()).toBe(true);
    expect(wrapper.find('.v-app-bar').text()).toContain('Lista de Ações');
    expect(wrapper.find('.v-main').exists()).toBe(true);
  });

  it('renderiza a página inicial na rota /', async () => {
    const { wrapper } = await montar('/');
    expect(wrapper.find('[data-teste="pagina-inicio"]').exists()).toBe(true);
  });

  it('renderiza a página 404 em rota desconhecida', async () => {
    const { wrapper } = await montar('/rota/que/nao/existe');
    expect(wrapper.find('[data-teste="pagina-404"]').exists()).toBe(true);
  });

  it('alterna o tema entre claro e escuro', async () => {
    const { wrapper, vuetify } = await montar('/');
    const botao = wrapper.find('[data-teste="alternar-tema"]');
    const inicial = vuetify.theme.global.name.value;

    await botao.trigger('click');
    const depois = vuetify.theme.global.name.value;
    expect(['claro', 'escuro']).toContain(depois);
    expect(depois).not.toBe(inicial);

    await botao.trigger('click');
    expect(vuetify.theme.global.name.value).not.toBe(depois);
  });
});

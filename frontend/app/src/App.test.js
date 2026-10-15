import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, criarApiFalsa, montarApp, USUARIOS } from '../../test/utils.js';

const itensDoMenu = (wrapper) =>
  wrapper
    .findAll('[data-teste="menu"] [data-teste^="menu-"]')
    .map((item) => item.attributes('data-teste'));

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('logado: layout com barra superior, menu lateral e conteúdo', async () => {
    apiComSessao('leitor');
    const { wrapper } = await montarApp('/');
    expect(wrapper.find('.v-app-bar').text()).toContain('Lista de Ações');
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true);
    expect(wrapper.find('[data-teste="pagina-inicio"]').exists()).toBe(true);
  });

  it('o menu mostra nome, e-mail e papel do usuário logado', async () => {
    apiComSessao('admin');
    const { wrapper } = await montarApp('/');
    const usuario = wrapper.find('[data-teste="menu-usuario"]').text();
    expect(usuario).toContain(USUARIOS.admin.nome);
    expect(usuario).toContain(USUARIOS.admin.email);
    expect(usuario).toContain('Administrador');
  });

  it('admin vê todos os tópicos; leitor não vê Usuários nem API keys', async () => {
    apiComSessao('admin');
    const admin = await montarApp('/');
    expect(itensDoMenu(admin.wrapper)).toEqual([
      'menu-usuario',
      'menu-inicio',
      'menu-ativos',
      'menu-usuarios',
      'menu-api-keys',
      'menu-perfil',
      'menu-sair',
    ]);

    apiComSessao('leitor');
    const leitor = await montarApp('/');
    expect(itensDoMenu(leitor.wrapper)).toEqual([
      'menu-usuario',
      'menu-inicio',
      'menu-ativos',
      'menu-perfil',
      'menu-sair',
    ]);
    expect(leitor.wrapper.find('[data-teste="menu-usuario"]').text()).toContain('Leitor');
  });

  it('Sair encerra a sessão na API e volta ao login', async () => {
    const falsa = apiComSessao('leitor');
    const { wrapper, router, auth } = await montarApp('/ativos');
    await wrapper.find('[data-teste="menu-sair"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('POST /v1/auth/logout')).toHaveLength(1);
    expect(auth.logado).toBe(false);
    expect(router.currentRoute.value.name).toBe('login');
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false);
  });

  it('telas públicas não têm menu lateral', async () => {
    criarApiFalsa();
    const { wrapper } = await montarApp('/login');
    expect(wrapper.find('[data-teste="pagina-login"]').exists()).toBe(true);
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false);
  });

  it('renderiza a página 404 em rota desconhecida', async () => {
    criarApiFalsa();
    const { wrapper } = await montarApp('/rota/que/nao/existe');
    expect(wrapper.find('[data-teste="pagina-404"]').exists()).toBe(true);
  });

  it('alterna o tema entre claro e escuro', async () => {
    criarApiFalsa();
    const { wrapper, vuetify } = await montarApp('/login');
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

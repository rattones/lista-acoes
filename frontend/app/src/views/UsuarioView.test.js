import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, enviar, montarApp, preencher } from '../../../test/utils.js';

const MARIA = {
  id: 2,
  email: 'maria@teste.com',
  nome: 'Maria Leitora',
  papel: 'leitor',
  ativo: 1,
  bloqueado_ate: null,
  ultimo_login_em: '2026-10-15 09:30:00',
  criado_em: '2026-10-10 08:00:00',
  excluido_em: null,
};

describe('edição de usuário (/usuarios/:id)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leitor não acessa', async () => {
    apiComSessao('leitor');
    const { router } = await montarApp('/usuarios/2');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('carrega o usuário; o e-mail é só leitura', async () => {
    apiComSessao('admin', { 'GET /v1/usuarios/2': [200, MARIA] });
    const { wrapper } = await montarApp('/usuarios/2');
    const email = wrapper.find('[data-teste="email"] input');
    expect(email.element.value).toBe('maria@teste.com');
    expect(email.attributes('readonly')).toBeDefined();
    expect(wrapper.find('[data-teste="nome"] input').element.value).toBe('Maria Leitora');
    expect(wrapper.text()).toContain('15/10/2026 09:30');
  });

  it('salva nome, papel e status com PATCH (sem e-mail) e volta à lista', async () => {
    const falsa = apiComSessao('admin', {
      'GET /v1/usuarios/2': [200, MARIA],
      'PATCH /v1/usuarios/2': (corpo) => [200, { ...MARIA, ...corpo }],
      'GET /v1/usuarios': [200, { dados: [], paginacao: { total: 0 } }],
    });
    const { wrapper, router } = await montarApp('/usuarios/2');
    await preencher(wrapper, 'nome', '  Maria Admin ');
    await wrapper.find('[data-teste="papel-admin"] input').setValue(true);
    await wrapper.find('[data-teste="ativo"] input').setValue(false);
    await enviar(wrapper, 'form-usuario');
    expect(falsa.chamou('PATCH /v1/usuarios/2')[0].corpo).toEqual({
      nome: 'Maria Admin',
      papel: 'admin',
      ativo: false,
    });
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('usuarios'));
  });

  it('nome vazio não salva', async () => {
    const falsa = apiComSessao('admin', { 'GET /v1/usuarios/2': [200, MARIA] });
    const { wrapper } = await montarApp('/usuarios/2');
    await preencher(wrapper, 'nome', '   ');
    await enviar(wrapper, 'form-usuario');
    expect(falsa.chamou('PATCH /v1/usuarios/2')).toHaveLength(0);
  });

  it('erro ao salvar mostra a mensagem e fica na tela', async () => {
    apiComSessao('admin', {
      'GET /v1/usuarios/2': [200, MARIA],
      'PATCH /v1/usuarios/2': [400, { erro: 'requisicao_invalida', mensagem: 'Dados inválidos' }],
    });
    const { wrapper, router } = await montarApp('/usuarios/2');
    await enviar(wrapper, 'form-usuario');
    expect(wrapper.find('[data-teste="erro-usuario"]').text()).toContain('Dados inválidos');
    expect(router.currentRoute.value.name).toBe('usuario');
  });

  it('usuário inexistente mostra o aviso', async () => {
    apiComSessao('admin', {
      'GET /v1/usuarios/99': [
        404,
        { erro: 'nao_encontrado', mensagem: 'Registro 99 não encontrado' },
      ],
    });
    const { wrapper } = await montarApp('/usuarios/99');
    await flushPromises();
    expect(wrapper.find('[data-teste="usuario-nao-encontrado"]').exists()).toBe(true);
    expect(wrapper.find('[data-teste="form-usuario"]').exists()).toBe(false);
  });

  it('o admin editando a si mesmo não muda o próprio papel nem o status', async () => {
    const eu = {
      ...MARIA,
      id: 1,
      email: 'admin@teste.com',
      nome: 'Admin da Silva',
      papel: 'admin',
    };
    const falsa = apiComSessao('admin', {
      'GET /v1/usuarios/1': [200, eu],
      'PATCH /v1/usuarios/1': (corpo) => [200, { ...eu, ...corpo }],
    });
    const { wrapper } = await montarApp('/usuarios/1');
    expect(wrapper.find('[data-teste="papel-leitor"] input').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-teste="ativo"] input').attributes('disabled')).toBeDefined();
    await preencher(wrapper, 'nome', 'Admin Novo');
    await enviar(wrapper, 'form-usuario');
    expect(falsa.chamou('PATCH /v1/usuarios/1')[0].corpo).toEqual({ nome: 'Admin Novo' });
  });
});

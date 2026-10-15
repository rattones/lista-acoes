import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, montarApp } from '../../../test/utils.js';

const EU = {
  id: 1,
  email: 'admin@teste.com',
  nome: 'Admin da Silva',
  papel: 'admin',
  ativo: 1,
  bloqueado_ate: null,
  ultimo_login_em: '2026-10-15 09:30:00',
  excluido_em: null,
};
const MARIA = {
  id: 2,
  email: 'maria@teste.com',
  nome: 'Maria Leitora',
  papel: 'leitor',
  ativo: 1,
  bloqueado_ate: null,
  ultimo_login_em: null,
  excluido_em: null,
};
const JOAO = { ...MARIA, id: 3, email: 'joao@teste.com', nome: 'João Inativo', ativo: 0 };
const BLOQUEADO = {
  ...MARIA,
  id: 4,
  email: 'bia@teste.com',
  nome: 'Bia Bloqueada',
  bloqueado_ate: '2999-01-01 10:00:00',
};
const EXCLUIDO = {
  ...MARIA,
  id: 5,
  email: 'ex@teste.com',
  nome: 'Ex Usuário',
  excluido_em: '2026-10-14 08:00:00',
};

const lista = (dados) => [
  200,
  { dados, paginacao: { pagina: 1, por_pagina: 100, total: dados.length, total_paginas: 1 } },
];
const listar = (url) =>
  new URL(url, 'http://app.teste').searchParams.get('incluir_excluidos') === 'true'
    ? lista([EU, MARIA, JOAO, BLOQUEADO, EXCLUIDO])
    : lista([EU, MARIA, JOAO, BLOQUEADO]);

function abrirApi(rotas = {}) {
  return apiComSessao('admin', {
    'GET /v1/usuarios': (corpo, opcoes, url) => listar(url),
    ...rotas,
  });
}

const ultimaUrl = (falsa, chave) => falsa.chamou(chave).at(-1).url;
const linha = (wrapper, id) => wrapper.find(`[data-teste="usuario-${id}"]`);

describe('tela de usuários', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leitor não acessa /usuarios (volta ao dashboard)', async () => {
    apiComSessao('leitor');
    const { router } = await montarApp('/usuarios');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('lista os usuários com papel, status e último login', async () => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/usuarios');
    expect(ultimaUrl(falsa, 'GET /v1/usuarios')).toContain('por_pagina=100');

    expect(linha(wrapper, 1).text()).toContain('Admin da Silva');
    expect(linha(wrapper, 1).text()).toContain('admin@teste.com');
    expect(linha(wrapper, 1).text()).toContain('Administrador');
    expect(linha(wrapper, 1).text()).toContain('15/10/2026 09:30');
    expect(linha(wrapper, 2).text()).toContain('Leitor');
    expect(linha(wrapper, 2).text()).toContain('Nunca');
    expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Ativo');
    expect(linha(wrapper, 3).find('[data-teste="status"]').text()).toBe('Inativo');
    expect(linha(wrapper, 4).find('[data-teste="status"]').text()).toBe('Bloqueado');
  });

  it('desativar e ativar mandam PATCH { ativo } e atualizam a linha', async () => {
    const falsa = abrirApi({
      'PATCH /v1/usuarios/2': (corpo) => [200, { ...MARIA, ativo: corpo.ativo ? 1 : 0 }],
      'PATCH /v1/usuarios/3': (corpo) => [200, { ...JOAO, ativo: corpo.ativo ? 1 : 0 }],
    });
    const { wrapper } = await montarApp('/usuarios');
    await linha(wrapper, 2).find('[data-teste="alternar-ativo"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('PATCH /v1/usuarios/2')[0].corpo).toEqual({ ativo: false });
    expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Inativo');

    await linha(wrapper, 3).find('[data-teste="alternar-ativo"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('PATCH /v1/usuarios/3')[0].corpo).toEqual({ ativo: true });
    expect(linha(wrapper, 3).find('[data-teste="status"]').text()).toBe('Ativo');
  });

  it('o próprio admin não se desativa nem se exclui por aqui', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/usuarios');
    expect(
      linha(wrapper, 1).find('[data-teste="alternar-ativo"]').attributes('disabled'),
    ).toBeDefined();
    expect(linha(wrapper, 1).find('[data-teste="excluir"]').attributes('disabled')).toBeDefined();
  });

  it('excluir pede confirmação; lógica por padrão, física com a opção marcada', async () => {
    const falsa = abrirApi({
      'DELETE /v1/usuarios/2': [204],
      'DELETE /v1/usuarios/3': [204],
    });
    const { wrapper } = await montarApp('/usuarios');

    await linha(wrapper, 2).find('[data-teste="excluir"]').trigger('click');
    await flushPromises();
    const dialogo = () => document.body.querySelector('[data-teste="dialogo-excluir"]');
    expect(dialogo().textContent).toContain('Maria Leitora');
    expect(falsa.chamou('DELETE /v1/usuarios/2')).toHaveLength(0);
    dialogo().querySelector('[data-teste="confirmar-exclusao"]').click();
    await flushPromises();
    expect(ultimaUrl(falsa, 'DELETE /v1/usuarios/2')).not.toContain('permanente');
    expect(linha(wrapper, 2).exists()).toBe(false);

    await linha(wrapper, 3).find('[data-teste="excluir"]').trigger('click');
    await flushPromises();
    dialogo().querySelector('[data-teste="excluir-permanente"] input').click();
    await flushPromises();
    expect(dialogo().textContent).toMatch(/não pode ser desfeita/);
    dialogo().querySelector('[data-teste="confirmar-exclusao"]').click();
    await flushPromises();
    expect(ultimaUrl(falsa, 'DELETE /v1/usuarios/3')).toContain('permanente=true');
  });

  it('mostrar excluídos lista os excluídos, que podem ser restaurados', async () => {
    const falsa = abrirApi({
      'POST /v1/usuarios/5/restaurar': [200, { ...EXCLUIDO, excluido_em: null }],
    });
    const { wrapper } = await montarApp('/usuarios');
    expect(linha(wrapper, 5).exists()).toBe(false);

    await wrapper.find('[data-teste="mostrar-excluidos"] input').setValue(true);
    await flushPromises();
    expect(ultimaUrl(falsa, 'GET /v1/usuarios')).toContain('incluir_excluidos=true');
    expect(linha(wrapper, 5).find('[data-teste="status"]').text()).toBe('Excluído');

    await linha(wrapper, 5).find('[data-teste="restaurar"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('POST /v1/usuarios/5/restaurar')).toHaveLength(1);
    expect(linha(wrapper, 5).find('[data-teste="status"]').text()).toBe('Ativo');
  });

  it('editar leva a /usuarios/:id', async () => {
    abrirApi({ 'GET /v1/usuarios/2': [200, MARIA] });
    const { wrapper, router } = await montarApp('/usuarios');
    expect(linha(wrapper, 2).find('[data-teste="editar"]').attributes('href')).toBe('/usuarios/2');
    await router.push('/usuarios/2');
    expect(router.currentRoute.value.name).toBe('usuario');
  });

  describe('convidar', () => {
    const dialogo = () => document.body.querySelector('[data-teste="dialogo-convite"]');
    async function convidar(wrapper, email = 'novo@teste.com', papel = 'admin') {
      await wrapper.find('[data-teste="convidar"]').trigger('click');
      await flushPromises();
      const campo = dialogo().querySelector('[data-teste="convite-email"] input');
      campo.value = email;
      campo.dispatchEvent(new Event('input'));
      if (papel === 'admin')
        dialogo().querySelector('[data-teste="convite-papel-admin"] input').click();
      await flushPromises();
      dialogo().querySelector('[data-teste="form-convite"]').dispatchEvent(new Event('submit'));
      await flushPromises();
    }

    it('envia { email, papel } e mostra a confirmação com o aviso de 72 horas', async () => {
      const falsa = abrirApi({
        'POST /v1/convites': (corpo) => [201, { ...corpo, expira_em: '2026-10-18T12:00:00.000Z' }],
      });
      const { wrapper } = await montarApp('/usuarios');
      await convidar(wrapper);
      expect(falsa.chamou('POST /v1/convites')[0].corpo).toEqual({
        email: 'novo@teste.com',
        papel: 'admin',
      });
      const confirmacao = dialogo().querySelector('[data-teste="convite-enviado"]').textContent;
      expect(confirmacao).toContain('novo@teste.com');
      expect(dialogo().textContent).toMatch(/72 horas/);
      expect(dialogo().textContent).toMatch(/não pode ser cancelado/);
    });

    it('papel padrão é leitor', async () => {
      const falsa = abrirApi({
        'POST /v1/convites': (corpo) => [201, { ...corpo, expira_em: 'x' }],
      });
      const { wrapper } = await montarApp('/usuarios');
      await convidar(wrapper, 'leitor2@teste.com', 'leitor');
      expect(falsa.chamou('POST /v1/convites')[0].corpo.papel).toBe('leitor');
    });

    it('Reenviar gera um novo link para o mesmo e-mail e papel', async () => {
      const falsa = abrirApi({
        'POST /v1/convites': (corpo) => [201, { ...corpo, expira_em: 'x' }],
      });
      const { wrapper } = await montarApp('/usuarios');
      await convidar(wrapper);
      dialogo().querySelector('[data-teste="reenviar-convite"]').click();
      await flushPromises();
      expect(falsa.chamou('POST /v1/convites')).toHaveLength(2);
      expect(falsa.chamou('POST /v1/convites')[1].corpo).toEqual({
        email: 'novo@teste.com',
        papel: 'admin',
      });
    });

    it('e-mail já cadastrado (409) ou falha de envio (503) mostram o erro', async () => {
      let resposta = [409, { erro: 'conflito', mensagem: 'Este e-mail já está cadastrado.' }];
      abrirApi({ 'POST /v1/convites': () => resposta });
      const { wrapper } = await montarApp('/usuarios');
      await convidar(wrapper, 'maria@teste.com');
      expect(dialogo().querySelector('[data-teste="erro-convite"]').textContent).toContain(
        'já está cadastrado',
      );
      resposta = [
        503,
        { erro: 'falha_envio_email', mensagem: 'Não foi possível enviar o e-mail.' },
      ];
      dialogo().querySelector('[data-teste="form-convite"]').dispatchEvent(new Event('submit'));
      await flushPromises();
      expect(dialogo().querySelector('[data-teste="erro-convite"]').textContent).toContain(
        'Não foi possível enviar',
      );
    });

    it('e-mail inválido não chama a API', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/usuarios');
      await convidar(wrapper, 'nao-e-email');
      expect(falsa.chamou('POST /v1/convites')).toHaveLength(0);
    });
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import {
  USUARIOS,
  apiComSessao,
  enviar,
  montarApp,
  preencher,
  sessao,
} from '../../../test/utils.js';
import { irPara } from '../utils/navegador.js';

vi.mock('../utils/navegador.js', () => ({ irPara: vi.fn() }));

const dialogo = () => document.body.querySelector('[data-teste="dialogo-excluir-conta"]');
const botaoConfirmar = () => dialogo().querySelector('[data-teste="confirmar-exclusao-conta"]');

async function digitarNoDialogo(teste, valor) {
  const campo = dialogo().querySelector(`[data-teste="${teste}"] input`);
  campo.value = valor;
  campo.dispatchEvent(new Event('input'));
  await flushPromises();
}

async function abrirExclusao(wrapper) {
  await wrapper.find('[data-teste="excluir-conta"]').trigger('click');
  await flushPromises();
}

describe('perfil (/perfil)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('mostra nome, e-mail desabilitado e papel do usuário logado', async () => {
    apiComSessao('leitor');
    const { wrapper } = await montarApp('/perfil');
    const email = wrapper.find('[data-teste="email"] input');
    expect(email.element.value).toBe('leitor@teste.com');
    expect(email.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-teste="nome"] input').element.value).toBe('Leitor Souza');
    expect(wrapper.find('[data-teste="pagina-perfil"]').text()).toContain('Leitor');
  });

  describe('dados', () => {
    it('salvar o nome manda PATCH { nome } e atualiza o menu', async () => {
      const falsa = apiComSessao('leitor', {
        'PATCH /v1/auth/eu': (corpo) => [200, { usuario: { ...USUARIOS.leitor, ...corpo } }],
      });
      const { wrapper } = await montarApp('/perfil');
      await preencher(wrapper, 'nome', '  Leitor Novo ');
      await enviar(wrapper, 'form-dados');
      expect(falsa.chamou('PATCH /v1/auth/eu')[0].corpo).toEqual({ nome: 'Leitor Novo' });
      expect(wrapper.find('[data-teste="menu-usuario"]').text()).toContain('Leitor Novo');
      expect(wrapper.find('[data-teste="aviso-dados"]').text()).toMatch(/salvo/);
    });

    it('nome vazio não salva', async () => {
      const falsa = apiComSessao('leitor');
      const { wrapper } = await montarApp('/perfil');
      await preencher(wrapper, 'nome', '  ');
      await enviar(wrapper, 'form-dados');
      expect(falsa.chamou('PATCH /v1/auth/eu')).toHaveLength(0);
    });
  });

  describe('troca de senha', () => {
    async function trocar(
      wrapper,
      { atual = 'senha-atual-123', nova = 'senha-nova-123', confirmacao = nova } = {},
    ) {
      await preencher(wrapper, 'senha-atual', atual);
      await preencher(wrapper, 'nova-senha', nova);
      await preencher(wrapper, 'confirmar-senha', confirmacao);
      await enviar(wrapper, 'form-senha');
    }

    it('manda senha atual e nova e adota a sessão nova devolvida pela API', async () => {
      const falsa = apiComSessao('leitor', {
        'PATCH /v1/auth/eu': [200, sessao('leitor', 'token-novo')],
      });
      const { wrapper, auth } = await montarApp('/perfil');
      await trocar(wrapper);
      expect(falsa.chamou('PATCH /v1/auth/eu')[0].corpo).toEqual({
        senha_atual: 'senha-atual-123',
        nova_senha: 'senha-nova-123',
      });
      expect(auth.token).toBe('token-novo');
      expect(auth.logado).toBe(true);
      expect(wrapper.find('[data-teste="aviso-senha"]').text()).toMatch(/Senha alterada/);
      expect(wrapper.find('[data-teste="senha-atual"] input').element.value).toBe('');
    });

    it('nova senha curta ou confirmação diferente não chamam a API', async () => {
      const falsa = apiComSessao('leitor');
      const { wrapper } = await montarApp('/perfil');
      await trocar(wrapper, { nova: 'curta' });
      await trocar(wrapper, { nova: 'senha-nova-123', confirmacao: 'outra-senha-123' });
      await trocar(wrapper, { atual: '' });
      expect(falsa.chamou('PATCH /v1/auth/eu')).toHaveLength(0);
    });

    it('senha atual incorreta (403) mostra o erro e mantém a sessão', async () => {
      apiComSessao('leitor', {
        'PATCH /v1/auth/eu': [403, { erro: 'senha_incorreta', mensagem: 'Senha atual incorreta' }],
      });
      const { wrapper, auth } = await montarApp('/perfil');
      await trocar(wrapper);
      expect(wrapper.find('[data-teste="erro-senha"]').text()).toContain('Senha atual incorreta');
      expect(auth.logado).toBe(true);
    });
  });

  describe('excluir minha conta', () => {
    it('o diálogo explica que tudo é apagado de vez', async () => {
      apiComSessao('leitor');
      const { wrapper } = await montarApp('/perfil');
      await abrirExclusao(wrapper);
      expect(dialogo().textContent).toMatch(/permanentemente/);
      expect(dialogo().textContent).toMatch(/não pode ser desfeita/);
    });

    it('a confirmação só habilita com a senha e "EXCLUIR" digitado', async () => {
      apiComSessao('leitor');
      const { wrapper } = await montarApp('/perfil');
      await abrirExclusao(wrapper);
      expect(botaoConfirmar().disabled).toBe(true);
      await digitarNoDialogo('confirmar-senha-exclusao', 'minha-senha-123');
      expect(botaoConfirmar().disabled).toBe(true);
      await digitarNoDialogo('confirmar-palavra', 'excluir');
      expect(botaoConfirmar().disabled).toBe(true);
      await digitarNoDialogo('confirmar-palavra', 'EXCLUIR');
      expect(botaoConfirmar().disabled).toBe(false);
      await digitarNoDialogo('confirmar-senha-exclusao', '');
      expect(botaoConfirmar().disabled).toBe(true);
    });

    it('sucesso: DELETE com a senha, encerra a sessão e vai para a landing', async () => {
      const falsa = apiComSessao('leitor', { 'DELETE /v1/auth/eu': [204] });
      const { wrapper, auth } = await montarApp('/perfil');
      await abrirExclusao(wrapper);
      await digitarNoDialogo('confirmar-senha-exclusao', 'minha-senha-123');
      await digitarNoDialogo('confirmar-palavra', 'EXCLUIR');
      botaoConfirmar().click();
      await flushPromises();
      expect(falsa.chamou('DELETE /v1/auth/eu')[0].corpo).toEqual({ senha: 'minha-senha-123' });
      expect(auth.logado).toBe(false);
      expect(irPara).toHaveBeenCalledWith('https://www.listadecompras.net');
    });

    it('último admin (409) mostra a mensagem específica e mantém a sessão', async () => {
      apiComSessao('admin', {
        'DELETE /v1/auth/eu': [
          409,
          { erro: 'ultimo_admin', mensagem: 'Você é o último administrador ativo.' },
        ],
      });
      const { wrapper, auth } = await montarApp('/perfil');
      await abrirExclusao(wrapper);
      await digitarNoDialogo('confirmar-senha-exclusao', 'minha-senha-123');
      await digitarNoDialogo('confirmar-palavra', 'EXCLUIR');
      botaoConfirmar().click();
      await flushPromises();
      const erro = dialogo().querySelector('[data-teste="erro-exclusao-conta"]').textContent;
      expect(erro).toMatch(/último administrador/);
      expect(erro).toMatch(/promova outro usuário a administrador/);
      expect(auth.logado).toBe(true);
      expect(irPara).not.toHaveBeenCalled();
    });

    it('senha incorreta (403) mostra o erro', async () => {
      apiComSessao('leitor', {
        'DELETE /v1/auth/eu': [403, { erro: 'senha_incorreta', mensagem: 'Senha atual incorreta' }],
      });
      const { wrapper, auth } = await montarApp('/perfil');
      await abrirExclusao(wrapper);
      await digitarNoDialogo('confirmar-senha-exclusao', 'errada-123456');
      await digitarNoDialogo('confirmar-palavra', 'EXCLUIR');
      botaoConfirmar().click();
      await flushPromises();
      expect(dialogo().querySelector('[data-teste="erro-exclusao-conta"]').textContent).toContain(
        'Senha atual incorreta',
      );
      expect(auth.logado).toBe(true);
    });
  });
});

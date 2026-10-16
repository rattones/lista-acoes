import { describe, it, expect, afterEach, vi } from 'vitest';
import { criarApiFalsa, enviar, montarApp, preencher, sessao } from '../../../test/utils.js';

async function entrar(wrapper, email = 'leitor@teste.com', senha = 'senha-forte-123') {
  await preencher(wrapper, 'email', email);
  await preencher(wrapper, 'senha', senha);
  await enviar(wrapper, 'form-login');
}

const mensagem = (wrapper) => wrapper.find('[data-teste="erro-login"]');

describe('tela de login', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('login com sucesso redireciona ao dashboard', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/auth/login': [200, sessao('leitor')] });
    const { wrapper, router } = await montarApp('/login');
    await entrar(wrapper, '  leitor@teste.com ');
    expect(falsa.chamou('POST /v1/auth/login')[0].corpo).toEqual({
      email: 'leitor@teste.com',
      senha: 'senha-forte-123',
    });
    expect(router.currentRoute.value.name).toBe('inicio');
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(true);
  });

  it('volta à página pedida antes do login', async () => {
    criarApiFalsa({ 'POST /v1/auth/login': [200, sessao('leitor')] });
    const { wrapper, router } = await montarApp('/ativos');
    expect(router.currentRoute.value.fullPath).toBe('/login?volta=/ativos');
    await entrar(wrapper);
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('ativos'));
  });

  it('não redireciona para outro site (volta precisa ser caminho interno)', async () => {
    criarApiFalsa({ 'POST /v1/auth/login': [200, sessao('leitor')] });
    const { wrapper, router } = await montarApp('/login?volta=//evil.com/x');
    await entrar(wrapper);
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('credenciais inválidas mostram a mensagem e continuam no login', async () => {
    criarApiFalsa({
      'POST /v1/auth/login': [
        401,
        { erro: 'nao_autenticado', mensagem: 'E-mail ou senha inválidos' },
      ],
    });
    const { wrapper, router } = await montarApp('/login');
    await entrar(wrapper);
    expect(mensagem(wrapper).text()).toContain('E-mail ou senha inválidos');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('conta bloqueada mostra o tempo restante', async () => {
    criarApiFalsa({
      'POST /v1/auth/login': [
        423,
        { erro: 'bloqueado', mensagem: 'Conta bloqueada', detalhes: { segundos_restantes: 601 } },
      ],
    });
    const { wrapper } = await montarApp('/login');
    await entrar(wrapper);
    expect(mensagem(wrapper).text()).toMatch(/bloqueada/i);
    expect(mensagem(wrapper).text()).toContain('11 minutos');
  });

  it('excesso de tentativas (429) e falha de rede têm mensagem própria', async () => {
    criarApiFalsa({
      'POST /v1/auth/login': [429, { erro: 'muitas_requisicoes', mensagem: 'Muitas tentativas.' }],
    });
    let app = await montarApp('/login');
    await entrar(app.wrapper);
    expect(mensagem(app.wrapper).text()).toContain('Muitas tentativas');

    criarApiFalsa();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    app = await montarApp('/login');
    await entrar(app.wrapper);
    expect(mensagem(app.wrapper).text()).toMatch(/servidor/i);
  });

  it('campos vazios não chamam a API', async () => {
    const falsa = criarApiFalsa();
    const { wrapper } = await montarApp('/login');
    await enviar(wrapper, 'form-login');
    expect(falsa.chamou('POST /v1/auth/login')).toHaveLength(0);
  });

  it('tem o link para recuperar a senha', async () => {
    criarApiFalsa();
    const { wrapper } = await montarApp('/login');
    expect(wrapper.find('[data-teste="link-recuperar"]').attributes('href')).toBe(
      '/recuperar-senha',
    );
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { criarApiFalsa, enviar, montarApp, preencher } from '../../../test/utils.js';

const MENSAGEM =
  'Se o e-mail estiver cadastrado, você receberá em instantes um link para redefinir a senha.';

describe('tela de recuperação de senha', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pede o e-mail, envia à API e mostra a mensagem dela', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/auth/recuperar-senha': [202, { mensagem: MENSAGEM }] });
    const { wrapper } = await montarApp('/recuperar-senha');
    await preencher(wrapper, 'email', 'fulano@teste.com');
    await enviar(wrapper, 'form-recuperar');
    expect(falsa.chamou('POST /v1/auth/recuperar-senha')[0].corpo).toEqual({
      email: 'fulano@teste.com',
    });
    expect(wrapper.find('[data-teste="recuperar-enviado"]').text()).toContain(MENSAGEM);
    expect(wrapper.find('[data-teste="form-recuperar"]').exists()).toBe(false);
  });

  it('limite de pedidos (429) mostra o erro', async () => {
    criarApiFalsa({
      'POST /v1/auth/recuperar-senha': [
        429,
        { erro: 'muitas_requisicoes', mensagem: 'Muitas tentativas. Aguarde.' },
      ],
    });
    const { wrapper } = await montarApp('/recuperar-senha');
    await preencher(wrapper, 'email', 'fulano@teste.com');
    await enviar(wrapper, 'form-recuperar');
    expect(wrapper.find('[data-teste="erro-recuperar"]').text()).toContain('Muitas tentativas');
  });

  it('tem o link de volta ao login', async () => {
    criarApiFalsa();
    const { wrapper } = await montarApp('/recuperar-senha');
    expect(wrapper.find('[data-teste="link-login"]').attributes('href')).toBe('/login');
  });
});

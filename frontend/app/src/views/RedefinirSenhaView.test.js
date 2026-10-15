import { describe, it, expect, afterEach, vi } from 'vitest';
import { criarApiFalsa, enviar, montarApp, preencher } from '../../../test/utils.js';

const TOKEN = 'eyJwYXlsb2FkIjp0cnVlfQ.assinatura-123';
const VALIDO = [200, { email: 'fulano@teste.com' }];

describe('tela de redefinição de senha', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('valida o token do fragmento (#t=), mostra o e-mail e tira o token do endereço', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/auth/redefinir-senha/validar': VALIDO });
    const { wrapper, router } = await montarApp(`/redefinir-senha#t=${encodeURIComponent(TOKEN)}`);
    expect(falsa.chamou('POST /v1/auth/redefinir-senha/validar')[0].corpo).toEqual({
      token: TOKEN,
    });
    expect(wrapper.find('[data-teste="redefinir-email"]').text()).toContain('fulano@teste.com');
    expect(router.currentRoute.value.hash).toBe('');
  });

  it('também aceita o token em ?t= (formato antigo do link)', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/auth/redefinir-senha/validar': VALIDO });
    const { router } = await montarApp(`/redefinir-senha?t=${encodeURIComponent(TOKEN)}`);
    expect(falsa.chamou('POST /v1/auth/redefinir-senha/validar')[0].corpo).toEqual({
      token: TOKEN,
    });
    expect(router.currentRoute.value.query.t).toBeUndefined();
  });

  it('define a nova senha e mostra o link para entrar', async () => {
    const falsa = criarApiFalsa({
      'POST /v1/auth/redefinir-senha/validar': VALIDO,
      'POST /v1/auth/redefinir-senha': [
        200,
        { mensagem: 'Senha redefinida. Entre com a nova senha.' },
      ],
    });
    const { wrapper } = await montarApp(`/redefinir-senha#t=${TOKEN}`);
    await preencher(wrapper, 'nova-senha', 'nova-senha-forte-1');
    await preencher(wrapper, 'confirmacao', 'nova-senha-forte-1');
    await enviar(wrapper, 'form-redefinir');
    expect(falsa.chamou('POST /v1/auth/redefinir-senha')[0].corpo).toEqual({
      token: TOKEN,
      senha: 'nova-senha-forte-1',
    });
    const sucesso = wrapper.find('[data-teste="redefinir-sucesso"]');
    expect(sucesso.text()).toContain('Senha redefinida');
    expect(sucesso.find('a').attributes('href')).toBe('/login');
  });

  it('senha curta ou confirmação diferente não chamam a API', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/auth/redefinir-senha/validar': VALIDO });
    const { wrapper } = await montarApp(`/redefinir-senha#t=${TOKEN}`);
    await preencher(wrapper, 'nova-senha', 'curta');
    await preencher(wrapper, 'confirmacao', 'curta');
    await enviar(wrapper, 'form-redefinir');
    await preencher(wrapper, 'nova-senha', 'nova-senha-forte-1');
    await preencher(wrapper, 'confirmacao', 'outra-senha-forte-1');
    await enviar(wrapper, 'form-redefinir');
    expect(falsa.chamou('POST /v1/auth/redefinir-senha')).toHaveLength(0);
  });

  it('token expirado mostra a mensagem e o link para pedir outro', async () => {
    criarApiFalsa({
      'POST /v1/auth/redefinir-senha/validar': [
        410,
        { erro: 'token_expirado', mensagem: 'Link expirado. Peça um novo.' },
      ],
    });
    const { wrapper } = await montarApp(`/redefinir-senha#t=${TOKEN}`);
    const aviso = wrapper.find('[data-teste="redefinir-link-invalido"]');
    expect(aviso.text()).toMatch(/expirado/i);
    expect(aviso.find('a').attributes('href')).toBe('/recuperar-senha');
    expect(wrapper.find('[data-teste="form-redefinir"]').exists()).toBe(false);
  });

  it('token inválido ou ausente mostra o aviso e o link para pedir outro', async () => {
    criarApiFalsa({
      'POST /v1/auth/redefinir-senha/validar': [
        400,
        { erro: 'token_invalido', mensagem: 'Link inválido ou já utilizado. Peça um novo.' },
      ],
    });
    let app = await montarApp(`/redefinir-senha#t=${TOKEN}`);
    expect(app.wrapper.find('[data-teste="redefinir-link-invalido"]').text()).toMatch(/inválido/i);

    const falsa = criarApiFalsa();
    app = await montarApp('/redefinir-senha');
    expect(app.wrapper.find('[data-teste="redefinir-link-invalido"]').exists()).toBe(true);
    expect(falsa.chamou('POST /v1/auth/redefinir-senha/validar')).toHaveLength(0);
  });

  it('o token expira durante o preenchimento: mostra o aviso', async () => {
    criarApiFalsa({
      'POST /v1/auth/redefinir-senha/validar': VALIDO,
      'POST /v1/auth/redefinir-senha': [
        410,
        { erro: 'token_expirado', mensagem: 'Link expirado. Peça um novo.' },
      ],
    });
    const { wrapper } = await montarApp(`/redefinir-senha#t=${TOKEN}`);
    await preencher(wrapper, 'nova-senha', 'nova-senha-forte-1');
    await preencher(wrapper, 'confirmacao', 'nova-senha-forte-1');
    await enviar(wrapper, 'form-redefinir');
    expect(wrapper.find('[data-teste="redefinir-link-invalido"]').text()).toMatch(/expirado/i);
  });
});

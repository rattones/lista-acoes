import { describe, it, expect, afterEach, vi } from 'vitest';
import { criarApiFalsa, enviar, montarApp, preencher } from '../../../test/utils.js';

const TOKEN = 'eyJmaW4iOiJjb252aXRlIn0.assinatura-456';
const CONVITE = [
  200,
  { email: 'convidado@teste.com', papel: 'leitor', expira_em: '2026-10-18T12:00:00.000Z' },
];

const botao = (wrapper) => wrapper.find('[data-teste="cadastrar"]');

async function preencherTudo(
  wrapper,
  { senha = 'senha-do-convidado-1', confirmacao = senha } = {},
) {
  await preencher(wrapper, 'nome', ' Convidado da Silva ');
  await preencher(wrapper, 'senha', senha);
  await preencher(wrapper, 'confirmacao', confirmacao);
}

describe('cadastro por convite (/cadastro#c=)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('valida o token do link, mostra o e-mail desabilitado e tira o token do endereço', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/convites/validar': CONVITE });
    const { wrapper, router } = await montarApp(`/cadastro#c=${encodeURIComponent(TOKEN)}`);
    expect(falsa.chamou('POST /v1/convites/validar')[0].corpo).toEqual({ token: TOKEN });
    const email = wrapper.find('[data-teste="email"] input');
    expect(email.element.value).toBe('convidado@teste.com');
    expect(email.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Leitor');
    expect(router.currentRoute.value.hash).toBe('');
    expect(wrapper.find('.v-navigation-drawer').exists()).toBe(false);
  });

  it('também aceita ?c= no link', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/convites/validar': CONVITE });
    await montarApp(`/cadastro?c=${encodeURIComponent(TOKEN)}`);
    expect(falsa.chamou('POST /v1/convites/validar')[0].corpo).toEqual({ token: TOKEN });
  });

  it('o botão só habilita com a confirmação do e-mail marcada', async () => {
    criarApiFalsa({ 'POST /v1/convites/validar': CONVITE });
    const { wrapper } = await montarApp(`/cadastro#c=${TOKEN}`);
    await preencherTudo(wrapper);
    expect(botao(wrapper).attributes('disabled')).toBeDefined();
    await wrapper.find('[data-teste="confirmo-email"] input').setValue(true);
    expect(botao(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('cadastra com o e-mail confirmado e leva ao login', async () => {
    const falsa = criarApiFalsa({
      'POST /v1/convites/validar': CONVITE,
      'POST /v1/convites/aceitar': [
        201,
        { id: 9, email: 'convidado@teste.com', nome: 'Convidado da Silva', papel: 'leitor' },
      ],
    });
    const { wrapper } = await montarApp(`/cadastro#c=${TOKEN}`);
    await preencherTudo(wrapper);
    await wrapper.find('[data-teste="confirmo-email"] input').setValue(true);
    await enviar(wrapper, 'form-cadastro');
    expect(falsa.chamou('POST /v1/convites/aceitar')[0].corpo).toEqual({
      token: TOKEN,
      nome: 'Convidado da Silva',
      senha: 'senha-do-convidado-1',
      email_confirmado: 'convidado@teste.com',
    });
    const sucesso = wrapper.find('[data-teste="cadastro-sucesso"]');
    expect(sucesso.text()).toContain('convidado@teste.com');
    expect(sucesso.find('a').attributes('href')).toBe('/login');
  });

  it('senha curta ou diferente da confirmação não chama a API', async () => {
    const falsa = criarApiFalsa({ 'POST /v1/convites/validar': CONVITE });
    const { wrapper } = await montarApp(`/cadastro#c=${TOKEN}`);
    await wrapper.find('[data-teste="confirmo-email"] input').setValue(true);
    await preencherTudo(wrapper, { senha: 'curta' });
    await enviar(wrapper, 'form-cadastro');
    await preencherTudo(wrapper, { senha: 'senha-do-convidado-1', confirmacao: 'outra-senha-123' });
    await enviar(wrapper, 'form-cadastro');
    expect(falsa.chamou('POST /v1/convites/aceitar')).toHaveLength(0);
  });

  it('token expirado mostra a mensagem, sem formulário', async () => {
    criarApiFalsa({
      'POST /v1/convites/validar': [
        410,
        { erro: 'token_expirado', mensagem: 'Convite expirado. Peça um novo.' },
      ],
    });
    const { wrapper } = await montarApp(`/cadastro#c=${TOKEN}`);
    const aviso = wrapper.find('[data-teste="convite-invalido"]');
    expect(aviso.text()).toMatch(/expirado/i);
    expect(aviso.text()).toMatch(/peça um novo convite/i);
    expect(wrapper.find('[data-teste="form-cadastro"]').exists()).toBe(false);
  });

  it('convite inválido, ausente ou de e-mail já cadastrado mostram o aviso', async () => {
    criarApiFalsa({
      'POST /v1/convites/validar': [400, { erro: 'token_invalido', mensagem: 'Convite inválido.' }],
    });
    let app = await montarApp(`/cadastro#c=${TOKEN}`);
    expect(app.wrapper.find('[data-teste="convite-invalido"]').text()).toMatch(/inválido/i);

    criarApiFalsa({
      'POST /v1/convites/validar': [
        409,
        { erro: 'conflito', mensagem: 'Este e-mail já está cadastrado.' },
      ],
    });
    app = await montarApp(`/cadastro#c=${TOKEN}`);
    const aviso = app.wrapper.find('[data-teste="convite-invalido"]');
    expect(aviso.text()).toContain('já está cadastrado');
    expect(aviso.find('a').attributes('href')).toBe('/login');

    const falsa = criarApiFalsa();
    app = await montarApp('/cadastro');
    expect(app.wrapper.find('[data-teste="convite-invalido"]').exists()).toBe(true);
    expect(falsa.chamou('POST /v1/convites/validar')).toHaveLength(0);
  });

  it('o convite expira durante o preenchimento: mostra o aviso', async () => {
    criarApiFalsa({
      'POST /v1/convites/validar': CONVITE,
      'POST /v1/convites/aceitar': [
        410,
        { erro: 'token_expirado', mensagem: 'Convite expirado. Peça um novo.' },
      ],
    });
    const { wrapper } = await montarApp(`/cadastro#c=${TOKEN}`);
    await preencherTudo(wrapper);
    await wrapper.find('[data-teste="confirmo-email"] input').setValue(true);
    await enviar(wrapper, 'form-cadastro');
    expect(wrapper.find('[data-teste="convite-invalido"]').text()).toMatch(/expirado/i);
  });
});

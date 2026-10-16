import { describe, it, expect, afterEach, vi } from 'vitest';
import { apiComSessao, enviar, montarApp, preencher } from '../../../test/utils.js';
import { PREVIA_GOOGL, rotasAtivos } from '../../../test/ativos.js';

const LINK = 'https://www.google.com/finance/quote/GOOGL:NASDAQ';

const abrirApi = (rotas = {}) =>
  apiComSessao('admin', {
    ...rotasAtivos(),
    'POST /v1/ativos/pre-visualizar': [200, PREVIA_GOOGL],
    ...rotas,
  });

async function preVisualizar(wrapper, link = LINK) {
  await preencher(wrapper, 'link', link);
  await enviar(wrapper, 'form-link');
}

const campo = (wrapper, teste) => wrapper.find(`[data-teste="${teste}"] input`).element.value;

describe('inclusão de ativo (/ativos/novo)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leitor não acessa (volta ao dashboard)', async () => {
    apiComSessao('leitor');
    const { router } = await montarApp('/ativos/novo');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it.each([
    'não é um link',
    'ftp://www.google.com/finance/quote/GOOGL:NASDAQ',
    'https://www.investing.com/equities/google-inc',
    'https://www.google.com/search?q=googl',
    'https://finance.yahoo.com/',
  ])('link inválido (%s) mostra o erro sem chamar a API', async (link) => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper, link);
    expect(falsa.chamou('POST /v1/ativos/pre-visualizar')).toHaveLength(0);
    expect(wrapper.text()).toMatch(/Google Finance ou do Yahoo Finance/);
    expect(wrapper.find('[data-teste="form-ativo"]').exists()).toBe(false);
  });

  it.each([
    LINK,
    'https://www.google.com/finance/quote/USDT-BRL?hl=pt',
    'https://finance.yahoo.com/quote/PETR4.SA/',
    'https://br.financas.yahoo.com/quote/BRL=X',
  ])('link válido (%s) chama o pre-visualizar', async (link) => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper, link);
    expect(falsa.chamou('POST /v1/ativos/pre-visualizar')[0].corpo).toEqual({ url: link });
    expect(wrapper.find('[data-teste="form-ativo"]').exists()).toBe(true);
  });

  it('mostra a pré-visualização com os dados coletados e a cotação', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper);
    expect(campo(wrapper, 'campo-ativo')).toBe('GOOGL');
    expect(campo(wrapper, 'campo-nome')).toBe('Alphabet Inc.');
    expect(campo(wrapper, 'campo-ticker_yahoo')).toBe('GOOGL');
    expect(campo(wrapper, 'campo-url_historico')).toBe(PREVIA_GOOGL.ativo.url_historico);
    expect(wrapper.find('[data-teste="cotacao"]').text()).toMatch(/US\$\s?245,10/);
    expect(wrapper.find('[data-teste="cotacao"]').text()).toContain('Yahoo Finance');
  });

  it('confirmar grava (POST com os campos, editáveis) e volta à lista', async () => {
    const falsa = abrirApi({
      'POST /v1/ativos': (corpo) => [201, { id: 9, status: 'ativo', ...corpo }],
    });
    const { wrapper, router } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper);
    await preencher(wrapper, 'campo-nome', 'Alphabet (classe A)');
    await enviar(wrapper, 'form-ativo');
    expect(falsa.chamou('POST /v1/ativos')[0].corpo).toEqual({
      ...PREVIA_GOOGL.ativo,
      nome: 'Alphabet (classe A)',
      status: 'ativo',
    });
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('ativos'));
  });

  it('erro da fonte no pre-visualizar mostra a mensagem da API', async () => {
    abrirApi({
      'POST /v1/ativos/pre-visualizar': [
        422,
        { erro: 'ativo_nao_encontrado', mensagem: 'XYZ não foi encontrado no Yahoo Finance.' },
      ],
    });
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper, 'https://finance.yahoo.com/quote/XYZ');
    expect(wrapper.find('[data-teste="erro-link"]').text()).toContain('não foi encontrado');
    expect(wrapper.find('[data-teste="form-ativo"]').exists()).toBe(false);
  });

  it('ativo já cadastrado (409) mostra o erro e fica na confirmação', async () => {
    abrirApi({
      'POST /v1/ativos': [409, { erro: 'conflito', mensagem: 'Registro duplicado' }],
    });
    const { wrapper, router } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper);
    await enviar(wrapper, 'form-ativo');
    expect(wrapper.find('[data-teste="erro-ativo"]').text()).toContain('Registro duplicado');
    expect(wrapper.find('[data-teste="erro-ativo"]').text()).toMatch(/excluídos/);
    expect(router.currentRoute.value.name).toBe('ativo-novo');
  });

  it('campos obrigatórios vazios não gravam', async () => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper);
    await preencher(wrapper, 'campo-url_historico', '');
    await enviar(wrapper, 'form-ativo');
    expect(falsa.chamou('POST /v1/ativos')).toHaveLength(0);
  });

  it('"Outro link" volta ao passo do link', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos/novo');
    await preVisualizar(wrapper);
    await wrapper.find('[data-teste="outro-link"]').trigger('click');
    expect(wrapper.find('[data-teste="form-ativo"]').exists()).toBe(false);
    expect(wrapper.find('[data-teste="form-link"]').exists()).toBe(true);
  });
});

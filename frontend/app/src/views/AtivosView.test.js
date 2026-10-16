import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, montarApp, preencher } from '../../../test/utils.js';
import { CSCO, EXCLUIDO, PETR4, USDT, rotasAtivos } from '../../../test/ativos.js';

const abrirApi = (papel = 'admin', rotas = {}) =>
  apiComSessao(papel, { ...rotasAtivos(), ...rotas });

const linha = (wrapper, id) => wrapper.find(`[data-teste="ativo-${id}"]`);
const visiveis = (wrapper) =>
  wrapper.findAll('[data-teste^="ativo-"]').map((tr) => tr.attributes('data-teste'));

async function escolher(wrapper, teste, valor) {
  wrapper.findComponent(`[data-teste="${teste}"]`).vm.$emit('update:modelValue', valor);
  await flushPromises();
}

describe('lista de ativos (/ativos)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista ativo, nome, tipo, bolsa, status e a última cotação', async () => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/ativos');
    expect(falsa.chamou('GET /v1/ativos').at(-1).url).toContain('por_pagina=100');

    await vi.waitFor(() => expect(falsa.chamou('GET /v1/precos')).toHaveLength(3));
    await flushPromises();
    const csco = linha(wrapper, 1).text();
    expect(csco).toContain('CSCO');
    expect(csco).toContain('Cisco Systems');
    expect(csco).toContain('Ação');
    expect(csco).toContain('NASDAQ');
    expect(csco).toMatch(/US\$\s?58,40/);
    expect(csco).toContain('14/10/2026');
    expect(linha(wrapper, 2).text()).toMatch(/R\$\s?37,25/);
    expect(linha(wrapper, 3).text()).toContain('Stablecoin');
    expect(linha(wrapper, 3).find('[data-teste="cotacao"]').text()).toBe('—');
    // Uma consulta da cotação mais recente por ativo.
    const precos = falsa.chamou('GET /v1/precos').map((c) => c.url);
    expect(precos).toHaveLength(3);
    expect(precos[0]).toContain('ordenar=-data');
    expect(precos[0]).toContain('por_pagina=1');
  });

  it('filtra por tipo, por status e pela busca (código ou nome)', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos');
    expect(visiveis(wrapper)).toEqual(['ativo-1', 'ativo-2', 'ativo-3']);

    await escolher(wrapper, 'filtro-tipo', 'stablecoin');
    expect(visiveis(wrapper)).toEqual(['ativo-3']);
    await escolher(wrapper, 'filtro-tipo', null);

    await escolher(wrapper, 'filtro-status', 'inativo');
    expect(visiveis(wrapper)).toEqual(['ativo-2']);
    await escolher(wrapper, 'filtro-status', null);

    await preencher(wrapper, 'busca', 'petro');
    await flushPromises();
    expect(visiveis(wrapper)).toEqual(['ativo-2']);
    await preencher(wrapper, 'busca', 'csco');
    await flushPromises();
    expect(visiveis(wrapper)).toEqual(['ativo-1']);
  });

  it('o switch de status manda PATCH { status } e atualiza a linha', async () => {
    const falsa = abrirApi('admin', {
      'PATCH /v1/ativos/1': (corpo) => [200, { ...CSCO, ...corpo }],
    });
    const { wrapper } = await montarApp('/ativos');
    const chave = () => linha(wrapper, 1).find('[data-teste="status"] input');
    expect(chave().element.checked).toBe(true);
    await chave().setValue(false);
    await flushPromises();
    expect(falsa.chamou('PATCH /v1/ativos/1')[0].corpo).toEqual({ status: 'inativo' });
    expect(chave().element.checked).toBe(false);
  });

  it('o switch volta ao valor anterior e mostra o erro se a API falhar', async () => {
    abrirApi('admin', {
      'PATCH /v1/ativos/2': [503, { erro: 'indisponivel', mensagem: 'Serviço indisponível' }],
    });
    const { wrapper } = await montarApp('/ativos');
    const chave = () => linha(wrapper, 2).find('[data-teste="status"] input');
    expect(chave().element.checked).toBe(false);
    await chave().setValue(true);
    await flushPromises();
    expect(chave().element.checked).toBe(false);
    expect(wrapper.find('[data-teste="erro-ativos"]').text()).toContain('Serviço indisponível');
  });

  it('leitor vê a lista sem botões de edição (status só como texto)', async () => {
    const falsa = abrirApi('leitor');
    const { wrapper } = await montarApp('/ativos');
    expect(linha(wrapper, 1).text()).toContain('CSCO');
    expect(wrapper.find('[data-teste="novo-ativo"]').exists()).toBe(false);
    expect(wrapper.find('[data-teste="mostrar-excluidos"]').exists()).toBe(false);
    expect(linha(wrapper, 1).find('[data-teste="status"] input').exists()).toBe(false);
    expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Ativo');
    expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Inativo');
    expect(falsa.chamou('GET /v1/ativos').at(-1).url).not.toContain('incluir_excluidos');
  });

  it('o código do ativo leva a /ativos/:id', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos');
    expect(linha(wrapper, 1).find('[data-teste="abrir"]').attributes('href')).toBe('/ativos/1');
    expect(wrapper.find('[data-teste="novo-ativo"]').attributes('href')).toBe('/ativos/novo');
  });

  it('admin vê os excluídos e os restaura', async () => {
    const falsa = abrirApi('admin', {
      'POST /v1/ativos/4/restaurar': [200, { ...EXCLUIDO, excluido_em: null }],
    });
    const { wrapper } = await montarApp('/ativos');
    expect(linha(wrapper, 4).exists()).toBe(false);

    await wrapper.find('[data-teste="mostrar-excluidos"] input').setValue(true);
    await flushPromises();
    expect(falsa.chamou('GET /v1/ativos').at(-1).url).toContain('incluir_excluidos=true');
    expect(linha(wrapper, 4).find('[data-teste="status"]').text()).toBe('Excluído');

    await linha(wrapper, 4).find('[data-teste="restaurar"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('POST /v1/ativos/4/restaurar')).toHaveLength(1);
    expect(linha(wrapper, 4).find('[data-teste="status"] input').exists()).toBe(true);
  });

  it('erro ao carregar mostra a mensagem', async () => {
    abrirApi('admin', {
      'GET /v1/ativos': [500, { erro: 'erro_interno', mensagem: 'Falha ao listar' }],
    });
    const { wrapper } = await montarApp('/ativos');
    expect(wrapper.find('[data-teste="erro-ativos"]').text()).toContain('Falha ao listar');
  });

  it('a lista vem em ordem de código', async () => {
    abrirApi('admin', rotasAtivos([USDT, PETR4, CSCO]));
    const { wrapper } = await montarApp('/ativos');
    expect(visiveis(wrapper)).toEqual(['ativo-1', 'ativo-2', 'ativo-3']);
  });
});

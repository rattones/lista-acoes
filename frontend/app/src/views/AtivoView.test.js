import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, enviar, montarApp, preencher } from '../../../test/utils.js';
import { CSCO, PETR4, USDT, rotasAtivos } from '../../../test/ativos.js';

const abrirApi = (papel = 'admin', rotas = {}) =>
  apiComSessao(papel, {
    ...rotasAtivos(),
    'GET /v1/ativos/1': [200, CSCO],
    'GET /v1/ativos/3': [200, USDT],
    ...rotas,
  });

const campo = (wrapper, teste) => wrapper.find(`[data-teste="${teste}"] input`);
const dialogo = () => document.body.querySelector('[data-teste="dialogo-excluir"]');

describe('ativo (/ativos/:id)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra os dados do ativo e a última cotação gravada', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos/1');
    expect(campo(wrapper, 'campo-ativo').element.value).toBe('CSCO');
    expect(campo(wrapper, 'campo-nome').element.value).toBe('Cisco Systems');
    expect(campo(wrapper, 'campo-url_pagina').element.value).toBe(CSCO.url_pagina);
    expect(wrapper.find('[data-teste="cotacao"]').text()).toMatch(/US\$\s?58,40/);
    expect(wrapper.text()).toContain('08/10/2026');
  });

  it('sem cotação gravada, avisa', async () => {
    abrirApi();
    const { wrapper } = await montarApp('/ativos/3');
    expect(wrapper.find('[data-teste="cotacao"]').text()).toMatch(/Nenhuma cotação/);
    expect(wrapper.find('[data-teste="campo-observacao"] textarea').element.value).toContain(
      'BRL=X',
    );
  });

  it('salvar manda PATCH com os campos editados e volta à lista', async () => {
    const falsa = abrirApi('admin', {
      'PATCH /v1/ativos/1': (corpo) => [200, { ...CSCO, ...corpo }],
    });
    const { wrapper, router } = await montarApp('/ativos/1');
    await preencher(wrapper, 'campo-nome', 'Cisco');
    await wrapper.find('[data-teste="campo-observacao"] textarea').setValue('Rede');
    await enviar(wrapper, 'form-ativo');
    const corpo = falsa.chamou('PATCH /v1/ativos/1')[0].corpo;
    expect(corpo).toEqual({ nome: 'Cisco', observacao: 'Rede' });
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('ativos'));
  });

  it('salvar sem mudanças volta à lista sem chamar a API', async () => {
    const falsa = abrirApi();
    const { wrapper, router } = await montarApp('/ativos/1');
    await enviar(wrapper, 'form-ativo');
    expect(falsa.chamou('PATCH /v1/ativos/1')).toHaveLength(0);
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('ativos'));
  });

  it('erro ao salvar mostra a mensagem e fica na tela', async () => {
    abrirApi('admin', {
      'PATCH /v1/ativos/1': [400, { erro: 'requisicao_invalida', mensagem: 'URL inválida' }],
    });
    const { wrapper, router } = await montarApp('/ativos/1');
    await preencher(wrapper, 'campo-url_cotacao', 'xx');
    await enviar(wrapper, 'form-ativo');
    expect(wrapper.find('[data-teste="erro-ativo"]').text()).toContain('URL inválida');
    expect(router.currentRoute.value.name).toBe('ativo');
  });

  it('Atualizar dados da fonte chama atualizar-dados e mostra os dados novos', async () => {
    const falsa = abrirApi('admin', {
      'POST /v1/ativos/1/atualizar-dados': [
        200,
        {
          ativo: { ...CSCO, nome: 'Cisco Systems, Inc.' },
          cotacao: { preco: 60, moeda: 'USD', em: '2026-10-15T14:00:00.000Z', fonte: 'Yahoo' },
        },
      ],
    });
    const { wrapper } = await montarApp('/ativos/1');
    await wrapper.find('[data-teste="atualizar-dados"]').trigger('click');
    await flushPromises();
    expect(falsa.chamou('POST /v1/ativos/1/atualizar-dados')).toHaveLength(1);
    expect(campo(wrapper, 'campo-nome').element.value).toBe('Cisco Systems, Inc.');
    expect(wrapper.find('[data-teste="cotacao"]').text()).toMatch(/US\$\s?60,00/);
    expect(wrapper.find('[data-teste="aviso-ativo"]').text()).toMatch(/atualizados/);
  });

  it('falha da fonte no atualizar-dados mostra o erro', async () => {
    abrirApi('admin', {
      'POST /v1/ativos/1/atualizar-dados': [
        502,
        { erro: 'fonte_indisponivel', mensagem: 'Yahoo Finance indisponível' },
      ],
    });
    const { wrapper } = await montarApp('/ativos/1');
    await wrapper.find('[data-teste="atualizar-dados"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-teste="erro-ativo"]').text()).toContain('indisponível');
  });

  it('excluir pede confirmação: lógica por padrão e volta à lista', async () => {
    const falsa = abrirApi('admin', { 'DELETE /v1/ativos/1': [204] });
    const { wrapper, router } = await montarApp('/ativos/1');
    await wrapper.find('[data-teste="excluir"]').trigger('click');
    await flushPromises();
    expect(dialogo().textContent).toContain('CSCO');
    expect(falsa.chamou('DELETE /v1/ativos/1')).toHaveLength(0);
    dialogo().querySelector('[data-teste="confirmar-exclusao"]').click();
    await flushPromises();
    expect(falsa.chamou('DELETE /v1/ativos/1').at(-1).url).not.toContain('permanente');
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('ativos'));
  });

  it('exclusão física com a opção marcada avisa que apaga sinais e cotações', async () => {
    const falsa = abrirApi('admin', { 'DELETE /v1/ativos/1': [204] });
    const { wrapper } = await montarApp('/ativos/1');
    await wrapper.find('[data-teste="excluir"]').trigger('click');
    await flushPromises();
    dialogo().querySelector('[data-teste="excluir-permanente"] input').click();
    await flushPromises();
    expect(dialogo().textContent).toMatch(/sinais/);
    expect(dialogo().textContent).toMatch(/não pode ser desfeita/);
    dialogo().querySelector('[data-teste="confirmar-exclusao"]').click();
    await flushPromises();
    expect(falsa.chamou('DELETE /v1/ativos/1').at(-1).url).toContain('permanente=true');
  });

  it('leitor vê os dados só para leitura, sem os botões de edição', async () => {
    abrirApi('leitor');
    const { wrapper } = await montarApp('/ativos/1');
    expect(campo(wrapper, 'campo-ativo').element.value).toBe('CSCO');
    expect(campo(wrapper, 'campo-nome').attributes('readonly')).toBeDefined();
    for (const botao of ['salvar', 'atualizar-dados', 'excluir']) {
      expect(wrapper.find(`[data-teste="${botao}"]`).exists()).toBe(false);
    }
  });

  it('ativo inexistente mostra o aviso', async () => {
    abrirApi('admin', {
      'GET /v1/ativos/99': [404, { erro: 'nao_encontrado', mensagem: 'Registro 99 não encontrado' }],
    });
    const { wrapper } = await montarApp('/ativos/99');
    expect(wrapper.find('[data-teste="ativo-nao-encontrado"]').exists()).toBe(true);
    expect(wrapper.find('[data-teste="form-ativo"]').exists()).toBe(false);
  });

  it('o status pode ser trocado na edição', async () => {
    const falsa = abrirApi('admin', {
      'GET /v1/ativos/2': [200, PETR4],
      'PATCH /v1/ativos/2': (corpo) => [200, { ...PETR4, ...corpo }],
    });
    const { wrapper } = await montarApp('/ativos/2');
    await campo(wrapper, 'campo-status').setValue(true);
    await enviar(wrapper, 'form-ativo');
    expect(falsa.chamou('PATCH /v1/ativos/2')[0].corpo).toEqual({ status: 'ativo' });
  });
});

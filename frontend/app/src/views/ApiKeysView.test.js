import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, montarApp } from '../../../test/utils.js';

const ESCOPOS = [
  'ativos:read',
  'execucoes:read',
  'execucoes:write',
  'sinais:read',
  'sinais:write',
  'precos:read',
  'precos:write',
  'noticias:read',
  'noticias:write',
];

const COLETOR = {
  id: 1,
  nome: 'Coletor de preços',
  prefixo: 'a1b2c3d4',
  escopos: ['ativos:read', 'precos:write'],
  criado_por: 1,
  criado_em: '2026-10-15 09:30:00',
  ultimo_uso_em: '2026-10-16 07:05:00',
  revogado_em: null,
  excluido_em: null,
};
const ANTIGA = {
  ...COLETOR,
  id: 2,
  nome: 'Agente antigo',
  prefixo: 'ffff0000',
  escopos: ['noticias:write'],
  criado_em: '2026-10-14 08:00:00',
  ultimo_uso_em: null,
  revogado_em: '2026-10-15 10:00:00',
};
const CHAVE = 'la_0badc0de_0123456789abcdef0123456789abcdef';
const NOVA = {
  ...COLETOR,
  id: 3,
  nome: 'Coletor de notícias',
  prefixo: '0badc0de',
  escopos: ['ativos:read', 'noticias:write'],
  criado_em: '2026-10-16 11:00:00',
  ultimo_uso_em: null,
};

const lista = (dados) => [
  200,
  { dados, paginacao: { pagina: 1, por_pagina: 100, total: dados.length, total_paginas: 1 } },
];

function abrirApi(rotas = {}) {
  return apiComSessao('admin', {
    'GET /v1/agentes-tokens': lista([COLETOR, ANTIGA]),
    'GET /v1/agentes-tokens/escopos': [200, ESCOPOS],
    ...rotas,
  });
}

const linha = (wrapper, id) => wrapper.find(`[data-teste="chave-${id}"]`);
async function mostrarRevogadas(wrapper, ligar = true) {
  await wrapper.find('[data-teste="mostrar-revogadas"] input').setValue(ligar);
  await flushPromises();
}
const dialogoNova = () => document.body.querySelector('[data-teste="dialogo-nova-chave"]');
const dialogoRevogar = () => document.body.querySelector('[data-teste="dialogo-revogar"]');

async function criarChave(wrapper, nome = 'Coletor de notícias', escopos = NOVA.escopos) {
  await wrapper.find('[data-teste="nova-chave"]').trigger('click');
  await flushPromises();
  const campo = dialogoNova().querySelector('[data-teste="chave-nome"] input');
  campo.value = nome;
  campo.dispatchEvent(new Event('input'));
  for (const escopo of escopos) {
    dialogoNova().querySelector(`[data-teste="escopo-${escopo}"] input`).click();
    await flushPromises();
  }
  dialogoNova().querySelector('[data-teste="form-nova-chave"]').dispatchEvent(new Event('submit'));
  await flushPromises();
}

describe('tela de API keys', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.execCommand;
  });

  it('leitor não acessa /api-keys (volta ao dashboard)', async () => {
    apiComSessao('leitor');
    const { router } = await montarApp('/api-keys');
    expect(router.currentRoute.value.name).toBe('inicio');
  });

  it('lista nome, prefixo, escopos, criação, último uso e status', async () => {
    const falsa = abrirApi();
    const { wrapper } = await montarApp('/api-keys');
    const url = falsa.chamou('GET /v1/agentes-tokens').at(-1).url;
    expect(url).toContain('por_pagina=100');
    expect(url).toContain('ordenar=-criado_em');

    const ativa = linha(wrapper, 1).text();
    expect(ativa).toContain('Coletor de preços');
    expect(ativa).toContain('la_a1b2c3d4_');
    expect(ativa).toContain('ativos:read');
    expect(ativa).toContain('precos:write');
    expect(ativa).toContain('15/10/2026 09:30');
    expect(ativa).toContain('16/10/2026 07:05');
    expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Ativa');

    // Tarefa 031: as revogadas só aparecem com "Mostrar revogadas" ligado.
    expect(linha(wrapper, 2).exists()).toBe(false);
    await mostrarRevogadas(wrapper);
    expect(linha(wrapper, 2).text()).toContain('Nunca');
    expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Revogada');
    expect(linha(wrapper, 2).find('[data-teste="revogar"]').exists()).toBe(false);
  });

  describe('mostrar revogadas (tarefa 031)', () => {
    it('por padrão esconde as revogadas e o rótulo diz quantas estão ocultas', async () => {
      abrirApi();
      const { wrapper } = await montarApp('/api-keys');
      expect(linha(wrapper, 1).exists()).toBe(true);
      expect(linha(wrapper, 2).exists()).toBe(false);
      expect(wrapper.find('[data-teste="mostrar-revogadas"]').text()).toContain(
        'Mostrar revogadas (1)',
      );
    });

    it('ligar mostra as revogadas sem chamar a API de novo; desligar esconde', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/api-keys');
      const chamadas = falsa.chamou('GET /v1/agentes-tokens').length;

      await mostrarRevogadas(wrapper);
      expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Revogada');
      await mostrarRevogadas(wrapper, false);
      expect(linha(wrapper, 2).exists()).toBe(false);
      expect(falsa.chamou('GET /v1/agentes-tokens')).toHaveLength(chamadas);
    });

    it('sem revogadas, o switch fica desabilitado', async () => {
      abrirApi({ 'GET /v1/agentes-tokens': lista([COLETOR]) });
      const { wrapper } = await montarApp('/api-keys');
      expect(
        wrapper.find('[data-teste="mostrar-revogadas"] input').attributes('disabled'),
      ).toBeDefined();
    });

    it('só revogadas e switch desligado: a lista vazia orienta a ligar o switch', async () => {
      abrirApi({ 'GET /v1/agentes-tokens': lista([ANTIGA, { ...ANTIGA, id: 4 }]) });
      const { wrapper } = await montarApp('/api-keys');
      expect(wrapper.find('[data-teste="lista-vazia"]').text()).toBe(
        'Nenhuma API key ativa. Ligue "Mostrar revogadas" para ver as 2 revogadas.',
      );
    });

    it('sem nenhuma chave, a lista vazia continua simples', async () => {
      abrirApi({ 'GET /v1/agentes-tokens': lista([]) });
      const { wrapper } = await montarApp('/api-keys');
      expect(wrapper.find('[data-teste="lista-vazia"]').text()).toBe('Nenhuma API key.');
    });
  });

  describe('nova chave', () => {
    it('envia { nome, escopos } e mostra a chave uma única vez, com aviso e botão copiar', async () => {
      const falsa = abrirApi({
        'POST /v1/agentes-tokens': (corpo) => [201, { ...NOVA, ...corpo, chave: CHAVE }],
      });
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper);

      expect(falsa.chamou('POST /v1/agentes-tokens')[0].corpo).toEqual({
        nome: 'Coletor de notícias',
        escopos: ['ativos:read', 'noticias:write'],
      });
      const exibida = dialogoNova().querySelector('[data-teste="chave-gerada"]');
      expect(exibida.textContent).toContain(CHAVE);
      expect(dialogoNova().textContent).toMatch(/não será exibida novamente/);

      dialogoNova().querySelector('[data-teste="copiar-chave"]').click();
      await flushPromises();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CHAVE);
      expect(dialogoNova().textContent).toMatch(/Copiada/);

      // A chave nova entra na lista, sem o segredo.
      expect(linha(wrapper, 3).text()).toContain('Coletor de notícias');
      expect(linha(wrapper, 3).text()).not.toContain(CHAVE);
    });

    // Tarefa 030: por HTTP (DEV), o navigator.clipboard não existe.
    it('sem navigator.clipboard (HTTP), copiar ainda funciona', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      document.execCommand = vi.fn((comando) => comando === 'copy');
      abrirApi({
        'POST /v1/agentes-tokens': (corpo) => [201, { ...NOVA, ...corpo, chave: CHAVE }],
      });
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper);
      dialogoNova().querySelector('[data-teste="copiar-chave"]').click();
      await flushPromises();
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(dialogoNova().textContent).toMatch(/Copiada/);
      expect(dialogoNova().querySelector('[data-teste="erro-nova-chave"]')).toBeNull();
    });

    it('sem nenhuma forma de copiar, pede a cópia manual e deixa a chave selecionada', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      document.execCommand = vi.fn(() => false);
      abrirApi({
        'POST /v1/agentes-tokens': (corpo) => [201, { ...NOVA, ...corpo, chave: CHAVE }],
      });
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper);
      dialogoNova().querySelector('[data-teste="copiar-chave"]').click();
      await flushPromises();
      expect(dialogoNova().querySelector('[data-teste="erro-nova-chave"]').textContent).toMatch(
        /copie manualmente/,
      );
      expect(window.getSelection().toString()).toBe(CHAVE);
    });

    it('a chave some ao fechar e não volta ao reabrir o diálogo', async () => {
      abrirApi({
        'POST /v1/agentes-tokens': (corpo) => [201, { ...NOVA, ...corpo, chave: CHAVE }],
      });
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper);
      expect(document.body.textContent).toContain(CHAVE);

      dialogoNova().querySelector('[data-teste="fechar-nova-chave"]').click();
      await flushPromises();
      expect(document.body.textContent).not.toContain(CHAVE);

      await wrapper.find('[data-teste="nova-chave"]').trigger('click');
      await flushPromises();
      expect(dialogoNova().querySelector('[data-teste="chave-gerada"]')).toBeNull();
      expect(dialogoNova().querySelector('[data-teste="chave-nome"] input').value).toBe('');
      expect(document.body.textContent).not.toContain(CHAVE);
    });

    it('sem nome ou sem escopo não chama a API', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper, '   ', ['ativos:read']);
      expect(falsa.chamou('POST /v1/agentes-tokens')).toHaveLength(0);
      dialogoNova().querySelector('[data-teste="fechar-nova-chave"]').click();
      await flushPromises();
      await criarChave(wrapper, 'Sem escopo', []);
      expect(falsa.chamou('POST /v1/agentes-tokens')).toHaveLength(0);
      expect(dialogoNova().textContent).toMatch(/Escolha ao menos um escopo/);
    });

    it('erro da API aparece no diálogo', async () => {
      abrirApi({
        'POST /v1/agentes-tokens': [
          400,
          { erro: 'requisicao_invalida', mensagem: 'Dados inválidos', detalhes: null },
        ],
      });
      const { wrapper } = await montarApp('/api-keys');
      await criarChave(wrapper);
      expect(dialogoNova().querySelector('[data-teste="erro-nova-chave"]').textContent).toContain(
        'Dados inválidos',
      );
      expect(dialogoNova().querySelector('[data-teste="chave-gerada"]')).toBeNull();
    });
  });

  describe('revogar', () => {
    it('pede confirmação e atualiza o status na lista', async () => {
      const falsa = abrirApi({
        'POST /v1/agentes-tokens/1/revogar': [
          200,
          { ...COLETOR, revogado_em: '2026-10-16 12:00:00' },
        ],
      });
      const { wrapper } = await montarApp('/api-keys');
      await linha(wrapper, 1).find('[data-teste="revogar"]').trigger('click');
      await flushPromises();
      expect(dialogoRevogar().textContent).toContain('Coletor de preços');
      expect(falsa.chamou('POST /v1/agentes-tokens/1/revogar')).toHaveLength(0);

      dialogoRevogar().querySelector('[data-teste="confirmar-revogacao"]').click();
      await flushPromises();
      expect(falsa.chamou('POST /v1/agentes-tokens/1/revogar')).toHaveLength(1);
      // Com "Mostrar revogadas" desligado (padrão), a chave revogada sai da lista.
      expect(linha(wrapper, 1).exists()).toBe(false);
      await mostrarRevogadas(wrapper);
      expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Revogada');
      expect(linha(wrapper, 1).find('[data-teste="revogar"]').exists()).toBe(false);
    });

    it('com "Mostrar revogadas" ligado, a linha fica e mostra Revogada', async () => {
      abrirApi({
        'POST /v1/agentes-tokens/1/revogar': [
          200,
          { ...COLETOR, revogado_em: '2026-10-16 12:00:00' },
        ],
      });
      const { wrapper } = await montarApp('/api-keys');
      await mostrarRevogadas(wrapper);
      await linha(wrapper, 1).find('[data-teste="revogar"]').trigger('click');
      await flushPromises();
      dialogoRevogar().querySelector('[data-teste="confirmar-revogacao"]').click();
      await flushPromises();
      expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Revogada');
    });

    it('cancelar não revoga', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/api-keys');
      await linha(wrapper, 1).find('[data-teste="revogar"]').trigger('click');
      await flushPromises();
      dialogoRevogar().querySelector('[data-teste="cancelar-revogacao"]').click();
      await flushPromises();
      expect(falsa.chamou('POST /v1/agentes-tokens/1/revogar')).toHaveLength(0);
      expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Ativa');
    });

    it('falha na revogação mostra o erro e mantém o status', async () => {
      abrirApi({
        'POST /v1/agentes-tokens/1/revogar': [
          409,
          { erro: 'conflito', mensagem: 'API key 1 já está revogada' },
        ],
      });
      const { wrapper } = await montarApp('/api-keys');
      await linha(wrapper, 1).find('[data-teste="revogar"]').trigger('click');
      await flushPromises();
      dialogoRevogar().querySelector('[data-teste="confirmar-revogacao"]').click();
      await flushPromises();
      expect(wrapper.find('[data-teste="erro-api-keys"]').text()).toContain('já está revogada');
    });
  });
});

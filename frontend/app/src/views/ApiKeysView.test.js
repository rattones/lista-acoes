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
  afterEach(() => vi.unstubAllGlobals());

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

    expect(linha(wrapper, 2).text()).toContain('Nunca');
    expect(linha(wrapper, 2).find('[data-teste="status"]').text()).toBe('Revogada');
    expect(linha(wrapper, 2).find('[data-teste="revogar"]').exists()).toBe(false);
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
      expect(linha(wrapper, 1).find('[data-teste="status"]').text()).toBe('Revogada');
      expect(linha(wrapper, 1).find('[data-teste="revogar"]').exists()).toBe(false);
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

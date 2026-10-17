import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { apiComSessao, montarApp } from '../../../test/utils.js';
import { HISTORICO, rotasDashboard } from '../../../test/dashboard.js';

// O jsdom não tem canvas: o gráfico do Chart.js vira um componente que guarda os dados recebidos.
vi.mock('vue-chartjs', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Chart: defineComponent({
      name: 'ChartFalso',
      props: { type: String, data: Object, options: Object },
      setup: () => () => h('div', { 'data-teste': 'grafico-canvas' }),
    }),
  };
});

const abrirApi = (opcoes, papel = 'leitor') => apiComSessao(papel, rotasDashboard(opcoes));

const query = (chamada) => new URL(chamada.url, 'http://app.teste').searchParams;
const ultima = (falsa, rota) => query(falsa.chamou(`GET /v1/dashboard/${rota}`).at(-1));

const cards = (wrapper) =>
  wrapper.findAll('[data-teste^="card-"]').map((c) => c.attributes('data-teste').slice(5));
const linhasTabela = (wrapper) =>
  wrapper
    .findAll('[data-teste^="indicadores-"]')
    .map((tr) => tr.attributes('data-teste').slice(12));

async function clicar(wrapper, teste) {
  await wrapper.find(`[data-teste="${teste}"]`).trigger('click');
  await flushPromises();
}

async function escolher(wrapper, teste, valor) {
  wrapper.findComponent(`[data-teste="${teste}"]`).vm.$emit('update:modelValue', valor);
  await flushPromises();
}

describe('dashboard (/)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('cards do resumo', () => {
    it('mostram nota, variação, fechamento, leituras e a data da execução', async () => {
      abrirApi();
      const { wrapper } = await montarApp('/');
      expect(wrapper.find('[data-teste="data-execucao"]').text()).toContain('16/10/2026');
      // Maior nota primeiro (empate: ordem alfabética).
      expect(cards(wrapper)).toEqual(['PETR4', 'TSLA', 'CSCO', 'USDT-BRL']);

      const petr4 = wrapper.find('[data-teste="card-PETR4"]');
      expect(petr4.find('[data-teste="nota"]').text()).toBe('4');
      expect(petr4.find('[data-teste="variacao"]').text()).toBe('+1');
      expect(petr4.text()).toMatch(/R\$\s?37,25/);
      expect(petr4.text()).toContain('Alta');
      expect(petr4.find('[data-teste="concordam"]').text()).toMatch(/Concordam/);

      const tsla = wrapper.find('[data-teste="card-TSLA"]');
      expect(tsla.find('[data-teste="variacao"]').text()).toBe('−1');
      expect(tsla.find('[data-teste="concordam"]').text()).toMatch(/Divergem/);
      expect(tsla.text()).toContain('Negativo');
      expect(tsla.text()).toContain('Recuperação');
      expect(wrapper.find('[data-teste="card-USDT-BRL"] [data-teste="variacao"]').text()).toBe('—');
    });

    it('sem execução: aviso no lugar dos cards', async () => {
      abrirApi({ resumo: { execucao: null, ativos: [] } });
      const { wrapper } = await montarApp('/');
      expect(wrapper.find('[data-teste="sem-execucao"]').text()).toContain(
        'Ainda não há execuções do relatório',
      );
      expect(cards(wrapper)).toEqual([]);
    });
  });

  describe('gráfico do ativo em foco', () => {
    it('abre no ativo de maior nota, com preço em linha e nota em barras', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/');
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('2');
      expect(ultima(falsa, 'historico').get('de')).toBe('2026-09-16');
      expect(wrapper.find('[data-teste="card-PETR4"]').classes()).toContain('em-foco');
      expect(wrapper.find('[data-teste="titulo-grafico"]').text()).toContain('PETR4');

      const { data } = wrapper.findComponent({ name: 'ChartFalso' }).props();
      expect(data.labels).toEqual(['14/10', '15/10']);
      const [linha, barras] = data.datasets;
      expect(linha).toMatchObject({ type: 'line', yAxisID: 'y', data: [36.9, 37.25] });
      expect(barras).toMatchObject({ type: 'bar', yAxisID: 'y1', data: [null, 4] });
    });

    it('o tooltip da nota mostra as leituras de notícias e do gráfico', async () => {
      abrirApi();
      const { wrapper } = await montarApp('/');
      const { data, options } = wrapper.findComponent({ name: 'ChartFalso' }).props();
      const rotulo = options.plugins.tooltip.callbacks.label({
        dataset: data.datasets[1],
        datasetIndex: 1,
        dataIndex: 1,
        raw: 4,
      });
      expect(rotulo.join(' ')).toMatch(/Nota 4.*Notícias: Positivo.*Gráfico: Alta/);
    });

    it('clicar num card troca o ativo do gráfico', async () => {
      const falsa = abrirApi();
      const { wrapper, router } = await montarApp('/');
      await clicar(wrapper, 'card-CSCO');
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('1');
      expect(wrapper.find('[data-teste="card-CSCO"]').classes()).toContain('em-foco');
      await vi.waitFor(() => expect(router.currentRoute.value.query.foco).toBe('CSCO'));
    });

    it('ativo sem preço no período: gráfico vazio com aviso', async () => {
      abrirApi({ historico: () => ({ precos: [], notas: [] }) });
      const { wrapper } = await montarApp('/');
      expect(wrapper.find('[data-teste="sem-precos"]').text()).toMatch(/sem preços/i);
    });
  });

  describe('filtros rápidos', () => {
    it('os chips de ativos reduzem cards, tabela e notícias', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/');
      expect(ultima(falsa, 'noticias').get('ativos')).toBe('2,3,1,4');
      await clicar(wrapper, 'chip-ativo-CSCO');
      await clicar(wrapper, 'chip-ativo-TSLA');
      expect(cards(wrapper)).toEqual(['TSLA', 'CSCO']);
      expect(linhasTabela(wrapper).sort()).toEqual(['CSCO', 'TSLA']);
      expect(ultima(falsa, 'noticias').get('ativos')).toBe('3,1');
      // O ativo em foco (PETR4) saiu: passa para o primeiro da lista.
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('3');
    });

    it('a nota mínima tira os ativos de nota menor', async () => {
      abrirApi();
      const { wrapper } = await montarApp('/');
      await clicar(wrapper, 'nota-4');
      expect(cards(wrapper)).toEqual(['PETR4', 'TSLA']);
    });

    it('o período muda o "de" do histórico e das notícias', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/');
      expect(ultima(falsa, 'noticias').get('de')).toBe('2026-09-16');
      await clicar(wrapper, 'periodo-3m');
      expect(ultima(falsa, 'historico').get('de')).toBe('2026-07-16');
      expect(ultima(falsa, 'noticias').get('de')).toBe('2026-07-16');
      await clicar(wrapper, 'periodo-1a');
      expect(ultima(falsa, 'historico').get('de')).toBe('2025-10-16');
      await clicar(wrapper, 'periodo-tudo');
      expect(ultima(falsa, 'historico').has('de')).toBe(false);
      expect(ultima(falsa, 'noticias').has('de')).toBe(false);
    });
  });

  describe('filtros avançados', () => {
    it('reduzem os cards, mostram quantos estão ativos e "Limpar filtros" volta ao padrão', async () => {
      abrirApi();
      const { wrapper, router } = await montarApp('/');
      await clicar(wrapper, 'mais-filtros');
      expect(document.body.querySelector('[data-teste="dialogo-filtros"]')).not.toBeNull();

      await escolher(wrapper, 'filtro-tipo', 'stablecoin');
      expect(cards(wrapper)).toEqual(['USDT-BRL']);
      await escolher(wrapper, 'filtro-tipo', null);

      await escolher(wrapper, 'filtro-ifr', 'sobrevendido');
      expect(cards(wrapper)).toEqual(['TSLA']);
      await escolher(wrapper, 'filtro-concordam', 'nao');
      expect(cards(wrapper)).toEqual(['TSLA']);
      await escolher(wrapper, 'filtro-concordam', 'sim');
      expect(cards(wrapper)).toEqual([]);
      await escolher(wrapper, 'filtro-concordam', null);
      await escolher(wrapper, 'filtro-ifr', null);

      await escolher(wrapper, 'filtro-pctb', 'abaixo');
      await escolher(wrapper, 'filtro-noticias', 'positivo');
      expect(cards(wrapper)).toEqual(['PETR4']);
      expect(wrapper.find('[data-teste="mais-filtros"]').text()).toContain('2');

      await clicar(wrapper, 'nota-3');
      await clicar(wrapper, 'limpar-filtros');
      expect(cards(wrapper)).toEqual(['PETR4', 'TSLA', 'CSCO', 'USDT-BRL']);
      await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}));
    });
  });

  describe('filtros na URL', () => {
    it('os filtros vão para a query', async () => {
      abrirApi();
      const { wrapper, router } = await montarApp('/');
      await clicar(wrapper, 'chip-ativo-TSLA');
      await clicar(wrapper, 'chip-ativo-PETR4');
      await clicar(wrapper, 'periodo-6m');
      await clicar(wrapper, 'nota-3');
      await vi.waitFor(() =>
        expect(router.currentRoute.value.query).toEqual({
          ativos: 'TSLA,PETR4',
          periodo: '6m',
          nota: '3',
        }),
      );
    });

    it('um link com filtros abre a mesma visão', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp(
        '/?ativos=PETR4,TSLA,CSCO&periodo=3m&nota=3&foco=CSCO&grafico=alta',
      );
      expect(cards(wrapper)).toEqual(['PETR4']);
      // O foco pedido (CSCO) foi tirado pelo filtro do gráfico: vai para o primeiro.
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('2');
      expect(ultima(falsa, 'historico').get('de')).toBe('2026-07-16');
    });

    it('o foco vem da query', async () => {
      const falsa = abrirApi();
      await montarApp('/?foco=USDT-BRL');
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('4');
    });

    it('valores inválidos são ignorados', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp(
        '/?ativos=XXXX,TSLA&periodo=2d&nota=9&tipo=foo&ifr=muito&concordam=talvez&foco=ZZZ',
      );
      expect(cards(wrapper)).toEqual(['TSLA']);
      expect(ultima(falsa, 'historico').get('de')).toBe('2026-09-16');
      expect(ultima(falsa, 'historico').get('ativo_id')).toBe('3');
    });
  });

  describe('tabela e notícias', () => {
    it('destaca IFR > 70 / < 30 e %B > 1 / < 0', async () => {
      abrirApi();
      const { wrapper } = await montarApp('/');
      const celula = (ativo, campo) =>
        wrapper.find(`[data-teste="indicadores-${ativo}"] [data-teste="${campo}"]`);
      expect(celula('CSCO', 'rsi14').classes()).toContain('sobrecomprado');
      expect(celula('TSLA', 'rsi14').classes()).toContain('sobrevendido');
      expect(celula('PETR4', 'rsi14').classes()).not.toContain('sobrecomprado');
      expect(celula('TSLA', 'bollinger_pctb').classes()).toContain('sobrecomprado');
      expect(celula('PETR4', 'bollinger_pctb').classes()).toContain('sobrevendido');
      expect(celula('CSCO', 'ret_1m').text()).toBe('3,2%');
    });

    it('lista as notícias com sentimento, fonte, data e link seguro', async () => {
      const falsa = abrirApi();
      const { wrapper } = await montarApp('/');
      expect(ultima(falsa, 'noticias').get('limite')).toBe('10');
      const noticias = wrapper.findAll('[data-teste="noticia"]');
      expect(noticias).toHaveLength(2);
      expect(noticias[0].text()).toContain('Petrobras anuncia dividendos');
      expect(noticias[0].text()).toContain('Valor');
      expect(noticias[0].text()).toContain('16/10/2026');
      expect(noticias[0].text()).toContain('Positivo');
      expect(noticias[1].text()).toContain('Geral');
      const link = noticias[0].find('a');
      expect(link.attributes('href')).toBe('https://noticias.exemplo/petr4');
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toBe('noopener noreferrer');
    });
  });

  it('usa os dados do histórico do ativo em foco', async () => {
    abrirApi({ historico: (id) => (id === 2 ? HISTORICO : { precos: [], notas: [] }) });
    const { wrapper } = await montarApp('/');
    expect(wrapper.find('[data-teste="sem-precos"]').exists()).toBe(false);
    await clicar(wrapper, 'card-TSLA');
    expect(wrapper.find('[data-teste="sem-precos"]').exists()).toBe(true);
  });
});

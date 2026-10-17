'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { dataHoraLocal, lerRss, limparHtml, urlGoogleNews } = require('../../src/noticias/rss');

const feed = (nome) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'rss', `${nome}.xml`), 'utf8');

// Leitura dos feeds RSS (tarefa 037), com feeds reais gravados.
describe('lerRss', () => {
  it('Google News: título sem o veículo, fonte do <source>, URL e data', () => {
    const itens = lerRss(feed('google-PETR4-pt'));
    expect(itens).toHaveLength(6);
    expect(itens[0]).toEqual({
      titulo:
        'Petrobras (PETR4): pagamento bilionário e acordo de US$ 859 milhões; de onde vem o dinheiro?',
      fonte: 'Suno - Investimentos Inteligentes',
      url: expect.stringMatching(/^https:\/\/news\.google\.com\/rss\/articles\//),
      resumo: null,
      publicada: Date.parse('2026-10-14T16:45:03Z'),
    });
    const csco = lerRss(feed('google-CSCO-en'));
    expect(csco[0]).toMatchObject({
      titulo: "Here's Why Cisco Systems (CSCO) Fell More Than Broader Market",
      fonte: 'Yahoo Finance',
    });
  });

  it('feed geral: fonte do nome do feed e resumo sem HTML', () => {
    const valor = lerRss(feed('geral-valor'), { fonte: 'Valor Econômico' });
    expect(valor[0]).toMatchObject({
      titulo: 'Tunisianos realizam maior protesto em anos contra o presidente Kais Saied',
      fonte: 'Valor Econômico',
      url: 'https://valor.globo.com/mundo/noticia/2026/10/17/tunisianos-realizam-maior-protesto-em-anos-contra-o-presidente-kais-saied.ghtml',
      publicada: Date.parse('2026-10-17T15:10:09Z'),
    });
    expect(valor[0].resumo).not.toMatch(/<|&[a-z]+;/);

    const mw = lerRss(feed('geral-marketwatch'), { fonte: 'MarketWatch' });
    expect(mw[0].titulo).toMatch(/^‘Some people did everything right’/);
    expect(mw[0].resumo).toBe('”I earn $110,000 a year.”');

    for (const nome of ['geral-infomoney', 'geral-moneytimes', 'geral-cnbc']) {
      const itens = lerRss(feed(nome), { fonte: 'X' });
      expect(itens.length).toBeGreaterThan(0);
      for (const item of itens) {
        expect(item.url).toMatch(/^https:\/\//);
        expect(Number.isFinite(item.publicada)).toBe(true);
        expect(item.titulo).not.toMatch(/<|&[a-z]+;/);
      }
    }
  });

  it('item sem título, sem link http(s) ou sem data válida fica de fora', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>ok</title><link>https://a.teste/1</link><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><link>https://a.teste/2</link><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>sem link</title><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>ftp</title><link>ftp://a.teste/3</link><pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>sem data</title><link>https://a.teste/4</link></item>
      <item><title>data ruim</title><link>https://a.teste/5</link><pubDate>ontem</pubDate></item>
    </channel></rss>`;
    expect(lerRss(xml).map((i) => i.titulo)).toEqual(['ok']);
  });

  it('XML inválido ou sem canal RSS → erro', () => {
    expect(() => lerRss('<html><body>fora do ar</body>')).toThrow(/RSS/);
    expect(() => lerRss('<rss><channel><item>')).toThrow(/RSS/);
    expect(() => lerRss('')).toThrow(/RSS/);
  });
});

describe('limparHtml', () => {
  it('tira tags e entidades, junta espaços e corta em 500 caracteres', () => {
    expect(limparHtml('<p><img src="x"> Alta de&nbsp;3% &amp; <b>recorde</b></p>')).toBe(
      'Alta de 3% & recorde',
    );
    expect(limparHtml('a'.repeat(600))).toHaveLength(500);
    expect(limparHtml('a'.repeat(600)).endsWith('…')).toBe(true);
    expect(limparHtml('  ')).toBeNull();
    expect(limparHtml(undefined)).toBeNull();
  });
});

describe('urlGoogleNews', () => {
  it('busca código e nome dos últimos 7 dias, em pt-BR e en-US', () => {
    const ativo = { ativo: 'PETR4', nome: 'Petrobras PN' };
    const pt = new URL(urlGoogleNews(ativo, 'pt'));
    expect(pt.origin + pt.pathname).toBe('https://news.google.com/rss/search');
    expect(pt.searchParams.get('q')).toBe('"PETR4" OR "Petrobras PN" when:7d');
    expect(Object.fromEntries([...pt.searchParams].filter(([k]) => k !== 'q'))).toEqual({
      hl: 'pt-BR',
      gl: 'BR',
      ceid: 'BR:pt-419',
    });
    const en = new URL(urlGoogleNews(ativo, 'en'));
    expect(en.searchParams.get('ceid')).toBe('US:en');
    expect(
      new URL(urlGoogleNews({ ativo: 'USDT-BRL', nome: null }, 'pt')).searchParams.get('q'),
    ).toBe('"USDT-BRL" when:7d');
  });
});

describe('dataHoraLocal', () => {
  it('formata no fuso informado, como a API grava (AAAA-MM-DD HH:MM:SS)', () => {
    const ms = Date.parse('2026-10-14T16:45:03Z');
    expect(dataHoraLocal(ms, 'America/Sao_Paulo')).toBe('2026-10-14 13:45:03');
    expect(dataHoraLocal(ms, 'UTC')).toBe('2026-10-14 16:45:03');
  });
});

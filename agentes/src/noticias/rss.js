'use strict';

const { XMLParser, XMLValidator } = require('fast-xml-parser');

// Leitura de feeds RSS 2.0 (tarefa 037): Google News por ativo e feeds gerais de mercado.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  htmlEntities: true,
  isArray: (nome) => nome === 'item',
});

const TAMANHO_RESUMO = 500;
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const texto = (valor) =>
  valor === null || valor === undefined
    ? ''
    : typeof valor === 'object'
      ? String(valor['#text'] ?? '')
      : String(valor);

// Texto puro de um trecho HTML (descrição do feed): sem tags nem entidades, espaços juntos,
// até 500 caracteres. Vazio → null.
function limparHtml(html) {
  const limpo = texto(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome) => {
      if (nome[0] === '#') {
        const codigo =
          nome[1].toLowerCase() === 'x' ? parseInt(nome.slice(2), 16) : Number(nome.slice(1));
        return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
      }
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) return null;
  return limpo.length > TAMANHO_RESUMO ? `${limpo.slice(0, TAMANHO_RESUMO - 1)}…` : limpo;
}

// Itens do feed: { titulo, fonte, url, resumo, publicada (ms) }. No Google News o título termina
// em " - Veículo" e o veículo vem em <source>; nos gerais, a fonte é o nome do feed. O resumo
// que só repete o título (Google News) fica null. Sem título, link http(s) ou data → fora.
function lerRss(xml, { fonte = null } = {}) {
  if (typeof xml !== 'string' || !xml.trim() || XMLValidator.validate(xml) !== true) {
    throw new Error('feed RSS inválido (XML malformado)');
  }
  const canal = parser.parse(xml)?.rss?.channel;
  if (!canal || typeof canal !== 'object') throw new Error('feed RSS inválido: sem <rss><channel>');

  return (canal.item ?? [])
    .map((item) => {
      const veiculo = texto(item.source).trim();
      let titulo = limparHtml(item.title);
      if (titulo && veiculo && titulo.endsWith(` - ${veiculo}`)) {
        titulo = titulo.slice(0, -(veiculo.length + 3)).trim();
      }
      const resumo = limparHtml(item.description);
      return {
        titulo,
        fonte: veiculo || fonte,
        url: texto(item.link).trim(),
        resumo: resumo && titulo && resumo.startsWith(titulo) ? null : resumo,
        publicada: Date.parse(texto(item.pubDate)),
      };
    })
    .filter((i) => i.titulo && /^https?:\/\//.test(i.url) && Number.isFinite(i.publicada));
}

const IDIOMAS = {
  pt: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
};

// Busca do Google News pelo código e pelo nome do ativo, só dos últimos 7 dias.
function urlGoogleNews(ativo, idioma) {
  const termos = [ativo.ativo, ativo.nome].filter(Boolean).map((t) => `"${t}"`);
  const query = new URLSearchParams({ q: `${termos.join(' OR ')} when:7d`, ...IDIOMAS[idioma] });
  return `https://news.google.com/rss/search?${query}`;
}

// 'AAAA-MM-DD HH:MM:SS' no fuso informado, como a API grava as datas.
function dataHoraLocal(ms, fuso) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}

module.exports = { IDIOMAS, dataHoraLocal, lerRss, limparHtml, urlGoogleNews };

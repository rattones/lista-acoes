'use strict';

const { listarAtivos } = require('../ativos');
const { IDIOMAS, dataHoraLocal, lerRss, urlGoogleNews } = require('./rss');

// Coletor de notícias (tarefa 037): Google News de cada ativo com status "ativo" (pt-BR e
// en-US) e os feeds gerais de mercado, gravados por POST /v1/noticias/lote (upsert pela URL).
// Só as dos últimos 7 dias, até 20 por feed. O sentimento fica com o agente de decisão.

const DIA = 24 * 60 * 60 * 1000;
const DIAS = 7;
const POR_FEED = 20;
// URLs do Google News têm ~300 caracteres: 200 notícias por lote ficam bem abaixo de 1 MB.
const TAMANHO_LOTE = 200;

function feedsDos(ativos, feedsGerais, comGerais) {
  const porAtivo = ativos.flatMap((ativo) =>
    Object.entries(IDIOMAS).map(([idioma, { hl }]) => ({
      nome: `Google News (${ativo.ativo}, ${hl})`,
      url: urlGoogleNews(ativo, idioma),
      ativoId: ativo.id,
    })),
  );
  const gerais = comGerais ? feedsGerais.map((f) => ({ ...f, fonte: f.nome })) : [];
  return [...porAtivo, ...gerais];
}

async function lerFeed(http, feed, desde) {
  const { status, corpo } = await http.getTexto(feed.url, { fonte: feed.nome });
  if (status >= 300) throw new Error(`${feed.nome} respondeu ${status}`);
  return lerRss(corpo, { fonte: feed.fonte })
    .filter((item) => item.publicada >= desde)
    .sort((a, b) => b.publicada - a.publicada)
    .slice(0, POR_FEED);
}

async function coletarNoticias(contexto, { ativo: codigo } = {}) {
  const { api, http, log, agora, fuso, feedsGerais = [] } = contexto;
  const resumo = { ativos: 0, feeds: 0, noticias: 0, inseridos: 0, atualizados: 0, falhas: 0 };
  const ativos = await listarAtivos(api, codigo);
  if (codigo && !ativos.length) {
    log.error(`ativo ${codigo} não encontrado entre os ativos com status ativo`);
    return { ...resumo, falhas: 1 };
  }
  resumo.ativos = ativos.length;

  // A primeira ocorrência de cada URL vale: os feeds dos ativos vêm antes dos gerais. A notícia
  // geral vai sem ativo_id, para o upsert não desligar do ativo uma notícia já ligada a ele.
  const porUrl = new Map();
  const desde = agora() - DIAS * DIA;
  for (const feed of feedsDos(ativos, feedsGerais, !codigo)) {
    resumo.feeds += 1;
    try {
      for (const item of await lerFeed(http, feed, desde)) {
        if (porUrl.has(item.url)) continue;
        porUrl.set(item.url, {
          ...(feed.ativoId && { ativo_id: feed.ativoId }),
          titulo: item.titulo,
          resumo: item.resumo,
          fonte: item.fonte,
          url: item.url,
          publicada_em: dataHoraLocal(item.publicada, fuso),
        });
      }
    } catch (e) {
      resumo.falhas += 1;
      log.error({ feed: feed.nome, erro: e.message }, 'falha ao ler o feed');
    }
  }

  const itens = [...porUrl.values()];
  resumo.noticias = itens.length;
  try {
    const { inseridos, atualizados } = await api.enviarLote('/v1/noticias/lote', itens, {
      tamanho: TAMANHO_LOTE,
    });
    Object.assign(resumo, { inseridos, atualizados });
  } catch (e) {
    resumo.falhas += 1;
    log.error({ erro: e.message }, 'falha ao gravar as notícias');
  }
  return resumo;
}

module.exports = { coletarNoticias };

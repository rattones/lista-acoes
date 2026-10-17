'use strict';

const { fonteDaUrl, lerBinance, lerYahoo, moedaDoPar, urlBinance, urlYahoo } = require('./fontes');

// Coletor de preços (tarefa 036): para cada ativo com status "ativo", os últimos 5 pregões pela
// url_historico (Yahoo chart ou klines da Binance), gravados por POST /v1/precos/lote (upsert
// por ativo e data). Ativo sem nenhum preço, ou com --historico, recebe 2 anos. A falha de um
// ativo não interrompe os outros: entra em `falhas` do resumo.

const DIA = 24 * 60 * 60 * 1000;
const DIAS_HISTORICO = 730;
const PAGINA_BINANCE = 1000;
const POR_PAGINA = 100;

async function listarAtivos(api, codigo) {
  const ativos = [];
  for (let pagina = 1; ; pagina += 1) {
    const query = new URLSearchParams({
      status: 'ativo',
      ordenar: 'ativo',
      por_pagina: String(POR_PAGINA),
      pagina: String(pagina),
    });
    if (codigo) query.set('ativo', codigo);
    const { dados, paginacao } = await api.get(`/v1/ativos?${query}`);
    ativos.push(...dados);
    if (pagina >= (paginacao?.total_paginas ?? 1)) return ativos;
  }
}

async function temPrecos(api, ativoId) {
  const query = new URLSearchParams({ ativo_id: String(ativoId), por_pagina: '1' });
  return (await api.get(`/v1/precos?${query}`)).paginacao.total > 0;
}

async function buscarJson(http, url, fonte) {
  const { status, corpo } = await http.getJson(url, { fonte });
  if (status >= 300) throw new Error(`${fonte} respondeu ${status} para ${url}`);
  return corpo;
}

async function pregoesYahoo(http, ativo, historico) {
  const url = urlYahoo(ativo.url_historico, historico ? '2y' : '5d');
  const { moeda, pregoes } = lerYahoo(await buscarJson(http, url, 'Yahoo Finance'));
  return { moeda, pregoes, fonte: 'yahoo' };
}

// Histórico: páginas de 1000 dias a partir de 2 anos atrás, enquanto vierem cheias.
async function pregoesBinance(http, { simbolo }, historico, agora) {
  const fonte = { moeda: moedaDoPar(simbolo), fonte: 'binance' };
  if (!historico) {
    const corpo = await buscarJson(http, urlBinance(simbolo, { limite: 5 }), 'Binance');
    return { ...fonte, pregoes: lerBinance(corpo, { agora }) };
  }
  const pregoes = [];
  let inicio = agora - DIAS_HISTORICO * DIA;
  for (;;) {
    const url = urlBinance(simbolo, { limite: PAGINA_BINANCE, inicio });
    const corpo = await buscarJson(http, url, 'Binance');
    pregoes.push(...lerBinance(corpo, { agora }));
    if (!Array.isArray(corpo) || corpo.length < PAGINA_BINANCE) return { ...fonte, pregoes };
    inicio = corpo.at(-1)[0] + DIA;
  }
}

async function coletarAtivo({ api, http, agora }, ativo, forcarHistorico) {
  const origem = fonteDaUrl(ativo.url_historico);
  if (!origem) throw new Error(`url_historico não suportada: ${ativo.url_historico}`);
  const historico = forcarHistorico || !(await temPrecos(api, ativo.id));
  const { moeda, pregoes, fonte } =
    origem.tipo === 'yahoo'
      ? await pregoesYahoo(http, ativo, historico)
      : await pregoesBinance(http, origem, historico, agora());
  const itens = pregoes.map((p) => ({ ativo_id: ativo.id, ...p, moeda, fonte }));
  return { historico, ...(await api.enviarLote('/v1/precos/lote', itens)) };
}

async function coletarPrecos(contexto, { ativo: codigo, historico = false } = {}) {
  const { api, log } = contexto;
  const resumo = { ativos: 0, historico: 0, inseridos: 0, atualizados: 0, falhas: 0 };
  const ativos = await listarAtivos(api, codigo);
  if (codigo && !ativos.length) {
    log.error(`ativo ${codigo} não encontrado entre os ativos com status ativo`);
    return { ...resumo, falhas: 1 };
  }
  for (const ativo of ativos) {
    resumo.ativos += 1;
    try {
      const r = await coletarAtivo(contexto, ativo, historico);
      resumo.historico += r.historico ? 1 : 0;
      resumo.inseridos += r.inseridos;
      resumo.atualizados += r.atualizados;
      log.debug({ ativo: ativo.ativo, ...r }, 'preços gravados');
    } catch (e) {
      resumo.falhas += 1;
      log.error({ ativo: ativo.ativo, erro: e.message }, 'falha ao coletar os preços do ativo');
    }
  }
  return resumo;
}

module.exports = { coletarPrecos };

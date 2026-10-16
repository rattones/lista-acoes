import { api } from '../api/cliente.js';

// Ativos (tarefa 021): tipos, links aceitos na inclusão, preços e campos do cadastro.
export const NOMES_TIPOS = {
  acao: 'Ação',
  etf: 'ETF',
  moeda: 'Moeda',
  cripto: 'Cripto',
  stablecoin: 'Stablecoin',
  indice: 'Índice',
};
export const TIPOS = Object.entries(NOMES_TIPOS).map(([value, title]) => ({ value, title }));

export const NOMES_STATUS = { ativo: 'Ativo', inativo: 'Inativo' };
export const STATUS = Object.entries(NOMES_STATUS).map(([value, title]) => ({ value, title }));

// Os mesmos hosts e caminhos do wrapper da API (backend/src/wrapper/urls.js). Aqui só se barra
// o que certamente não serve; o ticker é conferido pela API (400 url_nao_suportada).
const HOST_GOOGLE = /^(www\.)?google\.com(\.[a-z]{2})?$/;
const HOST_YAHOO = /^([a-z]{2}\.)?finance\.yahoo\.com$|^br\.financas\.yahoo\.com$/;

export function linkDeFonteValido(texto) {
  let url;
  try {
    url = new URL(String(texto).trim());
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  const partes = url.pathname.split('/').filter(Boolean);
  if (HOST_GOOGLE.test(host))
    return partes[0] === 'finance' && partes[1] === 'quote' && !!partes[2];
  if (HOST_YAHOO.test(host)) return partes[0] === 'quote' && !!partes[1];
  return false;
}

// Preço na moeda do ativo; códigos que o Intl não conhece (USDT...) vão ao lado do número.
export function formatarPreco(valor, moeda) {
  if (valor === null || valor === undefined) return '—';
  if (moeda) {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(valor);
    } catch {
      // moeda fora da ISO 4217
    }
  }
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(valor);
  return moeda ? `${numero} ${moeda}` : numero;
}

// Última cotação gravada pelo agente coletor (precos_diarios); null se não houver.
export async function ultimaCotacao(ativoId) {
  const query = new URLSearchParams({
    ativo_id: String(ativoId),
    ordenar: '-data',
    por_pagina: '1',
  });
  return (await api.get(`/v1/precos?${query}`)).dados[0] ?? null;
}

// Campos que a tela envia ao POST/PATCH /v1/ativos (adicionado_em fica com a API).
export const CAMPOS = [
  'ativo',
  'nome',
  'tipo',
  'bolsa',
  'ticker_google',
  'ticker_yahoo',
  'url_historico',
  'url_cotacao',
  'url_pagina',
  'status',
  'observacao',
];

// Texto aparado; campo opcional vazio vira null.
export function normalizar(dados) {
  return Object.fromEntries(
    CAMPOS.filter((campo) => campo in dados).map((campo) => {
      const valor = typeof dados[campo] === 'string' ? dados[campo].trim() : dados[campo];
      return [campo, valor === '' ? null : (valor ?? null)];
    }),
  );
}

// Só o que mudou em relação ao registro original (corpo do PATCH).
export function alteracoes(original, dados) {
  const antes = normalizar(original);
  return Object.fromEntries(
    Object.entries(normalizar(dados)).filter(([campo, valor]) => valor !== antes[campo]),
  );
}

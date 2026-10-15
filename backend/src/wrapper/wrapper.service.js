import { Dependencies, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ClienteHttp, fonteIndisponivel } from './cliente-http';
import {
  classificarPar,
  daYahoo,
  interpretarUrl,
  parDoYahoo,
  simboloYahoo,
  tickerYahooDoPar,
  urlBinanceKlines,
  urlCoinGeckoBusca,
  urlCoinGeckoPreco,
  urlGoogle,
  urlYahooChart,
} from './urls';

const YAHOO = 'Yahoo Finance';
const BINANCE = 'Binance';
const COINGECKO = 'CoinGecko';
const LIMITE_HISTORICO = 500;

const TIPOS_YAHOO = {
  EQUITY: 'acao',
  ETF: 'etf',
  MUTUALFUND: 'etf',
  INDEX: 'indice',
  CURRENCY: 'moeda',
  CRYPTOCURRENCY: 'cripto',
};

const naoEncontrado = (codigo, fonte) =>
  new UnprocessableEntityException({
    erro: 'ativo_nao_encontrado',
    mensagem: `${codigo} não foi encontrado no ${fonte}. Confira o link.`,
  });

const emIso = (segundos) => (segundos ? new Date(segundos * 1000).toISOString() : null);

// Wrapper de dados de ativos (tarefa 018): a partir de um link do Google Finance ou do Yahoo
// Finance, monta os campos de `ativos` e busca a última cotação, sem gravar nada.
// Ações, ETFs, índices e moedas → Yahoo; cripto e stablecoins → Binance (histórico) e
// CoinGecko (cotação). O Google Finance não tem API: dele só se aproveita o ticker da URL.
@Injectable()
@Dependencies(ClienteHttp)
export class WrapperService {
  constructor(cliente) {
    this.cliente = cliente;
  }

  // { ativo: { campos de ativos }, cotacao: { preco, moeda, em, fonte, ... } }
  async preVisualizar(url) {
    const alvo = interpretarUrl(url);
    if (alvo.par) return this.doPar(alvo.par);

    const simbolo = alvo.fonte === 'google' ? simboloYahoo(alvo.ticker, alvo.bolsa) : alvo.simbolo;
    const meta = await this.metaYahoo(simbolo);
    if (alvo.fonte === 'yahoo' && ['CURRENCY', 'CRYPTOCURRENCY'].includes(meta.instrumentType)) {
      const par = parDoYahoo(simbolo);
      if (par) return this.doPar(par);
    }
    const codigos =
      alvo.fonte === 'google'
        ? { ativo: alvo.ticker, bolsa: alvo.bolsa, ticker_google: `${alvo.ticker}:${alvo.bolsa}` }
        : daYahoo(simbolo, meta.exchangeName);
    return {
      ativo: {
        ativo: codigos.ativo,
        nome: meta.longName ?? meta.shortName ?? null,
        tipo: TIPOS_YAHOO[meta.instrumentType] ?? 'acao',
        bolsa: codigos.bolsa,
        ticker_google: codigos.ticker_google,
        ticker_yahoo: simbolo,
        url_historico: urlYahooChart(simbolo, '2y'),
        url_cotacao: urlYahooChart(simbolo, '1d'),
        url_pagina: codigos.ticker_google
          ? urlGoogle(codigos.ticker_google)
          : `https://finance.yahoo.com/quote/${encodeURIComponent(simbolo)}`,
        observacao: null,
      },
      cotacao: cotacaoYahoo(meta),
    };
  }

  // Moedas pelo Yahoo; cripto e stablecoins pela Binance e pelo CoinGecko.
  async doPar({ base, cotacao: moeda }) {
    const codigo = `${base}-${moeda}`;
    const tipo = classificarPar(base, moeda);
    const tickerYahoo = tickerYahooDoPar(base, moeda);
    const comum = {
      ativo: codigo,
      tipo,
      bolsa: null,
      ticker_google: codigo,
      ticker_yahoo: tickerYahoo,
      url_pagina: urlGoogle(codigo),
    };

    if (tipo === 'moeda') {
      const meta = await this.metaYahoo(tickerYahoo);
      return {
        ativo: {
          ...comum,
          nome: meta.longName ?? meta.shortName ?? codigo,
          url_historico: urlYahooChart(tickerYahoo, '2y'),
          url_cotacao: urlYahooChart(tickerYahoo, '1d'),
          observacao: null,
        },
        cotacao: cotacaoYahoo(meta),
      };
    }

    const observacoes = [];
    if (tickerYahoo !== codigo) {
      observacoes.push(`O Yahoo não tem ${codigo}; os indicadores usam ${tickerYahoo}.`);
    }
    const simboloBinance = `${base}${moeda}`;
    const klines = await this.klinesBinance(simboloBinance);
    // Sem o par na Binance, o histórico vem do Yahoo, que só cota cripto em dólar.
    let meta;
    if (!klines) {
      if (tickerYahoo !== codigo) throw naoEncontrado(codigo, `${BINANCE} nem no ${YAHOO}`);
      meta = await this.metaYahoo(tickerYahoo);
      observacoes.push(`A Binance não tem o par ${simboloBinance}; o histórico vem do Yahoo.`);
    }
    const moedaCoinGecko = await this.moedaCoinGecko(base);

    return {
      ativo: {
        ...comum,
        nome: moedaCoinGecko
          ? `${moedaCoinGecko.name} (${base}/${moeda})`
          : (meta?.longName ?? codigo),
        url_historico: klines
          ? urlBinanceKlines(simboloBinance, LIMITE_HISTORICO)
          : urlYahooChart(tickerYahoo, '2y'),
        url_cotacao: moedaCoinGecko
          ? urlCoinGeckoPreco(moedaCoinGecko.id, moeda)
          : klines
            ? urlBinanceKlines(simboloBinance, 1)
            : urlYahooChart(tickerYahoo, '1d'),
        observacao: observacoes.join(' ') || null,
      },
      cotacao:
        (moedaCoinGecko && (await this.cotacaoCoinGecko(moedaCoinGecko.id, moeda))) ??
        (klines ? cotacaoBinance(klines, moeda) : cotacaoYahoo(meta)),
    };
  }

  async metaYahoo(simbolo) {
    const { status, corpo } = await this.cliente.getJson(urlYahooChart(simbolo, '1d'), {
      fonte: YAHOO,
    });
    const meta = corpo?.chart?.result?.[0]?.meta;
    if (status === 404 || (status < 300 && !meta)) throw naoEncontrado(simbolo, YAHOO);
    if (!meta) throw fonteIndisponivel(YAHOO);
    return meta;
  }

  // Últimas velas diárias do par, ou null se a Binance não tem o símbolo (400 "Invalid symbol").
  async klinesBinance(simbolo) {
    const { status, corpo } = await this.cliente.getJson(urlBinanceKlines(simbolo, 1), {
      fonte: BINANCE,
    });
    if (status === 400) return null;
    if (status >= 300 || !Array.isArray(corpo)) throw fonteIndisponivel(BINANCE);
    return corpo.length ? corpo : null;
  }

  // Moeda do CoinGecko com o símbolo exato e a maior capitalização (a busca já vem ordenada).
  async moedaCoinGecko(simbolo) {
    const { status, corpo } = await this.cliente.getJson(urlCoinGeckoBusca(simbolo), {
      fonte: COINGECKO,
    });
    if (status >= 300) throw fonteIndisponivel(COINGECKO);
    return corpo?.coins?.find((moeda) => moeda.symbol?.toUpperCase() === simbolo) ?? null;
  }

  async cotacaoCoinGecko(id, moeda) {
    const { status, corpo } = await this.cliente.getJson(urlCoinGeckoPreco(id, moeda), {
      fonte: COINGECKO,
    });
    if (status >= 300) throw fonteIndisponivel(COINGECKO);
    const chave = moeda.toLowerCase();
    const preco = corpo?.[id]?.[chave];
    if (typeof preco !== 'number') return null;
    return {
      preco,
      moeda,
      variacao_24h: corpo[id][`${chave}_24h_change`] ?? null,
      em: new Date().toISOString(),
      fonte: 'coingecko',
    };
  }
}

const cotacaoYahoo = (meta) => ({
  preco: meta.regularMarketPrice ?? null,
  moeda: meta.currency ?? null,
  em: emIso(meta.regularMarketTime),
  fonte: 'yahoo',
});

// Vela da Binance: [abertura_ms, abertura, máx, mín, fechamento, volume, fechamento_ms, ...].
const cotacaoBinance = (klines, moeda) => {
  const vela = klines.at(-1);
  return {
    preco: Number(vela[4]),
    moeda,
    em: new Date(Math.min(vela[6], Date.now())).toISOString(),
    fonte: 'binance',
  };
};

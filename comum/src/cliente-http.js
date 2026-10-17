import { HttpException } from '@nestjs/common';

export const fonteIndisponivel = (fonte) =>
  new HttpException(
    {
      erro: 'fonte_indisponivel',
      mensagem: `${fonte} não respondeu ou está fora do ar. Tente de novo em alguns minutos.`,
    },
    502,
  );

const CACHE_MAXIMO = 500;
const repetir = (status) => status === 429 || status >= 500;

// GET de JSON nas fontes externas do wrapper (tarefa 018): timeout por tentativa, retry com
// backoff exponencial em erro de rede, timeout, 429 e 5xx, e cache curto em memória das
// respostas 2xx. Outros 4xx voltam ao chamador ({ status, corpo }), que decide o que são.
// fetch, dormir e agora são injetáveis para os testes.
export class ClienteHttp {
  constructor({
    userAgent,
    timeoutMs = 8000,
    tentativas = 3,
    esperaBaseMs = 500,
    cacheSegundos = 60,
    fetch = globalThis.fetch,
    dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    agora = Date.now,
  }) {
    Object.assign(this, { userAgent, timeoutMs, tentativas, esperaBaseMs, cacheSegundos });
    Object.assign(this, { fetch, dormir, agora });
    this.cache = new Map();
  }

  async getJson(url, { fonte }) {
    const guardado = this.cache.get(url);
    if (guardado && guardado.expira > this.agora()) return guardado.resposta;

    for (let tentativa = 1; tentativa <= this.tentativas; tentativa += 1) {
      if (tentativa > 1) await this.dormir(this.esperaBaseMs * 2 ** (tentativa - 2));
      let resposta;
      try {
        resposta = await this.fetch(url, {
          headers: { 'user-agent': this.userAgent, accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        continue;
      }
      if (repetir(resposta.status)) continue;

      let corpo;
      try {
        corpo = await resposta.json();
      } catch {
        corpo = undefined;
      }
      if (resposta.ok && corpo === undefined) throw fonteIndisponivel(fonte);
      const resultado = { status: resposta.status, corpo };
      if (resposta.ok) this.guardar(url, resultado);
      return resultado;
    }
    throw fonteIndisponivel(fonte);
  }

  guardar(url, resposta) {
    if (this.cacheSegundos <= 0) return;
    if (this.cache.size >= CACHE_MAXIMO) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(url, { resposta, expira: this.agora() + this.cacheSegundos * 1000 });
  }
}

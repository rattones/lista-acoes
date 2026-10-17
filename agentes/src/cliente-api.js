'use strict';

// Cliente da API para os agentes (tarefa 035): API key no "Authorization: Bearer", JSON e
// erros no formato da API ({ erro, mensagem }). A chave nunca entra em mensagem de erro.

const TAMANHO_LOTE = 1000;

class ErroApi extends Error {
  constructor({ status, codigo, mensagem }) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
  }
}

async function lerCorpo(resposta) {
  const texto = await resposta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function criarClienteApi({ url, chave, timeoutMs = 30000, fetch = globalThis.fetch }) {
  async function requisitar(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      headers: { accept: 'application/json', authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (corpo !== undefined) {
      opcoes.headers['content-type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    let resposta;
    try {
      resposta = await fetch(`${url}${caminho}`, opcoes);
    } catch (e) {
      throw new ErroApi({
        status: 0,
        codigo: 'sem_conexao',
        mensagem: `Sem conexão com a API (${metodo} ${caminho}): ${e.message}`,
      });
    }
    const dados = await lerCorpo(resposta);
    if (!resposta.ok) {
      const daApi = dados && typeof dados === 'object' && dados.erro;
      throw new ErroApi({
        status: resposta.status,
        codigo: daApi ? dados.erro : 'erro_http',
        mensagem: `${metodo} ${caminho}: ${daApi ? dados.mensagem : `erro HTTP ${resposta.status}`}`,
      });
    }
    return dados;
  }

  return {
    get: (caminho) => requisitar('GET', caminho),
    post: (caminho, corpo) => requisitar('POST', caminho, corpo),

    // POST /v1/<recurso>/lote em partes de até 1000 itens (limite da API), somando o resultado.
    // tamanho menor quando os itens são grandes (o corpo vai até 1 MB).
    async enviarLote(caminho, itens, { tamanho = TAMANHO_LOTE } = {}) {
      const total = { inseridos: 0, atualizados: 0 };
      for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
        const { inseridos, atualizados } = await requisitar('POST', caminho, {
          itens: itens.slice(inicio, inicio + tamanho),
        });
        total.inseridos += inseridos;
        total.atualizados += atualizados;
      }
      return total;
    },
  };
}

module.exports = { ErroApi, TAMANHO_LOTE, criarClienteApi };

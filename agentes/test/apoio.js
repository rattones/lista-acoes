'use strict';

// Apoio dos testes dos agentes (tarefa 035).
const CHAVE_PRECOS = `la_0123abcd_${'a'.repeat(32)}`;
const CHAVE_NOTICIAS = `la_4567ef01_${'b'.repeat(32)}`;

const ENV = {
  API_URL: 'http://backend:3000',
  API_KEY_PRECOS: CHAVE_PRECOS,
  API_KEY_NOTICIAS: CHAVE_NOTICIAS,
};

// Log que guarda as chamadas: log.registros = [{ nivel, dados, mensagem }].
function logFalso() {
  const registros = [];
  const nivel = (n) => (dados, mensagem) =>
    registros.push(
      typeof dados === 'string' ? { nivel: n, mensagem: dados } : { nivel: n, dados, mensagem },
    );
  const log = { registros };
  for (const n of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) log[n] = nivel(n);
  log.child = () => log;
  return log;
}

const json = (corpo, status = 200) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

module.exports = { CHAVE_PRECOS, CHAVE_NOTICIAS, ENV, logFalso, json };

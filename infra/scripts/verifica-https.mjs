// Verificação do HTTPS em PROD (tarefa 006): cada host responde em HTTPS com
// certificado válido e HSTS, e o HTTP redireciona com 301 para o HTTPS.
//   node --test infra/scripts/verifica-https.mjs
// DOMINIO: domínio verificado (padrão: listadecompras.net).
// VERIFICA_IP: força o IP do servidor (ex.: antes de o DNS propagar); o certificado
//   continua sendo validado pelo nome do host.
// DIAS_MINIMOS: alerta de renovação; falha se o certificado vencer antes (padrão: 15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';

const DOMINIO = process.env.DOMINIO ?? 'listadecompras.net';
const IP = process.env.VERIFICA_IP;
const DIAS_MINIMOS = Number(process.env.DIAS_MINIMOS ?? 15);
const HOSTS = [`api.${DOMINIO}`, `app.${DOMINIO}`, `www.${DOMINIO}`, DOMINIO];
const CAMINHO = { [`api.${DOMINIO}`]: '/v1/health' };

// Com VERIFICA_IP, todo nome resolve para o IP informado.
const lookup = IP
  ? (_host, opcoes, cb) => (opcoes?.all ? cb(null, [{ address: IP, family: 4 }]) : cb(null, IP, 4))
  : dnsLookup;

function get(modulo, host, caminho) {
  return new Promise((resolve, reject) => {
    const req = modulo.get(
      { host, servername: host, path: caminho, lookup, timeout: 10_000, agent: false },
      (res) => {
        const certificado = res.socket.getPeerCertificate?.();
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, certificado }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout em ${host}${caminho}`)));
    req.on('error', reject);
  });
}

for (const host of HOSTS) {
  const caminho = CAMINHO[host] ?? '/';

  test(`https://${host} responde 200 com certificado válido`, async () => {
    // O https do Node rejeita certificado inválido, vencido ou de outro nome.
    const { status, certificado } = await get(https, host, caminho);
    assert.equal(status, 200);
    const dias = (new Date(certificado.valid_to) - Date.now()) / 86_400_000;
    assert.ok(
      dias >= DIAS_MINIMOS,
      `certificado vence em ${Math.floor(dias)} dias (${certificado.valid_to}): renove`,
    );
  });

  test(`https://${host} envia HSTS`, async () => {
    const { headers } = await get(https, host, caminho);
    assert.match(headers['strict-transport-security'] ?? '', /max-age=\d{7,}/);
  });

  test(`http://${host} redireciona com 301 para o HTTPS`, async () => {
    const { status, headers } = await get(http, host, `${caminho}?x=1`);
    assert.equal(status, 301);
    assert.equal(headers.location, `https://${host}${caminho}?x=1`);
  });
}

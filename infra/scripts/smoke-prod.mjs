// Smoke test da stack de PROD simulando os subdomínios (tarefas 005 e 006). Requer a stack no ar,
// com um certificado (o autoassinado de teste serve: infra/scripts/certificado-teste.sh):
//   PROXY_PORTA=8088 PROXY_PORTA_HTTPS=8444 docker compose -f infra/docker-compose.prod.yml up -d --build
//   PROXY_PORTA=8088 PROXY_PORTA_HTTPS=8444 node --test infra/scripts/smoke-prod.mjs
// PROXY_PORTA / PROXY_PORTA_HTTPS: portas do proxy no host (padrão: 80 / 443).
// SMOKE_HOST: host testado (padrão: localhost). A validade do certificado não é verificada
// aqui (em teste ele é autoassinado); em PROD use `npm run verifica:https`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const HOST = process.env.SMOKE_HOST ?? 'localhost';
const PORTA = Number(process.env.PROXY_PORTA ?? 80);
const PORTA_HTTPS = Number(process.env.PROXY_PORTA_HTTPS ?? 443);
const COMPOSE = ['compose', '-f', join(import.meta.dirname, '..', 'docker-compose.prod.yml')];
const DOMINIO = 'listadecompras.net';

const compose = (...args) =>
  execFileSync('docker', [...COMPOSE, ...args], { encoding: 'utf8', stdio: 'pipe' });

const nomeHost = (subdominio) => (subdominio ? `${subdominio}.${DOMINIO}` : DOMINIO);

// Requisição ao proxy como se fosse ao subdomínio: Host (e SNI, no HTTPS) do subdomínio.
function requisitar(seguro, hostHeader, caminho, cabecalhos = {}) {
  const modulo = seguro ? https : http;
  return new Promise((resolve, reject) => {
    const req = modulo.request(
      {
        host: HOST,
        port: seguro ? PORTA_HTTPS : PORTA,
        path: caminho,
        headers: { host: hostHeader, ...cabecalhos },
        servername: hostHeader,
        rejectUnauthorized: false,
        agent: false,
        timeout: 10_000,
      },
      (res) => {
        const partes = [];
        res.on('data', (parte) => partes.push(parte));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout em ${hostHeader}${caminho}`)));
    req.on('error', reject);
    req.end();
  });
}

const get = (subdominio, caminho = '/', cabecalhos = {}) =>
  requisitar(true, nomeHost(subdominio), caminho, cabecalhos);
const getHttp = (subdominio, caminho = '/') => requisitar(false, nomeHost(subdominio), caminho);

const texto = (res) => res.corpo.toString('utf8');

test('nginx -t aprova a configuração do proxy', () => {
  assert.doesNotThrow(() => compose('exec', '-T', 'proxy', 'nginx', '-t'));
});

test('nginx -t aprova a configuração do frontend', () => {
  assert.doesNotThrow(() => compose('exec', '-T', 'frontend', 'nginx', '-t'));
});

test('somente o proxy publica porta no host', () => {
  const publicadas = (servico) =>
    JSON.parse(compose('ps', '--format', 'json', servico) || '{}').Publishers?.filter(
      (p) => p.PublishedPort > 0,
    ) ?? [];
  assert.equal(publicadas('backend').length, 0, 'backend publica porta');
  assert.equal(publicadas('frontend').length, 0, 'frontend publica porta');
  assert.equal(publicadas('certbot').length, 0, 'certbot publica porta');
  const portas = publicadas('proxy').map((p) => p.PublishedPort);
  assert.ok(portas.includes(PORTA), `proxy não publica ${PORTA}`);
  assert.ok(portas.includes(PORTA_HTTPS), `proxy não publica ${PORTA_HTTPS}`);
});

test('api. responde o health da API', async () => {
  const res = await get('api', '/v1/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(texto(res)).status, 'ok');
});

test('api. responde erro da API (não do Nginx) para rota inexistente', async () => {
  const res = await get('api', '/v1/nao-existe');
  assert.equal(res.status, 404);
  assert.equal(JSON.parse(texto(res)).erro, 'nao_encontrado');
});

test('app. serve a SPA', async () => {
  const res = await get('app', '/');
  assert.equal(res.status, 200);
  assert.match(texto(res), /id="app"/);
});

test('app. devolve o index.html em rota da SPA (fallback)', async () => {
  const res = await get('app', '/ativos/123');
  assert.equal(res.status, 200);
  assert.match(texto(res), /id="app"/);
});

test('app. responde 404 para asset inexistente (sem fallback)', async () => {
  const res = await get('app', '/assets/nao-existe.js');
  assert.equal(res.status, 404);
});

for (const subdominio of ['www', null]) {
  const nome = subdominio ? `${subdominio}.` : 'domínio raiz';
  test(`${nome} serve a landing page`, async () => {
    const res = await get(subdominio, '/');
    assert.equal(res.status, 200);
    assert.match(texto(res), /Lista de Ações/);
    assert.doesNotMatch(texto(res), /id="app"/);
    assert.match(texto(res), /href="https:\/\/app\.listadecompras\.net"/);
  });
}

test('host desconhecido não é atendido no HTTP', async () => {
  await assert.rejects(requisitar(false, 'outro.com', '/'), /socket hang up|ECONNRESET/);
});

test('host desconhecido tem o handshake TLS recusado no HTTPS', async () => {
  await assert.rejects(requisitar(true, 'outro.com', '/'), /alert|handshake|ECONNRESET|hang up/i);
});

for (const subdominio of ['api', 'app', 'www', null]) {
  const nome = subdominio ? `${subdominio}.` : 'domínio raiz';
  test(`${nome} redireciona o HTTP com 301 para o HTTPS`, async () => {
    const res = await getHttp(subdominio, '/caminho?x=1');
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, `https://${nomeHost(subdominio)}/caminho?x=1`);
  });

  test(`${nome} envia HSTS no HTTPS`, async () => {
    const { headers } = await get(subdominio, subdominio === 'api' ? '/v1/health' : '/');
    assert.equal(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
  });
}

test("desafio ACME da Let's Encrypt é servido no HTTP, sem redirect", async () => {
  const token = `smoke-${Date.now()}`;
  const arquivo = `/var/www/certbot/.well-known/acme-challenge/${token}`;
  compose(
    'exec',
    '-T',
    'certbot',
    'sh',
    '-c',
    `mkdir -p "$(dirname ${arquivo})" && echo ${token} > ${arquivo}`,
  );
  try {
    for (const subdominio of ['api', 'app', 'www', null]) {
      const res = await getHttp(subdominio, `/.well-known/acme-challenge/${token}`);
      assert.equal(res.status, 200, `${nomeHost(subdominio)}: ${res.status}`);
      assert.equal(texto(res).trim(), token);
    }
  } finally {
    compose('exec', '-T', 'certbot', 'rm', '-f', arquivo);
  }
});

test('o certificado servido cobre os quatro nomes', async () => {
  const certificado = await new Promise((resolve, reject) => {
    const req = https.get(
      {
        host: HOST,
        port: PORTA_HTTPS,
        servername: `app.${DOMINIO}`,
        rejectUnauthorized: false,
        agent: false,
      },
      (res) => {
        resolve(res.socket.getPeerCertificate());
        res.resume();
      },
    );
    req.on('error', reject);
  });
  for (const nome of ['api', 'app', 'www', null].map(nomeHost)) {
    assert.match(certificado.subjectaltname, new RegExp(`DNS:${nome.replaceAll('.', '\\.')}(,|$)`));
  }
});

test('serviço certbot está no ar para renovar o certificado', () => {
  const estado = JSON.parse(compose('ps', '--format', 'json', 'certbot') || '{}');
  assert.equal(estado.State, 'running');
});

for (const subdominio of ['api', 'app', 'www']) {
  test(`${subdominio}. envia os cabeçalhos de segurança`, async () => {
    const { headers } = await get(subdominio, subdominio === 'api' ? '/v1/health' : '/');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(headers['permissions-policy'], 'sem Permissions-Policy');
    assert.equal(headers['server'], 'nginx', 'versão do Nginx exposta');
    assert.equal(headers['x-powered-by'], undefined, 'X-Powered-By exposto');
  });
}

test('app. envia Content-Security-Policy', async () => {
  const { headers } = await get('app', '/');
  assert.match(headers['content-security-policy'] ?? '', /default-src 'self'/);
  assert.match(headers['content-security-policy'], /connect-src 'self' https:\/\/api\./);
});

test('app. comprime os assets com gzip', async () => {
  const html = texto(await get('app', '/'));
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, 'script do app não encontrado no index.html');
  const res = await get('app', script, { 'accept-encoding': 'gzip' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], 'gzip');
});

test('app. guarda assets com hash em cache e o index.html não', async () => {
  const index = await get('app', '/');
  assert.match(index.headers['cache-control'] ?? '', /no-cache/);
  const script = texto(index).match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const asset = await get('app', script);
  assert.match(asset.headers['cache-control'] ?? '', /immutable/);
});

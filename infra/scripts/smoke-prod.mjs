// Smoke test da stack de PROD simulando os subdomínios (tarefa 005). Requer a stack no ar:
//   PROXY_PORTA=8088 docker compose -f infra/docker-compose.prod.yml up -d --build
//   PROXY_PORTA=8088 node --test infra/scripts/smoke-prod.mjs
// PROXY_PORTA: porta do proxy no host (padrão: 80). SMOKE_HOST: host testado (padrão: localhost).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const HOST = process.env.SMOKE_HOST ?? 'localhost';
const PORTA = Number(process.env.PROXY_PORTA ?? 80);
const COMPOSE = ['compose', '-f', join(import.meta.dirname, '..', 'docker-compose.prod.yml')];
const DOMINIO = 'listadecompras.net';

const compose = (...args) =>
  execFileSync('docker', [...COMPOSE, ...args], { encoding: 'utf8', stdio: 'pipe' });

// Requisição ao proxy com o cabeçalho Host do subdomínio simulado.
function get(subdominio, caminho = '/', cabecalhos = {}) {
  const hostHeader = subdominio ? `${subdominio}.${DOMINIO}` : DOMINIO;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: HOST,
        port: PORTA,
        path: caminho,
        headers: { host: hostHeader, ...cabecalhos },
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
  assert.ok(publicadas('proxy').length > 0, 'proxy não publica porta');
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

test('host desconhecido não é atendido', async () => {
  const req = new Promise((resolve, reject) => {
    const r = request({ host: HOST, port: PORTA, path: '/', headers: { host: 'outro.com' } });
    r.on('response', (res) => resolve(res.statusCode));
    r.on('error', reject);
    r.end();
  });
  await assert.rejects(req, /socket hang up|ECONNRESET/);
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

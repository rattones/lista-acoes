// Smoke test do ambiente DEV (tarefa 004). Requer os containers no ar:
//   docker compose -f infra/docker-compose.dev.yml up -d
//   node --test infra/scripts/smoke-dev.mjs
// SMOKE_HOST escolhe o host testado (padrão: localhost), ex.: casa-ratton.local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

const HOST = process.env.SMOKE_HOST ?? 'localhost';
const HOSTNAMES_DEV = ['casa-ratton.local', 'casaratton.ddns.net'];

// node:http (e não fetch) para poder enviar o cabeçalho Host de cada hostname.
function get(porta, caminho, cabecalhos = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: HOST, port: porta, path: caminho, headers: cabecalhos, timeout: 10_000 },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (parte) => (corpo += parte));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout em ${HOST}:${porta}${caminho}`)));
    req.on('error', reject);
    req.end();
  });
}

test('API: GET :3000/v1/health responde 200', async () => {
  const res = await get(3000, '/v1/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.corpo).status, 'ok');
});

test('app: :8080 responde 200 com a SPA', async () => {
  const res = await get(8080, '/');
  assert.equal(res.status, 200);
  assert.match(res.corpo, /id="app"/);
});

test('landing: :8081 responde 200', async () => {
  const res = await get(8081, '/');
  assert.equal(res.status, 200);
  assert.match(res.corpo, /Lista de Ações/);
});

test('app: :8080/v1/health chega à API pelo proxy do Vite', async () => {
  const res = await get(8080, '/v1/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.corpo).status, 'ok');
});

for (const hostname of HOSTNAMES_DEV) {
  test(`app e landing aceitam o host ${hostname}`, async () => {
    for (const porta of [8080, 8081]) {
      const res = await get(porta, '/', { host: `${hostname}:${porta}` });
      assert.equal(res.status, 200, `porta ${porta} recusou o host ${hostname}`);
    }
  });

  test(`API libera CORS para o app em ${hostname}`, async () => {
    const origem = `http://${hostname}:8080`;
    const res = await get(3000, '/v1/health', { origin: origem });
    assert.equal(res.headers['access-control-allow-origin'], origem);
  });
}

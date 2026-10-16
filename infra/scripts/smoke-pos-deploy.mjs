// Smoke test depois do deploy em PROD (tarefa 027), de fora da VPS, pelo DNS e HTTPS reais.
// Uso: npm run smoke:pos-deploy
//      ADMIN_EMAIL=... ADMIN_SENHA=... npm run smoke:pos-deploy   (inclui o login do admin)
// SMOKE_DOMINIO troca o domínio (padrão: listadecompras.net). A senha nunca é exibida, e o
// teste não chama o logout (que encerraria todas as sessões do admin).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DOMINIO = process.env.SMOKE_DOMINIO ?? 'listadecompras.net';
const url = (subdominio, caminho) =>
  `https://${subdominio ? `${subdominio}.` : ''}${DOMINIO}${caminho}`;

async function get(subdominio, caminho, opcoes = {}) {
  const res = await fetch(url(subdominio, caminho), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    ...opcoes,
  });
  return { status: res.status, corpo: await res.text(), headers: res.headers };
}

test('api.: /v1/health responde em HTTPS', async () => {
  const res = await get('api', '/v1/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.corpo).status, 'ok');
});

test('app.: serve a SPA', async () => {
  const res = await get('app', '/');
  assert.equal(res.status, 200);
  assert.match(res.corpo, /id="app"/);
});

for (const subdominio of ['www', null]) {
  test(`${subdominio ?? 'domínio raiz'}: serve a landing com o link do login`, async () => {
    const res = await get(subdominio, '/');
    assert.equal(res.status, 200);
    assert.match(
      res.corpo,
      new RegExp(`href="https://app\\.${DOMINIO.replace('.', '\\.')}/login"`),
    );
  });
}

test('www.: serve a política de privacidade', async () => {
  const res = await get('www', '/privacidade.html');
  assert.equal(res.status, 200);
  assert.match(res.corpo, /LGPD/);
});

const { ADMIN_EMAIL, ADMIN_SENHA } = process.env;

test(
  'admin entra no app pela API',
  {
    skip:
      !ADMIN_EMAIL || !ADMIN_SENHA ? 'defina ADMIN_EMAIL e ADMIN_SENHA para testar o login' : false,
  },
  async () => {
    const login = await get('api', '/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: url('app', '') },
      body: JSON.stringify({ email: ADMIN_EMAIL, senha: ADMIN_SENHA }),
    });
    assert.equal(login.status, 200, `login respondeu ${login.status}`);
    const { token_acesso: token } = JSON.parse(login.corpo);
    assert.ok(token, 'login sem token de acesso');
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i, 'cookie do refresh');
    assert.match(login.headers.get('set-cookie') ?? '', /Secure/i, 'cookie Secure em PROD');

    const eu = await get('api', '/v1/auth/eu', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(eu.status, 200);
    assert.equal(JSON.parse(eu.corpo).papel, 'admin');
  },
);

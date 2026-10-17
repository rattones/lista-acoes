// Testes do infra/scripts/deploy.sh (tarefa 027), com git, docker e curl falsos no PATH.
// Uso: node --test infra/scripts/deploy.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'deploy.sh');

// Cada comando falso registra a chamada em chamadas.log e falha conforme as variáveis
// FALHA_* (padrão: tudo dá certo).
const FALSOS = {
  git: `
case "$1" in
  status) [ -n "\${GIT_SUJO:-}" ] && echo " M backend/src/x.js"; exit 0 ;;
  pull) [ -n "\${FALHA_PULL:-}" ] && exit 1; exit 0 ;;
  rev-parse) echo abc1234; exit 0 ;;
esac`,
  docker: `
case "$*" in
  "image inspect"*) [ -n "\${SEM_IMAGEM:-}" ] && exit 1; exit 0 ;;
  *" build"*) [ -n "\${FALHA_BUILD:-}" ] && exit 1 ;;
  *" run "*migrate*) [ -n "\${FALHA_MIGRATE:-}" ] && exit 1 ;;
  *" run "*sem-seed*) [ -n "\${COM_SEED:-}" ] && exit 1 ;;
  # O primeiro up é o do deploy; os seguintes, o do rollback.
  *" up "*)
    if [ -e "$LOG.up" ]; then [ -n "\${FALHA_ROLLBACK:-}" ] && exit 1
    else touch "$LOG.up"; [ -n "\${FALHA_UP:-}" ] && exit 1; fi ;;
esac
exit 0`,
  curl: `[ -n "\${FALHA_SAUDE:-}" ] && exit 22; echo '{"status":"ok"}'; exit 0`,
};

let dir;
let raiz;
let log;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-'));
  raiz = join(dir, 'repo');
  log = join(dir, 'chamadas.log');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const [nome, corpo] of Object.entries(FALSOS)) {
    const arquivo = join(bin, nome);
    writeFileSync(arquivo, `#!/bin/sh\necho "${nome} $*" >> "$LOG"\n${corpo}\n`);
    chmodSync(arquivo, 0o755);
  }
  mkdirSync(join(raiz, 'infra'), { recursive: true });
  mkdirSync(join(raiz, 'backend'));
  mkdirSync(join(raiz, 'agentes'));
  writeFileSync(join(raiz, 'infra', '.env'), 'LETSENCRYPT_EMAIL=a@b.c\n');
  writeFileSync(join(raiz, 'backend', '.env'), 'JWT_SEGREDO=x\n');
  writeFileSync(join(raiz, 'agentes', '.env'), 'API_URL=http://backend:3000\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function deploy(env = {}) {
  const r = spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      LOG: log,
      DEPLOY_RAIZ: raiz,
      DEPLOY_TENTATIVAS: '2',
      DEPLOY_INTERVALO: '0',
      ...env,
    },
  });
  let chamadas = [];
  try {
    chamadas = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    // nenhum comando chamado
  }
  return { ...r, chamadas, saida: r.stdout + r.stderr };
}

const indice = (chamadas, trecho) => chamadas.findIndex((c) => c.includes(trecho));
const tem = (chamadas, trecho) => indice(chamadas, trecho) !== -1;

test('deploy completo: pull, marca as imagens atuais, build, migrations, up e saúde', () => {
  const { status, chamadas, saida } = deploy();
  assert.equal(status, 0, saida);
  const ordem = [
    'git pull --ff-only',
    'docker tag lista-acoes-backend:latest lista-acoes-backend:anterior',
    'docker tag lista-acoes-frontend:latest lista-acoes-frontend:anterior',
    'docker tag lista-acoes-agentes:latest lista-acoes-agentes:anterior',
    ' build',
    'node dist/database/cli.js migrate',
    'node dist/database/cli.js sem-seed',
    'up -d --no-build --wait',
    'curl',
  ].map((t) => indice(chamadas, t));
  assert.ok(
    ordem.every((i) => i >= 0),
    `faltou uma etapa: ${JSON.stringify(chamadas, null, 1)}`,
  );
  assert.deepEqual(
    [...ordem].sort((a, b) => a - b),
    ordem,
    'etapas fora de ordem',
  );
  assert.ok(tem(chamadas, 'https://api.listadecompras.net/v1/health'));
  assert.ok(!tem(chamadas, ':anterior lista-acoes'), 'não deveria haver rollback');
  assert.match(saida, /abc1234/);
});

test('as migrations rodam com a imagem nova, antes de trocar os containers', () => {
  const { chamadas } = deploy();
  const migrate = chamadas.find((c) => c.includes('migrate'));
  assert.match(migrate, /docker compose -f infra\/docker-compose\.prod\.yml run --rm --no-deps/);
  assert.match(migrate, / backend node dist\/database\/cli\.js migrate/);
});

test('sem infra/.env, backend/.env ou agentes/.env, aborta antes de qualquer comando', () => {
  for (const arquivo of [join('infra', '.env'), join('backend', '.env'), join('agentes', '.env')]) {
    rmSync(join(raiz, arquivo));
    const { status, chamadas, saida } = deploy();
    assert.notEqual(status, 0);
    assert.deepEqual(chamadas, []);
    assert.match(saida, /\.env/);
    writeFileSync(join(raiz, arquivo), 'X=1\n');
  }
});

test('alterações locais não commitadas abortam o deploy', () => {
  const { status, chamadas, saida } = deploy({ GIT_SUJO: '1' });
  assert.notEqual(status, 0);
  assert.ok(!tem(chamadas, 'git pull'));
  assert.ok(!tem(chamadas, 'docker'));
  assert.match(saida, /não commitad/);
});

test('falha no git pull aborta sem build', () => {
  const { status, chamadas } = deploy({ FALHA_PULL: '1' });
  assert.notEqual(status, 0);
  assert.ok(!tem(chamadas, ' build'));
  assert.ok(!tem(chamadas, ' up '));
});

test('falha no build ou nas migrations não troca os containers em execução', () => {
  for (const falha of ['FALHA_BUILD', 'FALHA_MIGRATE']) {
    rmSync(log, { force: true });
    const { status, chamadas, saida } = deploy({ [falha]: '1' });
    assert.notEqual(status, 0, falha);
    assert.ok(!tem(chamadas, ' up '), `${falha}: não deveria subir`);
    assert.ok(!tem(chamadas, ':anterior lista-acoes'), `${falha}: nada a reverter`);
    assert.match(saida, /continuam/);
  }
});

test('falha no up volta às imagens anteriores', () => {
  const { status, chamadas, saida } = deploy({ FALHA_UP: '1' });
  assert.notEqual(status, 0);
  assert.ok(tem(chamadas, 'docker tag lista-acoes-backend:anterior lista-acoes-backend:latest'));
  assert.ok(tem(chamadas, 'docker tag lista-acoes-frontend:anterior lista-acoes-frontend:latest'));
  const rollback = indice(chamadas, 'tag lista-acoes-backend:anterior');
  assert.ok(indice(chamadas.slice(rollback), 'up -d --no-build --wait') >= 0);
  assert.match(saida, /imagens anteriores/);
  assert.match(saida, /abc1234/, 'informa o commit anterior para voltar o código');
});

test('API sem saúde depois do up também volta às imagens anteriores', () => {
  const { status, chamadas } = deploy({ FALHA_SAUDE: '1' });
  assert.notEqual(status, 0);
  assert.equal(
    chamadas.filter((c) => c.startsWith('curl')).length,
    2,
    'tenta DEPLOY_TENTATIVAS vezes',
  );
  assert.ok(tem(chamadas, 'docker tag lista-acoes-backend:anterior lista-acoes-backend:latest'));
});

test('primeiro deploy (sem imagens anteriores): não marca nem reverte', () => {
  const { status, chamadas, saida } = deploy({ SEM_IMAGEM: '1', FALHA_UP: '1' });
  assert.notEqual(status, 0);
  assert.ok(!tem(chamadas, 'docker tag'));
  assert.match(saida, /sem imagens anteriores/i);
});

test('falha também no rollback é avisada', () => {
  const { status, saida } = deploy({ FALHA_UP: '1', FALHA_ROLLBACK: '1' });
  assert.notEqual(status, 0);
  assert.match(saida, /rollback falhou/i);
});

test('DEPLOY_SAUDE_URL troca o endereço da verificação', () => {
  const { chamadas } = deploy({ DEPLOY_SAUDE_URL: 'https://api.teste/v1/health' });
  assert.ok(tem(chamadas, 'https://api.teste/v1/health'));
});

// Tarefa 033: dados fictícios (seed) nunca vão para PROD.
test('banco com dados fictícios (seed) para o deploy antes de trocar os containers', () => {
  const { status, chamadas, saida } = deploy({ COM_SEED: '1' });
  assert.notEqual(status, 0);
  assert.ok(tem(chamadas, 'migrate'));
  assert.ok(!tem(chamadas, ' up '), 'não deveria subir os containers');
  assert.ok(!tem(chamadas, ':anterior lista-acoes'), 'não há rollback: nada foi trocado');
  assert.match(saida, /seed/);
});

test('a verificação do seed usa a imagem nova, num container avulso', () => {
  const { chamadas } = deploy();
  const verificacao = chamadas.find((c) => c.includes('sem-seed'));
  assert.match(
    verificacao,
    /docker compose -f infra\/docker-compose\.prod\.yml run --rm --no-deps/,
  );
  assert.match(verificacao, / backend node dist\/database\/cli\.js sem-seed/);
});

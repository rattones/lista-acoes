// Testes do infra/scripts/certificado-inicial.sh (tarefa 027), com docker falso no PATH.
// Uso: node --test infra/scripts/certificado.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'certificado-inicial.sh');

// CERT_EXISTENTE: staging | producao | (vazio = nenhum). FALHA_CERTONLY=1 faz a emissão falhar.
// O arquivo de renovação do certbot guarda o servidor: "acme-staging" = certificado de testes.
// Depois do certonly, vale o que foi emitido (CERT_EMITIDO, padrão producao).
const DOCKER = `
case "$*" in
  *"acme-staging"*)
    atual="\${CERT_EXISTENTE:-}"
    [ -f "$LOG.emitido" ] && atual="$(cat "$LOG.emitido")"
    [ "$atual" = staging ] && exit 0; exit 1 ;;
  *" certonly "*)
    [ -n "\${FALHA_CERTONLY:-}" ] && exit 1
    echo "\${CERT_EMITIDO:-producao}" > "$LOG.emitido" ;;
esac
exit 0`;

let dir;
let log;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'certificado-'));
  log = join(dir, 'chamadas.log');
  mkdirSync(join(dir, 'bin'));
  const docker = join(dir, 'bin', 'docker');
  writeFileSync(docker, `#!/bin/sh\necho "docker $*" >> "$LOG"\n${DOCKER}\n`);
  chmodSync(docker, 0o755);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function emitir(env = {}) {
  const r = spawnSync('sh', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      LOG: log,
      LETSENCRYPT_EMAIL: 'avisos@teste.com',
      ...env,
    },
  });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, chamadas, saida: r.stdout + r.stderr };
}

const indice = (chamadas, trecho) => chamadas.findIndex((c) => c.includes(trecho));

test('emissão real sobre um certificado de staging: apaga o de staging antes de emitir', () => {
  const { status, chamadas, saida } = emitir({ CERT_EXISTENTE: 'staging' });
  assert.equal(status, 0, saida);
  const apaga = indice(chamadas, 'certbot delete');
  const emite = indice(chamadas, ' certonly ');
  assert.ok(apaga >= 0, 'apaga o certificado de staging');
  assert.match(chamadas[apaga], /--cert-name listadecompras\.net/);
  assert.ok(emite > apaga, 'emite depois de apagar');
  assert.doesNotMatch(chamadas[emite], /--staging/);
});

test('emissão real sem certificado anterior: não apaga nada', () => {
  const { status, chamadas } = emitir();
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'certbot delete'), -1);
});

test('ensaio (staging) nunca apaga o certificado existente', () => {
  const { status, chamadas } = emitir({
    LETSENCRYPT_STAGING: '1',
    CERT_EXISTENTE: 'staging',
    CERT_EMITIDO: 'staging',
  });
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'certbot delete'), -1);
  assert.match(chamadas[indice(chamadas, ' certonly ')], /--staging/);
});

test('emissão real que termina com certificado de staging falha e avisa', () => {
  const { status, saida } = emitir({ CERT_EMITIDO: 'staging' });
  assert.notEqual(status, 0);
  assert.match(saida, /ainda é de testes/);
  assert.doesNotMatch(saida, /Certificado emitido/);
});

test('falha na emissão sobe o proxy de novo e falha', () => {
  const { status, chamadas } = emitir({ FALHA_CERTONLY: '1' });
  assert.notEqual(status, 0);
  const emite = indice(chamadas, ' certonly ');
  assert.ok(indice(chamadas.slice(emite + 1), ' up -d') >= 0, 'o site não fica fora do ar');
});

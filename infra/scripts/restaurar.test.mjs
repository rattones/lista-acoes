// Testes do restaurar-backup.sh (tarefa 028), com docker falso no PATH.
// Uso: node --test infra/scripts/restaurar.test.mjs
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

// FALHA_VERIFICAR=1: o "cli.js verificar" recusa o arquivo; FALHA_UP=1: a API não sobe.
const DOCKER = `
case "$*" in
  *"cli.js verificar"*) [ -n "\${FALHA_VERIFICAR:-}" ] && { echo "integridade: falhou" >&2; exit 1; }
    echo "ok: integridade ok, 6 ativo(s), 1 usuário(s)" ;;
  *" up "*) [ -n "\${FALHA_UP:-}" ] && exit 1 ;;
esac
exit 0`;

let dir;
let log;
let arquivo;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'restaurar-'));
  log = join(dir, 'chamadas.log');
  mkdirSync(join(dir, 'bin'));
  const docker = join(dir, 'bin', 'docker');
  writeFileSync(docker, `#!/bin/sh\necho "docker $*" >> "$LOG"\n${DOCKER}\n`);
  chmodSync(docker, 0o755);
  // Um backup de verdade: gzip + .sha256.
  const backups = join(dir, 'backups');
  mkdirSync(backups);
  writeFileSync(join(backups, 'monitor-2026-10-18_0300.db'), 'SQLite format 3 dados');
  spawnSync(
    'sh',
    [
      '-c',
      'gzip monitor-2026-10-18_0300.db && sha256sum monitor-2026-10-18_0300.db.gz > monitor-2026-10-18_0300.db.gz.sha256',
    ],
    { cwd: backups },
  );
  arquivo = join(backups, 'monitor-2026-10-18_0300.db.gz');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function restaurar(args, env = {}) {
  const r = spawnSync('sh', [join(import.meta.dirname, 'restaurar-backup.sh'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      LOG: log,
      HOME: dir,
      RESTAURAR_RAIZ: dir,
      RESTAURAR_DATA: '2026-10-19_1000',
      ...env,
    },
  });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, chamadas, saida: r.stdout + r.stderr };
}

const indice = (chamadas, trecho) => chamadas.findIndex((c) => c.includes(trecho));

test('restaura: confere, guarda o banco atual, para a API, troca o arquivo e sobe', () => {
  const { status, chamadas, saida } = restaurar([arquivo, '--sim']);
  assert.equal(status, 0, saida);
  const verifica = indice(chamadas, 'cli.js verificar /restaurar/monitor-2026-10-18_0300.db');
  const guarda = indice(
    chamadas,
    'cli.js backup data/backups/antes-da-restauracao-2026-10-19_1000.db',
  );
  const para = indice(chamadas, 'stop backend');
  const troca = indice(chamadas, 'cp /restaurar/monitor-2026-10-18_0300.db data/monitor.db');
  const sobe = indice(chamadas, 'up -d --no-build --wait backend');
  assert.ok(
    verifica >= 0 && guarda > verifica && para > guarda && troca > para && sobe > troca,
    JSON.stringify(chamadas, null, 1),
  );
  assert.match(chamadas[troca], /rm -f data\/monitor\.db-wal data\/monitor\.db-shm/);
  assert.match(chamadas[troca], /run --rm --no-deps/, 'troca com o usuário da imagem (dono certo)');
  assert.match(
    saida,
    /antes-da-restauracao-2026-10-19_1000\.db/,
    'informa onde ficou o banco anterior',
  );
  assert.ok(
    !existsSync(join(dir, 'backups', 'monitor-2026-10-18_0300.db')),
    'apaga o descompactado',
  );
});

test('sem --sim só confere e mostra o que faria, sem parar nada', () => {
  const { status, chamadas, saida } = restaurar([arquivo]);
  assert.equal(status, 0, saida);
  assert.ok(indice(chamadas, 'cli.js verificar') >= 0);
  assert.equal(indice(chamadas, 'stop backend'), -1);
  assert.equal(indice(chamadas, 'cli.js backup'), -1);
  assert.match(saida, /--sim/);
});

test('checksum que não confere: recusa sem tocar no banco', () => {
  writeFileSync(arquivo, 'adulterado');
  const { status, chamadas, saida } = restaurar([arquivo, '--sim']);
  assert.notEqual(status, 0);
  assert.match(saida, /não confere/);
  assert.equal(indice(chamadas, 'stop backend'), -1);
});

test('backup sem integridade: recusa sem tocar no banco', () => {
  const { status, chamadas } = restaurar([arquivo, '--sim'], { FALHA_VERIFICAR: '1' });
  assert.notEqual(status, 0);
  assert.equal(indice(chamadas, 'stop backend'), -1);
});

test('API que não sobe depois da troca: avisa como voltar ao banco anterior', () => {
  const { status, saida } = restaurar([arquivo, '--sim'], { FALHA_UP: '1' });
  assert.notEqual(status, 0);
  assert.match(saida, /antes-da-restauracao-2026-10-19_1000\.db/);
});

test('sem arquivo mostra o uso', () => {
  const { status, saida, chamadas } = restaurar([]);
  assert.notEqual(status, 0);
  assert.match(saida, /Uso:/);
  assert.deepEqual(chamadas, []);
});

test('restaurar-backup.sh é executável e tem sintaxe válida', () => {
  const caminho = join(import.meta.dirname, 'restaurar-backup.sh');
  assert.ok(existsSync(caminho));
  assert.equal(spawnSync('test', ['-x', caminho]).status, 0);
  assert.equal(spawnSync('sh', ['-n', caminho]).status, 0);
});

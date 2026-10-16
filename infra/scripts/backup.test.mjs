// Testes do backup.sh (VPS) e do puxar-backup.sh (casa-ratton), tarefa 028.
// docker, rsync e date falsos no PATH; gzip e sha256sum de verdade.
// Uso: node --test infra/scripts/backup.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let log;

function falso(nome, corpo) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const arquivo = join(bin, nome);
  writeFileSync(arquivo, `#!/bin/sh\necho "${nome} $*" >> "$LOG"\n${corpo}\n`);
  chmodSync(arquivo, 0o755);
}

function rodar(script, env = {}, args = []) {
  const r = spawnSync('sh', [join(import.meta.dirname, script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: `${join(dir, 'bin')}:/usr/bin:/bin`, LOG: log, HOME: dir, ...env },
  });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, chamadas, saida: r.stdout + r.stderr };
}

const indice = (chamadas, trecho) => chamadas.findIndex((c) => c.includes(trecho));
const listar = (pasta) => (existsSync(pasta) ? readdirSync(pasta).sort() : []);
const sha256ok = (pasta, arquivo) =>
  spawnSync('sha256sum', ['-c', '--quiet', `${arquivo}.sha256`], { cwd: pasta }).status === 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'backup-'));
  log = join(dir, 'chamadas.log');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

// ===== backup.sh (VPS) =====

// "docker compose cp backend:<origem> <destino>" cria o arquivo copiado; FALHA_BACKUP=1
// faz o "cli.js backup" falhar (ex.: integridade).
const DOCKER = `
case "$*" in
  *"cli.js backup"*) [ -n "\${FALHA_BACKUP:-}" ] && { echo "integridade: falhou" >&2; exit 1; } ;;
  *" cp backend:"*) for ultimo; do :; done; printf 'SQLite format 3 dados' > "$ultimo" ;;
esac
exit 0`;

function backup(env = {}) {
  falso('docker', DOCKER);
  return rodar('backup.sh', {
    BACKUP_DIR: join(dir, 'backups'),
    BACKUP_DATA: '2026-10-18_0300',
    BACKUP_RAIZ: dir,
    ...env,
  });
}

test('backup.sh: gera a cópia pelo CLI, compacta, grava o checksum e registra no log', () => {
  const { status, chamadas, saida } = backup();
  assert.equal(status, 0, saida);
  const pasta = join(dir, 'backups');
  assert.deepEqual(listar(pasta), [
    'backup.log',
    'monitor-2026-10-18_0300.db.gz',
    'monitor-2026-10-18_0300.db.gz.sha256',
  ]);
  assert.ok(sha256ok(pasta, 'monitor-2026-10-18_0300.db.gz'), 'checksum confere');
  assert.equal(
    spawnSync('gzip', ['-t', join(pasta, 'monitor-2026-10-18_0300.db.gz')]).status,
    0,
    'gzip válido',
  );

  const gera = indice(chamadas, 'cli.js backup data/backups/monitor-2026-10-18_0300.db');
  const copia = indice(chamadas, 'cp backend:/app/backend/data/backups/monitor-2026-10-18_0300.db');
  const limpa = indice(chamadas, 'rm -f data/backups/monitor-2026-10-18_0300.db');
  assert.ok(gera >= 0 && copia > gera && limpa > copia, JSON.stringify(chamadas, null, 1));
  assert.match(chamadas[gera], /exec -T backend/);

  assert.match(
    readFileSync(join(pasta, 'backup.log'), 'utf8'),
    /ok monitor-2026-10-18_0300\.db\.gz/,
  );
});

test('backup.sh: falha no backup não deixa arquivo e registra a falha', () => {
  const { status, saida } = backup({ FALHA_BACKUP: '1' });
  assert.notEqual(status, 0);
  const pasta = join(dir, 'backups');
  assert.deepEqual(listar(pasta), ['backup.log']);
  assert.match(readFileSync(join(pasta, 'backup.log'), 'utf8'), /falhou/);
  assert.match(saida, /falhou/);
});

test('backup.sh: retenção mantém só as 8 cópias mais recentes', () => {
  const pasta = join(dir, 'backups');
  mkdirSync(pasta);
  for (let dia = 1; dia <= 10; dia += 1) {
    const nome = `monitor-2026-08-${String(dia).padStart(2, '0')}_0300.db.gz`;
    writeFileSync(join(pasta, nome), 'x');
    writeFileSync(join(pasta, `${nome}.sha256`), 'x');
  }
  writeFileSync(join(pasta, 'anotacao.txt'), 'não é backup');

  const { status } = backup();
  assert.equal(status, 0);
  const copias = listar(pasta).filter((f) => f.endsWith('.db.gz'));
  assert.equal(copias.length, 8);
  assert.equal(copias.at(-1), 'monitor-2026-10-18_0300.db.gz', 'a nova fica');
  assert.equal(copias[0], 'monitor-2026-08-04_0300.db.gz', 'saem as 3 mais antigas');
  assert.ok(
    !existsSync(join(pasta, 'monitor-2026-08-01_0300.db.gz.sha256')),
    'o checksum vai junto',
  );
  assert.ok(existsSync(join(pasta, 'anotacao.txt')), 'outros arquivos ficam');
});

test('backup.sh: BACKUP_MANTER muda a retenção', () => {
  const pasta = join(dir, 'backups');
  mkdirSync(pasta);
  for (let dia = 1; dia <= 5; dia += 1) {
    writeFileSync(join(pasta, `monitor-2026-08-0${dia}_0300.db.gz`), 'x');
  }
  backup({ BACKUP_MANTER: '2' });
  assert.equal(listar(pasta).filter((f) => f.endsWith('.db.gz')).length, 2);
});

// ===== puxar-backup.sh (casa-ratton) =====

// O rsync falso copia os arquivos de $REMOTO (a pasta de backups da VPS) para o destino.
const RSYNC = `
[ -n "\${FALHA_RSYNC:-}" ] && exit 12
for ultimo; do :; done
cp "$REMOTO"/monitor-* "$ultimo" 2>/dev/null
exit 0`;

function remoto(nomes, { corromper } = {}) {
  const pasta = join(dir, 'remoto');
  mkdirSync(pasta, { recursive: true });
  for (const nome of nomes) {
    writeFileSync(join(pasta, nome), `conteúdo de ${nome}`);
    spawnSync('sh', ['-c', `sha256sum ${nome} > ${nome}.sha256`], { cwd: pasta });
    if (corromper === nome) writeFileSync(join(pasta, nome), 'alterado depois do checksum');
  }
  return pasta;
}

function puxar(env = {}) {
  falso('rsync', RSYNC);
  return rodar('puxar-backup.sh', { BACKUP_DESTINO: join(dir, 'externo'), ...env });
}

test('puxar-backup.sh: traz só os backups pela chave dedicada e confere os checksums', () => {
  const REMOTO = remoto(['monitor-2026-10-11_0300.db.gz', 'monitor-2026-10-18_0300.db.gz']);
  const { status, chamadas, saida } = puxar({ REMOTO });
  assert.equal(status, 0, saida);

  const rsync = chamadas.find((c) => c.startsWith('rsync'));
  assert.match(rsync, /lista-acoes-backup/, 'chave dedicada');
  assert.match(rsync, /-p 22022/);
  assert.match(rsync, /BatchMode=yes/);
  assert.match(rsync, /--include=monitor-\*\.db\.gz /);
  assert.match(rsync, /--exclude=\*/);
  assert.match(rsync, /deploy@129\.121\.39\.182:/);

  const destino = join(dir, 'externo');
  assert.ok(sha256ok(destino, 'monitor-2026-10-18_0300.db.gz'));
  assert.match(readFileSync(join(destino, 'puxar.log'), 'utf8'), /ok 2 cópia/);
});

test('puxar-backup.sh: checksum que não confere falha e avisa', () => {
  const REMOTO = remoto(['monitor-2026-10-18_0300.db.gz'], {
    corromper: 'monitor-2026-10-18_0300.db.gz',
  });
  const { status, saida } = puxar({ REMOTO });
  assert.notEqual(status, 0);
  assert.match(saida, /não confere/);
});

test('puxar-backup.sh: falha no rsync é registrada', () => {
  const { status } = puxar({ REMOTO: remoto([]), FALHA_RSYNC: '1' });
  assert.notEqual(status, 0);
  assert.match(readFileSync(join(dir, 'externo', 'puxar.log'), 'utf8'), /falhou/);
});

test('puxar-backup.sh: retenção externa de 26 cópias (configurável)', () => {
  const nomes = [];
  for (let semana = 0; semana < 30; semana += 1) {
    const d = new Date(Date.UTC(2026, 0, 4 + semana * 7));
    nomes.push(`monitor-${d.toISOString().slice(0, 10)}_0300.db.gz`);
  }
  const REMOTO = remoto(nomes);
  assert.equal(puxar({ REMOTO }).status, 0);
  const destino = join(dir, 'externo');
  assert.equal(listar(destino).filter((f) => f.endsWith('.db.gz')).length, 26);

  rmSync(destino, { recursive: true });
  assert.equal(puxar({ REMOTO, BACKUP_MANTER_EXTERNO: '3' }).status, 0);
  assert.equal(listar(destino).filter((f) => f.endsWith('.db.gz')).length, 3);
});

test('scripts de backup são executáveis e têm sintaxe válida', () => {
  for (const script of ['backup.sh', 'puxar-backup.sh']) {
    const caminho = join(import.meta.dirname, script);
    assert.ok(existsSync(caminho), `${script} ausente`);
    assert.equal(spawnSync('test', ['-x', caminho]).status, 0, `${script} não é executável`);
    assert.equal(spawnSync('sh', ['-n', caminho]).status, 0);
  }
});

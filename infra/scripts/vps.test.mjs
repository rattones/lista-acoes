// Testes dos scripts de preparação da VPS (tarefa 027), com os comandos do sistema falsos.
// Uso: node --test infra/scripts/vps.test.mjs
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

let dir;
let log;

// Cria comandos falsos que registram a chamada; corpo opcional por comando.
function falsos(comandos) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [nome, corpo] of Object.entries(comandos)) {
    const arquivo = join(bin, nome);
    writeFileSync(arquivo, `#!/bin/sh\necho "${nome} $*" >> "$LOG"\n${corpo ?? 'exit 0'}\n`);
    chmodSync(arquivo, 0o755);
  }
  return bin;
}

function rodar(script, args, env) {
  const r = spawnSync('sh', [join(import.meta.dirname, script), ...args], {
    encoding: 'utf8',
    env: { PATH: `${join(dir, 'bin')}:/usr/bin:/bin`, LOG: log, HOME: dir, ...env },
  });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, chamadas, saida: r.stdout + r.stderr };
}

const indice = (chamadas, trecho) => chamadas.findIndex((c) => c.includes(trecho));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vps-'));
  log = join(dir, 'chamadas.log');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('scripts da VPS são executáveis e têm sintaxe válida', () => {
  for (const script of ['deploy.sh', 'preparar-vps.sh', 'configurar-ssh.sh']) {
    const caminho = join(import.meta.dirname, script);
    assert.ok(existsSync(caminho), `${script} ausente`);
    assert.ok(spawnSync('test', ['-x', caminho]).status === 0, `${script} não é executável`);
    assert.equal(spawnSync('sh', ['-n', caminho]).status, 0, `${script} com erro de sintaxe`);
  }
});

// ===== preparar-vps.sh (roda como root na VPS) =====

const SISTEMA = {
  dnf: null,
  // FIREWALLD_INATIVO=1 simula o firewalld desligado (como na VPS em 2026-10-16).
  systemctl: '[ "$1" = is-active ] && [ -n "${FIREWALLD_INATIVO:-}" ] && exit 3; exit 0',
  'firewall-cmd': null,
  'firewall-offline-cmd': null,
  useradd: null,
  usermod: null,
  install: null,
  cp: null,
  chown: null,
  getent: 'exit 1',
  // Sem Docker instalado (o caso com Docker é testado à parte).
  docker: 'exit 127',
};

test('preparar-vps recusa rodar sem root, sem executar nada', () => {
  falsos({ ...SISTEMA, id: 'echo 1000' });
  const { status, chamadas, saida } = rodar('preparar-vps.sh', [], {});
  assert.notEqual(status, 0);
  assert.match(saida, /root/);
  assert.deepEqual(
    chamadas.filter((c) => !c.startsWith('id ')),
    [],
  );
});

test('preparar-vps: Docker, usuário deploy e firewall com a porta do SSH antes de recarregar', () => {
  falsos({ ...SISTEMA, id: 'echo 0' });
  const { status, chamadas, saida } = rodar('preparar-vps.sh', [], { SSH_PORTA: '22022' });
  assert.equal(status, 0, saida);

  assert.ok(indice(chamadas, 'dnf') >= 0, 'instala pacotes');
  assert.ok(indice(chamadas, 'docker-ce') >= 0, 'instala o Docker CE');
  assert.ok(indice(chamadas, 'docker-compose-plugin') >= 0, 'instala o Compose');
  assert.ok(indice(chamadas, 'systemctl enable --now docker') >= 0);

  assert.ok(indice(chamadas, 'useradd') >= 0, 'cria o usuário deploy');
  assert.ok(indice(chamadas, 'usermod -aG docker deploy') >= 0);

  const porta = indice(chamadas, '--add-port=22022/tcp');
  const recarga = indice(chamadas, 'firewall-cmd --reload');
  assert.ok(porta >= 0, 'libera a porta do SSH');
  assert.ok(indice(chamadas, '--add-service=http') >= 0);
  assert.ok(indice(chamadas, '--add-service=https') >= 0);
  assert.ok(recarga > porta, 'só recarrega depois de liberar o SSH');
  const removeSsh = indice(chamadas, '--remove-service=ssh');
  if (removeSsh >= 0) assert.ok(removeSsh > porta, 'só fecha a 22 depois de abrir a porta do SSH');
});

test('preparar-vps não reinstala o Docker quando o Compose já existe', () => {
  falsos({ ...SISTEMA, id: 'echo 0', docker: 'exit 0' });
  const { status, chamadas } = rodar('preparar-vps.sh', [], {});
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'docker-ce'), -1);
  assert.ok(indice(chamadas, 'systemctl enable --now docker') >= 0);
});

test('firewalld desligado: configura offline antes de ligar, sem janela sem SSH', () => {
  falsos({ ...SISTEMA, id: 'echo 0' });
  const { status, chamadas, saida } = rodar('preparar-vps.sh', [], {
    SSH_PORTA: '22022',
    FIREWALLD_INATIVO: '1',
  });
  assert.equal(status, 0, saida);
  const porta = indice(chamadas, 'firewall-offline-cmd --add-port=22022/tcp');
  const liga = indice(chamadas, 'systemctl enable --now firewalld');
  assert.ok(porta >= 0, 'libera a porta do SSH offline');
  assert.ok(indice(chamadas, 'firewall-offline-cmd --add-service=http') >= 0);
  assert.ok(indice(chamadas, 'firewall-offline-cmd --add-service=https') >= 0);
  assert.ok(liga > porta, 'só liga o firewalld depois de liberar o SSH');
  const removeSsh = indice(chamadas, '--remove-service=ssh');
  assert.ok(removeSsh > porta && removeSsh < liga, 'fecha a 22 offline, depois de abrir a 22022');
  assert.equal(
    indice(chamadas, 'firewall-cmd --permanent'),
    -1,
    'sem firewall-cmd com o daemon parado',
  );
  // Ligar o firewalld apaga as regras de rede do Docker: o Docker é reiniciado depois.
  assert.ok(indice(chamadas, 'systemctl restart docker') > liga, 'reinicia o Docker depois');
});

test('firewalld ligado: firewall-cmd permanente e Docker sem reinício', () => {
  falsos({ ...SISTEMA, id: 'echo 0' });
  const { status, chamadas } = rodar('preparar-vps.sh', [], {});
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'firewall-offline-cmd'), -1);
  assert.equal(indice(chamadas, 'systemctl restart docker'), -1);
  assert.ok(
    indice(chamadas, 'firewall-cmd --permanent --add-port') <
      indice(chamadas, 'systemctl enable --now docker'),
    'firewall antes do Docker',
  );
});

test('preparar-vps é idempotente: usuário deploy existente não é recriado', () => {
  falsos({ ...SISTEMA, id: 'echo 0', getent: 'echo "deploy:x:1001:1001::/home/deploy:/bin/bash"' });
  const { status, chamadas } = rodar('preparar-vps.sh', [], {});
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'useradd'), -1);
  assert.ok(indice(chamadas, 'usermod -aG docker deploy') >= 0);
});

// ===== configurar-ssh.sh (roda na máquina do desenvolvedor) =====

const SSH = {
  'ssh-keygen': 'touch "$HOME/.ssh/lista-acoes-vps" "$HOME/.ssh/lista-acoes-vps.pub"',
  'ssh-copy-id': null,
  ssh: null,
};

test('configurar-ssh gera a chave se não existir, instala na VPS e testa o login sem senha', () => {
  falsos(SSH);
  mkdirSync(join(dir, '.ssh'));
  const { status, chamadas, saida } = rodar('configurar-ssh.sh', ['129.121.39.182'], {});
  assert.equal(status, 0, saida);
  const gerar = indice(chamadas, 'ssh-keygen');
  const copiar = indice(chamadas, 'ssh-copy-id');
  const testar = indice(chamadas, 'BatchMode=yes');
  assert.ok(gerar >= 0 && copiar > gerar && testar > copiar, JSON.stringify(chamadas));
  assert.match(chamadas[gerar], /-t ed25519/);
  assert.match(chamadas[copiar], /-i .*lista-acoes-vps\.pub/);
  assert.match(chamadas[copiar], /-p 22022/);
  assert.match(chamadas[copiar], /root@129\.121\.39\.182/);
  assert.match(chamadas[testar], /-i .*lista-acoes-vps /);
});

test('configurar-ssh reaproveita a chave existente', () => {
  falsos(SSH);
  mkdirSync(join(dir, '.ssh'));
  writeFileSync(join(dir, '.ssh', 'lista-acoes-vps'), 'chave');
  writeFileSync(join(dir, '.ssh', 'lista-acoes-vps.pub'), 'chave.pub');
  const { status, chamadas } = rodar('configurar-ssh.sh', ['129.121.39.182'], {});
  assert.equal(status, 0);
  assert.equal(indice(chamadas, 'ssh-keygen'), -1);
});

test('configurar-ssh falha se o login pela chave não funcionar', () => {
  falsos({ ...SSH, ssh: 'exit 255' });
  mkdirSync(join(dir, '.ssh'));
  const { status, saida } = rodar('configurar-ssh.sh', ['129.121.39.182'], {});
  assert.notEqual(status, 0);
  assert.match(saida, /não funcionou/);
});

test('configurar-ssh --so-chave só desliga a senha depois de testar a chave', () => {
  falsos(SSH);
  mkdirSync(join(dir, '.ssh'));
  const { status, chamadas, saida } = rodar(
    'configurar-ssh.sh',
    ['129.121.39.182', '--so-chave'],
    {},
  );
  assert.equal(status, 0, saida);
  const testar = indice(chamadas, 'BatchMode=yes');
  const desligar = indice(chamadas, 'PasswordAuthentication no');
  assert.ok(desligar > testar, JSON.stringify(chamadas));
  // O echo do comando falso quebra a linha nos \n do printf: confere o resto do registro.
  const comando = chamadas.slice(desligar).join('\n');
  assert.match(comando, /sshd -t && systemctl reload sshd/, 'valida antes de recarregar');
});

test('configurar-ssh sem o host mostra o uso', () => {
  falsos(SSH);
  const { status, saida, chamadas } = rodar('configurar-ssh.sh', [], {});
  assert.notEqual(status, 0);
  assert.match(saida, /Uso:/);
  assert.deepEqual(chamadas, []);
});

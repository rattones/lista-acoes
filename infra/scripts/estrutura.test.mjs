// Verificação da estrutura do monorepo (tarefa 001).
// Uso: node --test infra/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..', '..');
const lerJson = (arquivo) => JSON.parse(readFileSync(join(raiz, arquivo), 'utf8'));

test('package.json da raiz declara os workspaces backend e frontend', () => {
  const pkg = lerJson('package.json');
  assert.deepEqual(pkg.workspaces, ['backend', 'frontend']);
});

test('package.json da raiz tem os scripts agregados test, lint e dev', () => {
  const { scripts } = lerJson('package.json');
  for (const nome of ['test', 'lint', 'dev']) {
    assert.ok(scripts?.[nome], `script "${nome}" ausente`);
  }
});

test('pastas backend, frontend e infra existem', () => {
  for (const pasta of ['backend', 'frontend', 'infra/docker', 'infra/nginx', 'infra/scripts']) {
    assert.ok(existsSync(join(raiz, pasta)), `pasta "${pasta}" ausente`);
  }
});

test('workspaces têm package.json próprio', () => {
  assert.equal(lerJson('backend/package.json').name, '@lista-acoes/backend');
  assert.equal(lerJson('frontend/package.json').name, '@lista-acoes/frontend');
});

test('ESLint, Prettier e EditorConfig estão configurados na raiz', () => {
  for (const arquivo of ['eslint.config.js', '.prettierrc.json', '.editorconfig']) {
    assert.ok(existsSync(join(raiz, arquivo)), `"${arquivo}" ausente`);
  }
});

test('versão do Node fixada em .nvmrc e engines', () => {
  const nvmrc = readFileSync(join(raiz, '.nvmrc'), 'utf8').trim();
  const { engines } = lerJson('package.json');
  assert.match(nvmrc, /^\d+$/);
  assert.ok(engines?.node?.includes(nvmrc), `engines.node deve citar a versão ${nvmrc}`);
});

test('.env-example existe na raiz e em cada serviço', () => {
  for (const arquivo of ['.env-example', 'backend/.env-example', 'frontend/.env-example']) {
    assert.ok(existsSync(join(raiz, arquivo)), `"${arquivo}" ausente`);
  }
});

test('.gitignore ignora node_modules, .env, bancos e builds, mas não .env-example', () => {
  const ignorado = (caminho) => {
    try {
      execFileSync('git', ['check-ignore', '-q', '--no-index', caminho], { cwd: raiz });
      return true;
    } catch {
      return false;
    }
  };
  for (const caminho of [
    'node_modules/x',
    'backend/node_modules/x',
    '.env',
    'backend/.env',
    'frontend/.env.local',
    'backend/data/monitor.db',
    'frontend/dist/index.html',
    'backend/build/main.js',
  ]) {
    assert.ok(ignorado(caminho), `"${caminho}" deveria ser ignorado`);
  }
  for (const caminho of ['.env-example', 'backend/.env-example', 'frontend/.env-example']) {
    assert.ok(!ignorado(caminho), `"${caminho}" não deveria ser ignorado`);
  }
});

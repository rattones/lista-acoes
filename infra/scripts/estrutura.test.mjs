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

// Documentação base (tarefa 008): .skill/DOCUMENTAR.md.
const lerTexto = (arquivo) => readFileSync(join(raiz, arquivo), 'utf8');
const secoes = (texto) => [...texto.matchAll(/^##+ (.+)$/gm)].map(([, titulo]) => titulo);

test('README, CHANGELOG, INSTALL e POLICY existem na raiz', () => {
  for (const arquivo of ['README.md', 'CHANGELOG.md', 'INSTALL.md', 'POLICY.md']) {
    assert.ok(existsSync(join(raiz, arquivo)), `"${arquivo}" ausente`);
  }
});

test('README tem visão geral, arquitetura, stack, DEV e testes, e aponta para os demais', () => {
  const readme = lerTexto('README.md');
  const titulos = secoes(readme);
  for (const secao of ['Arquitetura', 'Stack', 'Como rodar em DEV', 'Como testar']) {
    assert.ok(titulos.includes(secao), `seção "${secao}" ausente no README`);
  }
  assert.match(readme, /```mermaid[\s\S]*api\.listadecompras\.net[\s\S]*```/, 'diagrama ausente');
  for (const arquivo of ['INSTALL.md', 'CHANGELOG.md', 'POLICY.md']) {
    assert.ok(readme.includes(`(${arquivo}`), `README não aponta para ${arquivo}`);
  }
});

test('CHANGELOG segue o Keep a Changelog com a seção [Não lançado]', () => {
  const changelog = lerTexto('CHANGELOG.md');
  assert.match(changelog, /keepachangelog\.com/);
  assert.match(changelog, /^## \[Não lançado\]$/m);
});

test('INSTALL cobre requisitos, variáveis, DEV (portas e firewall) e PROD (SSL)', () => {
  const titulos = secoes(lerTexto('INSTALL.md')).join('\n');
  for (const trecho of ['Requisitos', 'Variáveis de ambiente', 'DEV', 'Firewall', 'Produção']) {
    assert.ok(titulos.includes(trecho), `seção com "${trecho}" ausente no INSTALL`);
  }
  assert.match(lerTexto('INSTALL.md'), /certificado/i);
});

test('POLICY cobre dados coletados, logs, e-mail, exclusão e direitos do titular', () => {
  const policy = lerTexto('POLICY.md');
  const titulos = secoes(policy);
  for (const secao of [
    'Dados coletados',
    'Logs de acesso',
    'Envio de e-mails',
    'Exclusão dos dados',
    'Seus direitos',
  ]) {
    assert.ok(titulos.includes(secao), `seção "${secao}" ausente na POLICY`);
  }
  assert.match(policy, /Gmail/);
  assert.match(policy, /LGPD/);
});

// Rotação dos logs dos containers (tarefa 029): todo serviço dos composes tem tamanho máximo.
const configCompose = (arquivo, ...extras) =>
  JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        join(raiz, 'infra', arquivo),
        ...extras,
        'config',
        '--no-env-resolution',
        '--format',
        'json',
      ],
      { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );

for (const [arquivo, extras] of [
  ['docker-compose.dev.yml', []],
  ['docker-compose.prod.yml', ['--profile', 'teste']],
]) {
  test(`${arquivo}: todo serviço tem rotação de log (json-file com max-size e max-file)`, () => {
    const { services } = configCompose(arquivo, ...extras);
    for (const [nome, servico] of Object.entries(services)) {
      assert.equal(servico.logging?.driver, 'json-file', `${nome}: driver de log`);
      assert.match(servico.logging?.options?.['max-size'] ?? '', /^\d+m$/, `${nome}: max-size`);
      assert.match(servico.logging?.options?.['max-file'] ?? '', /^\d+$/, `${nome}: max-file`);
    }
  });
}

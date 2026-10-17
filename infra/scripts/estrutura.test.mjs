// Verificação da estrutura do monorepo (tarefa 001).
// Uso: node --test infra/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { load as lerYaml, YAML11_SCHEMA } from 'js-yaml';

const raiz = join(import.meta.dirname, '..', '..');
const lerJson = (arquivo) => JSON.parse(readFileSync(join(raiz, arquivo), 'utf8'));

test('package.json da raiz declara os workspaces comum, backend, frontend e agentes', () => {
  const pkg = lerJson('package.json');
  assert.deepEqual(pkg.workspaces, ['comum', 'backend', 'frontend', 'agentes']);
});

test('package.json da raiz tem os scripts agregados test, lint e dev', () => {
  const { scripts } = lerJson('package.json');
  for (const nome of ['test', 'lint', 'dev']) {
    assert.ok(scripts?.[nome], `script "${nome}" ausente`);
  }
});

test('pastas comum, backend, frontend, agentes e infra existem', () => {
  for (const pasta of [
    'comum',
    'backend',
    'frontend',
    'agentes',
    'infra/docker',
    'infra/nginx',
    'infra/scripts',
  ]) {
    assert.ok(existsSync(join(raiz, pasta)), `pasta "${pasta}" ausente`);
  }
});

test('workspaces têm package.json próprio', () => {
  assert.equal(lerJson('backend/package.json').name, '@lista-acoes/backend');
  assert.equal(lerJson('frontend/package.json').name, '@lista-acoes/frontend');
  assert.equal(lerJson('comum/package.json').name, '@lista-acoes/comum');
  assert.equal(lerJson('agentes/package.json').name, '@lista-acoes/agentes');
});

// Agentes coletores (tarefa 035): o código comum é usado pela API e pelos agentes.
test('backend e agentes dependem do workspace comum', () => {
  for (const ws of ['backend', 'agentes']) {
    assert.ok(lerJson(`${ws}/package.json`).dependencies?.['@lista-acoes/comum'], ws);
  }
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
  for (const arquivo of [
    '.env-example',
    'backend/.env-example',
    'frontend/.env-example',
    'agentes/.env-example',
  ]) {
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
    'agentes/.env',
    'frontend/.env.local',
    'backend/data/monitor.db',
    'frontend/dist/index.html',
    'backend/build/main.js',
  ]) {
    assert.ok(ignorado(caminho), `"${caminho}" deveria ser ignorado`);
  }
  for (const caminho of [
    '.env-example',
    'backend/.env-example',
    'frontend/.env-example',
    'agentes/.env-example',
  ]) {
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
// Lido direto do YAML, sem depender do Docker nem do backend/.env, que o compose exige.
// O schema YAML 1.1 resolve as chaves de mesclagem (`<<: *node`), como o Compose.
const configCompose = (arquivo) =>
  lerYaml(readFileSync(join(raiz, 'infra', arquivo), 'utf8'), { schema: YAML11_SCHEMA });

for (const arquivo of ['docker-compose.dev.yml', 'docker-compose.prod.yml']) {
  test(`${arquivo}: todo serviço tem rotação de log (json-file com max-size e max-file)`, () => {
    const { services } = configCompose(arquivo);
    for (const [nome, servico] of Object.entries(services)) {
      assert.equal(servico.logging?.driver, 'json-file', `${nome}: driver de log`);
      assert.match(servico.logging?.options?.['max-size'] ?? '', /^\d+m$/, `${nome}: max-size`);
      assert.match(servico.logging?.options?.['max-file'] ?? '', /^\d+$/, `${nome}: max-file`);
    }
  });
}

// Serviço dos agentes coletores (tarefa 035): sem porta publicada, chaves no agentes/.env e a API
// pela rede interna. Em PROD o .env é obrigatório; no DEV, sem ele o container só registra o erro
// (configuração inválida não derruba o processo: veja agentes/src/main.js).
for (const [arquivo, obrigatorio] of [
  ['docker-compose.dev.yml', false],
  ['docker-compose.prod.yml', true],
]) {
  test(`${arquivo}: serviço agentes com o agentes/.env, a API interna e sem portas`, () => {
    const { agentes } = configCompose(arquivo).services;
    assert.ok(agentes, 'serviço agentes ausente');
    assert.equal(agentes.ports, undefined, 'agentes não publica portas');
    assert.deepEqual(agentes.env_file, [{ path: '../agentes/.env', required: obrigatorio }]);
    assert.equal(agentes.environment?.API_URL, 'http://backend:3000');
    assert.equal(agentes.environment?.TZ, 'America/Sao_Paulo');
    assert.ok(agentes.depends_on?.backend, 'agentes depende do backend');
  });
}

for (const arquivo of ['backend.Dockerfile', 'frontend.Dockerfile', 'dev.Dockerfile']) {
  test(`${arquivo} copia o package.json de todos os workspaces (npm ci)`, () => {
    const dockerfile = lerTexto(join('infra', 'docker', arquivo));
    for (const ws of lerJson('package.json').workspaces) {
      assert.match(dockerfile, new RegExp(`COPY .*${ws}/package\\.json`), `${arquivo}: ${ws}`);
    }
  });
}

test('agentes.Dockerfile: sem root, só dependências de produção, fuso de São Paulo', () => {
  const dockerfile = lerTexto('infra/docker/agentes.Dockerfile');
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /npm ci -w agentes --omit=dev/);
  assert.match(dockerfile, /TZ=America\/Sao_Paulo/);
  assert.match(dockerfile, /COPY .*comum\/src/);
});

// Destaques da landing (tarefa 034): trecho gerado pelo CLI do banco num volume e incluído por SSI.
test('frontend.conf: SSI só na landing, com o trecho num local interno', () => {
  const conf = lerTexto('infra/nginx/frontend.conf');
  const [app, landing] = conf.split(/^server \{/m).slice(1);
  assert.doesNotMatch(app, /ssi/);
  assert.match(landing, /^\s*ssi on;/m);
  assert.match(landing, /^\s*ssi_silent_errors on;/m);
  assert.match(
    landing,
    /location \/destaques\/ \{[^}]*internal;[^}]*alias \/usr\/share\/nginx\/destaques\/;/s,
  );
});

test('docker-compose.prod.yml: volume dos destaques (backend escreve, frontend lê)', () => {
  const { services, volumes } = configCompose('docker-compose.prod.yml');
  assert.ok('destaques' in volumes, 'volume destaques');
  assert.ok(services.backend.volumes.includes('destaques:/app/destaques'));
  assert.ok(services.frontend.volumes.includes('destaques:/usr/share/nginx/destaques:ro'));
});

test('docker-compose.dev.yml: destaques no backend e no Vite da landing', () => {
  const { services, volumes } = configCompose('docker-compose.dev.yml');
  assert.ok('destaques' in volumes, 'volume destaques');
  assert.ok(services.backend.volumes.includes('destaques:/app/destaques'));
  assert.ok(services.frontend.volumes.includes('destaques:/app/destaques:ro'));
  assert.equal(services.frontend.environment.DESTAQUES_DIR, '/app/destaques');
});

test('backend.Dockerfile cria a pasta dos destaques com o dono node', () => {
  assert.match(lerTexto('infra/docker/backend.Dockerfile'), /mkdir -p [^\n]*\/app\/destaques/);
});

test('destaques.sh gera o trecho com o CLI do banco num container avulso', () => {
  const script = lerTexto('infra/scripts/destaques.sh');
  assert.match(
    script,
    /run --rm --no-deps backend node dist\/database\/cli\.js destaques \/app\/destaques/,
  );
});

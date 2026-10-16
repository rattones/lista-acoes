// Comandos do banco: npm run db:migrate | db:status | db:admin -w backend (na imagem de
// PROD: node dist/database/cli.js migrate|status|admin|backup|verificar|seed-dev). Lê DB_ARQUIVO do ambiente ou do
// backend/.env (padrão: data/monitor.db).
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { DB_ARQUIVO_PADRAO } from '../config/configuracao';
import { criarAdmin } from './admin';
import { fazerBackup, verificarBackup } from './backup';
import { gerarSeed, limparSeed } from './seed-dev';
import { abrirConexao } from './conexao';
import { aplicarMigracoes, PASTA_MIGRACOES, statusMigracoes } from './migracoes';

const USO_BACKUP = 'Uso: cli.js backup <arquivo de destino>';
const USO_VERIFICAR = 'Uso: cli.js verificar <arquivo de backup>';

const USO_ADMIN =
  'Uso: npm run db:admin -w backend -- --email <e-mail> --nome <nome> (a senha é pedida em seguida)';

const comandos = {
  migrate({ db, pasta, saida }) {
    const aplicadas = aplicarMigracoes(db, pasta);
    if (aplicadas.length === 0) {
      saida('Nenhuma migration pendente.');
      return;
    }
    aplicadas.forEach(({ nome }) => saida(`aplicada: ${nome}`));
    saida(`${aplicadas.length} migration(s) aplicada(s).`);
  },

  status({ db, pasta, saida }) {
    const migracoes = statusMigracoes(db, pasta);
    migracoes.forEach(({ nome, aplicadaEm }) =>
      saida(aplicadaEm ? `aplicada  ${nome}  (${aplicadaEm})` : `pendente  ${nome}`),
    );
    saida(`${migracoes.filter((m) => !m.aplicadaEm).length} pendente(s).`);
  },

  async admin({ db, saida, args = [], lerSenha }) {
    const { values } = parseArgs({
      args,
      options: { email: { type: 'string' }, nome: { type: 'string' } },
      strict: false,
    });
    if (typeof values.email !== 'string' || typeof values.nome !== 'string') {
      throw new Error(USO_ADMIN);
    }
    const senha = await lerSenha();
    const { id, email } = await criarAdmin(db, { email: values.email, nome: values.nome, senha });
    saida(`Admin criado: ${email} (id ${id})`);
  },

  // Backup consistente com a API no ar (tarefa 028); usado pelo infra/scripts/backup.sh.
  async backup({ db, saida, args = [] }) {
    if (!args[0]) throw new Error(USO_BACKUP);
    const { destino, integridade } = await fazerBackup(db, args[0]);
    saida(`Backup gravado: ${destino} (integridade: ${integridade})`);
  },

  // Dados fictícios para o dashboard no DEV (tarefa 032); nunca em produção.
  'seed-dev'({ db, saida, args = [], ambiente = process.env.NODE_ENV, hoje }) {
    if (ambiente === 'production') {
      throw new Error('O seed-dev não roda em produção (NODE_ENV=production).');
    }
    if (args.includes('--limpar')) {
      limparSeed(db);
      saida('Dados fictícios apagados.');
      return;
    }
    const r = gerarSeed(db, hoje ? { hoje } : {});
    saida(
      `Dados fictícios gerados: ${r.ativos} ativo(s), ${r.precos} preço(s), ` +
        `${r.execucoes} execução(ões), ${r.sinais} sinal(is), ${r.noticias} notícia(s).`,
    );
  },

  verificar({ saida, args = [] }) {
    if (!args[0]) throw new Error(USO_VERIFICAR);
    const { ativos, usuarios } = verificarBackup(args[0]);
    saida(
      ativos === null || usuarios === null
        ? `${args[0]}: integridade ok, sem as tabelas do sistema`
        : `${args[0]}: integridade ok, ${ativos} ativo(s), ${usuarios} usuário(s)`,
    );
  },
};

export async function executar(comando, contexto) {
  const acao = comandos[comando];
  if (!acao) {
    throw new Error(
      `Comando desconhecido: ${comando}. Uso: cli.js ${Object.keys(comandos).join('|')}`,
    );
  }
  await acao(contexto);
}

// Lê uma linha do terminal em modo raw, sem ecoar (Backspace apaga; Ctrl+C cancela).
function perguntarOculto(texto) {
  const { stdin, stdout } = process;
  stdout.write(texto);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let valor = '';
    const terminar = (erro) => {
      stdin.off('data', aoDigitar);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (erro) reject(erro);
      else resolve(valor);
    };
    function aoDigitar(teclas) {
      for (const tecla of teclas) {
        if (tecla === '\r' || tecla === '\n') return terminar();
        if (tecla === '\u0003') return terminar(new Error('Cancelado.'));
        if (tecla === '\u007f' || tecla === '\b') valor = valor.slice(0, -1);
        else valor += tecla;
      }
    }
    stdin.on('data', aoDigitar);
  });
}

// No terminal, pede a senha duas vezes sem ecoar; com entrada redirecionada, lê a primeira linha.
async function lerSenhaDoTerminal() {
  const senha = await perguntarOculto('Senha: ');
  if ((await perguntarOculto('Repita a senha: ')) !== senha) {
    throw new Error('As senhas não conferem.');
  }
  return senha;
}

async function lerSenhaDaEntrada() {
  const rl = createInterface({ input: process.stdin });
  for await (const linha of rl) {
    rl.close();
    return linha;
  }
  return '';
}

async function principal() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  // Só o banco importa aqui: o CLI não exige as demais variáveis da API (ex.: CORS_ORIGENS).
  const db = abrirConexao(process.env.DB_ARQUIVO || DB_ARQUIVO_PADRAO);
  try {
    await executar(process.argv[2], {
      db,
      pasta: PASTA_MIGRACOES,
      saida: console.log,
      args: process.argv.slice(3),
      lerSenha: process.stdin.isTTY ? lerSenhaDoTerminal : lerSenhaDaEntrada,
    });
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  principal();
}

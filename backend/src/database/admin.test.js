import { verificarSenha } from '../auth/senha';
import { criarAdmin } from './admin';
import { abrirConexao } from './conexao';
import { aplicarMigracoes, PASTA_MIGRACOES } from './migracoes';

describe('criarAdmin', () => {
  let db;
  const dados = { email: 'Admin@Teste.com', nome: 'Administrador', senha: 'senha-forte-123' };

  beforeEach(() => {
    db = abrirConexao(':memory:');
    aplicarMigracoes(db, PASTA_MIGRACOES);
  });

  afterEach(() => db.close());

  it('cria um usuário admin ativo com a senha em argon2id', async () => {
    const criado = await criarAdmin(db, dados);

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(criado.id);
    expect(criado).toEqual({ id: usuario.id, email: 'admin@teste.com' });
    expect(usuario).toMatchObject({
      email: 'admin@teste.com',
      nome: 'Administrador',
      papel: 'admin',
      ativo: 1,
    });
    expect(usuario.senha_hash).toMatch(/^\$argon2id\$/);
    await expect(verificarSenha(usuario.senha_hash, dados.senha)).resolves.toBe(true);
  });

  it('rejeita e-mail inválido, nome vazio e senha curta', async () => {
    await expect(criarAdmin(db, { ...dados, email: 'nao-e-email' })).rejects.toThrow(/e-mail/i);
    await expect(criarAdmin(db, { ...dados, nome: '  ' })).rejects.toThrow(/nome/i);
    await expect(criarAdmin(db, { ...dados, senha: 'curta' })).rejects.toThrow(/10 caracteres/);
    expect(db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get()).toBe(0);
  });

  it('rejeita e-mail já cadastrado', async () => {
    await criarAdmin(db, dados);
    await expect(criarAdmin(db, { ...dados, email: 'admin@teste.com' })).rejects.toThrow(
      /já cadastrado/,
    );
  });
});

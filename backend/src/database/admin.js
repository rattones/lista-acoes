import Joi from 'joi';
import { gerarHashSenha, validarSenha } from '../auth/senha';

const esquema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    'string.email': 'E-mail inválido.',
    'any.required': 'Informe o e-mail.',
    'string.empty': 'Informe o e-mail.',
  }),
  nome: Joi.string().trim().required().messages({
    'any.required': 'Informe o nome.',
    'string.empty': 'Informe o nome.',
  }),
});

// Cria um usuário admin (npm run db:admin): primeiro acesso, já que o cadastro é só por convite.
export async function criarAdmin(db, { email, nome, senha }) {
  const { error, value } = esquema.validate({ email, nome });
  if (error) throw new Error(error.message);
  validarSenha(senha);

  const existe = db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(value.email);
  if (existe) throw new Error(`E-mail já cadastrado: ${value.email}`);

  const senhaHash = await gerarHashSenha(senha);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO usuarios (email, nome, senha_hash, papel) VALUES (?, ?, ?, 'admin')")
    .run(value.email, value.nome, senhaHash);
  return { id: Number(lastInsertRowid), email: value.email };
}

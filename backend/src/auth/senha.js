import { hash, verify } from '@node-rs/argon2';

// Política de senha (tarefas 010, 012 e 014).
export const SENHA_MINIMA = 10;

export function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    throw new Error(`A senha deve ter no mínimo de ${SENHA_MINIMA} caracteres.`);
  }
}

// Hash argon2id com sal aleatório, nos parâmetros padrão da biblioteca (recomendação OWASP).
export function gerarHashSenha(senha) {
  return hash(senha);
}

// true se a senha confere com o hash; hash malformado conta como senha errada.
export async function verificarSenha(senhaHash, senha) {
  try {
    return await verify(senhaHash, senha);
  } catch {
    return false;
  }
}

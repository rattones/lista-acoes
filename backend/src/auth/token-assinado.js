import { createHmac, timingSafeEqual } from 'node:crypto';

// Tokens de link sem estado no banco (recuperação de senha, convites):
//   base64url(JSON do payload) + "." + base64url(HMAC-SHA256(chave, payload))
// O payload não é secreto (só codificado), mas não pode ser alterado sem a chave.

const PARTE = /^[\w-]+$/;

// Chave específica por finalidade, derivada do segredo da aplicação (HMAC como KDF).
// Ex.: derivarChave(JWT_SEGREDO, 'recuperacao-senha', senha_hash).
export const derivarChave = (segredo, ...partes) =>
  createHmac('sha256', segredo).update(JSON.stringify(partes)).digest();

const assinar = (payloadCodificado, chave) =>
  createHmac('sha256', chave).update(payloadCodificado).digest();

export function assinarToken(payload, chave) {
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${codificado}.${assinar(codificado, chave).toString('base64url')}`;
}

// Payload sem conferir a assinatura (para saber de quem é a chave); null se malformado.
export function lerPayload(token) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2 || !partes.every((parte) => PARTE.test(parte))) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

// Compara a assinatura em tempo constante.
export function assinaturaValida(token, chave) {
  if (!lerPayload(token)) return false;
  const [codificado, assinatura] = token.split('.');
  const esperada = assinar(codificado, chave);
  const recebida = Buffer.from(assinatura, 'base64url');
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

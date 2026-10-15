import { assinarToken, assinaturaValida, derivarChave, lerPayload } from './token-assinado';

// Tokens de link sem estado (tarefa 014): base64url(payload JSON) + "." + base64url(HMAC-SHA256).
describe('token assinado', () => {
  const chave = derivarChave(
    'segredo-de-teste-com-pelo-menos-32-caracteres',
    'recuperacao',
    'hash-1',
  );
  const payload = { id: 7, email: 'fulano@teste.com', exp: 2000000000 };

  const trocarParte = (token, indice, novo) => {
    const partes = token.split('.');
    partes[indice] = novo;
    return partes.join('.');
  };

  it('assina e lê o payload; a assinatura confere com a mesma chave', () => {
    const token = assinarToken(payload, chave);
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(lerPayload(token)).toEqual(payload);
    expect(assinaturaValida(token, chave)).toBe(true);
  });

  it('payload adulterado não confere', () => {
    const token = assinarToken(payload, chave);
    const outro = Buffer.from(JSON.stringify({ ...payload, exp: 2100000000 })).toString(
      'base64url',
    );
    expect(assinaturaValida(trocarParte(token, 0, outro), chave)).toBe(false);
  });

  it('assinatura adulterada ou de outra chave não confere', () => {
    const token = assinarToken(payload, chave);
    const [, assinatura] = token.split('.');
    const adulterada = (assinatura[0] === 'A' ? 'B' : 'A') + assinatura.slice(1);
    expect(assinaturaValida(trocarParte(token, 1, adulterada), chave)).toBe(false);
    expect(assinaturaValida(trocarParte(token, 1, 'curta'), chave)).toBe(false);

    const outraChave = derivarChave(
      'segredo-de-teste-com-pelo-menos-32-caracteres',
      'recuperacao',
      'hash-2',
    );
    expect(assinaturaValida(token, outraChave)).toBe(false);
  });

  it('derivarChave é determinística e muda com qualquer parte', () => {
    const segredo = 'segredo-de-teste-com-pelo-menos-32-caracteres';
    expect(derivarChave(segredo, 'a', 'b').equals(derivarChave(segredo, 'a', 'b'))).toBe(true);
    expect(derivarChave(segredo, 'a', 'b').equals(derivarChave(segredo, 'a', 'c'))).toBe(false);
    expect(derivarChave(segredo, 'a', 'b').equals(derivarChave(segredo, 'ab', ''))).toBe(false);
    expect(derivarChave(segredo, 'convite').equals(derivarChave(segredo, 'recuperacao'))).toBe(
      false,
    );
  });

  it('formato inválido não tem payload nem assinatura válida', () => {
    for (const token of [
      '',
      'sem-ponto',
      'a.b.c',
      '!!!.###',
      `${Buffer.from('nao-json').toString('base64url')}.x`,
      null,
      42,
    ]) {
      expect(lerPayload(token)).toBeNull();
      expect(assinaturaValida(token, chave)).toBe(false);
    }
  });
});

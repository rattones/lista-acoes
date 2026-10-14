import { gerarHashSenha, SENHA_MINIMA, validarSenha, verificarSenha } from './senha';

describe('senha', () => {
  it('exige no mínimo 10 caracteres', () => {
    expect(SENHA_MINIMA).toBe(10);
    expect(() => validarSenha('123456789')).toThrow(/mínimo de 10 caracteres/);
    expect(() => validarSenha(undefined)).toThrow(/mínimo de 10 caracteres/);
    expect(() => validarSenha('1234567890')).not.toThrow();
  });

  it('gera hash argon2id que não contém a senha', async () => {
    const hash = await gerarHashSenha('senha-forte-123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('senha-forte-123');
  });

  it('gera hashes diferentes para a mesma senha (sal)', async () => {
    expect(await gerarHashSenha('senha-forte-123')).not.toBe(
      await gerarHashSenha('senha-forte-123'),
    );
  });

  it('verifica a senha contra o hash', async () => {
    const hash = await gerarHashSenha('senha-forte-123');
    await expect(verificarSenha(hash, 'senha-forte-123')).resolves.toBe(true);
    await expect(verificarSenha(hash, 'outra-senha-123')).resolves.toBe(false);
  });

  it('hash inválido não autentica (sem exceção)', async () => {
    await expect(verificarSenha('nao-e-hash', 'senha-forte-123')).resolves.toBe(false);
  });
});

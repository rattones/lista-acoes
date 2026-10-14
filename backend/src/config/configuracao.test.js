import { validarConfig } from './configuracao';

describe('validarConfig', () => {
  const minima = {
    CORS_ORIGENS: 'http://app.teste',
    JWT_SEGREDO: 'segredo-de-teste-com-pelo-menos-32-caracteres',
  };

  it('falha quando falta uma variável obrigatória', () => {
    expect(() => validarConfig({})).toThrow(/CORS_ORIGENS/);
    expect(() => validarConfig({ CORS_ORIGENS: 'http://app.teste' })).toThrow(/JWT_SEGREDO/);
  });

  it('aplica os valores padrão', () => {
    expect(validarConfig(minima)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_ARQUIVO: 'data/monitor.db',
      CONFIAR_PROXY: 0,
      COOKIE_SEGURO: false,
    });
  });

  it('converte CORS_ORIGENS em lista', () => {
    const config = validarConfig({ ...minima, CORS_ORIGENS: 'http://a.teste, http://b.teste' });
    expect(config.CORS_ORIGENS).toEqual(['http://a.teste', 'http://b.teste']);
  });

  it('rejeita valores inválidos', () => {
    expect(() => validarConfig({ ...minima, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validarConfig({ ...minima, NODE_ENV: 'qa' })).toThrow(/NODE_ENV/);
  });

  it('JWT_SEGREDO precisa de pelo menos 32 caracteres', () => {
    expect(() => validarConfig({ ...minima, JWT_SEGREDO: 'curto' })).toThrow(/JWT_SEGREDO/);
  });

  it('cookie seguro por padrão só em produção', () => {
    expect(validarConfig({ ...minima, NODE_ENV: 'production' }).COOKIE_SEGURO).toBe(true);
    expect(validarConfig({ ...minima, NODE_ENV: 'development' }).COOKIE_SEGURO).toBe(false);
    expect(validarConfig({ ...minima, COOKIE_SEGURO: 'true' }).COOKIE_SEGURO).toBe(true);
  });
});

import { validarConfig } from './configuracao';

describe('validarConfig', () => {
  const minima = { CORS_ORIGENS: 'http://app.teste' };

  it('falha quando falta uma variável obrigatória', () => {
    expect(() => validarConfig({})).toThrow(/CORS_ORIGENS/);
  });

  it('aplica os valores padrão', () => {
    expect(validarConfig(minima)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_ARQUIVO: 'data/monitor.db',
    });
  });

  it('converte CORS_ORIGENS em lista', () => {
    const config = validarConfig({ CORS_ORIGENS: 'http://a.teste, http://b.teste' });
    expect(config.CORS_ORIGENS).toEqual(['http://a.teste', 'http://b.teste']);
  });

  it('rejeita valores inválidos', () => {
    expect(() => validarConfig({ ...minima, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validarConfig({ ...minima, NODE_ENV: 'qa' })).toThrow(/NODE_ENV/);
  });
});

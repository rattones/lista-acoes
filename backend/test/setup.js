// Ambiente mínimo para os testes: a configuração é validada na inicialização.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGENS = 'http://app.teste';
process.env.DB_ARQUIVO = ':memory:';
process.env.JWT_SEGREDO = 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.APP_URL = 'http://app.teste';

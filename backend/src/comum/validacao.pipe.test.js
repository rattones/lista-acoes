import Joi from 'joi';
import { ValidacaoPipe } from './validacao.pipe';
import { FiltroErros } from './filtro-erros';

const esquema = Joi.object({ ativo: Joi.string().required(), nota: Joi.number().min(1).max(5) });

describe('ValidacaoPipe', () => {
  const pipe = new ValidacaoPipe(esquema);

  it('devolve o valor validado e convertido', () => {
    expect(pipe.transform({ ativo: 'PETR4', nota: '3' })).toEqual({ ativo: 'PETR4', nota: 3 });
  });

  it('rejeita payload inválido com 400 listando todos os campos', () => {
    let erro;
    try {
      pipe.transform({ nota: 9, extra: true });
    } catch (e) {
      erro = e;
    }
    expect(erro.getStatus()).toBe(400);
    const campos = erro.getResponse().detalhes.map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['ativo', 'nota', 'extra']));
  });
});

describe('FiltroErros', () => {
  const resposta = () => {
    const res = { status: jest.fn(() => res), json: jest.fn() };
    return res;
  };
  const host = (res) => ({
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1' }) }),
  });

  it('formata erro de validação no padrão { erro, mensagem, detalhes }', () => {
    const res = resposta();
    let erro;
    try {
      new ValidacaoPipe(esquema).transform({});
    } catch (e) {
      erro = e;
    }
    new FiltroErros({ error: jest.fn() }).catch(erro, host(res));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erro: 'requisicao_invalida',
      mensagem: expect.any(String),
      detalhes: [expect.objectContaining({ campo: 'ativo' })],
    });
  });

  it('erro inesperado vira 500 sem vazar detalhes e é registrado no log', () => {
    const res = resposta();
    const logger = { error: jest.fn() };
    new FiltroErros(logger).catch(new Error('segredo interno'), host(res));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      erro: 'erro_interno',
      mensagem: 'Erro interno do servidor',
      detalhes: null,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('FiltroErros com erros de restrição do SQLite', () => {
  const resposta = () => {
    const res = { status: jest.fn(() => res), json: jest.fn() };
    return res;
  };
  const host = (res) => ({
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1' }) }),
  });
  const erroSqlite = (code, message) => Object.assign(new Error(message), { code });

  it('UNIQUE vira 409 conflito com os campos', () => {
    const res = resposta();
    new FiltroErros({ error: jest.fn() }).catch(
      erroSqlite(
        'SQLITE_CONSTRAINT_UNIQUE',
        'UNIQUE constraint failed: precos_diarios.ativo_id, precos_diarios.data',
      ),
      host(res),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      erro: 'conflito',
      mensagem: expect.any(String),
      detalhes: [
        { campo: 'ativo_id', mensagem: expect.any(String) },
        { campo: 'data', mensagem: expect.any(String) },
      ],
    });
  });

  it('FOREIGN KEY vira 422 entidade_invalida', () => {
    const res = resposta();
    new FiltroErros({ error: jest.fn() }).catch(
      erroSqlite('SQLITE_CONSTRAINT_FOREIGNKEY', 'FOREIGN KEY constraint failed'),
      host(res),
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erro: 'entidade_invalida' }));
  });

  it('CHECK vira 400 requisicao_invalida', () => {
    const res = resposta();
    new FiltroErros({ error: jest.fn() }).catch(
      erroSqlite('SQLITE_CONSTRAINT_CHECK', 'CHECK constraint failed: nota BETWEEN 1 AND 5'),
      host(res),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

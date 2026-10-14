import { Catch, HttpException } from '@nestjs/common';

const CODIGOS = {
  400: 'requisicao_invalida',
  401: 'nao_autenticado',
  403: 'proibido',
  404: 'nao_encontrado',
  405: 'metodo_nao_permitido',
  409: 'conflito',
  413: 'payload_muito_grande',
  422: 'entidade_invalida',
  423: 'bloqueado',
  429: 'muitas_requisicoes',
};

// Violações de restrição do SQLite que escapam da validação (ex.: duplicata, FK inexistente).
function traduzirErroSqlite(excecao) {
  switch (excecao.code) {
    case 'SQLITE_CONSTRAINT_UNIQUE':
    case 'SQLITE_CONSTRAINT_PRIMARYKEY': {
      // "UNIQUE constraint failed: tabela.coluna1, tabela.coluna2"
      const campos = (excecao.message.split(': ')[1] ?? '')
        .split(', ')
        .filter(Boolean)
        .map((coluna) => coluna.split('.').pop());
      return {
        status: 409,
        erro: 'conflito',
        mensagem: 'Já existe um registro com estes dados',
        detalhes: campos.map((campo) => ({ campo, mensagem: 'valor já cadastrado' })),
      };
    }
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return {
        status: 422,
        erro: 'entidade_invalida',
        mensagem: 'Registro relacionado inexistente',
        detalhes: null,
      };
    case 'SQLITE_CONSTRAINT_CHECK':
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return {
        status: 400,
        erro: 'requisicao_invalida',
        mensagem: 'Dados inválidos na requisição',
        detalhes: null,
      };
    default:
      return null;
  }
}

// Toda resposta de erro segue o formato { erro, mensagem, detalhes }.
@Catch()
export class FiltroErros {
  constructor(logger) {
    this.logger = logger;
  }

  catch(excecao, host) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const sqlite = traduzirErroSqlite(excecao);
    if (sqlite) {
      const { status, ...corpo } = sqlite;
      res.status(status).json(corpo);
      return;
    }

    // Erros do padrão http-errors (ex.: body-parser: corpo grande demais) trazem o status.
    if (!(excecao instanceof HttpException) && excecao?.expose === true && excecao.status < 500) {
      res.status(excecao.status).json({
        erro: CODIGOS[excecao.status] ?? 'erro_http',
        mensagem: excecao.status === 413 ? 'Corpo da requisição grande demais' : excecao.message,
        detalhes: null,
      });
      return;
    }

    if (!(excecao instanceof HttpException)) {
      this.logger.error({ err: excecao, reqId: req.id }, 'Erro não tratado');
      res
        .status(500)
        .json({ erro: 'erro_interno', mensagem: 'Erro interno do servidor', detalhes: null });
      return;
    }

    const status = excecao.getStatus();
    const resposta = excecao.getResponse();
    const corpo = typeof resposta === 'object' ? resposta : { message: resposta };
    // Exceções do próprio Nest (ex.: rota inexistente) vêm com `message` em inglês.
    const mensagem =
      corpo.mensagem ??
      (status === 404 && !corpo.erro
        ? `Rota não encontrada: ${req.method} ${req.originalUrl ?? req.url}`
        : [corpo.message].flat().join('; '));

    res.status(status).json({
      erro: corpo.erro ?? CODIGOS[status] ?? 'erro_http',
      mensagem,
      detalhes: corpo.detalhes ?? null,
    });
  }
}

import { Controller, Dependencies, Get, Module, NotFoundException, Query } from '@nestjs/common';
import Joi from 'joi';
import { validar } from '../comum/crud/controlador-crud';
import { data, id } from '../comum/crud/esquemas';
import { CONEXAO_DB } from '../database/database.module';

// Dashboard (tarefa 025): leitura consolidada para o app. Só usuários logados (admin e leitor):
// sem @Escopos, uma API key válida recebe 403. Registros excluídos logicamente ficam de fora.

// Linha de cada ativo da execução mais recente, com a variação da nota em relação à execução
// anterior do mesmo ativo (só sinais, execuções e ativos não excluídos contam).
const SQL_RESUMO = `
  WITH validos AS (
    SELECT s.*, e.data_execucao, a.nome, a.tipo AS tipo_ativo, a.bolsa AS bolsa_ativo,
           s.nota - LAG(s.nota) OVER (PARTITION BY s.ativo_id ORDER BY e.data_execucao)
             AS variacao_nota
    FROM sinais s
    JOIN execucoes e ON e.id = s.execucao_id
    JOIN ativos a ON a.id = s.ativo_id
    WHERE s.excluido_em IS NULL AND e.excluido_em IS NULL AND a.excluido_em IS NULL
  )
  SELECT ativo_id, ativo, nome, tipo_ativo AS tipo, bolsa_ativo AS bolsa, nota, variacao_nota,
         noticias, grafico, concordam, tendencia, destaque, proximo_evento, proximo_evento_data,
         data_preco, fechamento, moeda, rsi14, bollinger_pctb, macd_hist, dist_mm20, dist_mm50,
         dist_mm200, ret_5d, ret_1m, ret_3m, ret_1a
  FROM validos
  WHERE execucao_id = ?
  ORDER BY ativo`;

const SQL_ULTIMA_EXECUCAO = `
  SELECT id, data_execucao FROM execucoes
  WHERE excluido_em IS NULL ORDER BY data_execucao DESC LIMIT 1`;

const SQL_PRECOS = `
  SELECT data, fechamento FROM precos_diarios
  WHERE ativo_id = @ativo_id AND excluido_em IS NULL AND (@de IS NULL OR data >= @de)
  ORDER BY data`;

const SQL_NOTAS = `
  SELECT e.data_execucao, s.data_preco, s.nota, s.noticias, s.grafico
  FROM sinais s
  JOIN execucoes e ON e.id = s.execucao_id
  WHERE s.ativo_id = @ativo_id AND s.excluido_em IS NULL AND e.excluido_em IS NULL
    AND (@de IS NULL OR e.data_execucao >= @de)
  ORDER BY e.data_execucao`;

// Lista de ids "1,2,3" → [1, 2, 3].
const listaIds = () =>
  Joi.string()
    .pattern(/^\d+(,\d+)*$/)
    .custom((valor) => valor.split(',').map(Number))
    .messages({ 'string.pattern.base': '{{#label}} deve ser uma lista de ids: 1,2,3' });

const esquemaResumo = Joi.object({});
const esquemaHistorico = Joi.object({ ativo_id: id().required(), de: data() });
const esquemaNoticias = Joi.object({
  ativos: listaIds(),
  de: data(),
  limite: Joi.number().integer().min(1).max(50).default(10),
});

@Controller('dashboard')
@Dependencies(CONEXAO_DB)
export class DashboardController {
  constructor(db) {
    this.db = db;
  }

  @Get('resumo')
  resumo(@Query() query) {
    validar(esquemaResumo, query);
    const execucao = this.db.prepare(SQL_ULTIMA_EXECUCAO).get() ?? null;
    const ativos = execucao ? this.db.prepare(SQL_RESUMO).all(execucao.id) : [];
    return { execucao, ativos };
  }

  @Get('historico')
  historico(@Query() query) {
    const { ativo_id: ativoId, de = null } = validar(esquemaHistorico, query);
    const existe = this.db
      .prepare('SELECT 1 FROM ativos WHERE id = ? AND excluido_em IS NULL')
      .get(ativoId);
    if (!existe) {
      throw new NotFoundException({
        erro: 'nao_encontrado',
        mensagem: `Ativo ${ativoId} não encontrado`,
      });
    }
    const params = { ativo_id: ativoId, de };
    return {
      precos: this.db.prepare(SQL_PRECOS).all(params),
      notas: this.db.prepare(SQL_NOTAS).all(params),
    };
  }

  // Mais recentes primeiro (publicada_em ou, sem ela, coletada_em). Com `ativos`, entram as
  // desses ativos e as gerais (sem ativo).
  @Get('noticias')
  noticias(@Query() query) {
    const { ativos, de, limite } = validar(esquemaNoticias, query);
    const condicoes = ['n.excluido_em IS NULL', '(n.ativo_id IS NULL OR a.excluido_em IS NULL)'];
    const params = [];
    if (ativos) {
      condicoes.push(`(n.ativo_id IS NULL OR n.ativo_id IN (${ativos.map(() => '?').join(',')}))`);
      params.push(...ativos);
    }
    if (de) {
      condicoes.push('COALESCE(n.publicada_em, n.coletada_em) >= ?');
      params.push(de);
    }
    return this.db
      .prepare(
        `SELECT n.id, n.ativo_id, a.ativo, n.titulo, n.resumo, n.fonte, n.url, n.publicada_em,
                n.sentimento
         FROM noticias n
         LEFT JOIN ativos a ON a.id = n.ativo_id
         WHERE ${condicoes.join(' AND ')}
         ORDER BY COALESCE(n.publicada_em, n.coletada_em) DESC, n.id DESC
         LIMIT ?`,
      )
      .all(...params, limite);
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}

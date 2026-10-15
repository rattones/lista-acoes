import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ConflictException, Dependencies, Injectable, NotFoundException } from '@nestjs/common';
import { CONEXAO_DB } from '../database/database.module';

// Escopos disponíveis para as API keys (tarefa 016). Cada rota declara os seus com
// @Escopos(...) ou @EscoposCrud(...).
export const ESCOPOS_AGENTES = [
  'ativos:read',
  'execucoes:read',
  'execucoes:write',
  'sinais:read',
  'sinais:write',
  'precos:read',
  'precos:write',
  'noticias:read',
  'noticias:write',
];

// la_<prefixo: 8 hex>_<segredo: 32 hex (128 bits)>. O prefixo é público e serve à busca;
// do segredo, só o SHA-256 é guardado (alta entropia: não precisa de hash lento).
const FORMATO = /^la_([0-9a-f]{8})_([0-9a-f]{32})$/;
const TENTATIVAS_PREFIXO = 5;

const sha256 = (valor) => createHash('sha256').update(valor).digest();

// escopos é TEXT com um array JSON no banco; na API, um array.
export const apresentarToken = (registro) =>
  registro && { ...registro, escopos: JSON.parse(registro.escopos) };

const SELECAO = `id, nome, prefixo, escopos, criado_por, criado_em, ultimo_uso_em, revogado_em,
                 excluido_em`;

@Injectable()
@Dependencies(CONEXAO_DB)
export class AgentesTokensService {
  constructor(db) {
    this.db = db;
  }

  // Devolve o registro com a chave completa: é a única vez que ela sai da API.
  gerar({ nome, escopos }, criadoPor) {
    const inserir = this.db.prepare(
      `INSERT INTO agentes_tokens (nome, prefixo, token_hash, escopos, criado_por)
       VALUES (@nome, @prefixo, @hash, @escopos, @criadoPor)
       ON CONFLICT (prefixo) DO NOTHING RETURNING ${SELECAO}`,
    );
    for (let tentativa = 0; tentativa < TENTATIVAS_PREFIXO; tentativa += 1) {
      const prefixo = randomBytes(4).toString('hex');
      const segredo = randomBytes(16).toString('hex');
      const registro = inserir.get({
        nome,
        prefixo,
        hash: sha256(segredo).toString('hex'),
        escopos: JSON.stringify(escopos),
        criadoPor,
      });
      if (registro) return { ...apresentarToken(registro), chave: `la_${prefixo}_${segredo}` };
    }
    throw new Error('Não foi possível gerar um prefixo de API key livre');
  }

  // Agente da chave, ou null se ela é inválida, revogada, excluída ou se quem a criou não
  // é mais um admin ativo (como nos convites, tarefa 015). Atualiza ultimo_uso_em.
  autenticar(chave) {
    const [, prefixo, segredo] = FORMATO.exec(chave) ?? [];
    if (!prefixo) return null;
    const registro = this.db
      .prepare(
        `SELECT t.id, t.nome, t.escopos, t.token_hash
         FROM agentes_tokens t JOIN usuarios u ON u.id = t.criado_por
         WHERE t.prefixo = ? AND t.revogado_em IS NULL AND t.excluido_em IS NULL
           AND u.papel = 'admin' AND u.ativo = 1 AND u.excluido_em IS NULL`,
      )
      .get(prefixo);
    if (!registro) return null;
    if (!timingSafeEqual(sha256(segredo), Buffer.from(registro.token_hash, 'hex'))) return null;

    this.db
      .prepare("UPDATE agentes_tokens SET ultimo_uso_em = datetime('now','localtime') WHERE id = ?")
      .run(registro.id);
    return { id: registro.id, nome: registro.nome, escopos: JSON.parse(registro.escopos) };
  }

  // A chave revogada continua listada (auditoria), mas não autentica mais.
  revogar(id) {
    const registro = this.db
      .prepare(
        `UPDATE agentes_tokens SET revogado_em = datetime('now','localtime')
         WHERE id = ? AND excluido_em IS NULL AND revogado_em IS NULL RETURNING ${SELECAO}`,
      )
      .get(id);
    if (registro) return apresentarToken(registro);
    const existe = this.db
      .prepare('SELECT 1 FROM agentes_tokens WHERE id = ? AND excluido_em IS NULL')
      .get(id);
    if (!existe) {
      throw new NotFoundException({
        erro: 'nao_encontrado',
        mensagem: `Registro ${id} não encontrado`,
      });
    }
    throw new ConflictException({ erro: 'conflito', mensagem: `API key ${id} já está revogada` });
  }
}

import { createHash } from 'node:crypto';
import request from 'supertest';
import { ADMIN, criarAppTeste, idAtivo, idUsuario } from './utils/app-teste';

const FORMATO_CHAVE = /^la_[0-9a-f]{8}_[0-9a-f]{32}$/;

// API keys dos agentes (tarefa 016): geradas pelo admin, guardadas como hash, com escopos.
describe('API keys dos agentes', () => {
  let ctx;
  let admin;

  const criar = (corpo, token) => ctx.http(token).post('/v1/agentes-tokens').send(corpo);
  const comChave = (chave) => ({
    get: (url) => request(ctx.servidor).get(url).set('Authorization', `Bearer ${chave}`),
    post: (url) => request(ctx.servidor).post(url).set('Authorization', `Bearer ${chave}`),
    patch: (url) => request(ctx.servidor).patch(url).set('Authorization', `Bearer ${chave}`),
    delete: (url) => request(ctx.servidor).delete(url).set('Authorization', `Bearer ${chave}`),
  });
  const novaChave = async (escopos, nome = 'agente de teste') => {
    const res = await criar({ nome, escopos });
    expect(res.status).toBe(201);
    return res.body;
  };
  const lotePrecos = () => ({
    itens: [{ ativo_id: idAtivo(ctx.db, 'PETR4'), data: '2026-10-14', fechamento: 38.5 }],
  });
  const registro = (id) => ctx.db.prepare('SELECT * FROM agentes_tokens WHERE id = ?').get(id);

  beforeEach(async () => {
    ctx = await criarAppTeste();
    admin = ctx.http();
  });
  afterEach(() => ctx.app.close());

  describe('POST /v1/agentes-tokens (admin)', () => {
    it('cria a chave e a devolve uma única vez, guardando só prefixo e SHA-256 do segredo', async () => {
      const res = await criar({ nome: 'coletor de preços', escopos: ['precos:write'] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        nome: 'coletor de preços',
        escopos: ['precos:write'],
        criado_por: idUsuario(ctx.db, ADMIN),
        revogado_em: null,
        ultimo_uso_em: null,
      });
      expect(res.body.chave).toMatch(FORMATO_CHAVE);
      expect(res.body).not.toHaveProperty('token_hash');

      const [, prefixo, segredo] = res.body.chave.split('_');
      expect(res.body.prefixo).toBe(prefixo);
      const salvo = registro(res.body.id);
      expect(salvo.prefixo).toBe(prefixo);
      expect(salvo.token_hash).toBe(createHash('sha256').update(segredo).digest('hex'));
      expect(JSON.stringify(salvo)).not.toContain(segredo);
    });

    it('cada chave é diferente', async () => {
      const a = await novaChave(['ativos:read']);
      const b = await novaChave(['ativos:read']);
      expect(a.chave).not.toBe(b.chave);
      expect(a.prefixo).not.toBe(b.prefixo);
    });

    it('valida nome e escopos (lista fechada, ao menos um, sem repetição)', async () => {
      for (const corpo of [
        {},
        { nome: 'x' },
        { nome: 'x', escopos: [] },
        { nome: 'x', escopos: ['tudo:write'] },
        { nome: 'x', escopos: ['precos:write', 'precos:write'] },
        { nome: '', escopos: ['precos:write'] },
        { nome: 'x', escopos: ['precos:write'], prefixo: 'abcdabcd' },
      ]) {
        const res = await criar(corpo);
        expect(res.status).toBe(400);
        expect(res.body.erro).toBe('requisicao_invalida');
      }
      expect(ctx.db.prepare('SELECT COUNT(*) FROM agentes_tokens').pluck().get()).toBe(0);
    });

    it('leitor não cria chaves (403) e sem token → 401', async () => {
      expect((await criar({ nome: 'x', escopos: ['ativos:read'] }, ctx.tokens.leitor)).status).toBe(
        403,
      );
      expect((await criar({ nome: 'x', escopos: ['ativos:read'] }, null)).status).toBe(401);
      expect(ctx.db.prepare('SELECT COUNT(*) FROM agentes_tokens').pluck().get()).toBe(0);
    });
  });

  describe('GET /v1/agentes-tokens', () => {
    it('lista as chaves sem o segredo nem o hash, com escopos em array', async () => {
      const { chave } = await novaChave(['precos:write', 'ativos:read']);
      const res = await admin.get('/v1/agentes-tokens');
      expect(res.status).toBe(200);
      expect(res.body.paginacao.total).toBe(1);
      const [item] = res.body.dados;
      expect(item.escopos).toEqual(['precos:write', 'ativos:read']);
      expect(item).not.toHaveProperty('token_hash');
      expect(item).not.toHaveProperty('chave');
      const segredo = chave.split('_')[2];
      expect(JSON.stringify(res.body)).not.toContain(segredo);
      expect(JSON.stringify(res.body)).not.toContain(registro(item.id).token_hash);

      const obtido = await admin.get(`/v1/agentes-tokens/${item.id}`);
      expect(obtido.status).toBe(200);
      expect(obtido.body).not.toHaveProperty('token_hash');
      expect(obtido.body.escopos).toEqual(['precos:write', 'ativos:read']);
    });

    it('GET /v1/agentes-tokens/escopos devolve os escopos disponíveis', async () => {
      const res = await admin.get('/v1/agentes-tokens/escopos');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          'ativos:read',
          'precos:write',
          'noticias:write',
          'sinais:read',
          'sinais:write',
          'execucoes:write',
        ]),
      );
    });

    it('leitor não lista as chaves (403)', async () => {
      const leitor = ctx.http(ctx.tokens.leitor);
      expect((await leitor.get('/v1/agentes-tokens')).status).toBe(403);
      expect((await leitor.get('/v1/agentes-tokens/escopos')).status).toBe(403);
    });

    it('não há PATCH: a chave não muda depois de criada', async () => {
      const { id } = await novaChave(['ativos:read']);
      expect((await admin.patch(`/v1/agentes-tokens/${id}`).send({ nome: 'y' })).status).toBe(404);
    });
  });

  describe('autenticação com a chave', () => {
    it('critério de aceite: chave precos:write grava POST /v1/precos/lote', async () => {
      const { id, chave } = await novaChave(['precos:write']);
      const res = await comChave(chave).post('/v1/precos/lote').send(lotePrecos());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ inseridos: 1, atualizados: 0 });
      expect(registro(id).ultimo_uso_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('fora do escopo → 403 proibido, sem gravar', async () => {
      const { chave } = await novaChave(['ativos:read']);
      const res = await comChave(chave).post('/v1/precos/lote').send(lotePrecos());
      expect(res.status).toBe(403);
      expect(res.body.erro).toBe('proibido');
      expect(ctx.db.prepare('SELECT COUNT(*) FROM precos_diarios').pluck().get()).toBe(0);
    });

    it('cada escopo libera só as rotas declaradas', async () => {
      const leitura = comChave((await novaChave(['ativos:read'])).chave);
      expect((await leitura.get('/v1/ativos')).status).toBe(200);
      expect((await leitura.get('/v1/ativos/1')).status).toBe(200);
      expect((await leitura.patch('/v1/ativos/1').send({ nome: 'x' })).status).toBe(403);
      expect((await leitura.delete('/v1/ativos/1')).status).toBe(403);
      expect((await leitura.get('/v1/sinais')).status).toBe(403);

      const sinais = comChave((await novaChave(['sinais:read', 'sinais:write'])).chave);
      expect((await sinais.get('/v1/sinais')).status).toBe(200);
      expect((await sinais.post('/v1/sinais').send({})).status).toBe(400);
      expect((await sinais.delete('/v1/sinais/1')).status).toBe(403);
      expect((await sinais.post('/v1/sinais/1/restaurar')).status).toBe(403);

      const execucoes = comChave((await novaChave(['execucoes:write'])).chave);
      const criada = await execucoes
        .post('/v1/execucoes')
        .send({ data_execucao: '2026-10-14', fonte_lista: 'lista_salva' });
      expect(criada.status).toBe(201);

      const noticias = comChave((await novaChave(['noticias:write'])).chave);
      const lote = {
        itens: [{ titulo: 'Notícia', url: 'https://exemplo.com/n1', sentimento: 'neutro' }],
      };
      expect((await noticias.post('/v1/noticias/lote').send(lote)).status).toBe(200);
      expect((await noticias.post('/v1/precos/lote').send(lotePrecos())).status).toBe(403);
    });

    it('a chave não lê excluídos nem acessa usuários, chaves ou /auth/eu', async () => {
      const agente = comChave(
        (await novaChave(['ativos:read', 'precos:write', 'sinais:write'])).chave,
      );
      expect((await agente.get('/v1/ativos').query({ incluir_excluidos: true })).status).toBe(403);
      expect((await agente.get('/v1/usuarios')).status).toBe(403);
      expect((await agente.get('/v1/agentes-tokens')).status).toBe(403);
      expect((await agente.post('/v1/agentes-tokens').send({})).status).toBe(403);
      expect((await agente.get('/v1/auth/eu')).status).toBe(403);
    });

    it('chave revogada → 401', async () => {
      const { id, chave } = await novaChave(['precos:write']);
      const revogada = await admin.post(`/v1/agentes-tokens/${id}/revogar`);
      expect(revogada.status).toBe(200);
      expect(revogada.body.revogado_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(revogada.body).not.toHaveProperty('token_hash');

      const res = await comChave(chave).post('/v1/precos/lote').send(lotePrecos());
      expect(res.status).toBe(401);
      expect(res.body.erro).toBe('nao_autenticado');

      // A chave revogada continua listada, para auditoria.
      const lista = await admin.get('/v1/agentes-tokens');
      expect(lista.body.dados[0].revogado_em).toBe(revogada.body.revogado_em);
    });

    it('revogar de novo → 409; chave inexistente → 404; leitor → 403', async () => {
      const { id } = await novaChave(['precos:write']);
      expect(
        (await ctx.http(ctx.tokens.leitor).post(`/v1/agentes-tokens/${id}/revogar`)).status,
      ).toBe(403);
      expect(registro(id).revogado_em).toBeNull();
      expect((await admin.post(`/v1/agentes-tokens/${id}/revogar`)).status).toBe(200);
      const repetida = await admin.post(`/v1/agentes-tokens/${id}/revogar`);
      expect(repetida.status).toBe(409);
      expect(repetida.body.erro).toBe('conflito');
      expect((await admin.post('/v1/agentes-tokens/999/revogar')).status).toBe(404);
    });

    it('chave excluída → 401; restaurada volta a valer', async () => {
      const { id, chave } = await novaChave(['ativos:read']);
      expect((await admin.delete(`/v1/agentes-tokens/${id}`)).status).toBe(204);
      expect((await comChave(chave).get('/v1/ativos')).status).toBe(401);
      expect((await admin.post(`/v1/agentes-tokens/${id}/restaurar`)).status).toBe(200);
      expect((await comChave(chave).get('/v1/ativos')).status).toBe(200);
    });

    it('chave inválida, adulterada ou de prefixo inexistente → 401', async () => {
      const { chave } = await novaChave(['ativos:read']);
      const ultimo = chave.at(-1) === '0' ? '1' : '0';
      for (const invalida of [
        `${chave.slice(0, -1)}${ultimo}`,
        `la_00000000_${'0'.repeat(32)}`,
        'la_curta',
        `${chave}0`,
      ]) {
        const res = await comChave(invalida).get('/v1/ativos');
        expect(res.status).toBe(401);
        expect(res.body.erro).toBe('nao_autenticado');
      }
    });

    it('deixa de valer quando quem criou não é mais um admin ativo', async () => {
      const { chave } = await novaChave(['ativos:read']);
      const criador = idUsuario(ctx.db, ADMIN);
      ctx.db.prepare("UPDATE usuarios SET papel = 'leitor' WHERE id = ?").run(criador);
      expect((await comChave(chave).get('/v1/ativos')).status).toBe(401);
      ctx.db.prepare("UPDATE usuarios SET papel = 'admin', ativo = 0 WHERE id = ?").run(criador);
      expect((await comChave(chave).get('/v1/ativos')).status).toBe(401);
      ctx.db.prepare('UPDATE usuarios SET ativo = 1 WHERE id = ?').run(criador);
      expect((await comChave(chave).get('/v1/ativos')).status).toBe(200);
    });

    it('JWT de usuário continua valendo nas rotas com escopo', async () => {
      expect((await admin.post('/v1/precos/lote').send(lotePrecos())).status).toBe(200);
      expect((await ctx.http(ctx.tokens.leitor).get('/v1/ativos')).status).toBe(200);
    });
  });
});

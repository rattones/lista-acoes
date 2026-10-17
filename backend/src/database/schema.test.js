import { abrirConexao } from './conexao';
import { aplicarMigracoes, PASTA_MIGRACOES } from './migracoes';

// Schema inicial e carga (tarefa 010): banco novo criado só pelas migrations do projeto.
describe('schema inicial', () => {
  let db;

  const inserir = (tabela, dados) => {
    const colunas = Object.keys(dados);
    const sql = `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map((c) => `@${c}`).join(', ')})`;
    return Number(db.prepare(sql).run(dados).lastInsertRowid);
  };
  const idAtivo = (ativo) => db.prepare('SELECT id FROM ativos WHERE ativo = ?').pluck().get(ativo);
  const novaExecucao = (data) =>
    inserir('execucoes', { data_execucao: data, fonte_lista: 'lista_salva' });
  const novoSinal = (execucaoId, ativo, extra = {}) =>
    inserir('sinais', {
      execucao_id: execucaoId,
      ativo_id: idAtivo(ativo),
      ativo,
      ticker_yahoo: ativo,
      data_preco: '2026-10-13',
      noticias: 'positivo',
      grafico: 'alta',
      pontos_noticias: 1,
      pontos_grafico: 1,
      pontos_extremos: 0,
      soma: 2,
      nota: 4,
      concordam: 1,
      ...extra,
    });
  const novoUsuario = (email) =>
    inserir('usuarios', { email, nome: 'Fulano', senha_hash: '$argon2id$teste', papel: 'admin' });

  beforeEach(() => {
    db = abrirConexao(':memory:');
    aplicarMigracoes(db, PASTA_MIGRACOES);
  });

  afterEach(() => db.close());

  it('cria as tabelas e views previstas', () => {
    const objetos = (tipo) =>
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .pluck()
        .all(tipo);
    expect(objetos('table')).toEqual([
      'agentes_tokens',
      'ativos',
      'execucoes',
      'noticias',
      'precos_diarios',
      'schema_migrations',
      'sinais',
      'sinais_noticias',
      'usuarios',
    ]);
    expect(objetos('view')).toEqual([
      'v_ativos_monitorados',
      'v_historico_nota',
      'v_proximos_eventos',
      'v_resumo_atual',
    ]);
  });

  it('todas as tabelas de dados têm excluido_em; ativos não tem mais monitorar nem removido_em', () => {
    const colunas = (tabela) => db.pragma(`table_info(${tabela})`).map((c) => c.name);
    for (const tabela of [
      'execucoes',
      'sinais',
      'ativos',
      'usuarios',
      'precos_diarios',
      'noticias',
      'agentes_tokens',
    ]) {
      expect(colunas(tabela)).toContain('excluido_em');
    }
    expect(colunas('ativos')).not.toContain('monitorar');
    expect(colunas('ativos')).not.toContain('removido_em');
  });

  it('cria os índices de consulta por ativo e data', () => {
    const indices = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .pluck()
      .all();
    expect(indices).toEqual(
      expect.arrayContaining([
        'idx_noticias_ativo',
        'idx_precos_diarios_ativo',
        'idx_sinais_ativo',
      ]),
    );
  });

  it('carrega os 6 ativos iniciais, ativos e sem exclusão', () => {
    const ativos = db.prepare('SELECT ativo, status, excluido_em FROM ativos ORDER BY ativo').all();
    expect(ativos.map((a) => a.ativo)).toEqual([
      'CSCO',
      'GOOGL',
      'ORCL',
      'PETR4',
      'TSLA',
      'USDT-BRL',
    ]);
    expect(ativos.every((a) => a.status === 'ativo' && a.excluido_em === null)).toBe(true);
  });

  it('não cria usuário na carga inicial (admin vem do db:admin)', () => {
    expect(db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get()).toBe(0);
  });

  it('inserir sinal com ativo_id inexistente falha (FK)', () => {
    const execucao = novaExecucao('2026-10-13');
    expect(() => novoSinal(execucao, 'PETR4', { ativo_id: 999 })).toThrow(/FOREIGN KEY/);
  });

  it('v_ativos_monitorados não lista ativo inativo nem excluído', () => {
    db.prepare("UPDATE ativos SET status = 'inativo' WHERE ativo = 'TSLA'").run();
    db.prepare("UPDATE ativos SET excluido_em = datetime('now') WHERE ativo = 'ORCL'").run();
    const monitorados = db.prepare('SELECT ativo FROM v_ativos_monitorados').pluck().all();
    expect(monitorados).toEqual(['CSCO', 'GOOGL', 'PETR4', 'USDT-BRL']);
  });

  it('v_resumo_atual usa a execução mais recente e ignora sinais excluídos', () => {
    const antiga = novaExecucao('2026-10-12');
    novoSinal(antiga, 'TSLA');
    const atual = novaExecucao('2026-10-13');
    novoSinal(atual, 'PETR4');
    novoSinal(atual, 'GOOGL', { excluido_em: '2026-10-13 10:00:00' });

    expect(db.prepare('SELECT ativo FROM v_resumo_atual').pluck().all()).toEqual(['PETR4']);
  });

  it('v_resumo_atual ignora a execução excluída e cai na anterior', () => {
    const antiga = novaExecucao('2026-10-12');
    novoSinal(antiga, 'TSLA');
    const atual = novaExecucao('2026-10-13');
    novoSinal(atual, 'PETR4');
    db.prepare("UPDATE execucoes SET excluido_em = datetime('now') WHERE id = ?").run(atual);

    expect(db.prepare('SELECT ativo FROM v_resumo_atual').pluck().all()).toEqual(['TSLA']);
  });

  it('v_historico_nota calcula a variação e ignora sinais excluídos', () => {
    novoSinal(novaExecucao('2026-10-11'), 'PETR4', { nota: 2 });
    novoSinal(novaExecucao('2026-10-12'), 'PETR4', { nota: 5, excluido_em: '2026-10-12 10:00:00' });
    novoSinal(novaExecucao('2026-10-13'), 'PETR4', { nota: 4 });

    const historico = db.prepare('SELECT nota, variacao_nota FROM v_historico_nota').all();
    expect(historico).toEqual([
      { nota: 2, variacao_nota: null },
      { nota: 4, variacao_nota: 2 },
    ]);
  });

  it('v_proximos_eventos lista só eventos futuros de sinais não excluídos', () => {
    const execucao = novaExecucao('2026-10-13');
    novoSinal(execucao, 'PETR4', { proximo_evento: 'Balanço', proximo_evento_data: '2999-01-01' });
    novoSinal(execucao, 'TSLA', { proximo_evento: 'Passado', proximo_evento_data: '2000-01-01' });
    novoSinal(execucao, 'CSCO', {
      proximo_evento: 'Excluído',
      proximo_evento_data: '2999-01-01',
      excluido_em: '2026-10-13 10:00:00',
    });

    expect(db.prepare('SELECT ativo FROM v_proximos_eventos').pluck().all()).toEqual(['PETR4']);
  });

  it('precos_diarios rejeita duplicata (ativo, data)', () => {
    const preco = { ativo_id: idAtivo('PETR4'), data: '2026-10-13', fechamento: 38.5 };
    inserir('precos_diarios', preco);
    expect(() => inserir('precos_diarios', preco)).toThrow(/UNIQUE/);
  });

  it('noticias rejeita URL duplicada e sentimento fora da lista', () => {
    const noticia = { titulo: 'Alta do petróleo', url: 'https://exemplo.com/n/1' };
    inserir('noticias', noticia);
    expect(() => inserir('noticias', noticia)).toThrow(/UNIQUE/);
    expect(() =>
      inserir('noticias', { titulo: 'x', url: 'https://exemplo.com/n/2', sentimento: 'otimo' }),
    ).toThrow(/CHECK/);
  });

  it('noticia pode não ter ativo e perde o vínculo quando o ativo é apagado', () => {
    inserir('noticias', { titulo: 'Mercado', url: 'https://exemplo.com/geral' });
    const id = inserir('noticias', {
      titulo: 'Tesla',
      url: 'https://exemplo.com/tsla',
      ativo_id: idAtivo('TSLA'),
    });
    db.prepare("DELETE FROM ativos WHERE ativo = 'TSLA'").run();
    expect(db.prepare('SELECT ativo_id FROM noticias WHERE id = ?').pluck().get(id)).toBeNull();
  });

  it('apagar um ativo apaga seus preços e sinais', () => {
    const ativoId = idAtivo('PETR4');
    inserir('precos_diarios', { ativo_id: ativoId, data: '2026-10-13', fechamento: 38.5 });
    novoSinal(novaExecucao('2026-10-13'), 'PETR4');
    db.prepare('DELETE FROM ativos WHERE id = ?').run(ativoId);
    expect(db.prepare('SELECT COUNT(*) FROM precos_diarios').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM sinais').pluck().get()).toBe(0);
  });

  it('excluir usuário remove seus agentes_tokens (cascata)', () => {
    const usuario = novoUsuario('admin@teste.com');
    const outro = novoUsuario('outro@teste.com');
    const token = (criadoPor, prefixo) =>
      inserir('agentes_tokens', {
        nome: 'coletor',
        prefixo,
        token_hash: `hash-${prefixo}`,
        escopos: '["precos:write"]',
        criado_por: criadoPor,
      });
    token(usuario, 'aaaa1111');
    token(outro, 'bbbb2222');

    db.prepare('DELETE FROM usuarios WHERE id = ?').run(usuario);

    expect(db.prepare('SELECT prefixo FROM agentes_tokens').pluck().all()).toEqual(['bbbb2222']);
  });

  it('agentes_tokens exige escopos em JSON e prefixo único', () => {
    const usuario = novoUsuario('admin@teste.com');
    const base = { nome: 'coletor', token_hash: 'h', criado_por: usuario };
    expect(() =>
      inserir('agentes_tokens', { ...base, prefixo: 'p1', escopos: 'precos:write' }),
    ).toThrow(/CHECK/);
    inserir('agentes_tokens', { ...base, prefixo: 'p2', escopos: '[]' });
    expect(() => inserir('agentes_tokens', { ...base, prefixo: 'p2', escopos: '[]' })).toThrow(
      /UNIQUE/,
    );
  });

  // Exclusão permanente de conta (tarefa 017): apagar o usuário apaga tudo o que é dele.
  // Tarefa 040: notícias que pesaram na nota de cada sinal.
  it('sinais_noticias: PK composta e CASCADE ao apagar o sinal ou a notícia', () => {
    const ativo = db.prepare("SELECT id FROM ativos WHERE ativo = 'PETR4'").pluck().get();
    const execucao = db
      .prepare("INSERT INTO execucoes (data_execucao, fonte_lista) VALUES ('2026-10-13', 'teste')")
      .run().lastInsertRowid;
    const sinal = db
      .prepare(
        `INSERT INTO sinais (execucao_id, ativo_id, ativo, ticker_yahoo, data_preco, noticias, grafico,
           pontos_noticias, pontos_grafico, pontos_extremos, soma, nota, concordam)
         VALUES (?, ?, 'PETR4', 'PETR4.SA', '2026-10-13', 'positivo', 'alta', 2, 2, 0, 4, 5, 1)`,
      )
      .run(execucao, ativo).lastInsertRowid;
    const noticia = (url) =>
      db.prepare("INSERT INTO noticias (titulo, url) VALUES ('n', ?)").run(url).lastInsertRowid;
    const n1 = noticia('https://n.teste/1');
    const n2 = noticia('https://n.teste/2');
    const ligar = db.prepare('INSERT INTO sinais_noticias (sinal_id, noticia_id) VALUES (?, ?)');
    ligar.run(sinal, n1);
    ligar.run(sinal, n2);
    expect(() => ligar.run(sinal, n1)).toThrow(/UNIQUE|PRIMARY/);
    expect(() => ligar.run(sinal, 9999)).toThrow(/FOREIGN KEY/);

    const contar = () => db.prepare('SELECT COUNT(*) FROM sinais_noticias').pluck().get();
    db.prepare('DELETE FROM noticias WHERE id = ?').run(n1);
    expect(contar()).toBe(1);
    db.prepare('DELETE FROM sinais WHERE id = ?').run(sinal);
    expect(contar()).toBe(0);
  });

  it('toda chave estrangeira para usuarios é ON DELETE CASCADE', () => {
    const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    const fks = tabelas.flatMap((tabela) =>
      db
        .pragma(`foreign_key_list(${tabela})`)
        .filter((fk) => fk.table === 'usuarios')
        .map((fk) => ({ tabela, coluna: fk.from, on_delete: fk.on_delete })),
    );
    expect(fks.length).toBeGreaterThan(0);
    for (const fk of fks) expect(fk).toEqual({ ...fk, on_delete: 'CASCADE' });
  });

  it('e-mail do usuário é único sem diferenciar maiúsculas', () => {
    novoUsuario('Admin@Teste.com');
    expect(() => novoUsuario('admin@teste.com')).toThrow(/UNIQUE/);
  });
});

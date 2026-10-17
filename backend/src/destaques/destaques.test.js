import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirConexao } from '../database/conexao';
import { executar } from '../database/cli';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../database/migracoes';
import { diasUteisEntre, gerarHtml, selecionarDestaques } from './destaques';

// Destaques da landing (tarefa 034): os 5 ativos de maior nota da execução anterior a hoje,
// com até 3 notícias que pesaram na nota, num trecho de HTML estático.
describe('destaques da landing', () => {
  let db;
  const id = (ativo) => db.prepare('SELECT id FROM ativos WHERE ativo = ?').pluck().get(ativo);

  const execucao = (data, excluido = null) =>
    db
      .prepare(
        "INSERT INTO execucoes (data_execucao, fonte_lista, excluido_em) VALUES (?, 'agente', ?)",
      )
      .run(data, excluido).lastInsertRowid;

  const sinal = (execucaoId, ativo, nota, { ret1m = 0, excluido = null } = {}) =>
    db
      .prepare(
        `INSERT INTO sinais (execucao_id, ativo_id, ativo, ticker_yahoo, data_preco, noticias, grafico,
           pontos_noticias, pontos_grafico, pontos_extremos, soma, nota, concordam, ret_1m, excluido_em)
         VALUES (?, ?, ?, ?, '2026-10-15', 'misto', 'lateral', 0, 0, 0, 0, ?, 1, ?, ?)`,
      )
      .run(execucaoId, id(ativo), ativo, ativo, nota, ret1m, excluido).lastInsertRowid;

  const noticia = (titulo, publicadaEm, { url, excluido = null, fonte = 'Valor' } = {}) =>
    db
      .prepare(
        `INSERT INTO noticias (titulo, fonte, url, publicada_em, excluido_em) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        titulo,
        fonte,
        url ?? `https://n.teste/${encodeURIComponent(titulo)}`,
        publicadaEm,
        excluido,
      ).lastInsertRowid;

  const ligar = (sinalId, ...noticiaIds) => {
    for (const n of noticiaIds) {
      db.prepare('INSERT INTO sinais_noticias (sinal_id, noticia_id) VALUES (?, ?)').run(
        sinalId,
        n,
      );
    }
  };

  beforeEach(() => {
    db = abrirConexao(':memory:');
    aplicarMigracoes(db, PASTA_MIGRACOES);
    // Carga inicial: CSCO, GOOGL, ORCL, PETR4, TSLA, USDT-BRL. Um sétimo ativo para o top 5.
    db.prepare(
      "INSERT INTO ativos (ativo, nome, tipo, url_historico) VALUES ('VALE3', 'Vale ON', 'acao', 'https://x.teste')",
    ).run();
  });
  afterEach(() => db.close());

  describe('selecionarDestaques', () => {
    it('sem execução anterior a hoje → null', () => {
      execucao('2026-10-16');
      expect(selecionarDestaques(db, { hoje: '2026-10-16' })).toBeNull();
    });

    it('D-1: usa a execução mais recente anterior a hoje, não excluída', () => {
      const e1 = execucao('2026-10-14');
      execucao('2026-10-15', '2026-10-15 21:00:00');
      execucao('2026-10-16');
      sinal(e1, 'PETR4', 4);
      const r = selecionarDestaques(db, { hoje: '2026-10-16' });
      expect(r.execucao).toEqual({ id: e1, data_execucao: '2026-10-14' });
    });

    it('5 de maior nota; empate pelo retorno de 1 mês e depois pelo código', () => {
      const e = execucao('2026-10-15');
      sinal(e, 'CSCO', 3);
      sinal(e, 'GOOGL', 5, { ret1m: 2 });
      sinal(e, 'ORCL', 5, { ret1m: 8 });
      sinal(e, 'PETR4', 4, { ret1m: 1 });
      sinal(e, 'TSLA', 4, { ret1m: 1 });
      sinal(e, 'USDT-BRL', 2);
      sinal(e, 'VALE3', 1);
      const r = selecionarDestaques(db, { hoje: '2026-10-16' });
      expect(r.ativos.map((a) => [a.ativo, a.nota])).toEqual([
        ['ORCL', 5],
        ['GOOGL', 5],
        ['PETR4', 4],
        ['TSLA', 4],
        ['CSCO', 3],
      ]);
      expect(r.ativos[2]).toMatchObject({ nome: 'Petrobras PN' });
    });

    it('ativos inativos ou excluídos e sinais excluídos ficam de fora', () => {
      const e = execucao('2026-10-15');
      sinal(e, 'PETR4', 5);
      sinal(e, 'TSLA', 5);
      sinal(e, 'CSCO', 5, { excluido: '2026-10-15 22:00:00' });
      sinal(e, 'ORCL', 2);
      db.prepare("UPDATE ativos SET status = 'inativo' WHERE ativo = 'PETR4'").run();
      db.prepare(
        "UPDATE ativos SET excluido_em = '2026-10-15 23:00:00' WHERE ativo = 'TSLA'",
      ).run();
      const r = selecionarDestaques(db, { hoje: '2026-10-16' });
      expect(r.ativos.map((a) => a.ativo)).toEqual(['ORCL']);
    });

    it('até 3 notícias ligadas ao sinal, sem as excluídas, mais recentes primeiro', () => {
      const e = execucao('2026-10-15');
      const s = sinal(e, 'PETR4', 5);
      const outro = sinal(e, 'TSLA', 4);
      const ns = ['a', 'b', 'c', 'd'].map((t, i) => noticia(t, `2026-10-1${i} 09:00:00`));
      const excluida = noticia('excluída', '2026-10-15 09:00:00', {
        excluido: '2026-10-15 10:00:00',
      });
      ligar(s, ...ns, excluida);
      ligar(outro, noticia('só da tesla', '2026-10-14 09:00:00'));
      const [petr4, tsla] = selecionarDestaques(db, { hoje: '2026-10-16' }).ativos;
      expect(petr4.noticias.map((n) => n.titulo)).toEqual(['d', 'c', 'b']);
      expect(petr4.noticias[0]).toEqual({
        titulo: 'd',
        fonte: 'Valor',
        publicada_em: '2026-10-13 09:00:00',
        url: 'https://n.teste/d',
      });
      expect(tsla.noticias.map((n) => n.titulo)).toEqual(['só da tesla']);
    });
  });

  describe('diasUteisEntre', () => {
    it('conta os dias úteis depois de uma data até a outra', () => {
      expect(diasUteisEntre('2026-10-15', '2026-10-16')).toBe(1); // qui → sex
      expect(diasUteisEntre('2026-10-16', '2026-10-19')).toBe(1); // sex → seg
      expect(diasUteisEntre('2026-10-13', '2026-10-19')).toBe(4);
      expect(diasUteisEntre('2026-10-16', '2026-10-16')).toBe(0);
    });
  });

  describe('gerarHtml', () => {
    const destaques = (extra = {}) => ({
      execucao: { id: 1, data_execucao: '2026-10-15' },
      ativos: [
        {
          ativo: 'PETR4',
          nome: 'Petrobras PN',
          nota: 5,
          noticias: [
            {
              titulo: 'Petrobras <b>sobe</b> & paga dividendos',
              fonte: 'Valor "Econômico"',
              publicada_em: '2026-10-14 09:30:00',
              url: 'https://valor.teste/petrobras?a=1&b=2',
            },
          ],
        },
        { ativo: 'TSLA', nome: 'Tesla', nota: 4, noticias: [] },
      ],
      ...extra,
    });

    it('lista os ativos com nota, notícias e o aviso, com os dados escapados', () => {
      const html = gerarHtml(destaques(), { hoje: '2026-10-16' });
      expect(html).toContain('id="destaques"');
      expect(html).toContain('Atualizado em 15/10/2026');
      expect(html).not.toContain('destaques-data--antiga');
      expect(html).toContain('PETR4');
      expect(html).toContain('Petrobras PN');
      expect(html).toMatch(/destaques-nota[^>]*>5</);
      expect(html).toContain('Petrobras &lt;b&gt;sobe&lt;/b&gt; &amp; paga dividendos');
      expect(html).toContain('Valor &quot;Econômico&quot;');
      expect(html).toContain('href="https://valor.teste/petrobras?a=1&amp;b=2"');
      expect(html).toContain('target="_blank" rel="noopener noreferrer nofollow"');
      expect(html).toContain('14/10/2026');
      expect(html).toMatch(/não são recomendação de investimento/);
      expect(html).toMatch(/Rentabilidade passada não garante resultado futuro/);
      expect(html).not.toMatch(/style=|<script/i);
    });

    it('ativo sem notícia aparece só com a nota', () => {
      const html = gerarHtml(destaques(), { hoje: '2026-10-16' });
      const tsla = html.slice(html.indexOf('TSLA'));
      expect(tsla.slice(0, tsla.indexOf('</li>'))).not.toContain('destaques-noticias');
    });

    it('link que não é http(s) vira texto, sem href', () => {
      const d = destaques();
      d.ativos[0].noticias[0].url = 'javascript:alert(1)';
      const html = gerarHtml(d, { hoje: '2026-10-16' });
      expect(html).not.toContain('javascript:');
      expect(html).toContain('Petrobras &lt;b&gt;sobe');
    });

    it('execução com mais de 3 dias úteis: data em destaque', () => {
      const html = gerarHtml(destaques(), { hoje: '2026-10-21' });
      expect(html).toContain('destaques-data--antiga');
      expect(html).toContain('Atualizado em 15/10/2026');
    });

    it('sem destaques → trecho vazio', () => {
      expect(gerarHtml(null, { hoje: '2026-10-16' })).toBe('');
      expect(gerarHtml(destaques({ ativos: [] }), { hoje: '2026-10-16' })).toBe('');
    });
  });

  describe('CLI: destaques <pasta>', () => {
    let pasta;
    let linhas;
    const saida = (linha) => linhas.push(linha);

    beforeEach(() => {
      pasta = mkdtempSync(join(tmpdir(), 'destaques-'));
      linhas = [];
    });
    afterEach(() => rmSync(pasta, { recursive: true, force: true }));

    it('grava destaques.html (escrita atômica) e resume', async () => {
      const e = execucao('2026-10-15');
      sinal(e, 'PETR4', 5);
      await executar('destaques', { db, saida, args: [pasta, '--hoje', '2026-10-16'] });
      expect(readdirSync(pasta)).toEqual(['destaques.html']);
      expect(readFileSync(join(pasta, 'destaques.html'), 'utf8')).toContain('PETR4');
      expect(linhas).toEqual([
        `Destaques gravados em ${join(pasta, 'destaques.html')}: 1 ativo(s) da execução de 15/10/2026.`,
      ]);
    });

    it('sem execução: grava o arquivo vazio', async () => {
      await executar('destaques', { db, saida, args: [pasta, '--hoje', '2026-10-16'] });
      expect(readFileSync(join(pasta, 'destaques.html'), 'utf8')).toBe('');
      expect(linhas[0]).toMatch(/sem execução anterior a 16\/10\/2026/);
    });

    it('sem pasta ou pasta inexistente → erro com o uso', async () => {
      await expect(executar('destaques', { db, saida, args: [] })).rejects.toThrow(/Uso/);
      await expect(
        executar('destaques', { db, saida, args: [join(pasta, 'nao-existe')] }),
      ).rejects.toThrow(/não existe/);
    });
  });
});

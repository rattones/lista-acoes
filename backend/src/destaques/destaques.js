// Destaques da landing (tarefa 034): os 5 ativos de maior nota da execução mais recente anterior a
// hoje (D-1: a vitrine não antecipa o que os usuários veem no app no mesmo dia), com até 3
// notícias que pesaram na nota (sinais_noticias, 040). Vira um trecho de HTML estático, incluído
// pelo Nginx da landing por SSI: sem rota pública na API, sem JavaScript e sem estilo inline
// (CSP do www: default-src 'self').

const LIMITE_ATIVOS = 5;
const LIMITE_NOTICIAS = 3;
const DIAS_UTEIS_ANTIGA = 3;

const SQL_EXECUCAO = `
  SELECT id, data_execucao FROM execucoes
  WHERE excluido_em IS NULL AND data_execucao < ?
  ORDER BY data_execucao DESC LIMIT 1`;

const SQL_ATIVOS = `
  SELECT s.id AS sinal_id, s.ativo, a.nome, s.nota
  FROM sinais s
  JOIN ativos a ON a.id = s.ativo_id
  WHERE s.execucao_id = ? AND s.excluido_em IS NULL
    AND a.excluido_em IS NULL AND a.status = 'ativo'
  ORDER BY s.nota DESC, s.ret_1m IS NULL, s.ret_1m DESC, s.ativo
  LIMIT ${LIMITE_ATIVOS}`;

// O link do veículo (url_materia, tarefa 042) entra quando a coluna existir.
const sqlNoticias = (temUrlMateria) => `
  SELECT n.titulo, n.fonte, n.publicada_em,
         ${temUrlMateria ? 'COALESCE(n.url_materia, n.url)' : 'n.url'} AS url
  FROM sinais_noticias sn
  JOIN noticias n ON n.id = sn.noticia_id
  WHERE sn.sinal_id = ? AND n.excluido_em IS NULL
  ORDER BY COALESCE(n.publicada_em, n.coletada_em) DESC, n.id DESC
  LIMIT ${LIMITE_NOTICIAS}`;

// { execucao: { id, data_execucao }, ativos: [{ ativo, nome, nota, noticias }] } ou null.
export function selecionarDestaques(db, { hoje }) {
  const execucao = db.prepare(SQL_EXECUCAO).get(hoje);
  if (!execucao) return null;
  const temUrlMateria = db
    .pragma('table_info(noticias)')
    .some((coluna) => coluna.name === 'url_materia');
  const noticias = db.prepare(sqlNoticias(temUrlMateria));
  const ativos = db
    .prepare(SQL_ATIVOS)
    .all(execucao.id)
    .map(({ sinal_id: sinalId, ...ativo }) => ({ ...ativo, noticias: noticias.all(sinalId) }));
  return { execucao, ativos };
}

const dia = (texto) => new Date(`${texto.slice(0, 10)}T12:00:00Z`);

// Dias úteis (seg–sex) depois de `de` até `ate`, inclusive.
export function diasUteisEntre(de, ate) {
  let total = 0;
  for (const d = dia(de); ;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > dia(ate)) return total;
    if (d.getUTCDay() % 6 !== 0) total += 1;
  }
}

const escapar = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const dataBr = (texto) => {
  const [a, m, d] = String(texto).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const linkSeguro = (url) => /^https?:\/\//i.test(url ?? '');

function htmlNoticia({ titulo, fonte, publicada_em: publicadaEm, url }) {
  const texto = escapar(titulo);
  const conteudo = linkSeguro(url)
    ? `<a href="${escapar(url)}" target="_blank" rel="noopener noreferrer nofollow">${texto}</a>`
    : texto;
  const detalhes = [fonte && escapar(fonte), publicadaEm && dataBr(publicadaEm)]
    .filter(Boolean)
    .join(' · ');
  return `<li>${conteudo}${detalhes ? ` <span class="destaques-fonte">${detalhes}</span>` : ''}</li>`;
}

function htmlAtivo({ ativo, nome, nota, noticias }) {
  const lista = noticias.length
    ? `<ul class="destaques-noticias">${noticias.map(htmlNoticia).join('')}</ul>`
    : '';
  return [
    '<li class="destaques-ativo">',
    '<div class="destaques-cabecalho">',
    `<span class="destaques-nota destaques-nota--${nota}" aria-label="Nota ${nota} de 5">${nota}</span>`,
    `<span class="destaques-codigo">${escapar(ativo)}</span>`,
    nome ? ` <span class="destaques-nome">${escapar(nome)}</span>` : '',
    '</div>',
    lista,
    '</li>',
  ].join('');
}

// Trecho de HTML da seção; vazio quando não há o que mostrar (a landing fica como antes).
export function gerarHtml(destaques, { hoje }) {
  if (!destaques?.ativos.length) return '';
  const { execucao, ativos } = destaques;
  const antiga = diasUteisEntre(execucao.data_execucao, hoje) > DIAS_UTEIS_ANTIGA;
  const data = `Atualizado em ${dataBr(execucao.data_execucao)}${
    antiga ? ': os agentes estão sem atualização há alguns dias' : ''
  }`;
  return [
    '<section id="destaques" class="destaques" aria-labelledby="titulo-destaques">',
    '<h2 id="titulo-destaques">Destaques dos agentes</h2>',
    `<p class="destaques-data${antiga ? ' destaques-data--antiga' : ''}">${data}</p>`,
    `<ol class="destaques-lista">${ativos.map(htmlAtivo).join('')}</ol>`,
    '<p class="destaques-aviso">As notas são geradas automaticamente pelos agentes a partir de ',
    'dados públicos e não são recomendação de investimento. ',
    'Rentabilidade passada não garante resultado futuro.</p>',
    '</section>',
    '',
  ].join('\n');
}

// Data de hoje no fuso dos usuários, como 'AAAA-MM-DD'.
export const hojeEm = (fuso = 'America/Sao_Paulo', agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);

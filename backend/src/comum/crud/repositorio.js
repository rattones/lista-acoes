const AGORA = "datetime('now','localtime')";

// better-sqlite3 não grava booleanos: viram 1/0 (colunas INTEGER do schema).
const paraSqlite = (dados) =>
  Object.fromEntries(
    Object.entries(dados).map(([campo, valor]) => [
      campo,
      typeof valor === 'boolean' ? Number(valor) : valor,
    ]),
  );

// Repositório genérico em SQL puro (tarefa 011) para tabelas com `id` e `excluido_em`.
// Nomes de tabela e colunas vêm da definição do recurso e dos esquemas Joi (listas fechadas),
// nunca direto da requisição; os valores entram sempre como parâmetros.
//
// opcoes:
//   tabela    nome da tabela
//   ocultas   colunas que nunca saem da API (ex.: senha_hash)
//   preparar  (dados, db) => dados, ajuste antes de gravar (ex.: campos derivados)
//   apresentar (registro) => registro, ajuste do que sai da API (ex.: JSON em TEXT)
export class Repositorio {
  constructor(db, { tabela, ocultas = [], preparar = (dados) => dados, apresentar }) {
    this.db = db;
    this.tabela = tabela;
    this.ocultas = ocultas;
    this.preparar = preparar;
    this.apresentar = (registro) => (registro && apresentar ? apresentar(registro) : registro);
  }

  // Lidas na primeira consulta: a API pode subir antes das migrations (ex.: testes).
  get colunas() {
    this._colunas ??= this.db
      .pragma(`table_info(${this.tabela})`)
      .map((coluna) => coluna.name)
      .filter((coluna) => !this.ocultas.includes(coluna));
    return this._colunas;
  }

  get selecao() {
    return this.colunas.join(', ');
  }

  // { pagina, por_pagina, ordenar ('campo' ou '-campo'), incluir_excluidos, ...filtros de igualdade }
  listar({
    pagina,
    por_pagina: porPagina,
    ordenar,
    incluir_excluidos: incluirExcluidos,
    ...filtros
  }) {
    const condicoes = incluirExcluidos ? [] : ['excluido_em IS NULL'];
    const params = paraSqlite(filtros);
    for (const campo of Object.keys(filtros)) condicoes.push(`${campo} = @${campo}`);
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const campo = ordenar.replace(/^-/, '');
    const direcao = ordenar.startsWith('-') ? 'DESC' : 'ASC';
    const ordem = campo === 'id' ? `id ${direcao}` : `${campo} ${direcao}, id ${direcao}`;

    const total = this.db
      .prepare(`SELECT COUNT(*) FROM ${this.tabela} ${where}`)
      .pluck()
      .get(params);
    const dados = this.db
      .prepare(
        `SELECT ${this.selecao} FROM ${this.tabela} ${where} ORDER BY ${ordem} LIMIT @limite OFFSET @deslocamento`,
      )
      .all({ ...params, limite: porPagina, deslocamento: (pagina - 1) * porPagina })
      .map(this.apresentar);

    return {
      dados,
      paginacao: {
        pagina,
        por_pagina: porPagina,
        total,
        total_paginas: Math.ceil(total / porPagina),
      },
    };
  }

  obter(id, { incluirExcluidos = false } = {}) {
    const filtro = incluirExcluidos ? '' : 'AND excluido_em IS NULL';
    return this.apresentar(
      this.db.prepare(`SELECT ${this.selecao} FROM ${this.tabela} WHERE id = ? ${filtro}`).get(id),
    );
  }

  criar(dados) {
    const valores = paraSqlite(this.preparar(dados, this.db));
    const campos = Object.keys(valores);
    return this.apresentar(
      this.db
        .prepare(
          `INSERT INTO ${this.tabela} (${campos.join(', ')}) VALUES (${campos.map((c) => `@${c}`).join(', ')}) RETURNING ${this.selecao}`,
        )
        .get(valores),
    );
  }

  // Só registros não excluídos; devolve undefined se não encontrar.
  atualizar(id, dados) {
    const valores = paraSqlite(this.preparar(dados, this.db));
    const atribuicoes = Object.keys(valores).map((campo) => `${campo} = @${campo}`);
    if (this.colunas.includes('atualizado_em')) atribuicoes.push(`atualizado_em = ${AGORA}`);
    return this.apresentar(
      this.db
        .prepare(
          `UPDATE ${this.tabela} SET ${atribuicoes.join(', ')} WHERE id = @id AND excluido_em IS NULL RETURNING ${this.selecao}`,
        )
        .get({ ...valores, id }),
    );
  }

  excluirLogico(id) {
    const { changes } = this.db
      .prepare(
        `UPDATE ${this.tabela} SET excluido_em = ${AGORA} WHERE id = ? AND excluido_em IS NULL`,
      )
      .run(id);
    return changes > 0;
  }

  // Só registros excluídos; devolve undefined se não houver o que restaurar.
  restaurar(id) {
    return this.apresentar(
      this.db
        .prepare(
          `UPDATE ${this.tabela} SET excluido_em = NULL WHERE id = ? AND excluido_em IS NOT NULL RETURNING ${this.selecao}`,
        )
        .get(id),
    );
  }

  excluirFisico(id) {
    return this.db.prepare(`DELETE FROM ${this.tabela} WHERE id = ?`).run(id).changes > 0;
  }

  // Insere ou atualiza (pela chave única `chave`) todos os itens numa transação: se um falhar,
  // nada é gravado. No conflito, só os campos enviados no item são alterados; excluido_em
  // não muda (um registro excluído pelo admin continua excluído).
  // substituir: condição SQL sobre o registro existente (ex.: "fonte = 'seed'", tarefa 033);
  // quando vale, o registro é trocado inteiro pelo item (sem herdar campos) e conta como
  // atualizado.
  upsertLote(itens, chave, { substituir } = {}) {
    const onde = chave.map((c) => `${c} = @${c}`).join(' AND ');
    const existe = this.db.prepare(`SELECT 1 FROM ${this.tabela} WHERE ${onde}`);
    const apagarSubstituivel =
      substituir && this.db.prepare(`DELETE FROM ${this.tabela} WHERE ${onde} AND (${substituir})`);
    const resultado = { inseridos: 0, atualizados: 0 };

    this.db.transaction(() => {
      for (const item of itens) {
        const valores = paraSqlite(this.preparar(item, this.db));
        if (apagarSubstituivel) {
          const chaves = Object.fromEntries(chave.map((c) => [c, valores[c]]));
          if (apagarSubstituivel.run(chaves).changes) {
            resultado.atualizados += 1;
            this.inserir(valores);
            continue;
          }
        }
        const campos = Object.keys(valores);
        const alterados = campos.filter((campo) => !chave.includes(campo));
        const noConflito = alterados.length
          ? `DO UPDATE SET ${alterados.map((c) => `${c} = excluded.${c}`).join(', ')}`
          : 'DO NOTHING';
        resultado[existe.get(valores) ? 'atualizados' : 'inseridos'] += 1;
        this.db
          .prepare(
            `INSERT INTO ${this.tabela} (${campos.join(', ')}) VALUES (${campos.map((c) => `@${c}`).join(', ')})
             ON CONFLICT (${chave.join(', ')}) ${noConflito}`,
          )
          .run(valores);
      }
    })();
    return resultado;
  }

  inserir(valores) {
    const campos = Object.keys(valores);
    this.db
      .prepare(
        `INSERT INTO ${this.tabela} (${campos.join(', ')}) VALUES (${campos.map((c) => `@${c}`).join(', ')})`,
      )
      .run(valores);
  }
}

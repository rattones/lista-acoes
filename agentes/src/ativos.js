'use strict';

// Ativos que os coletores atendem (tarefas 036 e 037): os com status "ativo", todas as páginas
// (máximo da API: 100 por página); com código, só esse.
const POR_PAGINA = 100;

async function listarAtivos(api, codigo) {
  const ativos = [];
  for (let pagina = 1; ; pagina += 1) {
    const query = new URLSearchParams({
      status: 'ativo',
      ordenar: 'ativo',
      por_pagina: String(POR_PAGINA),
      pagina: String(pagina),
    });
    if (codigo) query.set('ativo', codigo);
    const { dados, paginacao } = await api.get(`/v1/ativos?${query}`);
    ativos.push(...dados);
    if (pagina >= (paginacao?.total_paginas ?? 1)) return ativos;
  }
}

module.exports = { listarAtivos };

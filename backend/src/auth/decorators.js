import { SetMetadata } from '@nestjs/common';

export const PUBLICO = 'auth:publico';
export const PAPEIS = 'auth:papeis';

// Rota sem autenticação (ex.: health, login).
export const Publico = () => SetMetadata(PUBLICO, true);

// Papéis exigidos na rota ou no controller inteiro: @Papeis('admin').
export const Papeis = (...papeis) => SetMetadata(PAPEIS, papeis);

export const ESCOPOS = 'auth:escopos';
export const ESCOPOS_CRUD = 'auth:escopos-crud';

// Escopos de API key de agente que liberam a rota (tarefa 016): @Escopos('precos:write').
// A rota continua aceitando o JWT de usuário, com as regras de @Papeis.
export const Escopos = (...escopos) => SetMetadata(ESCOPOS, escopos);

// Escopos das rotas herdadas do ControladorCrud, no controller do recurso:
// leitura → listar e obter; escrita → criar e atualizar. Excluir e restaurar ficam só com admin.
// Uso: @EscoposCrud({ leitura: 'sinais:read', escrita: 'sinais:write' })
export const EscoposCrud = ({ leitura, escrita }) =>
  SetMetadata(ESCOPOS_CRUD, {
    ...(leitura && { listar: [leitura], obter: [leitura] }),
    ...(escrita && { criar: [escrita], atualizar: [escrita] }),
  });

-- Sessões (tarefa 012): os tokens levam a versão da sessão do usuário. Incrementar
-- versao_sessao invalida na hora todos os tokens já emitidos (logout e, nas próximas
-- tarefas, troca de senha).
ALTER TABLE usuarios ADD COLUMN versao_sessao INTEGER NOT NULL DEFAULT 0;

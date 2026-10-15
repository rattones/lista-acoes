import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../api/cliente.js';

// Renova o token de acesso um minuto antes de ele expirar.
const ANTECEDENCIA_SEGUNDOS = 60;

// Sessão do usuário (tarefa 019). O token de acesso fica só em memória (nunca em
// localStorage); a sessão sobrevive ao recarregar a página pelo refresh token, que a API
// guarda num cookie httpOnly.
export const useAuthStore = defineStore('auth', () => {
  const usuario = ref(null);
  const token = ref(null);
  let inicio = null;
  let renovacao = null;
  let temporizador = null;

  const logado = computed(() => Boolean(usuario.value && token.value));
  const ehAdmin = computed(() => usuario.value?.papel === 'admin');

  function limpar() {
    clearTimeout(temporizador);
    temporizador = null;
    usuario.value = null;
    token.value = null;
  }

  function abrir(corpo) {
    usuario.value = corpo.usuario;
    token.value = corpo.token_acesso;
    clearTimeout(temporizador);
    const segundos = Math.max(corpo.expira_em_segundos - ANTECEDENCIA_SEGUNDOS, 10);
    temporizador = setTimeout(renovar, segundos * 1000);
  }

  async function login(email, senha) {
    abrir(await api.post('/v1/auth/login', { email, senha }));
  }

  // Novo token pelo cookie do refresh; false (e sessão local encerrada) se a API recusar.
  // Chamadas simultâneas compartilham o mesmo pedido.
  function renovar() {
    renovacao ??= api
      .post('/v1/auth/refresh')
      .then((corpo) => {
        abrir(corpo);
        return true;
      })
      .catch(() => {
        limpar();
        return false;
      })
      .finally(() => {
        renovacao = null;
      });
    return renovacao;
  }

  // Na primeira navegação: tenta retomar a sessão do cookie. Roda uma vez só.
  function iniciar() {
    inicio ??= renovar().then(() => undefined);
    return inicio;
  }

  // Encerra as sessões na API; a sessão local é limpa mesmo se a API falhar.
  async function logout() {
    try {
      await api.post('/v1/auth/logout');
    } catch {
      // sem conexão ou sessão já expirada: basta limpar a local
    }
    limpar();
  }

  // Sessão nova devolvida pela API (ex.: troca de senha no perfil, tarefa 022).
  const atualizarSessao = abrir;

  api.configurarSessao({ obterToken: () => token.value, renovar });

  return { usuario, token, logado, ehAdmin, login, logout, renovar, iniciar, atualizarSessao };
});

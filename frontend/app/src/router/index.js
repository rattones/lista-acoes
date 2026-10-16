import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const EmBreve = () => import('../views/EmBreveView.vue');

// meta.publica: sem login (e sem o menu lateral). meta.admin: só papel admin.
// As telas "em breve" são substituídas nas tarefas 022 a 024.
const rotas = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { publica: true, soDeslogado: true },
  },
  {
    path: '/recuperar-senha',
    name: 'recuperar-senha',
    component: () => import('../views/RecuperarSenhaView.vue'),
    meta: { publica: true },
  },
  {
    path: '/redefinir-senha',
    name: 'redefinir-senha',
    component: () => import('../views/RedefinirSenhaView.vue'),
    meta: { publica: true },
  },
  {
    path: '/cadastro',
    name: 'cadastro',
    component: () => import('../views/CadastroView.vue'),
    meta: { publica: true },
  },
  {
    path: '/',
    name: 'inicio',
    component: () => import('../views/InicioView.vue'),
    meta: { titulo: 'Dashboard' },
  },
  {
    path: '/ativos',
    name: 'ativos',
    component: () => import('../views/AtivosView.vue'),
    meta: { titulo: 'Ativos' },
  },
  {
    path: '/ativos/novo',
    name: 'ativo-novo',
    component: () => import('../views/NovoAtivoView.vue'),
    meta: { titulo: 'Novo ativo', admin: true },
  },
  {
    path: '/ativos/:id(\\d+)',
    name: 'ativo',
    component: () => import('../views/AtivoView.vue'),
    meta: { titulo: 'Ativo' },
  },
  {
    path: '/usuarios',
    name: 'usuarios',
    component: () => import('../views/UsuariosView.vue'),
    meta: { titulo: 'Usuários', admin: true },
  },
  {
    path: '/usuarios/:id(\\d+)',
    name: 'usuario',
    component: () => import('../views/UsuarioView.vue'),
    meta: { titulo: 'Editar usuário', admin: true },
  },
  {
    path: '/api-keys',
    name: 'api-keys',
    component: EmBreve,
    meta: { titulo: 'API keys', admin: true },
  },
  { path: '/perfil', name: 'perfil', component: EmBreve, meta: { titulo: 'Meu perfil' } },
  // Rota desconhecida: mostra a 404 mantendo o endereço digitado.
  {
    path: '/:caminho(.*)*',
    name: 'nao-encontrado',
    component: () => import('../views/NaoEncontradoView.vue'),
    meta: { publica: true },
  },
];

export function criarRouter(history = createWebHistory(), pinia) {
  const router = createRouter({ history, routes: rotas });

  router.beforeEach(async (para) => {
    const auth = useAuthStore(pinia);
    await auth.iniciar();
    if (para.meta.soDeslogado && auth.logado) return { name: 'inicio' };
    if (para.meta.publica) return true;
    if (!auth.logado) return { name: 'login', query: { volta: para.fullPath } };
    if (para.meta.admin && !auth.ehAdmin) return { name: 'inicio' };
    return true;
  });

  return router;
}

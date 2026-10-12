import { createRouter, createWebHistory } from 'vue-router';

const rotas = [
  { path: '/', name: 'inicio', component: () => import('../views/InicioView.vue') },
  // Rota desconhecida: mostra a 404 mantendo o endereço digitado.
  {
    path: '/:caminho(.*)*',
    name: 'nao-encontrado',
    component: () => import('../views/NaoEncontradoView.vue'),
  },
];

export function criarRouter(history = createWebHistory()) {
  return createRouter({ history, routes: rotas });
}

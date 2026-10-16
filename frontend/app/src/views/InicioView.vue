<script setup>
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
</script>

<template>
  <v-container data-teste="pagina-inicio">
    <h1 class="text-h5 mb-2">Dashboard</h1>
    <p class="text-medium-emphasis">
      Olá, {{ auth.usuario?.nome }}. O gráfico consolidado dos ativos chega na tarefa 025.
    </p>
  </v-container>
</template>

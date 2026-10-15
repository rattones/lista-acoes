<script setup>
import { useRoute } from 'vue-router';

const rota = useRoute();
</script>

<template>
  <v-container data-teste="pagina-em-breve">
    <h1 class="text-h5 mb-2">{{ rota.meta.titulo }}</h1>
    <p class="text-medium-emphasis">Esta tela chega nas próximas tarefas.</p>
  </v-container>
</template>

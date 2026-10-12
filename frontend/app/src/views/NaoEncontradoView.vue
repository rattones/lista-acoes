<template>
  <v-container data-teste="pagina-404" class="text-center py-16">
    <h1 class="text-h2 mb-4">404</h1>
    <p class="text-medium-emphasis mb-6">Página não encontrada.</p>
    <v-btn color="primary" :to="{ name: 'inicio' }">Voltar ao início</v-btn>
  </v-container>
</template>

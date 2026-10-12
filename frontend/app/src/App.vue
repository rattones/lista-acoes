<script setup>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { mdiWeatherNight, mdiWeatherSunny } from '@mdi/js';
import { TEMAS } from './plugins/vuetify.js';

const tema = useTheme();
const escuro = computed(() => tema.global.current.value.dark);

function alternarTema() {
  tema.toggle(TEMAS);
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <v-app-bar-title>Lista de Ações</v-app-bar-title>
      <v-btn
        data-teste="alternar-tema"
        :icon="escuro ? mdiWeatherSunny : mdiWeatherNight"
        :aria-label="escuro ? 'Usar tema claro' : 'Usar tema escuro'"
        @click="alternarTema"
      />
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

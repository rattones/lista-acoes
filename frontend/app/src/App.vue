<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay, useTheme } from 'vuetify';
import {
  mdiAccountCircle,
  mdiChartLine,
  mdiFormatListBulleted,
  mdiKeyVariant,
  mdiAccountGroup,
  mdiLogout,
  mdiWeatherNight,
  mdiWeatherSunny,
  mdiViewDashboard,
} from '@mdi/js';
import { TEMAS } from './plugins/vuetify.js';
import { useAuthStore } from './stores/auth.js';

const tema = useTheme();
const escuro = computed(() => tema.global.current.value.dark);
const rota = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { mobile } = useDisplay();

// Telas públicas (login, recuperação, 404) não têm o menu lateral.
const comMenu = computed(() => auth.logado && !rota.meta.publica);
const menuAberto = ref(!mobile.value);

const PAPEIS = { admin: 'Administrador', leitor: 'Leitor' };

// Tópicos do menu (tela 4 do PROJETO.md); admin: só para administradores.
const TOPICOS = [
  { nome: 'inicio', titulo: 'Dashboard', icone: mdiViewDashboard },
  { nome: 'ativos', titulo: 'Ativos', icone: mdiFormatListBulleted },
  { nome: 'usuarios', titulo: 'Usuários', icone: mdiAccountGroup, admin: true },
  { nome: 'api-keys', titulo: 'API keys', icone: mdiKeyVariant, admin: true },
  { nome: 'perfil', titulo: 'Meu perfil', icone: mdiAccountCircle },
];
const topicos = computed(() => TOPICOS.filter((topico) => !topico.admin || auth.ehAdmin));

function alternarTema() {
  tema.toggle(TEMAS);
}

async function sair() {
  await auth.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <v-app-bar-nav-icon
        v-if="comMenu"
        data-teste="abrir-menu"
        aria-label="Abrir ou fechar o menu"
        @click="menuAberto = !menuAberto"
      />
      <v-app-bar-title>
        <v-icon :icon="mdiChartLine" class="me-2" />
        Lista de Ações
      </v-app-bar-title>
      <v-btn
        data-teste="alternar-tema"
        :icon="escuro ? mdiWeatherSunny : mdiWeatherNight"
        :aria-label="escuro ? 'Usar tema claro' : 'Usar tema escuro'"
        @click="alternarTema"
      />
    </v-app-bar>

    <v-navigation-drawer v-if="comMenu" v-model="menuAberto" data-teste="menu">
      <v-list>
        <v-list-item
          data-teste="menu-usuario"
          :prepend-icon="mdiAccountCircle"
          :title="auth.usuario.nome"
          :subtitle="auth.usuario.email"
        >
          <template #append>
            <v-chip size="x-small" :color="auth.ehAdmin ? 'secondary' : undefined" label>
              {{ PAPEIS[auth.usuario.papel] ?? auth.usuario.papel }}
            </v-chip>
          </template>
        </v-list-item>
      </v-list>

      <v-divider />

      <v-list nav density="compact">
        <v-list-item
          v-for="topico in topicos"
          :key="topico.nome"
          :data-teste="`menu-${topico.nome}`"
          :to="{ name: topico.nome }"
          :exact="topico.nome === 'inicio'"
          :prepend-icon="topico.icone"
          :title="topico.titulo"
        />
      </v-list>

      <template #append>
        <v-list nav density="compact">
          <v-list-item
            data-teste="menu-sair"
            :prepend-icon="mdiLogout"
            title="Sair"
            @click="sair"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import { mdiOpenInNew } from '@mdi/js';
import { NOMES_SENTIMENTO } from '../../utils/dashboard.js';
import { formatarDataHora } from '../../utils/formatos.js';

// Últimas notícias do período, dos ativos filtrados e as gerais (tarefa 025).
defineProps({
  noticias: { type: Array, required: true },
  erro: { type: String, default: '' },
});

const COR_SENTIMENTO = { positivo: 'success', neutro: 'grey', negativo: 'error' };
</script>

<template>
  <v-card data-teste="ultimas-noticias">
    <v-card-title class="text-subtitle-1">Últimas notícias</v-card-title>
    <v-card-text v-if="erro">
      <v-alert type="error" variant="tonal">{{ erro }}</v-alert>
    </v-card-text>
    <v-card-text v-else-if="!noticias.length" class="text-medium-emphasis">
      Nenhuma notícia no período.
    </v-card-text>
    <v-list v-else density="compact" lines="two">
      <v-list-item v-for="noticia in noticias" :key="noticia.id" data-teste="noticia">
        <v-list-item-title class="text-wrap">
          <a :href="noticia.url" target="_blank" rel="noopener noreferrer">
            {{ noticia.titulo }}
            <v-icon :icon="mdiOpenInNew" size="x-small" />
          </a>
        </v-list-item-title>
        <v-list-item-subtitle class="d-flex flex-wrap align-center ga-2 mt-1">
          <v-chip size="x-small" label>{{ noticia.ativo ?? 'Geral' }}</v-chip>
          <v-chip
            v-if="noticia.sentimento"
            size="x-small"
            label
            :color="COR_SENTIMENTO[noticia.sentimento]"
          >
            {{ NOMES_SENTIMENTO[noticia.sentimento] ?? noticia.sentimento }}
          </v-chip>
          <span>{{ noticia.fonte ?? '—' }}</span>
          <span>{{ formatarDataHora(noticia.publicada_em) }}</span>
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup>
import { computed } from 'vue';
import { formatarPreco } from '../../utils/ativos.js';
import {
  CORES_NOTA,
  NOMES_GRAFICO,
  NOMES_NOTICIAS,
  formatarVariacao,
} from '../../utils/dashboard.js';

// Card do resumo atual de um ativo (tarefa 025). Clicar põe o ativo em foco no gráfico.
const props = defineProps({
  linha: { type: Object, required: true },
  emFoco: { type: Boolean, default: false },
});
defineEmits(['focar']);

const corVariacao = computed(() =>
  props.linha.variacao_nota > 0 ? 'success' : props.linha.variacao_nota < 0 ? 'error' : undefined,
);
</script>

<template>
  <v-card
    :data-teste="`card-${linha.ativo}`"
    :class="{ 'em-foco': emFoco }"
    :variant="emFoco ? 'outlined' : 'elevated'"
    :color="emFoco ? 'primary' : undefined"
    height="100%"
    @click="$emit('focar', linha.ativo)"
  >
    <v-card-text class="d-flex ga-3">
      <div class="text-center">
        <v-avatar :color="CORES_NOTA[linha.nota]" size="48" class="text-h6 text-white">
          <span data-teste="nota">{{ linha.nota }}</span>
        </v-avatar>
        <div data-teste="variacao" :class="['text-caption', corVariacao && `text-${corVariacao}`]">
          {{ formatarVariacao(linha.variacao_nota) }}
        </div>
      </div>
      <div class="flex-grow-1 text-high-emphasis" style="min-width: 0">
        <div class="font-weight-bold">{{ linha.ativo }}</div>
        <div class="text-caption text-medium-emphasis text-truncate">{{ linha.nome }}</div>
        <div class="text-body-2">{{ formatarPreco(linha.fechamento, linha.moeda) }}</div>
        <div class="text-caption">{{ linha.tendencia ?? '—' }}</div>
      </div>
    </v-card-text>
    <v-card-text class="pt-0 text-caption text-high-emphasis">
      <div>
        Notícias: {{ NOMES_NOTICIAS[linha.noticias] ?? linha.noticias }} · Gráfico:
        {{ NOMES_GRAFICO[linha.grafico] ?? linha.grafico }}
      </div>
      <v-chip
        data-teste="concordam"
        size="x-small"
        label
        class="mt-1"
        :color="linha.concordam ? 'success' : 'warning'"
      >
        {{ linha.concordam ? 'Concordam' : 'Divergem' }}
      </v-chip>
    </v-card-text>
  </v-card>
</template>

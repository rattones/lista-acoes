<script setup>
import { computed } from 'vue';
import { NOMES_TIPOS } from '../../utils/ativos.js';
import {
  NOMES_CONCORDAM,
  NOMES_GRAFICO,
  NOMES_IFR,
  NOMES_NOTICIAS,
  NOMES_PCTB,
} from '../../utils/dashboard.js';

// Filtros avançados do dashboard (tela 3.2, tarefa 025), aplicados na hora. Bolsa e tendência
// oferecem os valores que existem no resumo.
const props = defineProps({
  modelValue: { type: Object, required: true },
  aberto: { type: Boolean, default: false },
  linhas: { type: Array, required: true },
});
const emit = defineEmits(['update:modelValue', 'update:aberto']);

const itens = (nomes) => Object.entries(nomes).map(([value, title]) => ({ value, title }));
const existentes = (campo) =>
  [...new Set(props.linhas.map((l) => l[campo]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );

const CAMPOS = computed(() => [
  { campo: 'tipo', rotulo: 'Tipo', itens: itens(NOMES_TIPOS) },
  { campo: 'bolsa', rotulo: 'Bolsa', itens: existentes('bolsa') },
  { campo: 'tendencia', rotulo: 'Tendência', itens: existentes('tendencia') },
  { campo: 'noticias', rotulo: 'Leitura das notícias', itens: itens(NOMES_NOTICIAS) },
  { campo: 'grafico', rotulo: 'Leitura do gráfico', itens: itens(NOMES_GRAFICO) },
  { campo: 'concordam', rotulo: 'Notícias × gráfico', itens: itens(NOMES_CONCORDAM) },
  { campo: 'ifr', rotulo: 'IFR14', itens: itens(NOMES_IFR) },
  { campo: 'pctb', rotulo: '%B (Bollinger)', itens: itens(NOMES_PCTB) },
]);

const atualizar = (campo, valor) =>
  emit('update:modelValue', { ...props.modelValue, [campo]: valor ?? null });
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="560"
    @update:model-value="$emit('update:aberto', $event)"
  >
    <v-card data-teste="dialogo-filtros" title="Mais filtros">
      <v-card-text>
        <v-row density="compact">
          <v-col v-for="item in CAMPOS" :key="item.campo" cols="12" sm="6">
            <v-select
              :model-value="modelValue[item.campo]"
              :data-teste="`filtro-${item.campo}`"
              :label="item.rotulo"
              :items="item.itens"
              density="compact"
              clearable
              hide-details
              @update:model-value="atualizar(item.campo, $event)"
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn data-teste="fechar-filtros" @click="$emit('update:aberto', false)">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue';
import { mdiFilterVariant, mdiFilterRemove } from '@mdi/js';
import { PERIODOS, contarAvancados, filtrosPadrao, paraQuery } from '../../utils/dashboard.js';

// Filtros rápidos do dashboard (tela 3.1, tarefa 025): ativos (vários; nenhum = todos),
// período e nota mínima. "Mais filtros" abre o diálogo dos avançados (3.2).
const props = defineProps({
  modelValue: { type: Object, required: true },
  codigos: { type: Array, required: true },
});
const emit = defineEmits(['update:modelValue', 'mais-filtros']);

const atualizar = (mudanca) => emit('update:modelValue', { ...props.modelValue, ...mudanca });

function alternarAtivo(codigo) {
  const ativos = props.modelValue.ativos;
  atualizar({
    ativos: ativos.includes(codigo) ? ativos.filter((a) => a !== codigo) : [...ativos, codigo],
  });
}

const avancados = computed(() => contarAvancados(props.modelValue));
// O foco não conta como filtro: "Limpar filtros" o mantém.
const temFiltros = computed(
  () => Object.keys(paraQuery({ ...props.modelValue, foco: null })).length > 0,
);
const limpar = () => emit('update:modelValue', { ...filtrosPadrao(), foco: props.modelValue.foco });
</script>

<template>
  <div class="d-flex flex-wrap align-center ga-3" data-teste="filtros-rapidos">
    <div class="d-flex flex-wrap ga-1">
      <v-chip
        v-for="codigo in codigos"
        :key="codigo"
        :data-teste="`chip-ativo-${codigo}`"
        :color="modelValue.ativos.includes(codigo) ? 'primary' : undefined"
        :variant="modelValue.ativos.includes(codigo) ? 'flat' : 'outlined'"
        size="small"
        @click="alternarAtivo(codigo)"
      >
        {{ codigo }}
      </v-chip>
    </div>

    <v-btn-toggle
      :model-value="modelValue.periodo"
      mandatory
      density="compact"
      variant="outlined"
      divided
      color="primary"
      aria-label="Período"
      @update:model-value="atualizar({ periodo: $event })"
    >
      <v-btn
        v-for="periodo in PERIODOS"
        :key="periodo.valor"
        :value="periodo.valor"
        :data-teste="`periodo-${periodo.valor}`"
        size="small"
      >
        {{ periodo.titulo }}
      </v-btn>
    </v-btn-toggle>

    <div class="d-flex align-center ga-1">
      <span class="text-caption text-medium-emphasis">Nota mín.</span>
      <v-btn-toggle
        :model-value="modelValue.nota"
        density="compact"
        variant="outlined"
        divided
        color="primary"
        aria-label="Nota mínima"
        @update:model-value="atualizar({ nota: $event ?? null })"
      >
        <v-btn
          v-for="nota in 5"
          :key="nota"
          :value="nota"
          :data-teste="`nota-${nota}`"
          size="small"
        >
          {{ nota }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <v-spacer />
    <v-btn
      data-teste="mais-filtros"
      variant="tonal"
      size="small"
      :prepend-icon="mdiFilterVariant"
      @click="$emit('mais-filtros')"
    >
      Mais filtros
      <v-badge v-if="avancados" :content="avancados" color="primary" inline />
    </v-btn>
    <v-btn
      v-if="temFiltros"
      data-teste="limpar-filtros"
      variant="text"
      size="small"
      :prepend-icon="mdiFilterRemove"
      @click="limpar"
    >
      Limpar filtros
    </v-btn>
  </div>
</template>

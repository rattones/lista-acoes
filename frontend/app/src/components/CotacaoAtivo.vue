<script setup>
import { computed } from 'vue';
import { formatarPreco } from '../utils/ativos.js';
import { formatarData, formatarDataHora } from '../utils/formatos.js';

// Cotação de um ativo: a do wrapper ({ preco, moeda, em, fonte }, consultada na hora) ou a
// última gravada em precos_diarios ({ fechamento, moeda, data, fonte }).
const props = defineProps({ cotacao: { type: Object, default: null } });

const texto = computed(() => {
  const c = props.cotacao;
  if (!c) return null;
  if ('preco' in c) {
    return {
      valor: formatarPreco(c.preco, c.moeda),
      detalhe: [c.em && `em ${formatarDataHora(c.em)}`, c.fonte && `fonte: ${c.fonte}`],
    };
  }
  return {
    valor: formatarPreco(c.fechamento, c.moeda),
    detalhe: [`fechamento de ${formatarData(c.data)}`, c.fonte && `fonte: ${c.fonte}`],
  };
});
</script>

<template>
  <v-sheet data-teste="cotacao" border rounded class="pa-3 mb-4">
    <template v-if="texto">
      <span class="text-h6 me-2">{{ texto.valor }}</span>
      <span class="text-caption text-medium-emphasis">
        {{ texto.detalhe.filter(Boolean).join(' · ') }}
      </span>
    </template>
    <span v-else class="text-medium-emphasis">Nenhuma cotação gravada ainda.</span>
  </v-sheet>
</template>

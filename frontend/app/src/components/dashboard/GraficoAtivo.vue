<script setup>
import { computed } from 'vue';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'vue-chartjs';
import { formatarPreco } from '../../utils/ativos.js';
import { dadosDoGrafico, rotuloTooltip } from '../../utils/dashboard.js';

ChartJS.register(
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

// Gráfico do ativo em foco (tarefa 025): fechamento em linha (eixo esquerdo, na moeda do
// ativo) e nota de cada execução em barras (eixo direito, 1–5).
const props = defineProps({
  linha: { type: Object, default: null },
  historico: { type: Object, default: null },
  carregando: { type: Boolean, default: false },
  erro: { type: String, default: '' },
});

const dados = computed(() => dadosDoGrafico(props.historico ?? { precos: [], notas: [] }));
const semPrecos = computed(() => !!props.historico && !props.historico.precos.length);

const opcoes = computed(() => {
  const preco = (valor) => formatarPreco(valor, props.linha?.moeda);
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { position: 'left', ticks: { callback: preco } },
      y1: {
        position: 'right',
        min: 0,
        max: 5,
        ticks: { stepSize: 1 },
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Nota' },
      },
    },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (contexto) => rotuloTooltip(contexto, preco) } },
    },
  };
});
</script>

<template>
  <v-card data-teste="grafico">
    <v-card-title data-teste="titulo-grafico" class="text-subtitle-1">
      <template v-if="linha">
        {{ linha.ativo }}
        <span class="text-medium-emphasis text-body-2">{{ linha.nome }}</span>
      </template>
      <template v-else>Gráfico</template>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-2">{{ erro }}</v-alert>
      <v-alert
        v-else-if="semPrecos"
        data-teste="sem-precos"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        Ativo sem preços no período.
      </v-alert>
      <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-2" />
      <div class="grafico-area">
        <Chart type="bar" :data="dados" :options="opcoes" />
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.grafico-area {
  position: relative;
  height: 320px;
}
</style>

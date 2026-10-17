<script setup>
import { faixaIfr, faixaPctb, formatarNumero, formatarPct } from '../../utils/dashboard.js';

// Indicadores da última execução (tarefa 025), ordenáveis. IFR > 70 / < 30 e %B > 1 / < 0 em
// destaque (sobrecomprado / sobrevendido).
defineProps({ linhas: { type: Array, required: true } });

const CABECALHOS = [
  { title: 'Ativo', key: 'ativo' },
  { title: 'IFR14', key: 'rsi14', align: 'end' },
  { title: '%B', key: 'bollinger_pctb', align: 'end' },
  { title: 'MACD hist.', key: 'macd_hist', align: 'end' },
  { title: 'Dist. MM20', key: 'dist_mm20', align: 'end' },
  { title: 'Dist. MM50', key: 'dist_mm50', align: 'end' },
  { title: 'Dist. MM200', key: 'dist_mm200', align: 'end' },
  { title: '5 dias', key: 'ret_5d', align: 'end' },
  { title: '1 mês', key: 'ret_1m', align: 'end' },
  { title: '3 meses', key: 'ret_3m', align: 'end' },
  { title: '12 meses', key: 'ret_1a', align: 'end' },
];
const PORCENTAGENS = [
  'dist_mm20',
  'dist_mm50',
  'dist_mm200',
  'ret_5d',
  'ret_1m',
  'ret_3m',
  'ret_1a',
];

const extremo = (faixa) =>
  ({
    sobrecomprado: 'sobrecomprado',
    acima: 'sobrecomprado',
    sobrevendido: 'sobrevendido',
    abaixo: 'sobrevendido',
  })[faixa];

const linha = ({ item }) => ({ 'data-teste': `indicadores-${item.ativo}` });
</script>

<template>
  <v-card>
    <v-card-title class="text-subtitle-1">Indicadores</v-card-title>
    <v-data-table
      :headers="CABECALHOS"
      :items="linhas"
      :row-props="linha"
      :items-per-page="-1"
      density="compact"
      hide-default-footer
      no-data-text="Nenhum ativo."
    >
      <template #[`item.rsi14`]="{ item }">
        <span data-teste="rsi14" :class="extremo(faixaIfr(item.rsi14))">
          {{ formatarNumero(item.rsi14, 1) }}
        </span>
      </template>
      <template #[`item.bollinger_pctb`]="{ item }">
        <span data-teste="bollinger_pctb" :class="extremo(faixaPctb(item.bollinger_pctb))">
          {{ formatarNumero(item.bollinger_pctb) }}
        </span>
      </template>
      <template #[`item.macd_hist`]="{ item }">{{ formatarNumero(item.macd_hist) }}</template>
      <template v-for="campo in PORCENTAGENS" #[`item.${campo}`]="{ item }" :key="campo">
        <span :data-teste="campo">{{ formatarPct(item[campo]) }}</span>
      </template>
    </v-data-table>
  </v-card>
</template>

<style scoped>
.sobrecomprado,
.sobrevendido {
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.sobrecomprado {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.12);
}
.sobrevendido {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}
</style>

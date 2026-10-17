<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/cliente.js';
import CartaoAtivo from '../components/dashboard/CartaoAtivo.vue';
import FiltrosAvancados from '../components/dashboard/FiltrosAvancados.vue';
import FiltrosRapidos from '../components/dashboard/FiltrosRapidos.vue';
import GraficoAtivo from '../components/dashboard/GraficoAtivo.vue';
import TabelaIndicadores from '../components/dashboard/TabelaIndicadores.vue';
import UltimasNoticias from '../components/dashboard/UltimasNoticias.vue';
import {
  SEM_FOCO,
  filtrarLinhas,
  filtrosPadrao,
  inicioDoPeriodo,
  lerFiltros,
  paraQuery,
} from '../utils/dashboard.js';
import { mensagemDeErro } from '../utils/erros.js';
import { formatarData } from '../utils/formatos.js';

// Dashboard (tarefa 025, tela 3 do PROJETO.md): resumo da última execução em cards, gráfico de
// preço + nota do ativo em foco, tabela de indicadores e últimas notícias. A filtragem é feita
// aqui, sobre o resumo (poucos ativos); os filtros ficam na query para recarregar e compartilhar.
const route = useRoute();
const router = useRouter();

const resumo = ref(null);
const carregando = ref(true);
const erro = ref('');
const filtros = ref(filtrosPadrao());
const dialogoFiltros = ref(false);

const historico = ref(null);
const carregandoHistorico = ref(false);
const erroHistorico = ref('');
const noticias = ref([]);
const erroNoticias = ref('');

const linhas = computed(() => resumo.value?.ativos ?? []);
const codigos = computed(() =>
  linhas.value.map((l) => l.ativo).sort((a, b) => a.localeCompare(b, 'pt-BR')),
);
const filtradas = computed(() => filtrarLinhas(linhas.value, filtros.value));
const de = computed(() => inicioDoPeriodo(filtros.value.periodo));

// O card clicado; se os filtros o tiram (ou ao abrir), o primeiro da lista (maior nota).
// Com o foco desfeito (SEM_FOCO), nenhum.
const emFoco = computed(() =>
  filtros.value.foco === SEM_FOCO
    ? null
    : (filtradas.value.find((l) => l.ativo === filtros.value.foco) ?? filtradas.value[0] ?? null),
);

// Clicar no card em foco desfaz o foco (tarefa 038); em outro, foca esse.
const focar = (codigo) => {
  filtros.value = { ...filtros.value, foco: emFoco.value?.ativo === codigo ? SEM_FOCO : codigo };
};

// Respostas fora de ordem (troca rápida de foco ou período) são descartadas.
let pedidoHistorico = 0;
async function carregarHistorico() {
  const linha = emFoco.value;
  const pedido = ++pedidoHistorico;
  erroHistorico.value = '';
  if (!linha) {
    historico.value = null;
    return;
  }
  const query = new URLSearchParams({ ativo_id: String(linha.ativo_id) });
  if (de.value) query.set('de', de.value);
  carregandoHistorico.value = true;
  try {
    const dados = await api.get(`/v1/dashboard/historico?${query}`);
    if (pedido === pedidoHistorico) historico.value = dados;
  } catch (e) {
    if (pedido === pedidoHistorico) {
      historico.value = null;
      erroHistorico.value = mensagemDeErro(e);
    }
  } finally {
    if (pedido === pedidoHistorico) carregandoHistorico.value = false;
  }
}

// Notícias dos ativos filtrados (e as gerais); sem execução, todas as do período.
let pedidoNoticias = 0;
async function carregarNoticias() {
  const pedido = ++pedidoNoticias;
  erroNoticias.value = '';
  const query = new URLSearchParams({ limite: '10' });
  if (resumo.value?.execucao) {
    if (!filtradas.value.length) {
      noticias.value = [];
      return;
    }
    query.set('ativos', filtradas.value.map((l) => l.ativo_id).join(','));
  }
  if (de.value) query.set('de', de.value);
  try {
    const dados = await api.get(`/v1/dashboard/noticias?${query}`);
    if (pedido === pedidoNoticias) noticias.value = dados;
  } catch (e) {
    if (pedido === pedidoNoticias) {
      noticias.value = [];
      erroNoticias.value = mensagemDeErro(e);
    }
  }
}

onMounted(async () => {
  try {
    resumo.value = await api.get('/v1/dashboard/resumo');
  } catch (e) {
    erro.value = mensagemDeErro(e);
    carregando.value = false;
    return;
  }
  filtros.value = lerFiltros(route.query, linhas.value);
  carregando.value = false;

  // O foco só vai para a query quando é o que está na tela (escolhido e não tirado pelos filtros)
  // ou quando foi desfeito (foco=nenhum, tarefa 038).
  watch(
    [filtros, emFoco],
    () => {
      const { foco: escolhido } = filtros.value;
      const foco = escolhido === SEM_FOCO || escolhido === emFoco.value?.ativo ? escolhido : null;
      router.replace({ query: paraQuery({ ...filtros.value, foco }) });
    },
    { immediate: true },
  );
  watch(() => [emFoco.value?.ativo_id, de.value], carregarHistorico, { immediate: true });
  watch(() => [filtradas.value.map((l) => l.ativo_id).join(','), de.value], carregarNoticias, {
    immediate: true,
  });
});
</script>

<template>
  <v-container data-teste="pagina-inicio" fluid>
    <div class="d-flex flex-wrap align-baseline ga-3 mb-4">
      <h1 class="text-h5">Dashboard</h1>
      <span v-if="resumo?.execucao" data-teste="data-execucao" class="text-medium-emphasis">
        Execução de {{ formatarData(resumo.execucao.data_execucao) }}
      </span>
    </div>

    <v-progress-linear v-if="carregando" indeterminate color="primary" />
    <v-alert v-else-if="erro" data-teste="erro-dashboard" type="error" variant="tonal">
      {{ erro }}
    </v-alert>

    <template v-else>
      <v-alert
        v-if="!resumo.execucao"
        data-teste="sem-execucao"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        Ainda não há execuções do relatório.
      </v-alert>

      <template v-else>
        <FiltrosRapidos
          v-model="filtros"
          :codigos="codigos"
          class="mb-4"
          @mais-filtros="dialogoFiltros = true"
        />
        <FiltrosAvancados v-model="filtros" v-model:aberto="dialogoFiltros" :linhas="linhas" />

        <p v-if="!filtradas.length" data-teste="sem-ativos" class="text-medium-emphasis mb-4">
          Nenhum ativo com esses filtros.
        </p>
        <v-row density="compact" class="mb-4">
          <v-col v-for="linha in filtradas" :key="linha.ativo_id" cols="12" sm="6" md="4" lg="3">
            <CartaoAtivo :linha="linha" :em-foco="linha === emFoco" @focar="focar" />
          </v-col>
        </v-row>

        <GraficoAtivo
          v-if="emFoco"
          :linha="emFoco"
          :historico="historico"
          :carregando="carregandoHistorico"
          :erro="erroHistorico"
          class="mb-4"
        />
        <v-alert
          v-else-if="filtradas.length"
          data-teste="sem-foco"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          Clique num card para ver o gráfico.
        </v-alert>
      </template>

      <v-row>
        <v-col v-if="resumo.execucao" cols="12" lg="8">
          <TabelaIndicadores :linhas="filtradas" />
        </v-col>
        <v-col cols="12" :lg="resumo.execucao ? 4 : 12">
          <UltimasNoticias :noticias="noticias" :erro="erroNoticias" />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

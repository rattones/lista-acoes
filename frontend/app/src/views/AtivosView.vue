<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { mdiDeleteRestore, mdiMagnify, mdiPlus } from '@mdi/js';
import { api } from '../api/cliente.js';
import { useAuthStore } from '../stores/auth.js';
import {
  NOMES_STATUS,
  NOMES_TIPOS,
  STATUS,
  TIPOS,
  formatarPreco,
  ultimaCotacao,
} from '../utils/ativos.js';
import { mensagemDeErro } from '../utils/erros.js';
import { formatarData } from '../utils/formatos.js';

// Ativos monitorados (tarefa 021, tela 6 do PROJETO.md). Admin liga e desliga o status
// (entra ou não no relatório) direto na lista; o leitor só vê.
const auth = useAuthStore();

const ativos = ref([]);
const cotacoes = ref({});
const carregando = ref(false);
const erro = ref('');
const busca = ref('');
const tipo = ref(null);
const status = ref(null);
const mostrarExcluidos = ref(false);

const CABECALHOS = [
  { title: 'Ativo', key: 'ativo' },
  { title: 'Nome', key: 'nome' },
  { title: 'Tipo', key: 'tipo' },
  { title: 'Bolsa', key: 'bolsa' },
  { title: 'Status', key: 'status' },
  { title: 'Última cotação', key: 'cotacao', sortable: false, align: 'end' },
];

// Sem acentos e sem caixa, para a busca por código ou nome.
const simplificar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const filtrados = computed(() => {
  const termo = simplificar(busca.value.trim());
  return ativos.value
    .filter((a) => !tipo.value || a.tipo === tipo.value)
    .filter((a) => !status.value || (a.status === status.value && !a.excluido_em))
    .filter((a) => !termo || simplificar(`${a.ativo} ${a.nome}`).includes(termo))
    .sort((a, b) => a.ativo.localeCompare(b.ativo, 'pt-BR'));
});

// Uma consulta por ativo, em paralelo; só busca as que ainda não estão na tela.
async function carregarCotacoes() {
  const faltam = ativos.value.filter((a) => !a.excluido_em && !(a.id in cotacoes.value));
  await Promise.all(
    faltam.map(async (a) => {
      try {
        const cotacao = await ultimaCotacao(a.id);
        cotacoes.value = { ...cotacoes.value, [a.id]: cotacao };
      } catch {
        // sem cotação na tela; o erro da lista já aparece se a API estiver fora
      }
    }),
  );
}

async function carregar() {
  carregando.value = true;
  erro.value = '';
  const query = new URLSearchParams({ por_pagina: '100', ordenar: 'ativo' });
  if (mostrarExcluidos.value) query.set('incluir_excluidos', 'true');
  try {
    ativos.value = (await api.get(`/v1/ativos?${query}`)).dados;
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    carregando.value = false;
  }
  await carregarCotacoes();
}

function substituir(atualizado) {
  ativos.value = ativos.value.map((a) => (a.id === atualizado.id ? atualizado : a));
}

// Otimista: o switch muda na hora e volta ao valor anterior se a API recusar.
async function alternarStatus(ativo, ligado) {
  const anterior = ativo;
  const novo = ligado ? 'ativo' : 'inativo';
  erro.value = '';
  substituir({ ...ativo, status: novo });
  try {
    substituir(await api.patch(`/v1/ativos/${ativo.id}`, { status: novo }));
  } catch (e) {
    substituir(anterior);
    erro.value = mensagemDeErro(e);
  }
}

async function restaurar(ativo) {
  erro.value = '';
  try {
    substituir(await api.post(`/v1/ativos/${ativo.id}/restaurar`));
    await carregarCotacoes();
  } catch (e) {
    erro.value = mensagemDeErro(e);
  }
}

const linha = ({ item }) => ({ 'data-teste': `ativo-${item.id}` });

watch(mostrarExcluidos, carregar);
onMounted(carregar);
</script>

<template>
  <v-container data-teste="pagina-ativos">
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h5">Ativos</h1>
      <v-spacer />
      <v-switch
        v-if="auth.ehAdmin"
        v-model="mostrarExcluidos"
        data-teste="mostrar-excluidos"
        label="Mostrar excluídos"
        color="primary"
        density="compact"
        hide-details
      />
      <v-btn
        v-if="auth.ehAdmin"
        data-teste="novo-ativo"
        color="primary"
        :prepend-icon="mdiPlus"
        :to="{ name: 'ativo-novo' }"
      >
        Novo ativo
      </v-btn>
    </div>

    <v-row dense class="mb-2">
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="busca"
          data-teste="busca"
          label="Buscar por código ou nome"
          :prepend-inner-icon="mdiMagnify"
          density="compact"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-select
          v-model="tipo"
          data-teste="filtro-tipo"
          label="Tipo"
          :items="TIPOS"
          density="compact"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-select
          v-model="status"
          data-teste="filtro-status"
          label="Status"
          :items="STATUS"
          density="compact"
          clearable
          hide-details
        />
      </v-col>
    </v-row>

    <v-alert v-if="erro" data-teste="erro-ativos" type="error" variant="tonal" class="mb-4">
      {{ erro }}
    </v-alert>

    <v-data-table
      :headers="CABECALHOS"
      :items="filtrados"
      :loading="carregando"
      :row-props="linha"
      :items-per-page="-1"
      hide-default-footer
      no-data-text="Nenhum ativo."
      loading-text="Carregando..."
    >
      <template #[`item.ativo`]="{ item }">
        <span v-if="item.excluido_em">{{ item.ativo }}</span>
        <router-link
          v-else
          data-teste="abrir"
          class="font-weight-medium"
          :to="{ name: 'ativo', params: { id: item.id } }"
        >
          {{ item.ativo }}
        </router-link>
      </template>
      <template #[`item.tipo`]="{ item }">{{ NOMES_TIPOS[item.tipo] ?? item.tipo }}</template>
      <template #[`item.bolsa`]="{ item }">{{ item.bolsa ?? '—' }}</template>
      <template #[`item.status`]="{ item }">
        <div class="d-flex align-center">
          <v-chip v-if="item.excluido_em" data-teste="status" size="small" label color="grey">
            Excluído
          </v-chip>
          <v-switch
            v-else-if="auth.ehAdmin"
            data-teste="status"
            :model-value="item.status === 'ativo'"
            :aria-label="`Monitorar ${item.ativo}`"
            :title="NOMES_STATUS[item.status]"
            color="primary"
            density="compact"
            hide-details
            @update:model-value="alternarStatus(item, $event)"
          />
          <v-chip
            v-else
            data-teste="status"
            size="small"
            label
            :color="item.status === 'ativo' ? 'success' : 'warning'"
          >
            {{ NOMES_STATUS[item.status] ?? item.status }}
          </v-chip>
          <v-btn
            v-if="item.excluido_em"
            data-teste="restaurar"
            :icon="mdiDeleteRestore"
            variant="text"
            size="small"
            title="Restaurar"
            aria-label="Restaurar"
            @click="restaurar(item)"
          />
        </div>
      </template>
      <template #[`item.cotacao`]="{ item }">
        <span data-teste="cotacao" class="text-no-wrap">
          <template v-if="cotacoes[item.id]">
            {{ formatarPreco(cotacoes[item.id].fechamento, cotacoes[item.id].moeda) }}
            <span class="text-caption text-medium-emphasis d-block">
              {{ formatarData(cotacoes[item.id].data) }}
            </span>
          </template>
          <template v-else>—</template>
        </span>
      </template>
    </v-data-table>
  </v-container>
</template>

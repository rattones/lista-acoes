<script setup>
import { computed, onMounted, ref } from 'vue';
import { mdiKeyPlus, mdiKeyRemove } from '@mdi/js';
import NovaChaveDialog from '../components/NovaChaveDialog.vue';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';
import { formatarDataHora } from '../utils/formatos.js';

// API keys dos agentes (tarefa 023): só admin. A chave completa só aparece no diálogo de
// criação; a lista mostra o prefixo. Sem edição: para mudar, cria-se outra e revoga-se esta.
// Revogadas ficam ocultas até ligar "Mostrar revogadas" (tarefa 031): filtro no app, sobre a
// lista já carregada, e a preferência não é guardada.
const chaves = ref([]);
const escopos = ref([]);
const carregando = ref(false);
const erro = ref('');
const criando = ref(false);

const mostrarRevogadas = ref(false);
const revogadas = computed(() => chaves.value.filter((c) => c.revogado_em).length);
const visiveis = computed(() =>
  mostrarRevogadas.value ? chaves.value : chaves.value.filter((c) => !c.revogado_em),
);
const mensagemVazia = computed(() =>
  revogadas.value && !mostrarRevogadas.value
    ? `Nenhuma API key ativa. Ligue "Mostrar revogadas" para ver as ${revogadas.value} revogadas.`
    : 'Nenhuma API key.',
);

const revogando = ref(null);
const enviando = ref(false);

async function carregar() {
  carregando.value = true;
  erro.value = '';
  const query = new URLSearchParams({ por_pagina: '100', ordenar: '-criado_em' });
  try {
    const [lista, disponiveis] = await Promise.all([
      api.get(`/v1/agentes-tokens?${query}`),
      api.get('/v1/agentes-tokens/escopos'),
    ]);
    chaves.value = lista.dados;
    escopos.value = disponiveis;
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    carregando.value = false;
  }
}

const adicionar = (registro) => {
  chaves.value = [registro, ...chaves.value];
};

async function confirmarRevogacao() {
  const chave = revogando.value;
  enviando.value = true;
  erro.value = '';
  try {
    const atualizada = await api.post(`/v1/agentes-tokens/${chave.id}/revogar`);
    chaves.value = chaves.value.map((c) => (c.id === atualizada.id ? atualizada : c));
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
    revogando.value = null;
  }
}

onMounted(carregar);
</script>

<template>
  <v-container data-teste="pagina-api-keys">
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h5">API keys dos agentes</h1>
      <v-spacer />
      <v-switch
        v-model="mostrarRevogadas"
        data-teste="mostrar-revogadas"
        :label="`Mostrar revogadas (${revogadas})`"
        :disabled="!revogadas"
        color="primary"
        density="compact"
        hide-details
      />
      <v-btn
        data-teste="nova-chave"
        color="primary"
        :prepend-icon="mdiKeyPlus"
        :disabled="!escopos.length"
        @click="criando = true"
      >
        Nova chave
      </v-btn>
    </div>

    <v-alert v-if="erro" data-teste="erro-api-keys" type="error" variant="tonal" class="mb-4">
      {{ erro }}
    </v-alert>

    <v-progress-linear v-if="carregando" indeterminate color="primary" />

    <v-table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Escopos</th>
          <th>Criada em</th>
          <th>Último uso</th>
          <th>Status</th>
          <th class="text-end">Ações</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="chave in visiveis" :key="chave.id" :data-teste="`chave-${chave.id}`">
          <td>
            <div>{{ chave.nome }}</div>
            <code class="text-caption text-medium-emphasis">la_{{ chave.prefixo }}_…</code>
          </td>
          <td>
            <v-chip v-for="escopo in chave.escopos" :key="escopo" size="x-small" class="ma-1">
              {{ escopo }}
            </v-chip>
          </td>
          <td class="text-no-wrap">{{ formatarDataHora(chave.criado_em) }}</td>
          <td class="text-no-wrap">{{ formatarDataHora(chave.ultimo_uso_em, 'Nunca') }}</td>
          <td>
            <v-chip
              data-teste="status"
              size="small"
              label
              :color="chave.revogado_em ? 'grey' : 'success'"
              :title="
                chave.revogado_em ? `Revogada em ${formatarDataHora(chave.revogado_em)}` : undefined
              "
            >
              {{ chave.revogado_em ? 'Revogada' : 'Ativa' }}
            </v-chip>
          </td>
          <td class="text-end">
            <v-btn
              v-if="!chave.revogado_em"
              data-teste="revogar"
              :icon="mdiKeyRemove"
              variant="text"
              size="small"
              color="error"
              title="Revogar"
              aria-label="Revogar"
              @click="revogando = chave"
            />
          </td>
        </tr>
        <tr v-if="!carregando && !visiveis.length">
          <td colspan="6" data-teste="lista-vazia" class="text-center text-medium-emphasis">
            {{ mensagemVazia }}
          </td>
        </tr>
      </tbody>
    </v-table>

    <NovaChaveDialog v-model="criando" :escopos="escopos" @criada="adicionar" />

    <v-dialog
      :model-value="Boolean(revogando)"
      max-width="460"
      @update:model-value="revogando = null"
    >
      <v-card v-if="revogando" data-teste="dialogo-revogar" title="Revogar API key">
        <v-card-text>
          <p class="mb-2">
            Revogar a chave <strong>{{ revogando.nome }}</strong> (<code
              >la_{{ revogando.prefixo }}_…</code
            >)?
          </p>
          <p class="text-medium-emphasis">
            O agente perde o acesso na hora. A revogação não pode ser desfeita: para voltar, gere
            uma chave nova.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn data-teste="cancelar-revogacao" @click="revogando = null">Cancelar</v-btn>
          <v-btn
            data-teste="confirmar-revogacao"
            color="error"
            :loading="enviando"
            @click="confirmarRevogacao"
          >
            Revogar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

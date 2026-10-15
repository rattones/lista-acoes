<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  mdiAccountCancel,
  mdiAccountCheck,
  mdiAccountPlus,
  mdiDelete,
  mdiDeleteRestore,
  mdiPencil,
} from '@mdi/js';
import ConvidarDialog from '../components/ConvidarDialog.vue';
import { api } from '../api/cliente.js';
import { useAuthStore } from '../stores/auth.js';
import { mensagemDeErro } from '../utils/erros.js';
import { NOMES_PAPEIS, formatarDataHora, statusUsuario } from '../utils/formatos.js';

// Usuários (tarefa 020, tela 2 do PROJETO.md): só admin. Cadastro novo só por convite.
const auth = useAuthStore();

const usuarios = ref([]);
const carregando = ref(false);
const erro = ref('');
const mostrarExcluidos = ref(false);
const convidando = ref(false);

const excluindo = ref(null);
const permanente = ref(false);
const removendo = ref(false);

const ordenados = computed(() =>
  [...usuarios.value].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
);
const souEu = (usuario) => usuario.id === auth.usuario?.id;

async function carregar() {
  carregando.value = true;
  erro.value = '';
  const query = new URLSearchParams({ por_pagina: '100', ordenar: 'nome' });
  if (mostrarExcluidos.value) query.set('incluir_excluidos', 'true');
  try {
    usuarios.value = (await api.get(`/v1/usuarios?${query}`)).dados;
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    carregando.value = false;
  }
}

function substituir(atualizado) {
  usuarios.value = usuarios.value.map((u) => (u.id === atualizado.id ? atualizado : u));
}

async function executar(acao) {
  erro.value = '';
  try {
    await acao();
  } catch (e) {
    erro.value = mensagemDeErro(e);
  }
}

const alternarAtivo = (usuario) =>
  executar(async () =>
    substituir(await api.patch(`/v1/usuarios/${usuario.id}`, { ativo: !usuario.ativo })),
  );

const restaurar = (usuario) =>
  executar(async () => substituir(await api.post(`/v1/usuarios/${usuario.id}/restaurar`)));

function pedirExclusao(usuario) {
  permanente.value = false;
  excluindo.value = usuario;
}

async function confirmarExclusao() {
  const usuario = excluindo.value;
  removendo.value = true;
  await executar(async () => {
    await api.delete(`/v1/usuarios/${usuario.id}${permanente.value ? '?permanente=true' : ''}`);
    // Com os excluídos à mostra, a exclusão lógica deixa o registro na lista (recarrega).
    if (mostrarExcluidos.value && !permanente.value) await carregar();
    else usuarios.value = usuarios.value.filter((u) => u.id !== usuario.id);
  });
  removendo.value = false;
  excluindo.value = null;
}

watch(mostrarExcluidos, carregar);
onMounted(carregar);
</script>

<template>
  <v-container data-teste="pagina-usuarios">
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h5">Usuários</h1>
      <v-spacer />
      <v-switch
        v-model="mostrarExcluidos"
        data-teste="mostrar-excluidos"
        label="Mostrar excluídos"
        color="primary"
        density="compact"
        hide-details
      />
      <v-btn
        data-teste="convidar"
        color="primary"
        :prepend-icon="mdiAccountPlus"
        @click="convidando = true"
      >
        Convidar usuário
      </v-btn>
    </div>

    <v-alert v-if="erro" data-teste="erro-usuarios" type="error" variant="tonal" class="mb-4">
      {{ erro }}
    </v-alert>

    <v-progress-linear v-if="carregando" indeterminate color="primary" />

    <v-table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Papel</th>
          <th>Status</th>
          <th>Último login</th>
          <th class="text-end">Ações</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="usuario in ordenados" :key="usuario.id" :data-teste="`usuario-${usuario.id}`">
          <td>
            <div>{{ usuario.nome }}</div>
            <div class="text-caption text-medium-emphasis">{{ usuario.email }}</div>
          </td>
          <td>{{ NOMES_PAPEIS[usuario.papel] ?? usuario.papel }}</td>
          <td>
            <v-chip
              data-teste="status"
              size="small"
              label
              :color="statusUsuario(usuario).cor"
              :title="
                usuario.bloqueado_ate
                  ? `Bloqueado até ${formatarDataHora(usuario.bloqueado_ate)}`
                  : undefined
              "
            >
              {{ statusUsuario(usuario).texto }}
            </v-chip>
          </td>
          <td>{{ formatarDataHora(usuario.ultimo_login_em, 'Nunca') }}</td>
          <td class="text-end text-no-wrap">
            <template v-if="usuario.excluido_em">
              <v-btn
                data-teste="restaurar"
                :icon="mdiDeleteRestore"
                variant="text"
                size="small"
                title="Restaurar"
                aria-label="Restaurar"
                @click="restaurar(usuario)"
              />
            </template>
            <template v-else>
              <v-btn
                data-teste="editar"
                :icon="mdiPencil"
                variant="text"
                size="small"
                title="Editar"
                aria-label="Editar"
                :to="{ name: 'usuario', params: { id: usuario.id } }"
              />
              <v-btn
                data-teste="alternar-ativo"
                :icon="usuario.ativo ? mdiAccountCancel : mdiAccountCheck"
                variant="text"
                size="small"
                :disabled="souEu(usuario)"
                :title="usuario.ativo ? 'Desativar' : 'Ativar'"
                :aria-label="usuario.ativo ? 'Desativar' : 'Ativar'"
                @click="alternarAtivo(usuario)"
              />
              <v-btn
                data-teste="excluir"
                :icon="mdiDelete"
                variant="text"
                size="small"
                color="error"
                :disabled="souEu(usuario)"
                title="Excluir"
                aria-label="Excluir"
                @click="pedirExclusao(usuario)"
              />
            </template>
          </td>
        </tr>
        <tr v-if="!carregando && !ordenados.length">
          <td colspan="5" class="text-center text-medium-emphasis">Nenhum usuário.</td>
        </tr>
      </tbody>
    </v-table>

    <ConvidarDialog v-model="convidando" />

    <v-dialog
      :model-value="Boolean(excluindo)"
      max-width="460"
      @update:model-value="excluindo = null"
    >
      <v-card v-if="excluindo" data-teste="dialogo-excluir" title="Excluir usuário">
        <v-card-text>
          <p class="mb-2">
            Excluir <strong>{{ excluindo.nome }}</strong> ({{ excluindo.email }})?
          </p>
          <v-checkbox
            v-model="permanente"
            data-teste="excluir-permanente"
            label="Excluir permanentemente"
            color="error"
            hide-details
          />
          <v-alert v-if="permanente" type="warning" variant="tonal" density="compact" class="mt-2">
            O usuário e tudo o que ele criou (como as API keys) são apagados. Esta ação não pode ser
            desfeita.
          </v-alert>
          <p v-else class="text-medium-emphasis mt-2">
            A exclusão lógica pode ser desfeita em "Mostrar excluídos".
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="excluindo = null">Cancelar</v-btn>
          <v-btn
            data-teste="confirmar-exclusao"
            color="error"
            :loading="removendo"
            @click="confirmarExclusao"
          >
            Excluir
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

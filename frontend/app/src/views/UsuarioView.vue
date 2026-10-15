<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/cliente.js';
import { useAuthStore } from '../stores/auth.js';
import { mensagemDeErro } from '../utils/erros.js';
import { formatarDataHora, statusUsuario } from '../utils/formatos.js';

// Edição de usuário pelo admin (tarefa 020): nome, papel e status. O e-mail não muda.
const rota = useRoute();
const router = useRouter();
const auth = useAuthStore();

const usuario = ref(null);
const naoEncontrado = ref(false);
const nome = ref('');
const papel = ref('leitor');
const ativo = ref(true);
const salvando = ref(false);
const erro = ref('');

// O próprio admin não muda o próprio papel nem o status aqui (não se trancar fora).
const souEu = computed(() => usuario.value?.id === auth.usuario?.id);
const obrigatorio = (valor) => Boolean(valor?.trim()) || 'Campo obrigatório';

onMounted(async () => {
  try {
    usuario.value = await api.get(`/v1/usuarios/${rota.params.id}`);
    nome.value = usuario.value.nome;
    papel.value = usuario.value.papel;
    ativo.value = Boolean(usuario.value.ativo);
  } catch (e) {
    if (e.status === 404) naoEncontrado.value = true;
    else erro.value = mensagemDeErro(e);
  }
});

async function salvar() {
  if (obrigatorio(nome.value) !== true) return;
  const dados = { nome: nome.value.trim() };
  if (!souEu.value) Object.assign(dados, { papel: papel.value, ativo: ativo.value });
  salvando.value = true;
  erro.value = '';
  try {
    await api.patch(`/v1/usuarios/${usuario.value.id}`, dados);
    await router.push({ name: 'usuarios' });
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-container data-teste="pagina-usuario" style="max-width: 640px">
    <h1 class="text-h5 mb-4">Editar usuário</h1>

    <v-alert
      v-if="naoEncontrado"
      data-teste="usuario-nao-encontrado"
      type="warning"
      variant="tonal"
    >
      Usuário não encontrado.
      <div class="mt-2"><router-link :to="{ name: 'usuarios' }">Voltar à lista</router-link></div>
    </v-alert>

    <v-form v-else-if="usuario" data-teste="form-usuario" @submit.prevent="salvar">
      <v-text-field
        :model-value="usuario.email"
        data-teste="email"
        label="E-mail"
        readonly
        hint="O e-mail não pode ser alterado"
        persistent-hint
        class="mb-2"
      />
      <v-text-field v-model="nome" data-teste="nome" label="Nome" :rules="[obrigatorio]" />
      <v-radio-group v-model="papel" label="Papel" inline :disabled="souEu">
        <v-radio data-teste="papel-leitor" label="Leitor" value="leitor" />
        <v-radio data-teste="papel-admin" label="Administrador" value="admin" />
      </v-radio-group>
      <v-checkbox
        v-model="ativo"
        data-teste="ativo"
        label="Pode entrar no app (ativo)"
        :disabled="souEu"
        :hint="souEu ? 'Você não pode mudar o próprio papel nem se desativar.' : undefined"
        persistent-hint
      />

      <p class="text-caption text-medium-emphasis my-4">
        Status: {{ statusUsuario(usuario).texto }} · Último login:
        {{ formatarDataHora(usuario.ultimo_login_em, 'nunca') }} · Criado em
        {{ formatarDataHora(usuario.criado_em) }}
      </p>

      <v-alert v-if="erro" data-teste="erro-usuario" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>

      <div class="d-flex ga-2">
        <v-btn :to="{ name: 'usuarios' }">Cancelar</v-btn>
        <v-btn type="submit" color="primary" :loading="salvando">Salvar</v-btn>
      </div>
    </v-form>

    <v-alert v-else-if="erro" data-teste="erro-usuario" type="error" variant="tonal">
      {{ erro }}
    </v-alert>
  </v-container>
</template>

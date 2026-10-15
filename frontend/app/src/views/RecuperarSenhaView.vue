<script setup>
import { ref } from 'vue';
import CartaoPublico from '../components/CartaoPublico.vue';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';

const email = ref('');
const enviando = ref(false);
const enviado = ref('');
const erro = ref('');

const valido = (valor) => /^\S+@\S+\.\S+$/.test(valor?.trim() ?? '') || 'Informe um e-mail válido';

// A API responde sempre 202 com a mesma mensagem, exista ou não o e-mail (tarefa 014).
async function pedir() {
  if (valido(email.value) !== true) return;
  enviando.value = true;
  erro.value = '';
  try {
    const { mensagem } = await api.post('/v1/auth/recuperar-senha', { email: email.value.trim() });
    enviado.value = mensagem;
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoPublico titulo="Recuperar a senha" data-teste="pagina-recuperar-senha">
    <v-alert v-if="enviado" data-teste="recuperar-enviado" type="success" variant="tonal">
      {{ enviado }} O link vale por 24 horas.
    </v-alert>
    <v-form v-else data-teste="form-recuperar" @submit.prevent="pedir">
      <p class="text-medium-emphasis mb-4">
        Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.
      </p>
      <v-text-field
        v-model="email"
        data-teste="email"
        label="E-mail"
        type="email"
        autocomplete="username"
        :rules="[valido]"
        autofocus
      />
      <v-alert v-if="erro" data-teste="erro-recuperar" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>
      <v-btn type="submit" color="primary" block :loading="enviando">Enviar link</v-btn>
    </v-form>
    <div class="text-center mt-4">
      <router-link data-teste="link-login" :to="{ name: 'login' }">Voltar ao login</router-link>
    </div>
  </CartaoPublico>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mdiEye, mdiEyeOff } from '@mdi/js';
import CartaoPublico from '../components/CartaoPublico.vue';
import { useAuthStore } from '../stores/auth.js';
import { mensagemDeErro } from '../utils/erros.js';

const auth = useAuthStore();
const rota = useRoute();
const router = useRouter();

const email = ref('');
const senha = ref('');
const verSenha = ref(false);
const enviando = ref(false);
const erro = ref('');

const obrigatorio = (valor) => Boolean(valor?.trim()) || 'Campo obrigatório';

// Só caminhos internos: "//site" ou "http://..." viraria redirecionamento para fora.
const destino = () => {
  const volta = rota.query.volta;
  return typeof volta === 'string' && /^\/(?![/\\])/.test(volta) ? volta : '/';
};

async function entrar() {
  if (!email.value.trim() || !senha.value) return;
  enviando.value = true;
  erro.value = '';
  try {
    await auth.login(email.value.trim(), senha.value);
    await router.replace(destino());
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoPublico titulo="Entrar" data-teste="pagina-login">
    <v-form data-teste="form-login" @submit.prevent="entrar">
      <v-text-field
        v-model="email"
        data-teste="email"
        label="E-mail"
        type="email"
        autocomplete="username"
        :rules="[obrigatorio]"
        autofocus
      />
      <v-text-field
        v-model="senha"
        data-teste="senha"
        label="Senha"
        :type="verSenha ? 'text' : 'password'"
        autocomplete="current-password"
        :append-inner-icon="verSenha ? mdiEyeOff : mdiEye"
        :rules="[obrigatorio]"
        @click:append-inner="verSenha = !verSenha"
      />
      <v-alert v-if="erro" data-teste="erro-login" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>
      <v-btn type="submit" color="primary" block :loading="enviando">Entrar</v-btn>
    </v-form>
    <div class="text-center mt-4">
      <router-link data-teste="link-recuperar" :to="{ name: 'recuperar-senha' }">
        Esqueci a senha
      </router-link>
    </div>
  </CartaoPublico>
</template>

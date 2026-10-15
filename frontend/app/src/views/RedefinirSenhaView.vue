<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CartaoPublico from '../components/CartaoPublico.vue';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';

// Mesmo mínimo da API (backend/src/auth/senha.js).
const SENHA_MINIMA = 10;

const rota = useRoute();
const router = useRouter();

const estado = ref('validando'); // validando | formulario | invalido | sucesso
const email = ref('');
const aviso = ref('');
const senha = ref('');
const confirmacao = ref('');
const enviando = ref(false);
const erro = ref('');
const sucesso = ref('');
let token = '';

const minimo = (valor) =>
  (valor?.length ?? 0) >= SENHA_MINIMA || `Use ao menos ${SENHA_MINIMA} caracteres`;
const igual = (valor) => valor === senha.value || 'As senhas não conferem';

// O link traz o token no fragmento (#t=), que o navegador não envia ao servidor nem aos
// logs; ?t= também é aceito. Depois de lido, o token sai do endereço.
function lerToken() {
  const doFragmento = new URLSearchParams(rota.hash.replace(/^#/, '')).get('t');
  return doFragmento ?? (typeof rota.query.t === 'string' ? rota.query.t : '');
}

function linkInvalido(e) {
  estado.value = 'invalido';
  aviso.value =
    e?.codigo === 'token_expirado'
      ? 'Link expirado. Peça um novo para redefinir a senha.'
      : (e?.message ?? 'Link inválido ou já utilizado. Peça um novo.');
}

onMounted(async () => {
  token = lerToken();
  if (rota.hash || rota.query.t) await router.replace({ name: 'redefinir-senha' });
  if (!token) return linkInvalido({ message: 'Link inválido ou incompleto. Peça um novo.' });
  try {
    ({ email: email.value } = await api.post('/v1/auth/redefinir-senha/validar', { token }));
    estado.value = 'formulario';
  } catch (e) {
    if (['token_expirado', 'token_invalido'].includes(e.codigo)) linkInvalido(e);
    else linkInvalido({ message: mensagemDeErro(e) });
  }
});

async function redefinir() {
  if (minimo(senha.value) !== true || igual(confirmacao.value) !== true) return;
  enviando.value = true;
  erro.value = '';
  try {
    const { mensagem } = await api.post('/v1/auth/redefinir-senha', { token, senha: senha.value });
    sucesso.value = mensagem;
    estado.value = 'sucesso';
  } catch (e) {
    if (['token_expirado', 'token_invalido'].includes(e.codigo)) linkInvalido(e);
    else erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoPublico titulo="Redefinir a senha" data-teste="pagina-redefinir-senha">
    <div v-if="estado === 'validando'" class="text-center py-4">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert
      v-else-if="estado === 'invalido'"
      data-teste="redefinir-link-invalido"
      type="warning"
      variant="tonal"
    >
      {{ aviso }}
      <div class="mt-2">
        <router-link :to="{ name: 'recuperar-senha' }">Pedir um novo link</router-link>
      </div>
    </v-alert>

    <v-alert
      v-else-if="estado === 'sucesso'"
      data-teste="redefinir-sucesso"
      type="success"
      variant="tonal"
    >
      {{ sucesso }}
      <div class="mt-2">
        <router-link :to="{ name: 'login' }">Ir para o login</router-link>
      </div>
    </v-alert>

    <v-form v-else data-teste="form-redefinir" @submit.prevent="redefinir">
      <p class="mb-4" data-teste="redefinir-email">
        Nova senha para <strong>{{ email }}</strong>
      </p>
      <v-text-field
        v-model="senha"
        data-teste="nova-senha"
        label="Nova senha"
        type="password"
        autocomplete="new-password"
        :rules="[minimo]"
        autofocus
      />
      <v-text-field
        v-model="confirmacao"
        data-teste="confirmacao"
        label="Confirme a nova senha"
        type="password"
        autocomplete="new-password"
        :rules="[igual]"
      />
      <v-alert v-if="erro" data-teste="erro-redefinir" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>
      <v-btn type="submit" color="primary" block :loading="enviando">Redefinir a senha</v-btn>
    </v-form>
  </CartaoPublico>
</template>

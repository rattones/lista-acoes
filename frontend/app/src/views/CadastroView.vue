<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CartaoPublico from '../components/CartaoPublico.vue';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';
import { NOMES_PAPEIS } from '../utils/formatos.js';
import { limparLink, tokenDoLink } from '../utils/link.js';

// Mesmo mínimo da API (backend/src/auth/senha.js).
const SENHA_MINIMA = 10;
const ERROS_DO_CONVITE = ['token_expirado', 'token_invalido', 'conflito'];

// Cadastro por convite (tarefa 020): o e-mail vem do link, assinado pela API, e só é
// confirmado; nome e senha são do convidado.
const rota = useRoute();
const router = useRouter();

const estado = ref('validando'); // validando | formulario | invalido | sucesso
const convite = ref(null);
const aviso = ref('');
const jaCadastrado = ref(false);
const confirmo = ref(false);
const nome = ref('');
const senha = ref('');
const confirmacao = ref('');
const enviando = ref(false);
const erro = ref('');
let token = '';

const obrigatorio = (valor) => Boolean(valor?.trim()) || 'Campo obrigatório';
const minimo = (valor) =>
  (valor?.length ?? 0) >= SENHA_MINIMA || `Use ao menos ${SENHA_MINIMA} caracteres`;
const igual = (valor) => valor === senha.value || 'As senhas não conferem';
const pronto = computed(() => confirmo.value && !enviando.value);

function conviteInvalido(e) {
  estado.value = 'invalido';
  jaCadastrado.value = e?.codigo === 'conflito';
  if (e?.codigo === 'token_expirado') {
    aviso.value = 'Convite expirado. Peça um novo convite a quem convidou você.';
  } else if (jaCadastrado.value) {
    aviso.value = e.message;
  } else {
    aviso.value = `${e?.message ?? 'Convite inválido.'} Peça um novo convite a quem convidou você.`;
  }
}

onMounted(async () => {
  token = tokenDoLink(rota, 'c');
  await limparLink(rota, router);
  if (!token) return conviteInvalido({ message: 'Link de convite inválido ou incompleto.' });
  try {
    convite.value = await api.post('/v1/convites/validar', { token });
    estado.value = 'formulario';
  } catch (e) {
    conviteInvalido(ERROS_DO_CONVITE.includes(e.codigo) ? e : { message: mensagemDeErro(e) });
  }
});

async function cadastrar() {
  if (!confirmo.value) return;
  if (
    [obrigatorio(nome.value), minimo(senha.value), igual(confirmacao.value)].some((r) => r !== true)
  ) {
    return;
  }
  enviando.value = true;
  erro.value = '';
  try {
    await api.post('/v1/convites/aceitar', {
      token,
      nome: nome.value.trim(),
      senha: senha.value,
      email_confirmado: convite.value.email,
    });
    estado.value = 'sucesso';
  } catch (e) {
    if (ERROS_DO_CONVITE.includes(e.codigo)) conviteInvalido(e);
    else erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoPublico titulo="Criar sua conta" data-teste="pagina-cadastro">
    <div v-if="estado === 'validando'" class="text-center py-4">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert
      v-else-if="estado === 'invalido'"
      data-teste="convite-invalido"
      type="warning"
      variant="tonal"
    >
      {{ aviso }}
      <div v-if="jaCadastrado" class="mt-2">
        <router-link :to="{ name: 'login' }">Ir para o login</router-link>
      </div>
    </v-alert>

    <v-alert
      v-else-if="estado === 'sucesso'"
      data-teste="cadastro-sucesso"
      type="success"
      variant="tonal"
    >
      Conta criada para {{ convite.email }}.
      <div class="mt-2"><router-link :to="{ name: 'login' }">Entrar no app</router-link></div>
    </v-alert>

    <v-form v-else data-teste="form-cadastro" @submit.prevent="cadastrar">
      <p class="text-medium-emphasis mb-4">
        Você foi convidado como <strong>{{ NOMES_PAPEIS[convite.papel] ?? convite.papel }}</strong
        >.
      </p>
      <v-text-field
        :model-value="convite.email"
        data-teste="email"
        label="E-mail"
        disabled
        hint="Vem do convite e não pode ser alterado"
        persistent-hint
        class="mb-2"
      />
      <v-checkbox
        v-model="confirmo"
        data-teste="confirmo-email"
        label="Confirmo que este é meu e-mail"
        hide-details
        class="mb-2"
      />
      <v-text-field
        v-model="nome"
        data-teste="nome"
        label="Nome"
        autocomplete="name"
        :rules="[obrigatorio]"
      />
      <v-text-field
        v-model="senha"
        data-teste="senha"
        label="Senha"
        type="password"
        autocomplete="new-password"
        :rules="[minimo]"
      />
      <v-text-field
        v-model="confirmacao"
        data-teste="confirmacao"
        label="Confirme a senha"
        type="password"
        autocomplete="new-password"
        :rules="[igual]"
      />
      <v-alert v-if="erro" data-teste="erro-cadastro" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>
      <v-btn
        data-teste="cadastrar"
        type="submit"
        color="primary"
        block
        :disabled="!pronto"
        :loading="enviando"
      >
        Criar conta
      </v-btn>
    </v-form>
  </CartaoPublico>
</template>

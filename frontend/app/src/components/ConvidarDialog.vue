<script setup>
import { ref, watch } from 'vue';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';

// Convite por e-mail (tarefa 020): só admin, com o papel escolhido. O link não tem estado
// no banco: vale 72 horas e não pode ser cancelado; reenviar gera um link novo.
const aberto = defineModel({ type: Boolean, default: false });

const email = ref('');
const papel = ref('leitor');
const enviando = ref(false);
const erro = ref('');
const enviado = ref(null);

const emailValido = (valor) =>
  /^\S+@\S+\.\S+$/.test(valor?.trim() ?? '') || 'Informe um e-mail válido';

watch(aberto, (agora) => {
  if (!agora) return;
  email.value = '';
  papel.value = 'leitor';
  erro.value = '';
  enviado.value = null;
});

async function convidar(dados = { email: email.value.trim().toLowerCase(), papel: papel.value }) {
  if (emailValido(dados.email) !== true) return;
  enviando.value = true;
  erro.value = '';
  try {
    enviado.value = await api.post('/v1/convites', dados);
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}

const reenviar = () => convidar({ email: enviado.value.email, papel: enviado.value.papel });
const expiraLocal = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
</script>

<template>
  <v-dialog v-model="aberto" max-width="480">
    <v-card data-teste="dialogo-convite" title="Convidar usuário">
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          O link do convite vale 72 horas e não pode ser cancelado depois de enviado.
        </v-alert>

        <div v-if="enviado" data-teste="convite-enviado">
          <p class="mb-2">
            Convite enviado para <strong>{{ enviado.email }}</strong> como
            {{ enviado.papel === 'admin' ? 'administrador' : 'leitor' }}.
          </p>
          <p v-if="expiraLocal(enviado.expira_em)" class="text-medium-emphasis">
            Válido até {{ expiraLocal(enviado.expira_em) }}.
          </p>
          <p class="text-medium-emphasis">
            Reenviar gera um link novo; o anterior continua valendo até expirar.
          </p>
        </div>

        <v-form v-else data-teste="form-convite" @submit.prevent="convidar()">
          <v-text-field
            v-model="email"
            data-teste="convite-email"
            label="E-mail"
            type="email"
            :rules="[emailValido]"
            autofocus
          />
          <v-radio-group v-model="papel" label="Papel" inline>
            <v-radio data-teste="convite-papel-leitor" label="Leitor" value="leitor" />
            <v-radio data-teste="convite-papel-admin" label="Administrador" value="admin" />
          </v-radio-group>
        </v-form>

        <v-alert v-if="erro" data-teste="erro-convite" type="error" variant="tonal" class="mt-2">
          {{ erro }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="aberto = false">Fechar</v-btn>
        <v-btn
          v-if="enviado"
          data-teste="reenviar-convite"
          color="primary"
          :loading="enviando"
          @click="reenviar"
        >
          Reenviar
        </v-btn>
        <v-btn v-else color="primary" :loading="enviando" @click="convidar()">Enviar convite</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

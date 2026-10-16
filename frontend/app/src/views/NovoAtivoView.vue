<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { mdiLinkVariant } from '@mdi/js';
import AtivoForm from '../components/AtivoForm.vue';
import CotacaoAtivo from '../components/CotacaoAtivo.vue';
import { api } from '../api/cliente.js';
import { linkDeFonteValido, normalizar } from '../utils/ativos.js';
import { mensagemDeErro } from '../utils/erros.js';

// Inclusão de ativo (tarefa 021, telas 5 e 5.1 do PROJETO.md): o admin cola o link do Google
// Finance ou do Yahoo Finance, a API pré-visualiza (sem gravar) e a confirmação, nesta mesma
// tela, permite revisar os campos antes do POST.
const router = useRouter();

const link = ref('');
const buscando = ref(false);
const erroLink = ref('');

const dados = ref(null);
const cotacao = ref(null);
const form = ref(null);
const salvando = ref(false);
const erro = ref('');

const LINK_INVALIDO =
  'Use o link da página de um ativo do Google Finance ou do Yahoo Finance, como https://www.google.com/finance/quote/PETR4:BVMF.';

async function preVisualizar() {
  erroLink.value = '';
  if (!linkDeFonteValido(link.value)) {
    erroLink.value = LINK_INVALIDO;
    return;
  }
  buscando.value = true;
  try {
    const previa = await api.post('/v1/ativos/pre-visualizar', { url: link.value.trim() });
    dados.value = { ...previa.ativo, status: 'ativo' };
    cotacao.value = previa.cotacao;
  } catch (e) {
    erroLink.value = mensagemDeErro(e);
  } finally {
    buscando.value = false;
  }
}

function outroLink() {
  dados.value = null;
  cotacao.value = null;
  erro.value = '';
}

async function incluir() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  salvando.value = true;
  erro.value = '';
  try {
    await api.post('/v1/ativos', normalizar(dados.value));
    await router.push({ name: 'ativos' });
  } catch (e) {
    // Um ativo excluído logicamente não é recriado (UNIQUE): restaura-se na lista.
    erro.value =
      e.status === 409
        ? `${mensagemDeErro(e)}. Se o ativo foi excluído, restaure-o na lista de ativos (Mostrar excluídos).`
        : mensagemDeErro(e);
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-container data-teste="pagina-novo-ativo" style="max-width: 800px">
    <h1 class="text-h5 mb-4">Novo ativo</h1>

    <v-form v-if="!dados" data-teste="form-link" @submit.prevent="preVisualizar">
      <v-text-field
        v-model="link"
        data-teste="link"
        label="Link do ativo"
        placeholder="https://www.google.com/finance/quote/PETR4:BVMF"
        hint="Página do ativo no Google Finance ou no Yahoo Finance"
        persistent-hint
        :prepend-inner-icon="mdiLinkVariant"
        autofocus
      />
      <v-alert v-if="erroLink" data-teste="erro-link" type="error" variant="tonal" class="my-4">
        {{ erroLink }}
      </v-alert>
      <div class="d-flex ga-2 mt-4">
        <v-btn :to="{ name: 'ativos' }">Cancelar</v-btn>
        <v-btn type="submit" color="primary" :loading="buscando">Buscar dados</v-btn>
      </div>
    </v-form>

    <v-form v-else ref="form" data-teste="form-ativo" @submit.prevent="incluir">
      <p class="text-medium-emphasis mb-4">
        Confira os dados coletados, ajuste o que for preciso e confirme a inclusão.
      </p>
      <CotacaoAtivo :cotacao="cotacao" />
      <AtivoForm v-model="dados" />

      <v-alert v-if="erro" data-teste="erro-ativo" type="error" variant="tonal" class="my-4">
        {{ erro }}
      </v-alert>

      <div class="d-flex ga-2 mt-4">
        <v-btn data-teste="outro-link" @click="outroLink">Outro link</v-btn>
        <v-btn type="submit" data-teste="incluir" color="primary" :loading="salvando">
          Incluir ativo
        </v-btn>
      </div>
    </v-form>
  </v-container>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { mdiDelete, mdiRefresh } from '@mdi/js';
import AtivoForm from '../components/AtivoForm.vue';
import CotacaoAtivo from '../components/CotacaoAtivo.vue';
import { api } from '../api/cliente.js';
import { useAuthStore } from '../stores/auth.js';
import { alteracoes, ultimaCotacao } from '../utils/ativos.js';
import { mensagemDeErro } from '../utils/erros.js';
import { formatarData } from '../utils/formatos.js';

// Exibição/edição de um ativo (tarefa 021, tela 5.1 do PROJETO.md). Admin salva, refaz a
// busca na fonte (atualizar-dados) e exclui; o leitor só vê.
const rota = useRoute();
const router = useRouter();
const auth = useAuthStore();

const original = ref(null);
const dados = ref(null);
const cotacao = ref(null);
const naoEncontrado = ref(false);
const form = ref(null);
const salvando = ref(false);
const atualizando = ref(false);
const erro = ref('');
const aviso = ref('');

const excluindo = ref(false);
const permanente = ref(false);
const removendo = ref(false);

function mostrar(ativo) {
  original.value = ativo;
  dados.value = { ...ativo };
}

onMounted(async () => {
  try {
    mostrar(await api.get(`/v1/ativos/${rota.params.id}`));
  } catch (e) {
    if (e.status === 404) naoEncontrado.value = true;
    else erro.value = mensagemDeErro(e);
    return;
  }
  try {
    cotacao.value = await ultimaCotacao(original.value.id);
  } catch {
    // sem cotação na tela
  }
});

async function salvar() {
  const { valid } = await form.value.validate();
  if (!valid) return;
  const mudancas = alteracoes(original.value, dados.value);
  salvando.value = true;
  erro.value = '';
  try {
    if (Object.keys(mudancas).length) {
      await api.patch(`/v1/ativos/${original.value.id}`, mudancas);
    }
    await router.push({ name: 'ativos' });
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    salvando.value = false;
  }
}

// A API grava na hora os campos do wrapper (nome, tipo, bolsa, tickers e URLs).
async function atualizarDados() {
  atualizando.value = true;
  erro.value = '';
  aviso.value = '';
  try {
    const resposta = await api.post(`/v1/ativos/${original.value.id}/atualizar-dados`);
    mostrar(resposta.ativo);
    cotacao.value = resposta.cotacao;
    aviso.value = 'Dados atualizados a partir da fonte e gravados.';
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    atualizando.value = false;
  }
}

function pedirExclusao() {
  permanente.value = false;
  excluindo.value = true;
}

async function confirmarExclusao() {
  removendo.value = true;
  try {
    await api.delete(
      `/v1/ativos/${original.value.id}${permanente.value ? '?permanente=true' : ''}`,
    );
    excluindo.value = false;
    await router.push({ name: 'ativos' });
  } catch (e) {
    excluindo.value = false;
    erro.value = mensagemDeErro(e);
  } finally {
    removendo.value = false;
  }
}
</script>

<template>
  <v-container data-teste="pagina-ativo" style="max-width: 800px">
    <h1 class="text-h5 mb-4">{{ original ? original.ativo : 'Ativo' }}</h1>

    <v-alert v-if="naoEncontrado" data-teste="ativo-nao-encontrado" type="warning" variant="tonal">
      Ativo não encontrado.
      <div class="mt-2"><router-link :to="{ name: 'ativos' }">Voltar à lista</router-link></div>
    </v-alert>

    <v-form v-else-if="dados" ref="form" data-teste="form-ativo" @submit.prevent="salvar">
      <CotacaoAtivo :cotacao="cotacao" />
      <AtivoForm v-model="dados" :somente-leitura="!auth.ehAdmin" />

      <p class="text-caption text-medium-emphasis my-4">
        Adicionado em {{ formatarData(original.adicionado_em) }}
      </p>

      <v-alert v-if="aviso" data-teste="aviso-ativo" type="success" variant="tonal" class="mb-4">
        {{ aviso }}
      </v-alert>
      <v-alert v-if="erro" data-teste="erro-ativo" type="error" variant="tonal" class="mb-4">
        {{ erro }}
      </v-alert>

      <div class="d-flex flex-wrap ga-2">
        <v-btn :to="{ name: 'ativos' }">{{ auth.ehAdmin ? 'Cancelar' : 'Voltar' }}</v-btn>
        <template v-if="auth.ehAdmin">
          <v-btn type="submit" data-teste="salvar" color="primary" :loading="salvando">
            Salvar
          </v-btn>
          <v-btn
            data-teste="atualizar-dados"
            :prepend-icon="mdiRefresh"
            :loading="atualizando"
            @click="atualizarDados"
          >
            Atualizar dados da fonte
          </v-btn>
          <v-spacer />
          <v-btn
            data-teste="excluir"
            color="error"
            variant="tonal"
            :prepend-icon="mdiDelete"
            @click="pedirExclusao"
          >
            Excluir
          </v-btn>
        </template>
      </div>
    </v-form>

    <v-alert v-else-if="erro" data-teste="erro-ativo" type="error" variant="tonal">
      {{ erro }}
    </v-alert>

    <v-dialog v-model="excluindo" max-width="460">
      <v-card v-if="original" data-teste="dialogo-excluir" title="Excluir ativo">
        <v-card-text>
          <p class="mb-2">
            Excluir <strong>{{ original.ativo }}</strong>
            <template v-if="original.nome"> ({{ original.nome }})</template>?
          </p>
          <v-checkbox
            v-model="permanente"
            data-teste="excluir-permanente"
            label="Excluir permanentemente"
            color="error"
            hide-details
          />
          <v-alert v-if="permanente" type="warning" variant="tonal" density="compact" class="mt-2">
            O ativo, seus sinais e suas cotações são apagados; as notícias ficam como gerais. Esta
            ação não pode ser desfeita.
          </v-alert>
          <p v-else class="text-medium-emphasis mt-2">
            A exclusão lógica pode ser desfeita na lista, em "Mostrar excluídos".
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="excluindo = false">Cancelar</v-btn>
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

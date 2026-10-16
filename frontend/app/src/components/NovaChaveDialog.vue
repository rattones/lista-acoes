<script setup>
import { ref, watch } from 'vue';
import { mdiCheck, mdiContentCopy } from '@mdi/js';
import { api } from '../api/cliente.js';
import { mensagemDeErro } from '../utils/erros.js';

// Nova API key (tarefa 023): nome do agente + escopos. A chave completa só existe na
// resposta da criação: fica neste diálogo, em memória, e é descartada ao fechar.
const aberto = defineModel({ type: Boolean, default: false });
const props = defineProps({ escopos: { type: Array, default: () => [] } });
const emit = defineEmits(['criada']);

const nome = ref('');
const selecionados = ref([]);
const enviando = ref(false);
const erro = ref('');
const chave = ref('');
const copiada = ref(false);

const nomeValido = (valor) => Boolean(valor?.trim()) || 'Informe o nome do agente';

watch(aberto, () => {
  // Ao abrir e ao fechar: a chave não sobrevive ao diálogo.
  nome.value = '';
  selecionados.value = [];
  erro.value = '';
  chave.value = '';
  copiada.value = false;
});

async function criar() {
  erro.value = '';
  if (nomeValido(nome.value) !== true) return;
  if (!selecionados.value.length) {
    erro.value = 'Escolha ao menos um escopo.';
    return;
  }
  enviando.value = true;
  try {
    // Mantém a ordem da lista de escopos, não a dos cliques.
    const escopos = props.escopos.filter((e) => selecionados.value.includes(e));
    const { chave: completa, ...registro } = await api.post('/v1/agentes-tokens', {
      nome: nome.value.trim(),
      escopos,
    });
    chave.value = completa;
    emit('criada', registro);
  } catch (e) {
    erro.value = mensagemDeErro(e);
  } finally {
    enviando.value = false;
  }
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(chave.value);
    copiada.value = true;
  } catch {
    erro.value = 'Não foi possível copiar. Selecione a chave e copie manualmente.';
  }
}
</script>

<template>
  <v-dialog v-model="aberto" max-width="560" :persistent="Boolean(chave)">
    <v-card data-teste="dialogo-nova-chave" title="Nova API key">
      <v-card-text>
        <div v-if="chave">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            Copie a chave agora: ela não será exibida novamente.
          </v-alert>
          <div class="d-flex align-center ga-2">
            <code data-teste="chave-gerada" class="flex-grow-1 pa-2 bg-surface-variant rounded">{{
              chave
            }}</code>
            <v-btn
              data-teste="copiar-chave"
              :prepend-icon="copiada ? mdiCheck : mdiContentCopy"
              variant="tonal"
              @click="copiar"
            >
              {{ copiada ? 'Copiada' : 'Copiar' }}
            </v-btn>
          </div>
          <p class="text-medium-emphasis mt-4">
            O agente envia a chave no cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code>.
          </p>
        </div>

        <v-form v-else data-teste="form-nova-chave" @submit.prevent="criar">
          <v-text-field
            v-model="nome"
            data-teste="chave-nome"
            label="Nome do agente"
            :rules="[nomeValido]"
            maxlength="100"
            autofocus
          />
          <p class="text-subtitle-2 mb-1">Escopos</p>
          <div class="d-flex flex-wrap">
            <v-checkbox
              v-for="escopo in props.escopos"
              :key="escopo"
              v-model="selecionados"
              :data-teste="`escopo-${escopo}`"
              :label="escopo"
              :value="escopo"
              density="compact"
              hide-details
              class="escopo"
            />
          </div>
        </v-form>

        <v-alert v-if="erro" data-teste="erro-nova-chave" type="error" variant="tonal" class="mt-2">
          {{ erro }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn data-teste="fechar-nova-chave" @click="aberto = false">
          {{ chave ? 'Concluir' : 'Cancelar' }}
        </v-btn>
        <v-btn v-if="!chave" color="primary" :loading="enviando" @click="criar">Gerar chave</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.escopo {
  flex: 0 0 50%;
}
code {
  word-break: break-all;
}
</style>

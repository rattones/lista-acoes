<script setup>
import { computed, ref } from 'vue';
import { mdiDeleteForever, mdiEye, mdiEyeOff } from '@mdi/js';
import { api } from '../api/cliente.js';
import { useAuthStore } from '../stores/auth.js';
import { mensagemDeErro } from '../utils/erros.js';
import { NOMES_PAPEIS } from '../utils/formatos.js';
import { irPara } from '../utils/navegador.js';

// Meu perfil (tarefa 022, tela 7 do PROJETO.md): nome editável, e-mail fixo, troca de senha e
// exclusão permanente da própria conta (PATCH e DELETE /v1/auth/eu, tarefa 017).

// Mesmo mínimo da API (backend/src/auth/senha.js).
const SENHA_MINIMA = 10;
// Depois de excluir a conta, o usuário vai para a landing (sem PROD: www.listadecompras.net).
const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'https://www.listadecompras.net';
const PALAVRA = 'EXCLUIR';

const auth = useAuthStore();

const obrigatorio = (valor) => Boolean(valor?.trim()) || 'Campo obrigatório';
const minimo = (valor) =>
  (valor?.length ?? 0) >= SENHA_MINIMA || `Use ao menos ${SENHA_MINIMA} caracteres`;

// Dados
const nome = ref(auth.usuario?.nome ?? '');
const salvandoDados = ref(false);
const erroDados = ref('');
const avisoDados = ref('');

async function salvarDados() {
  if (obrigatorio(nome.value) !== true) return;
  salvandoDados.value = true;
  erroDados.value = '';
  avisoDados.value = '';
  try {
    const { usuario } = await api.patch('/v1/auth/eu', { nome: nome.value.trim() });
    auth.atualizarUsuario(usuario);
    nome.value = usuario.nome;
    avisoDados.value = 'Nome salvo.';
  } catch (e) {
    erroDados.value = mensagemDeErro(e);
  } finally {
    salvandoDados.value = false;
  }
}

// Senha: a API encerra as outras sessões e devolve uma nova para este navegador.
const senhaAtual = ref('');
const novaSenha = ref('');
const confirmacao = ref('');
const verSenhas = ref(false);
const trocandoSenha = ref(false);
const erroSenha = ref('');
const avisoSenha = ref('');
const igual = (valor) => valor === novaSenha.value || 'As senhas não conferem';

async function trocarSenha() {
  if (!senhaAtual.value || minimo(novaSenha.value) !== true || igual(confirmacao.value) !== true) {
    return;
  }
  trocandoSenha.value = true;
  erroSenha.value = '';
  avisoSenha.value = '';
  try {
    auth.atualizarSessao(
      await api.patch('/v1/auth/eu', {
        senha_atual: senhaAtual.value,
        nova_senha: novaSenha.value,
      }),
    );
    senhaAtual.value = novaSenha.value = confirmacao.value = '';
    avisoSenha.value = 'Senha alterada. As sessões abertas em outros aparelhos foram encerradas.';
  } catch (e) {
    erroSenha.value = mensagemDeErro(e);
  } finally {
    trocandoSenha.value = false;
  }
}

// Exclusão da conta: senha + a palavra EXCLUIR digitada.
const excluindo = ref(false);
const senhaExclusao = ref('');
const palavra = ref('');
const removendo = ref(false);
const erroExclusao = ref('');
const podeExcluir = computed(() => Boolean(senhaExclusao.value) && palavra.value === PALAVRA);

function pedirExclusao() {
  senhaExclusao.value = '';
  palavra.value = '';
  erroExclusao.value = '';
  excluindo.value = true;
}

async function excluirConta() {
  if (!podeExcluir.value) return;
  removendo.value = true;
  erroExclusao.value = '';
  try {
    await api.delete('/v1/auth/eu', { senha: senhaExclusao.value });
    auth.descartarSessao();
    irPara(LANDING_URL);
  } catch (e) {
    erroExclusao.value =
      e.codigo === 'ultimo_admin'
        ? `${mensagemDeErro(e)} Para excluir a sua conta, promova outro usuário a administrador em Usuários.`
        : mensagemDeErro(e);
  } finally {
    removendo.value = false;
  }
}
</script>

<template>
  <v-container data-teste="pagina-perfil" style="max-width: 640px">
    <h1 class="text-h5 mb-4">Meu perfil</h1>

    <v-card class="mb-4" title="Dados">
      <v-card-text>
        <v-form data-teste="form-dados" @submit.prevent="salvarDados">
          <v-text-field
            :model-value="auth.usuario?.email"
            data-teste="email"
            label="E-mail"
            disabled
            hint="O e-mail não pode ser alterado"
            persistent-hint
            class="mb-2"
          />
          <v-text-field v-model="nome" data-teste="nome" label="Nome" :rules="[obrigatorio]" />
          <p class="text-caption text-medium-emphasis mb-4">
            Papel: {{ NOMES_PAPEIS[auth.usuario?.papel] ?? auth.usuario?.papel }}
          </p>
          <v-alert
            v-if="avisoDados"
            data-teste="aviso-dados"
            type="success"
            variant="tonal"
            class="mb-4"
          >
            {{ avisoDados }}
          </v-alert>
          <v-alert
            v-if="erroDados"
            data-teste="erro-dados"
            type="error"
            variant="tonal"
            class="mb-4"
          >
            {{ erroDados }}
          </v-alert>
          <v-btn type="submit" color="primary" :loading="salvandoDados">Salvar</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card class="mb-4" title="Trocar a senha">
      <v-card-text>
        <v-form data-teste="form-senha" @submit.prevent="trocarSenha">
          <v-text-field
            v-model="senhaAtual"
            data-teste="senha-atual"
            label="Senha atual"
            :type="verSenhas ? 'text' : 'password'"
            autocomplete="current-password"
            :append-inner-icon="verSenhas ? mdiEyeOff : mdiEye"
            :rules="[(v) => Boolean(v) || 'Campo obrigatório']"
            @click:append-inner="verSenhas = !verSenhas"
          />
          <v-text-field
            v-model="novaSenha"
            data-teste="nova-senha"
            label="Nova senha"
            :type="verSenhas ? 'text' : 'password'"
            autocomplete="new-password"
            :rules="[minimo]"
          />
          <v-text-field
            v-model="confirmacao"
            data-teste="confirmar-senha"
            label="Confirme a nova senha"
            :type="verSenhas ? 'text' : 'password'"
            autocomplete="new-password"
            :rules="[igual]"
          />
          <v-alert
            v-if="avisoSenha"
            data-teste="aviso-senha"
            type="success"
            variant="tonal"
            class="mb-4"
          >
            {{ avisoSenha }}
          </v-alert>
          <v-alert
            v-if="erroSenha"
            data-teste="erro-senha"
            type="error"
            variant="tonal"
            class="mb-4"
          >
            {{ erroSenha }}
          </v-alert>
          <v-btn type="submit" color="primary" :loading="trocandoSenha">Trocar a senha</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card title="Excluir a conta" border="error">
      <v-card-text>
        <p class="mb-4">
          Apaga permanentemente o seu cadastro e tudo o que você criou (como as API keys). Não há
          como recuperar a conta depois.
        </p>
        <v-btn
          data-teste="excluir-conta"
          color="error"
          variant="tonal"
          :prepend-icon="mdiDeleteForever"
          @click="pedirExclusao"
        >
          Excluir minha conta
        </v-btn>
      </v-card-text>
    </v-card>

    <v-dialog v-model="excluindo" max-width="480">
      <v-card data-teste="dialogo-excluir-conta" title="Excluir minha conta">
        <v-form @submit.prevent="excluirConta">
          <v-card-text>
            <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
              A sua conta e tudo o que você criou (como as API keys) serão apagados permanentemente.
              Esta ação não pode ser desfeita.
            </v-alert>
            <v-text-field
              v-model="senhaExclusao"
              data-teste="confirmar-senha-exclusao"
              label="Sua senha"
              type="password"
              autocomplete="current-password"
            />
            <v-text-field
              v-model="palavra"
              data-teste="confirmar-palavra"
              :label="`Digite ${PALAVRA} para confirmar`"
              autocomplete="off"
            />
            <v-alert
              v-if="erroExclusao"
              data-teste="erro-exclusao-conta"
              type="error"
              variant="tonal"
              density="compact"
            >
              {{ erroExclusao }}
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="excluindo = false">Cancelar</v-btn>
            <v-btn
              type="submit"
              data-teste="confirmar-exclusao-conta"
              color="error"
              :disabled="!podeExcluir"
              :loading="removendo"
            >
              Excluir permanentemente
            </v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </v-container>
</template>

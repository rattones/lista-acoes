<script setup>
import { STATUS, TIPOS } from '../utils/ativos.js';

// Campos do cadastro de um ativo (tarefa 021), usados na confirmação da inclusão e na
// exibição/edição. somenteLeitura: leitor (sem edição).
const dados = defineModel({ type: Object, required: true });
defineProps({ somenteLeitura: { type: Boolean, default: false } });

const obrigatorio = (valor) => Boolean(String(valor ?? '').trim()) || 'Campo obrigatório';
const url = (valor) =>
  !String(valor ?? '').trim() || /^https?:\/\/\S+$/i.test(valor.trim()) || 'URL inválida';

const TEXTOS = [
  { campo: 'bolsa', rotulo: 'Bolsa', dica: 'NASDAQ, NYSE, BVMF...' },
  { campo: 'ticker_google', rotulo: 'Ticker do Google Finance', dica: 'TICKER:BOLSA ou par' },
  { campo: 'ticker_yahoo', rotulo: 'Ticker do Yahoo Finance', dica: 'Usado nos indicadores' },
];
const URLS = [
  { campo: 'url_historico', rotulo: 'URL do histórico diário', regras: [obrigatorio, url] },
  { campo: 'url_cotacao', rotulo: 'URL da cotação atual', regras: [url] },
  { campo: 'url_pagina', rotulo: 'Página do ativo', regras: [url] },
];
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="4">
      <v-text-field
        v-model="dados.ativo"
        data-teste="campo-ativo"
        label="Código"
        :readonly="somenteLeitura"
        :rules="[obrigatorio]"
        maxlength="30"
      />
    </v-col>
    <v-col cols="12" sm="8">
      <v-text-field
        v-model="dados.nome"
        data-teste="campo-nome"
        label="Nome"
        :readonly="somenteLeitura"
      />
    </v-col>
    <v-col cols="12" sm="4">
      <v-select
        v-model="dados.tipo"
        data-teste="campo-tipo"
        label="Tipo"
        :items="TIPOS"
        :readonly="somenteLeitura"
        :rules="[obrigatorio]"
      />
    </v-col>
    <v-col v-for="item in TEXTOS" :key="item.campo" cols="12" sm="4">
      <v-text-field
        v-model="dados[item.campo]"
        :data-teste="`campo-${item.campo}`"
        :label="item.rotulo"
        :hint="somenteLeitura ? undefined : item.dica"
        :readonly="somenteLeitura"
      />
    </v-col>
    <v-col v-for="item in URLS" :key="item.campo" cols="12">
      <v-text-field
        v-model="dados[item.campo]"
        :data-teste="`campo-${item.campo}`"
        :label="item.rotulo"
        :readonly="somenteLeitura"
        :rules="item.regras"
      />
    </v-col>
    <v-col cols="12">
      <v-textarea
        v-model="dados.observacao"
        data-teste="campo-observacao"
        label="Observação"
        rows="2"
        auto-grow
        :readonly="somenteLeitura"
      />
    </v-col>
    <v-col cols="12">
      <v-switch
        v-model="dados.status"
        data-teste="campo-status"
        :label="`Monitorado (${STATUS.find((s) => s.value === dados.status)?.title ?? dados.status})`"
        true-value="ativo"
        false-value="inativo"
        color="primary"
        hint="Ativos inativos não entram no relatório"
        persistent-hint
        :readonly="somenteLeitura"
      />
    </v-col>
  </v-row>
</template>

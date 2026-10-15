<script setup>
defineProps({ titulo: { type: String, required: true } });
</script>

<!-- Moldura das telas públicas (login, recuperação e redefinição de senha). -->
<template>
  <v-container class="fill-height justify-center">
    <v-card width="100%" max-width="420" class="pa-2">
      <v-card-title class="text-h6">{{ titulo }}</v-card-title>
      <v-card-text>
        <slot />
      </v-card-text>
    </v-card>
  </v-container>
</template>

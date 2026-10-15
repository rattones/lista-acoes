import { SetMetadata } from '@nestjs/common';

export const PUBLICO = 'auth:publico';
export const PAPEIS = 'auth:papeis';

// Rota sem autenticação (ex.: health, login).
export const Publico = () => SetMetadata(PUBLICO, true);

// Papéis exigidos na rota ou no controller inteiro: @Papeis('admin').
export const Papeis = (...papeis) => SetMetadata(PAPEIS, papeis);

import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';

export const TEMAS = ['claro', 'escuro'];

const prefereEscuro = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function criarVuetify() {
  return createVuetify({
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    theme: {
      defaultTheme: prefereEscuro() ? 'escuro' : 'claro',
      themes: {
        claro: {
          dark: false,
          colors: { primary: '#1565C0', secondary: '#00897B', background: '#F5F7FA' },
        },
        escuro: {
          dark: true,
          colors: { primary: '#64B5F6', secondary: '#4DB6AC', background: '#121417' },
        },
      },
    },
  });
}

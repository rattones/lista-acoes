import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');
const pagina = new DOMParser().parseFromString(html, 'text/html');

describe('landing page', () => {
  it('tem título e explicação do projeto', () => {
    expect(pagina.querySelector('h1')?.textContent).toContain('Lista de Ações');
    expect(pagina.querySelector('main p')).not.toBeNull();
  });

  it('tem link para o app vindo de VITE_APP_URL', () => {
    const links = [...pagina.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('%VITE_APP_URL%');
  });

  it('não tem link para cadastro de usuários', () => {
    const links = [...pagina.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    for (const href of links) {
      expect(href).not.toMatch(/cadastr|convite|registr|signup/i);
    }
  });
});

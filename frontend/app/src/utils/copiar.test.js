import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { copiarTexto } from './copiar.js';

const definirClipboard = (valor) =>
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true });

describe('copiarTexto', () => {
  // O jsdom não implementa execCommand.
  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
  });
  afterEach(() => {
    delete document.execCommand;
    definirClipboard(undefined);
  });

  it('usa o navigator.clipboard quando existe', async () => {
    const writeText = vi.fn(async () => {});
    definirClipboard({ writeText });
    await expect(copiarTexto('abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('sem navigator.clipboard (HTTP), copia por um textarea temporário', async () => {
    definirClipboard(undefined);
    let copiado;
    document.execCommand = vi.fn((comando) => {
      copiado = document.activeElement?.value;
      return comando === 'copy';
    });
    await expect(copiarTexto('la_x_y')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(copiado).toBe('la_x_y');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('navigator.clipboard recusando cai no execCommand', async () => {
    definirClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('negado'))) });
    await expect(copiarTexto('abc')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('as duas formas falhando devolve false', async () => {
    definirClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    await expect(copiarTexto('abc')).resolves.toBe(false);
    document.execCommand = vi.fn(() => {
      throw new Error('sem suporte');
    });
    await expect(copiarTexto('abc')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

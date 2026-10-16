// Copia um texto para a área de transferência (tarefa 030). O navigator.clipboard só existe
// em contexto seguro (HTTPS ou localhost): no DEV por HTTP, a cópia vai por um textarea
// temporário e execCommand('copy'). Devolve false se nenhuma das duas formas funcionar.
export async function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Recusado (permissão, foco...): tenta a forma antiga.
    }
  }
  return copiarPorTextarea(texto);
}

function copiarPorTextarea(texto) {
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  // Dentro de um diálogo modal, o foco fica preso nele: o campo vai junto do elemento ativo.
  const pai = document.activeElement?.closest?.('[role="dialog"]') ?? document.body;
  pai.appendChild(campo);
  campo.focus();
  campo.select();
  try {
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}

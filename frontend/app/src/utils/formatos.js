export const NOMES_PAPEIS = { admin: 'Administrador', leitor: 'Leitor' };

// Datas da API em horário local: 'AAAA-MM-DD HH:MM:SS'.
const paraData = (texto) => new Date(String(texto).replace(' ', 'T'));
const dois = (n) => String(n).padStart(2, '0');

export function formatarDataHora(texto, vazio = '—') {
  if (!texto) return vazio;
  const d = paraData(texto);
  if (Number.isNaN(d.getTime())) return texto;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// Situação de um usuário da API: excluído, inativo, bloqueado (tentativas) ou ativo.
export function statusUsuario(usuario, agora = new Date()) {
  if (usuario.excluido_em) return { texto: 'Excluído', cor: 'grey' };
  if (!usuario.ativo) return { texto: 'Inativo', cor: 'warning' };
  if (usuario.bloqueado_ate && paraData(usuario.bloqueado_ate) > agora) {
    return { texto: 'Bloqueado', cor: 'error' };
  }
  return { texto: 'Ativo', cor: 'success' };
}

// Data sem hora da API ('AAAA-MM-DD'), sem passar por Date (fuso horário).
export function formatarData(texto, vazio = '—') {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto ?? '');
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : texto || vazio;
}

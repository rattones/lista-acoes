// Templates de e-mail (tarefa 013): cada um gera a versão HTML e a de texto puro.
// Em módulos JS (e não arquivos .html) para irem no build do Babel junto com o resto.

const escapar = (valor) =>
  String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const layout = (titulo, conteudo) => `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 16px">${escapar(titulo)}</h1>
        ${conteudo}
        <p style="font-size:12px;color:#616e7c;margin-top:32px">Lista de Ações — mensagem automática, não responda.</p>
      </td></tr>
    </table>
  </body>
</html>`;

const botao = (link, texto) =>
  `<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#1565c0;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapar(texto)}</a></p>
        <p style="font-size:13px;color:#616e7c">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapar(link)}</p>`;

const PAPEIS = { admin: 'administrador', leitor: 'leitor' };

export const TEMPLATES = {
  'recuperacao-senha': {
    obrigatorios: ['nome', 'link'],
    html: ({ nome, link }) =>
      layout(
        'Redefinição de senha',
        `<p>Olá, ${escapar(nome)}.</p>
        <p>Recebemos um pedido para redefinir a sua senha. Use o botão abaixo para escolher uma nova.</p>
        ${botao(link, 'Redefinir senha')}
        <p>O link vale por <strong>24 horas</strong> e deixa de funcionar assim que a senha for trocada.</p>
        <p>Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>`,
      ),
    texto: ({ nome, link }) => `Olá, ${nome}.

Recebemos um pedido para redefinir a sua senha. Para escolher uma nova, acesse:
${link}

O link vale por 24 horas e deixa de funcionar assim que a senha for trocada.
Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.

Lista de Ações — mensagem automática, não responda.`,
  },

  convite: {
    obrigatorios: ['link', 'papel'],
    html: ({ link, papel, convidadoPor }) =>
      layout(
        'Convite para o Lista de Ações',
        `<p>${convidadoPor ? `${escapar(convidadoPor)} convidou você` : 'Você foi convidado'} para acessar o Lista de Ações como <strong>${escapar(PAPEIS[papel] ?? papel)}</strong>.</p>
        <p>Para criar o seu acesso, use o botão abaixo.</p>
        ${botao(link, 'Criar meu acesso')}
        <p>O convite vale por <strong>72 horas</strong>. Se você não esperava este convite, ignore este e-mail.</p>`,
      ),
    texto: ({
      link,
      papel,
      convidadoPor,
    }) => `${convidadoPor ? `${convidadoPor} convidou você` : 'Você foi convidado'} para acessar o Lista de Ações como ${PAPEIS[papel] ?? papel}.

Para criar o seu acesso, acesse:
${link}

O convite vale por 72 horas. Se você não esperava este convite, ignore este e-mail.

Lista de Ações — mensagem automática, não responda.`,
  },
};

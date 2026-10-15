# Política de privacidade

Esta política explica quais dados pessoais o **Lista de Ações** coleta, por que coleta, onde guarda e como você pode apagá-los. Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).

O Lista de Ações é um sistema privado de acompanhamento de ações, de acesso **só por convite**: não há cadastro aberto ao público. Ele é composto pelo app (`app.listadecompras.net`), pela API (`api.listadecompras.net`) e pela landing page (`www.listadecompras.net`).

> Versão inicial (tarefa 008). Login, convites, e-mails e exclusão de conta ainda estão em desenvolvimento. Esta política descreve como eles vão funcionar e será revisada sempre que uma tarefa mudar o tratamento de dados.

## Dados coletados

### Usuários do app

| Dado                                          | Origem                        | Para quê                               |
| --------------------------------------------- | ----------------------------- | -------------------------------------- |
| Nome                                          | Informado no cadastro         | Identificar você no app                |
| E-mail                                        | Convite enviado pelo admin¹   | Login, convites e recuperação de senha |
| Senha (somente o hash)                        | Definida por você no cadastro | Login                                  |
| Papel (`admin` ou `leitor`)                   | Escolhido por quem convidou   | Controle do que você pode fazer        |
| Tentativas de login falhas e bloqueio         | Gerados no login              | Proteção contra tentativas de invasão  |
| Data do último login, do cadastro e da edição | Gerados pelo sistema          | Segurança e suporte                    |
| Dados que você cadastra (ex.: ativos, chaves) | Informados por você no app    | Funcionamento do sistema               |

- ¹ O primeiro administrador é cadastrado diretamente no servidor, pelo responsável pelo sistema.
- A senha **nunca** é guardada como texto: só um hash com sal (argon2id), que não permite recuperá-la.
- O e-mail não pode ser alterado depois do cadastro.
- O app não usa cookies de publicidade nem de rastreamento. O único cookie é o de sessão (refresh token), `httpOnly`, `secure` e válido por 7 dias, necessário para manter você conectado. Ele é apagado no logout, e o logout encerra todas as suas sessões abertas.
- A landing page não coleta dados pessoais nem tem formulários.

### Dados de mercado

Os agentes coletam preços e notícias **públicos** sobre os ativos monitorados. Esses dados não são pessoais.

## Logs de acesso

Para segurança, diagnóstico de erros e prevenção de abusos, cada acesso gera um registro técnico (log):

- **Proxy (Nginx):** endereço IP, data e hora, site acessado, endereço da página, código de resposta, tamanho e tempo da resposta, navegador (user agent) e um identificador da requisição.
- **API:** o mesmo identificador da requisição, endereço IP, método e endereço acessado, navegador (user agent), código e tempo da resposta.

Os logs **não** gravam senhas, cookies, tokens de sessão nem chaves de acesso: da requisição, só são guardados os campos acima.

Os logs ficam no próprio servidor, não são compartilhados e não são usados para traçar perfil de uso. Eles têm limite de tamanho: cada serviço guarda no máximo 50 MB de logs (5 arquivos de 10 MB), e os registros mais antigos são apagados automaticamente à medida que novos chegam. Por isso, o tempo de guarda varia com o volume de acessos.

## Envio de e-mails

O sistema envia e-mails apenas para:

- **Convite:** link de cadastro, válido por 72 horas, enviado ao e-mail escolhido pelo admin, com o nome de quem convidou e o papel. Nada é guardado no banco antes do aceite: o cadastro só existe quando a pessoa convidada confirma o e-mail e define nome e senha.
- **Recuperação de senha:** link válido por 24 horas, enviado quando você pede. Ele deixa de funcionar quando a senha é trocada, e a troca encerra as sessões abertas em todos os dispositivos. O pedido tem a mesma resposta exista ou não uma conta com o e-mail informado.

O registro técnico de cada envio guarda só o tipo de e-mail e o destinatário mascarado (ex.: `f***@dominio.com`), nunca o conteúdo nem o link.

Os e-mails são enviados pelo **Gmail** (SMTP do Google), que recebe o endereço do destinatário e o conteúdo da mensagem para fazer a entrega, conforme a política de privacidade do Google. Não enviamos newsletters, propaganda nem e-mails para terceiros.

## Armazenamento e segurança

- Os dados ficam em um banco SQLite no servidor de produção (VPS), em volume de disco persistente. A cópia de segurança semanal, com cópia externa, está em implantação (tarefa 028).
- Todo acesso ao app e à API é feito por HTTPS (certificado da Let's Encrypt, com HSTS).
- Credenciais do sistema (senhas de serviço, chaves) ficam em arquivos de configuração fora do repositório de código.
- As chaves de acesso dos agentes são guardadas como hash e exibidas uma única vez, na criação.

## Compartilhamento

Os dados pessoais não são vendidos nem compartilhados. Os únicos terceiros envolvidos são os prestadores de infraestrutura:

- **HostGator:** hospedagem do servidor (VPS).
- **Google (Gmail):** entrega dos e-mails de convite e de recuperação de senha.

## Exclusão dos dados

- Você pode **excluir sua conta permanentemente** na tela de perfil do app. A exclusão apaga, de imediato e em cascata, o seu cadastro e tudo o que você criou (por exemplo, as chaves de acesso de agentes). Ela não pode ser desfeita.
- Registros removidos com exclusão lógica (marcados como excluídos, mas recuperáveis) também são apagados quando a conta é excluída.
- Cópias de segurança anteriores à exclusão podem conter seus dados até serem substituídas pelo ciclo normal de backups.
- Os logs de acesso são apagados automaticamente pela rotação (limite de 50 MB por serviço).

## Seus direitos

Pela LGPD, você pode pedir a qualquer momento:

- confirmação de que tratamos seus dados e acesso a eles;
- correção de dados incompletos ou desatualizados (o nome pode ser editado no próprio app);
- exclusão dos dados (diretamente no app, como descrito acima);
- informação sobre com quem os dados são compartilhados.

Para exercer esses direitos ou tirar dúvidas, fale com o administrador que enviou o seu convite.

## Alterações

Esta política é atualizada junto com o sistema. Mudanças relevantes são registradas no [CHANGELOG.md](CHANGELOG.md).

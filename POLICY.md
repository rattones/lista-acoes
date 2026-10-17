# Política de privacidade

Esta política explica quais dados pessoais o **Lista de Ações** coleta, por que coleta, onde guarda e como você pode apagá-los. Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).

O Lista de Ações é um sistema privado de acompanhamento de ações, de acesso **só por convite**: não há cadastro aberto ao público. Ele é composto pelo app (`app.listadecompras.net`), pela API (`api.listadecompras.net`) e pela landing page (`www.listadecompras.net`).

> Atualizada em 17/10/2026. Esta política é revisada sempre que o sistema mudar a forma de tratar dados pessoais. Ela também está publicada na landing page, em `www.listadecompras.net/privacidade.html`.

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

Ao cadastrar ou atualizar um ativo, a API consulta o Yahoo Finance, a Binance e o CoinGecko enviando só o código do ativo (ex.: `PETR4.SA`). O agente de preços consulta, uma vez por dia, o Yahoo Finance e a Binance da mesma forma. O agente de notícias lê, uma vez por dia, o RSS do Google News (buscando o código e o nome do ativo) e feeds públicos de portais de mercado. Nenhum dado pessoal é enviado a esses serviços.

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

- Os dados ficam em um banco SQLite no servidor de produção (VPS), em volume de disco persistente. Uma cópia de segurança do banco é feita toda semana e guardada por cerca de 2 meses no próprio servidor e por cerca de 6 meses numa cópia externa, num servidor do responsável pelo sistema, acessível só por ele. As cópias têm verificação de integridade.
- Todo acesso ao app e à API é feito por HTTPS (certificado da Let's Encrypt, com HSTS).
- Credenciais do sistema (senhas de serviço, chaves) ficam em arquivos de configuração fora do repositório de código.
- As chaves de acesso dos agentes são guardadas como hash e exibidas uma única vez, na criação.

## Compartilhamento

Os dados pessoais não são vendidos nem compartilhados. Os únicos terceiros envolvidos são os prestadores de infraestrutura:

- **HostGator:** hospedagem do servidor (VPS).
- **Google (Gmail):** entrega dos e-mails de convite e de recuperação de senha.

## Exclusão dos dados

- Você pode **excluir sua conta permanentemente** na tela de perfil do app, confirmando a sua senha. A exclusão apaga, de imediato e em cascata, o seu cadastro (nome, e-mail, hash da senha, datas de acesso) e tudo o que você criou (hoje, as chaves de acesso de agentes, que deixam de funcionar na hora). Ela não pode ser desfeita, e as suas sessões abertas são encerradas.
- Se você for o último administrador ativo, a exclusão é recusada até que outro administrador seja definido, para o sistema não ficar sem administração.
- O e-mail da conta não pode ser alterado; o nome e a senha podem ser alterados na tela de perfil, e a troca de senha encerra as sessões abertas em outros dispositivos.
- Registros removidos com exclusão lógica (marcados como excluídos, mas recuperáveis) também são apagados quando a conta é excluída.
- Cópias de segurança anteriores à exclusão podem conter seus dados até serem descartadas pelo ciclo normal de backups: até cerca de 2 meses no servidor e de 6 meses na cópia externa.
- Os logs de acesso são apagados automaticamente pela rotação (limite de 50 MB por serviço).

## Seus direitos

Pela LGPD, você pode pedir a qualquer momento:

- confirmação de que tratamos seus dados e acesso a eles;
- correção de dados incompletos ou desatualizados (o nome pode ser editado no próprio app);
- exclusão dos dados (diretamente no app, como descrito acima);
- informação sobre com quem os dados são compartilhados.

Para exercer esses direitos ou tirar dúvidas, fale com o administrador que enviou o seu convite.

## Alterações

Esta política é atualizada junto com o sistema, e a data da última atualização aparece no início dela. Mudanças relevantes também são registradas no histórico de alterações do projeto (CHANGELOG).

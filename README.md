# DBADV

# PADRONIZADOR DE TELEFONES E REGISTRO DE LOGS


Descricao
---------
Este projeto consiste em uma ferramenta de automacao que processa uma lista 
de numeros de telefone, aplica a padronizacao brasileira (DDI 55) e registra 
as metricas de processamento (sucessos, falhas e total) em um banco de dados MySQL.

Funcionalidades
---------------
[+] Padronizacao de numeros para o formato DDI + DDD + Numero.
[+] Validacao de numeros invalidos ou incompletos.
[+] Registro automatico de logs de execucao no banco de dados.
[+] Arquitetura modular (logica separada da persistencia).

Tecnologias Utilizadas
----------------------
- Node.js
- MySQL (Driver: mysql2)

Estrutura de Arquivos
---------------------
/
|-- app.js            # Logica principal e processamento de lista
|-- conexao.js        # Configuracao de conexao e queries SQL
|-- script_banco.sql  # Script para criacao do banco e tabela
|-- package.json      # Dependencias do projeto
|-- .gitignore        # Arquivos ignorados pelo Git


# GUIA DE INSTALACAO E USO


1. Pre-requisitos
-----------------
Certifique-se de ter instalado:
- Node.js
- MySQL Server

2. Instalacao das Dependencias
------------------------------
Abra o terminal na pasta do projeto e execute:

   npm install

3. Configuracao do Banco de Dados
---------------------------------
Antes de rodar a aplicacao, voce precisa criar o banco de dados.
1. Abra seu cliente MySQL (Workbench, DBeaver, Terminal).
2. Abra o arquivo 'script_banco.sql'.
3. Execute todo o script para criar o banco 'sistema_logs' e a tabela.

4. Configuracao de Credenciais
------------------------------
Abra o arquivo 'conexao.js' e edite as credenciais de acesso ao banco:

   host: 'localhost',
   user: 'SEU_USUARIO',
   password: 'SUA_SENHA',
   database: 'sistema_logs'

5. Executando a Aplicacao
-------------------------
Para iniciar o processamento e salvar os logs, execute:

   node app.js


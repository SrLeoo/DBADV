-- Script de criação de banco de dados e tabela de Logs
-- Rode esse script no seu MySQL Workbench antes de iniciar a aplicação

CREATE DATABASE IF NOT EXISTS sistema_logs;

USE sistema_logs;

CREATE TABLE IF NOT EXISTS log_requisicoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company VARCHAR(255),
    aplication VARCHAR(255),
    qtd_requisicao_sucesso INT,
    qtd_requisicao_falha INT,
    qt_requisicao INT,
    data_inicio DATETIME
);

SELECT * FROM log_requisicoes; --Test
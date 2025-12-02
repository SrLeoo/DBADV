-- Script de criação de banco de dados e tabela de Logs
-- Rode esse script no seu MySQL Workbench antes de iniciar a aplicação

CREATE DATABASE IF NOT EXISTS system_logs;

USE system_logs;

CREATE TABLE IF NOT EXISTS log_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company VARCHAR(255),
    aplication VARCHAR(255),
    qt_request_successful INT,
    qtd_request_fail INT,
    qt_request INT,
    init_date DATETIME
);

SELECT * FROM log_requests; --Test
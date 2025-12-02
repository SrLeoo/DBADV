require('dotenv').config(); 
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.NAME_HOST, 
    user: process.env.USER,
    password: process.env.PASS,
    database: 'system_logs', 
    port: 7102,
    // Configuração de SSL Obrigatória para Square Cloud
    ssl: {
        rejectUnauthorized: false 
    }
});

/**
 * Salva ou atualiza os logs de requisição de forma agregada (Tabela log_requests).
 * Se a combinação (company, app) já existe, ele soma os contadores.
 */
async function salvarLog(company, app, sucesso, falha, total) {
    try {
        const query = `
            INSERT INTO log_requests 
            (company, aplication, qt_request_successful, qtd_request_fail, qt_request, init_date)
            VALUES (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                qt_request_successful = qt_request_successful + VALUES(qt_request_successful),
                qtd_request_fail = qtd_request_fail + VALUES(qtd_request_fail),
                qt_request = qt_request + VALUES(qt_request),
                init_date = NOW()
        `;
        
        await pool.execute(query, [company, app, sucesso, falha, total]);
        console.log(`[DB] Log agregado na nuvem. Agregação: ${company}/${app}`);
    } catch (error) {
        console.error("[DB] Erro ao salvar log agregado (Verifique o índice UNIQUE):", error.message);
    }
}

/**
 * Registra o log de auditoria individual na tabela audit_log_requests.
 * Usa os status 'SUCESS' ou 'FAIL'.
 */
async function salvarAuditoria(company, aplication, status, statusDetail, leadId) {
    try {
        // Query de INSERT para a nova tabela audit_log_requests, sem a coluna api_response
        const query = `
            INSERT INTO audit_log_requests 
            (company, aplication, status, lead_id, status_detail, date_request)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        
        // Garante que o leadId é um número inteiro ou NULL para evitar erros no banco de dados
        const finalLeadId = leadId && leadId !== '' ? parseInt(leadId, 10) : null;
        
        await pool.execute(query, [company, aplication, status, finalLeadId, statusDetail]);
        console.log(`[DB] Log de Auditoria salvo: ${company}/${aplication}/${status}`);
    } catch (error) {
        console.error("[DB] Erro ao salvar log de auditoria (audit_log_requests):", error.message);
    }
}

module.exports = { salvarLog, salvarAuditoria };
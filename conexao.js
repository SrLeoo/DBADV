require('dotenv').config(); 
const mysql = require('mysql2/promise');

// Certifique-se de que a porta 7102 está correta e que você configurou 
// o index UNIQUE (company, aplication) na tabela log_requests.
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
 * Salva ou atualiza os logs de requisição de forma agregada.
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
        
        // A função VALUES(coluna) na parte de UPDATE se refere ao valor que está sendo inserido (os parâmetros)
        await pool.execute(query, [company, app, sucesso, falha, total]);
        console.log(`[DB] Log agregado na nuvem. Agregação: ${company}/${app}`);
    } catch (error) {
        console.error("❌ [DB] Erro ao salvar log (Verifique o índice UNIQUE):", error.message);
    }
}

module.exports = { salvarLog };
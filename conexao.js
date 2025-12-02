require('dotenv').config(); 
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.NAME_HOST, 
    user: process.env.USER,
    password: process.env.PASS,
    database: 'system_logs', 
    port: 7102,
    // [NOVO] Configuração de SSL Obrigatória para Square Cloud
    ssl: {
        rejectUnauthorized: false 
    }
});

async function salvarLog(company, app, sucesso, falha, total) {
    try {
        const query = `
            INSERT INTO log_requests 
            (company, aplication, qt_request_successful, qtd_request_fail, qt_request, init_date)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        
        await pool.execute(query, [company, app, sucesso, falha, total]);
        console.log(`[DB] Log salvo na nuvem: S=${sucesso} | F=${falha}`);
    } catch (error) {
        console.error("❌ [DB] Erro ao salvar log:", error.message);
    }
}

module.exports = { salvarLog };
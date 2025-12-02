// Nome do arquivo: conexao.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'process.env.NAME_HOST',
    user: 'process.env.USER', 
    password: 'process.env.PASS',
    database: 'system_logs',
    port: 'process.env.SQL_PORT'
});

async function salvarLog(company, app, sucesso, falha, total) {
    try {
        const query = `
            INSERT INTO log_requisicoes 
            (company, aplication, qt_request_successful, qtd_request_fail, qt_request, init_date)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        await pool.execute(query, [company, app, sucesso, falha, total]);
        console.log("✅ Dados salvos no banco com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao salvar no banco:", error);
    }
}

module.exports = { salvarLog };
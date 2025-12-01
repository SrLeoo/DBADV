// Nome do arquivo: conexao.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', 
    password: 'senhaDoSeuBancoDeDados',
    database: 'sistema_logs'
});

async function salvarLog(company, app, sucesso, falha, total) {
    try {
        const query = `
            INSERT INTO log_requisicoes 
            (company, aplication, qtd_requisicao_sucesso, qtd_requisicao_falha, qt_requisicao, data_inicio)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        await pool.execute(query, [company, app, sucesso, falha, total]);
        console.log("✅ Dados salvos no banco com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao salvar no banco:", error);
    }
}

module.exports = { salvarLog };
const express = require('express');
const axios = require('axios');
const { salvarLog } = require('./conexao.js'); // Importa o logger

const app = express();
app.use(express.json()); // Habilita leitura de JSON para rotas POST

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// --- CONSTANTES ---
const STATUS_SUCESSO = '2872';
const STATUS_FALHA = '3026';  
const CAMPO_FIXO_ID = 'UF_CRM_1761808180550'; 
const CAMPO_TELEFONE_ID = 'UF_CRM_1761804215';

// --- FUNÇÕES UTILITÁRIAS ---

const categorizarErro = (num) => 
    num.length < 11 ? "Poucos caracteres (< 11)." :
    num.length >= 14 ? "Muitos caracteres (> 13)." :
    "Comprimento inválido (fora do padrão BR).";

const padronizarTelefoneBrasil = (input) => {
    const DDI = '55';
    if (!input) return { sucesso: false, valor: "Input vazio" };

    const num = input.split(',')[0].trim().replace(/\D/g, '');
    console.log(`[PADRONIZADOR] Analisando: ${num}`);

    if (num.length !== 13 && num.length !== 12 && !(num.length === 11 && !num.startsWith(DDI))) {
        console.log(`[PADRONIZADOR] Falha: ${num.length} dígitos.`);
        return { sucesso: false, valor: categorizarErro(num) };
    }

    const valor = num.startsWith(DDI) ? num : (num.length === 11 || num.length === 12 ? DDI + num : null);

    if (valor) {
        console.log(`[PADRONIZADOR] Sucesso: ${valor}`);
        return { sucesso: true, valor };
    }

    return { sucesso: false, valor: "Erro desconhecido." };
};

const enviarParaBitrix24 = async (id, resultadoPadronizacao) => {
    if (!BITRIX_WEBHOOK) return console.error("[BITRIX] CRÍTICO: Webhook não configurado.");
    
    const valorTelefone = resultadoPadronizacao.sucesso ? resultadoPadronizacao.valor : '';
    const valorFixo = resultadoPadronizacao.sucesso ? STATUS_SUCESSO : STATUS_FALHA;
    const logTelefone = resultadoPadronizacao.sucesso ? valorTelefone : `FALHA (${resultadoPadronizacao.valor})`;

    const payload = { 
        id, 
        fields: { 
            [CAMPO_TELEFONE_ID]: valorTelefone, 
            [CAMPO_FIXO_ID]: valorFixo 
        } 
    };

    console.log(`[BITRIX] Atualizando Lead ${id}...`);

    try {
        const { data } = await axios.post(`${BITRIX_WEBHOOK}crm.lead.update`, payload);
        if (data.result) console.log(`[BITRIX] Sucesso.`);
        else console.error(`[BITRIX] Erro API: ${data.error_description}`);
    } catch (e) {
        console.error(`[BITRIX] Erro Rede: ${e.message}`);
    }
};

// --- ROTAS ---

// ROTA 1: GET (Padrão Automation via URL com parâmetros)
// Ex: http://seusite.com/?telefoneInput=11999998888&leadId=100
app.get('/', async (req, res) => {
    const { telefoneInput: tel, leadId } = req.query;
    const empresa = "Dutra Bitencourt Advocacia"; // Nome fixo ou pode tentar pegar de outro lugar

    console.log(`\n[REQ GET] ${new Date().toISOString()} | Tel: ${tel} | Lead: ${leadId}`);

    if (!tel || !leadId) {
        console.error("[ERRO] Parâmetros faltando.");
        // Loga falha técnica (sem dados)
        await salvarLog(empresa, "Correção de telefone", 0, 1, 1);
        return res.status(400).send("Erro: Parâmetros faltando.");
    }

    // 1. Processa
    const resultado = padronizarTelefoneBrasil(tel);

    // 2. Envia pro Bitrix
    await enviarParaBitrix24(leadId, resultado);

    // 3. SALVA NO BANCO (A parte que faltava!) 💾
    const sucesso = resultado.sucesso ? 1 : 0;
    const falha = resultado.sucesso ? 0 : 1;
    await salvarLog(empresa, "Correção de telefone", sucesso, falha, 1);

    // 4. Responde
    res.json({ 
        sucesso: resultado.sucesso, 
        lead: leadId, 
        valor: resultado.valor 
    });
});

// ROTA 2: POST (Webhook moderno do Bitrix)
// Ex: Configurado em "Outbound Webhook" no Bitrix
app.post('/webhook-bitrix', async (req, res) => {
    try {
        console.log("\n[REQ POST] Webhook Bitrix recebido!");
        
        // Adapte os campos conforme o JSON que o Bitrix manda no POST
        const telefoneRecebido = req.body.phone || req.body.telefone || ""; 
        const nomeEmpresa = req.body.company || "Bitrix Webhook";

        const resultado = padronizarTelefoneBrasil(telefoneRecebido);
        
        // Loga no banco
        const sucesso = resultado.sucesso ? 1 : 0;
        const falha = resultado.sucesso ? 0 : 1;
        await salvarLog(nomeEmpresa, "Webhook Bitrix", sucesso, falha, 1);

        res.status(200).send('Recebido');
    } catch (erro) {
        console.error("Erro no POST:", erro);
        res.status(500).send('Erro interno');
    }
});

// --- SERVIDOR ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta: ${PORT}`);
});
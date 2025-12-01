const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Função utilitária compacta para erros
const categorizarErro = (num) => 
    num.length < 11 ? "Poucos caracteres (< 11)." :
    num.length >= 14 ? "Muitos caracteres (> 13)." :
    "Comprimento inválido (fora do padrão BR).";

// Função principal de padronização
const padronizarTelefoneBrasil = (input) => {
    const DDI = '55';
    // Remove caracteres não numéricos e espaços do primeiro número
    const num = input.split(',')[0].trim().replace(/\D/g, '');
    
    console.log(`[PADRONIZADOR] Analisando: ${num}`);

    // Validação de comprimento: aceita 13 dígitos OU (11 dígitos se não começar com 55)
    if (num.length !== 13 && !(num.length === 11 && !num.startsWith(DDI))) {
        console.log(`[PADRONIZADOR] Falha: ${num.length} dígitos.`);
        return { sucesso: false, valor: categorizarErro(num) };
    }

    // Retorna número se já tiver DDI ou adiciona DDI se tiver 11 dígitos
    const valor = num.startsWith(DDI) ? num : (num.length === 11 ? DDI + num : null);

    if (valor) {
        console.log(`[PADRONIZADOR] Sucesso: ${valor}`);
        return { sucesso: true, valor };
    }

    console.log(`[PADRONIZADOR] Erro lógico desconhecido.`);
    return { sucesso: false, valor: "Erro desconhecido." };
};

// Integração com Bitrix24
const enviarParaBitrix24 = async (id, valor) => {
    if (!BITRIX_WEBHOOK) return console.error("[BITRIX] CRÍTICO: Webhook não configurado.");

    const payload = { 
        id, 
        fields: { 'UF_CRM_1761804215': valor, 'UF_CRM_1761808180550': '2872' } 
    };

    console.log(`[BITRIX] Atualizando Lead ${id}. Payload: ${JSON.stringify(payload)}`);

    try {
        const { data, status } = await axios.post(`${BITRIX_WEBHOOK}crm.lead.update`, payload);
        if (data.result) console.log(`[BITRIX] Sucesso (HTTP ${status}).`);
        else console.error(`[BITRIX] Erro API: ${data.error_description}`);
    } catch (e) {
        console.error(`[BITRIX] Erro Rede: ${e.message}`);
    }
};

// Rota Principal
app.get('/', async (req, res) => {
    const { telefoneInput: tel, leadId } = req.query;

    console.log(`\n[REQ] ${new Date().toISOString()} | Tel: ${tel} | Lead: ${leadId}`);

    if (!tel || !leadId) {
        console.error("[ERRO] Parâmetros 'telefoneInput' ou 'leadId' faltando.");
        return res.status(400).send("<h1>Erro: Parâmetros faltando.</h1>");
    }

    const { sucesso, valor } = padronizarTelefoneBrasil(tel);
    
    // Envia para o Bitrix de forma assíncrona (await garante a ordem)
    await enviarParaBitrix24(leadId, valor);

    res.json({ sucesso, valor, leadId, fixo: '2872' });
    console.log("[REQ] Finalizada (200).");
});

app.listen(PORT, () => console.log(`Servidor Webhook rodando na porta ${PORT} (vCompacta).`));
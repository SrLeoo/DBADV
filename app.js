const express = require('express');
const axios = require('axios');
const { salvarLog } = require('./conexao.js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Constantes fixas
const STATUS_SUCESSO = '2872';
const STATUS_FALHA = '3026';
const CAMPO_FIXO_ID = 'UF_CRM_1761808180550';
const CAMPO_TELEFONE_ID = 'UF_CRM_1761804215';
const EMPRESA_FIXA = "Dutra Bitencourt Advocacia";

function categorizarErro(num) {
    if (num.length < 11) return "Poucos caracteres (< 11)";
    if (num.length > 13) return "Muitos caracteres (> 13)";
    return "Comprimento inválido";
}

function padronizarTelefoneBrasil(input) {
    if (!input) return { sucesso: false, valor: "Input vazio" };

    const num = input.split(',')[0].trim().replace(/\D/g, '');
    const DDI = '55';

    if (![11, 12, 13].includes(num.length))
        return { sucesso: false, valor: categorizarErro(num) };

    const valor = num.startsWith(DDI)
        ? num
        : DDI + num;

    return { sucesso: true, valor };
}

async function atualizarBitrix(leadId, resultado) {
    if (!BITRIX_WEBHOOK) {
        console.error("[FATAL] Webhook não configurado");
        return;
    }

    const payload = {
        id: leadId,
        fields: {
            [CAMPO_TELEFONE_ID]: resultado.sucesso ? resultado.valor : '',
            [CAMPO_FIXO_ID]: resultado.sucesso ? STATUS_SUCESSO : STATUS_FALHA
        }
    };

    try {
        const { data } = await axios.post(`${BITRIX_WEBHOOK}crm.lead.update`, payload);
        if (!data.result)
            console.error("[BITRIX] Erro API:", data.error_description);
    } catch (e) {
        console.error("[BITRIX] Erro de rede:", e.message);
    }
}

async function registrarLog(resultado, empresa, aplicacao) {
    const sucesso = resultado.sucesso ? 1 : 0;
    const falha = resultado.sucesso ? 0 : 1;

    try {
        await salvarLog(empresa, aplicacao, sucesso, falha, 1);
    } catch (err) {
        console.error("[LOG] Erro ao salvar log:", err.message);
    }
}

// ROTA GET (Bitrix chamando via URL)
app.get('/', async (req, res) => {
    const { telefoneInput: tel, leadId } = req.query;

    if (!tel || !leadId) {
        await registrarLog({ sucesso: false }, EMPRESA_FIXA, "Correção de telefone");
        return res.status(400).send("Erro: parâmetros faltando");
    }

    const resultado = padronizarTelefoneBrasil(tel);
    await atualizarBitrix(leadId, resultado);
    await registrarLog(resultado, EMPRESA_FIXA, "Correção de telefone");

    res.json({
        sucesso: resultado.sucesso,
        lead: leadId,
        valor: resultado.valor
    });
});

// ROTA POST (Webhook Bitrix)
app.post('/webhook-bitrix', async (req, res) => {
    try {
        const telefone = req.body.phone || req.body.telefone || "";
        const resultado = padronizarTelefoneBrasil(telefone);

        await registrarLog(resultado, EMPRESA_FIXA, "Webhook Bitrix");
        res.status(200).send('OK');
    } catch (erro) {
        console.error("[WEBHOOK] Erro:", erro.message);
        res.status(500).send('Erro interno');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado porta ${PORT}`);
});

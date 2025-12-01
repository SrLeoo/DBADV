const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 80;

const BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK;

function categorizarErro(numeroLimpo) {
    if (numeroLimpo.length < 11) {
        return "Número com poucos caracteres (menos de 11 dígitos, ex: DDI+DDD+7 dígitos).";
    }
    if (numeroLimpo.length >= 14) {
        return "Número com muitos caracteres (mais de 13 dígitos).";
    }
    return "Número Incompleto ou Inválido (Comprimento incorreto para o padrão BR).";
}

function padronizarTelefoneBrasil(input) {
    const DDI_BRASIL = '55';
    let numeroSegmento = input.split(',')[0].trim();
    
    let numeroLimpo = numeroSegmento.replace(/\D/g, '');

    const COMPRIMENTO_IDEAL = 13;

    if (numeroLimpo.length !== COMPRIMENTO_IDEAL && 
        !(numeroLimpo.length === 11 && !numeroLimpo.startsWith(DDI_BRASIL))) {
        
        return { 
            sucesso: false, 
            valor: categorizarErro(numeroLimpo) 
        };
    }

    if (numeroLimpo.startsWith(DDI_BRASIL)) {
        return { sucesso: true, valor: numeroLimpo };
    } 
    
    if (numeroLimpo.length === 11) {
        return { sucesso: true, valor: DDI_BRASIL + numeroLimpo };
    }
    
    return { 
        sucesso: false, 
        valor: "Erro desconhecido na padronização." 
    };
}

async function enviarParaBitrix24(leadId, valor) {
    if (!BITRIX_WEBHOOK) {
        console.error("ERRO: BITRIX_WEBHOOK não está configurado nas variáveis de ambiente.");
        return;
    }

    const apiMethod = 'crm.lead.update';
    const endpoint = BITRIX_WEBHOOK + apiMethod;

    const dados = {
        id: leadId,
        fields: {
            'UF_CRM_1761804215': [valor] 
        }
    };

    try {
        const response = await axios.post(endpoint, dados);
        if (response.data.result) {
            console.log(`[BITRIX] Sucesso ao atualizar Lead ${leadId}. Novo valor: ${valor}`);
        } else {
            console.error(`[BITRIX] Erro ao atualizar Lead ${leadId}:`, response.data.error_description);
        }
    } catch (error) {
        console.error(`[BITRIX] Erro de rede/conexão ao enviar para o Bitrix24:`, error.message);
    }
}

app.get('/', async (req, res) => {
    const telefoneInput = req.query.id;
    const leadId = req.query.leadId;

    if (!telefoneInput || !leadId) {
        const mensagem = "Erro: Parâmetros 'id' (telefone) ou 'leadId' faltando.";
        return res.status(400).send(`<h1>${mensagem}</h1>`);
    }

    const resultado = padronizarTelefoneBrasil(telefoneInput);
    
    await enviarParaBitrix24(leadId, resultado.valor);

    res.json({
        processamento_sucesso: resultado.sucesso,
        valor_enviado_bitrix: resultado.valor,
        lead_id_atualizado: leadId
    });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de exemplo: /?id=19996146814&leadId=123`);
});
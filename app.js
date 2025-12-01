const express = require('express');
const axios = require('axios');
const app = express();

// Define a porta de escuta. Prioriza a variável de ambiente (process.env.PORT) 
// fornecida pela hospedagem (Squareweb) ou usa 80 como padrão.
const PORT = process.env.PORT || 80;

// O webhook do Bitrix24 deve ser configurado como uma variável de ambiente (BITRIX_WEBHOOK).
const BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK;

/**
 * Categoriza o tipo de erro de comprimento do número de telefone.
 * @param {string} numeroLimpo - O número de telefone apenas com dígitos.
 * @returns {string} Descrição do erro.
 */
function categorizarErro(numeroLimpo) {
    if (numeroLimpo.length < 11) {
        return "Número com poucos caracteres (menos de 11 dígitos, ex: DDI+DDD+7 dígitos).";
    }
    if (numeroLimpo.length >= 14) {
        return "Número com muitos caracteres (mais de 13 dígitos).";
    }
    return "Número Incompleto ou Inválido (Comprimento incorreto para o padrão BR).";
}

/**
 * Padroniza o número de telefone para o formato DDI + DDD + Telefone (13 dígitos).
 * @param {string} input - O número de telefone bruto, que pode incluir prefixos, vírgulas, etc.
 * @returns {{sucesso: boolean, valor: string}} Objeto com o status e o valor (padronizado ou mensagem de erro).
 */
function padronizarTelefoneBrasil(input) {
    const DDI_BRASIL = '55';
    // Pega apenas o primeiro segmento caso haja múltiplos números separados por vírgula
    let numeroSegmento = input.split(',')[0].trim();
    
    // Remove todos os caracteres não numéricos
    let numeroLimpo = numeroSegmento.replace(/\D/g, '');

    const COMPRIMENTO_IDEAL = 13; // Ex: 55 + 11 + 987654321

    console.log(`[PADRONIZADOR] Número limpo para análise: ${numeroLimpo}`);

    // Verifica se o comprimento está fora do padrão (assumindo DDI+DDD+9 dígitos)
    if (numeroLimpo.length !== COMPRIMENTO_IDEAL && 
        !(numeroLimpo.length === 11 && !numeroLimpo.startsWith(DDI_BRASIL))) {
        
        console.log(`[PADRONIZADOR] FALHA: Comprimento inválido (${numeroLimpo.length} dígitos).`);
        return { 
            sucesso: false, 
            valor: categorizarErro(numeroLimpo) 
        };
    }

    // Se já começar com o DDI (55), retorna como está
    if (numeroLimpo.startsWith(DDI_BRASIL)) {
        console.log(`[PADRONIZADOR] SUCESSO: Já padronizado com DDI.`);
        return { sucesso: true, valor: numeroLimpo };
    } 
    
    // Se tiver 11 dígitos (DDD + 9 dígitos), adiciona o DDI
    if (numeroLimpo.length === 11) {
        const valorPadronizado = DDI_BRASIL + numeroLimpo;
        console.log(`[PADRONIZADOR] SUCESSO: Adicionado DDI. Resultado: ${valorPadronizado}`);
        return { sucesso: true, valor: valorPadronizado };
    }
    
    console.log(`[PADRONIZADOR] FALHA: Erro desconhecido na lógica final.`);
    return { 
        sucesso: false, 
        valor: "Erro desconhecido na padronização." 
    };
}

/**
 * Envia o valor padronizado ou a mensagem de erro para o campo customizado no Bitrix24.
 * @param {string} leadId - ID do Lead a ser atualizado.
 * @param {string} valor - Valor padronizado ou mensagem de erro.
 */
async function enviarParaBitrix24(leadId, valor) {
    if (!BITRIX_WEBHOOK) {
        console.error("ERRO CRÍTICO: BITRIX_WEBHOOK não está configurado nas variáveis de ambiente. Não é possível enviar dados.");
        return;
    }

    const apiMethod = 'crm.lead.update';
    // O endpoint completo inclui o método da API
    const endpoint = BITRIX_WEBHOOK + apiMethod;

    // A API do Bitrix espera 'fields' e 'id' diretamente no payload
    const dadosPayload = {
        id: leadId,
        fields: {
            // Envolve o valor em um array, conforme é comum para campos customizados
            'UF_CRM_1761804215': [valor] 
        }
    };

    console.log(`[BITRIX-REQ] Tentando atualizar Lead ${leadId}. Novo valor: ${valor}`);
    console.log(`[BITRIX-REQ] Payload enviado: ${JSON.stringify(dadosPayload)}`);

    try {
        const response = await axios.post(endpoint, dadosPayload);
        
        if (response.data.result) {
            console.log(`[BITRIX-SUCESSO] Lead ${leadId} atualizado com sucesso. Status HTTP: ${response.status}`);
        } else {
            // Loga o erro específico retornado pela API do Bitrix
            console.error(`[BITRIX-ERRO] Falha na API do Bitrix24. Lead ${leadId}. Descrição: ${response.data.error_description || 'Erro desconhecido'}`);
        }
    } catch (error) {
        // Loga erros de conexão ou de rede
        console.error(`[BITRIX-ERRO] Erro de rede/conexão ao enviar para o Bitrix24. Detalhe:`, error.message);
    }
}

// ----------------------------------------------------------------------
// Rota Principal do Webhook (Endpoint GET)
// ----------------------------------------------------------------------
app.get('/', async (req, res) => {
    // CORREÇÃO: Captura o parâmetro de telefone usando 'telefoneInput' (conforme URL do Bitrix)
    const telefoneInput = req.query.telefoneInput;
    const leadId = req.query.leadId;

    // Log de rastreamento de início da requisição
    console.log(`\n--- REQUISIÇÃO RECEBIDA: ${new Date().toISOString()} ---`);
    console.log(`[INPUT] Telefone (telefoneInput): ${telefoneInput}`); // Log atualizado
    console.log(`[INPUT] ID do Lead (leadId): ${leadId}`);


    // Validação de inputs obrigatórios (agora verificando telefoneInput)
    if (!telefoneInput || !leadId) {
        const mensagem = "Erro: Parâmetros 'telefoneInput' (telefone) ou 'leadId' faltando.";
        console.error(`[ERRO-400] ${mensagem}`);
        return res.status(400).send(`<h1>${mensagem}</h1>`);
    }

    // 1. Processamento do telefone
    const resultado = padronizarTelefoneBrasil(telefoneInput);

    // 2. Envio do valor para o Bitrix24 (Mesmo que seja uma mensagem de erro)
    await enviarParaBitrix24(leadId, resultado.valor);

    // 3. Resposta final para o serviço que chamou o webhook
    res.json({
        processamento_sucesso: resultado.sucesso,
        valor_enviado_bitrix: resultado.valor,
        lead_id_atualizado: leadId
    });
    console.log(`--- REQUISIÇÃO FINALIZADA. Status: 200 ---`);
});


// ----------------------------------------------------------------------
// Inicialização do Servidor
// ----------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`Servidor de Webhook (Bitrix Padronizador) INICIADO.`);
    console.log(`Porta de escuta: ${PORT}`);
    console.log('Versão: v1.0.4 (Correção de nome de parâmetro: telefoneInput)');
    console.log('======================================================\n');
});
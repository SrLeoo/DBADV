const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Constantes para os códigos de status
const STATUS_SUCESSO = '2872'; // Código Bitrix para: Telefone Padronizado (Correto)
const STATUS_FALHA = '3026';   // Código Bitrix para: Erro na Padronização (Inválido)
const CAMPO_FIXO_ID = 'UF_CRM_1761808180550'; 
const CAMPO_TELEFONE_ID = 'UF_CRM_1761804215';

// Função utilitária compacta para categorizar erros de comprimento
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
    // 13 dígitos (DDI+DDD+9+8dígitos) é o formato padrão esperado.
    if (num.length !== 13 && !(num.length === 11 && !num.startsWith(DDI))) {
        console.log(`[PADRONIZADOR] Falha: ${num.length} dígitos. Retornando erro para o log.`);
        // Retorna a mensagem de erro
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
const enviarParaBitrix24 = async (id, resultadoPadronizacao) => {
    if (!BITRIX_WEBHOOK) return console.error("[BITRIX] CRÍTICO: Webhook não configurado.");
    
    // 1. Define o valor do Telefone: Se sucesso, usa o número; se falha, usa string vazia.
    const valorTelefone = resultadoPadronizacao.sucesso ? resultadoPadronizacao.valor : '';
    
    // 2. Define o valor do Status Fixo: 2872 para sucesso, 3026 para falha.
    const valorFixo = resultadoPadronizacao.sucesso ? STATUS_SUCESSO : STATUS_FALHA;
    
    // O valor de log para visualização
    const logTelefone = resultadoPadronizacao.sucesso ? valorTelefone : `FALHA (${resultadoPadronizacao.valor})`;


    const payload = { 
        id, 
        fields: { 
            [CAMPO_TELEFONE_ID]: valorTelefone, // Enviado como '' em caso de falha
            [CAMPO_FIXO_ID]: valorFixo          // 2872 (Sucesso) ou 3026 (Falha)
        } 
    };

    console.log(`[BITRIX] Atualizando Lead ${id}. Telefone: ${logTelefone} | Status Fixo: ${valorFixo}`);
    console.log(`[BITRIX] Payload enviado: ${JSON.stringify(payload)}`);

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

    const resultado = padronizarTelefoneBrasil(tel);
    
    // Envia o resultado para Bitrix. A função 'enviarParaBitrix24' decide os códigos.
    await enviarParaBitrix24(leadId, resultado);

    // Resposta de sucesso para o cliente que chamou o webhook (Bitrix)
    res.json({ 
        processamento_sucesso: resultado.sucesso, 
        lead_id_atualizado: leadId, 
        valor_padronizado_log: resultado.valor, // Valor no log (padronizado ou mensagem de erro)
        status_fixo_enviado: resultado.sucesso ? STATUS_SUCESSO : STATUS_FALHA
    });
    console.log("[REQ] Finalizada (200).");
});

app.listen(PORT, () => console.log(`Servidor Webhook rodando na porta ${PORT} (vFinal-Status).`));
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Define o valor fixo a ser enviado para o segundo campo
const CAMPO_FIXO_VALOR = '3026';
const CAMPO_FIXO_ID = 'UF_CRM_1761808180550'; // Novo ID de campo fixo

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
    if (num.length !== 13 && !(num.length === 11 && !num.startsWith(DDI))) {
        console.log(`[PADRONIZADOR] Falha: ${num.length} dígitos. Retornando erro para o log.`);
        // Retorna a mensagem de erro para o log, mas o valor real enviado para o Bitrix será ''
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
    
    // Se a padronização falhou, enviamos uma string vazia para o Bitrix no campo de telefone.
    // Isso evita que o Bitrix receba texto em um campo numérico/telefone.
    const valorTelefone = resultadoPadronizacao.sucesso ? resultadoPadronizacao.valor : '';
    
    // O valor de log é o valor padronizado ou a mensagem de erro
    const logValor = resultadoPadronizacao.sucesso ? valorTelefone : `FALHA (${resultadoPadronizacao.valor})`;


    const payload = { 
        id, 
        fields: { 
            'UF_CRM_1761804215': valorTelefone, // Enviado como '' em caso de falha
            [CAMPO_FIXO_ID]: CAMPO_FIXO_VALOR // Sempre 3026
        } 
    };

    console.log(`[BITRIX] Atualizando Lead ${id}. Telefone: ${logValor} | Fixo: ${CAMPO_FIXO_VALOR}`);
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
    
    await enviarParaBitrix24(leadId, resultado);


    res.json({ 
        processamento_sucesso: resultado.sucesso, 
        lead_id_atualizado: leadId, 
        valor_padronizado_log: resultado.valor,
        campo_fixo_atualizado: `${CAMPO_FIXO_ID} = ${CAMPO_FIXO_VALOR}`
    });
    console.log("[REQ] Finalizada (200).");
});

app.listen(PORT, () => console.log(`Servidor Webhook rodando na porta ${PORT} (vCompacta-3026).`));
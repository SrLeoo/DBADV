const express = require('express');
const axios = require('axios');
// Importa ambas as funções de log, incluindo 'salvarAuditoria'
const { salvarLog, salvarAuditoria } = require('./conexao.js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Constantes fixas
const STATUS_BITRIX_SUCESSO = '2872'; // ID do status de sucesso no Bitrix
const STATUS_BITRIX_FALHA = '3026';   // ID do status de falha no Bitrix
const CAMPO_FIXO_ID = 'UF_CRM_1761808180550';
// ATENÇÃO: Se o campo CAMPO_TELEFONE_ID for um campo de telefone nativo do Bitrix, 
// o ID do campo deveria ser "PHONE". Como está como UF_CRM_...,  
// presumimos que é um campo customizado do tipo string/texto.
const CAMPO_TELEFONE_ID = 'UF_CRM_1761804215'; 
const EMPRESA_FIXA = "Dutra Bitencourt Advocacia"; // Cliente mockado

// --- Funções de Lógica ---

function categorizarErro(num) {
    if (num.length < 11) return "Poucos caracteres. DDD (2) + Número (9) obrigatório, ou DDI + DDD + Número.";
    if (num.length > 13) return "Muitos caracteres (> 13)";
    return "Comprimento inválido";
}

function padronizarTelefoneBrasil(input) {
    const inputOriginal = input || ''; 
    const DDI = '55';

    // 1. OTIMIZAÇÃO DE LIMPEZA: Isola o primeiro número e remove todos os não-dígitos
    const numBruto = inputOriginal.split(',')[0] || '';
    const numLimpo = numBruto.trim().replace(/\D/g, '');

    // 2. VERIFICAÇÃO REFORÇADA PARA INPUT VAZIO/NULO
    if (numLimpo.length === 0) {
        const errorMsg = "Entrada vazia ou sem dígitos.";
        return { sucesso: false, valor: errorMsg, statusDetail: errorMsg, inputOriginal };
    }

    // 3. Verifica o comprimento do número limpo
    if (![11, 12, 13].includes(numLimpo.length)) {
        const erroMsg = categorizarErro(numLimpo);
        return { sucesso: false, valor: erroMsg, statusDetail: erroMsg, inputOriginal };
    }

    // 4. Adiciona DDI se necessário (Padronização)
    const valorPadronizado = numLimpo.startsWith(DDI)
        ? numLimpo
        : DDI + numLimpo;

    return { sucesso: true, valor: valorPadronizado, statusDetail: "Telefone Padronizado", inputOriginal };
}

async function atualizarBitrix(leadId, resultado) {
    if (!BITRIX_WEBHOOK) {
        console.error("[FATAL] Webhook não configurado");
        return;
    }

    // Determina o valor do status 
    const statusValue = resultado.sucesso ? STATUS_BITRIX_SUCESSO : STATUS_BITRIX_FALHA;
    
    let camposParaAtualizar = {
        // Campo Fixo de Status (sempre atualizado)
        [CAMPO_FIXO_ID]: statusValue 
    };

    // ** Lógica de Correção para Campos Multivalorados (Telefone) **
    if (resultado.sucesso) {
        // Se o resultado foi SUCESSO, atualiza o campo de telefone.
        // O valor é encapsulado em um array de objetos, formato padrão para Bitrix API.
        camposParaAtualizar[CAMPO_TELEFONE_ID] = [
            { "VALUE": resultado.valor, "VALUE_TYPE": "WORK" } // 'WORK' é um VALUE_TYPE comum
        ];
    } else {
        // Se FALHA, garante que o campo de telefone seja limpo ou atualizado para "" (string vazia).
        // Se CAMPO_TELEFONE_ID for um campo string customizado, "" funciona.
        // Se for um campo PHONE nativo que espera array, enviar null ou [] pode ser melhor, 
        // mas vamos manter "" como string, pois é um UF_CRM.
        camposParaAtualizar[CAMPO_TELEFONE_ID] = '';
    }

    const payload = {
        id: leadId,
        fields: camposParaAtualizar
    };

    try {
        const { data } = await axios.post(`${BITRIX_WEBHOOK}crm.lead.update`, payload);
        
        if (!data.result) {
            console.error("[BITRIX] Erro API: Falha ao atualizar lead. Descrição:", 
                          data.error_description, 
                          "Payload enviado:", 
                          JSON.stringify(payload));
            // Logamos a falha de padronização, mas o Bitrix está retornando ERRO. 
            // Para efeitos de auditoria, vamos logar este erro de Bitrix.
             await registrarLogAuditoria(
                EMPRESA_FIXA, // Use a constante fixa
                "Bitrix Update Falhou", 
                { sucesso: false, valor: data.error_description || "Erro API Desconhecido", statusDetail: "Falha na API do Bitrix", inputOriginal: resultado.inputOriginal }, 
                leadId
            );
        } else {
            console.log(`[BITRIX SUCESSO] Lead ID ${leadId} atualizado para status: ${statusValue}`);
        }
    } catch (e) {
        console.error("[BITRIX] Erro de rede/conexão ao atualizar lead:", 
                      e.message, 
                      "Payload enviado:", 
                      JSON.stringify(payload));
    }
}

// Funções de Log (inalteradas)
async function registrarLogAgregado(resultado, empresa, aplicacao) {
    const sucesso = resultado.sucesso ? 1 : 0;
    const falha = resultado.sucesso ? 0 : 1;

    try {
        await salvarLog(empresa, aplicacao, sucesso, falha, 1);
    } catch (err) {
        console.error("[LOG] Erro ao salvar log agregado:", err.message);
    }
}

async function registrarLogAuditoria(empresa, aplicacao, resultadoPadronizacao, leadId) {
    const status = resultadoPadronizacao.sucesso ? "SUCESS" : "FAIL"; 
    
    let detailMessage = `Input: ${resultadoPadronizacao.inputOriginal} | `;
    
    if (resultadoPadronizacao.sucesso) {
        detailMessage += `Resultado: ${resultadoPadronizacao.valor}`;
    } else {
        detailMessage += `Falha: ${resultadoPadronizacao.statusDetail}`;
    }

    try {
        await salvarAuditoria(
            empresa,
            aplicacao, 
            status, 
            detailMessage, 
            leadId
        );
    } catch (err) {
        console.error("[LOG] Erro ao salvar log de auditoria:", err.message);
    }
}

// --- ROTAS (inalteradas na lógica de extração) ---

// ROTA GET (Bitrix chamando via URL)
app.get('/', async (req, res) => {
    const { telefoneInput: tel, leadId } = req.query;
    const APLICACAO = "Correção de telefone";
    const EMPRESA = EMPRESA_FIXA;

    if (!leadId) {
        const resultadoErro = { sucesso: false, valor: "Lead ID faltando", statusDetail: "Lead ID faltando", inputOriginal: tel || '' };
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, 'N/A');
        return res.status(400).send("Erro: leadId faltando");
    }
    
    if (!tel || tel.trim() === '') {
        const resultadoErro = { sucesso: false, valor: "Telefone de entrada vazio/nulo", statusDetail: "Telefone de entrada vazio/nulo", inputOriginal: tel || '' };
        
        await atualizarBitrix(leadId, resultadoErro);
        
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        return res.status(200).json({
            sucesso: resultadoErro.sucesso,
            lead: leadId,
            valor: resultadoErro.valor
        });
    }

    const resultado = padronizarTelefoneBrasil(tel);
    
    await atualizarBitrix(leadId, resultado);

    await registrarLogAgregado(resultado, EMPRESA, APLICACAO);
    await registrarLogAuditoria(EMPRESA, APLICACAO, resultado, leadId);

    res.json({
        sucesso: resultado.sucesso,
        lead: leadId,
        valor: resultado.valor
    });
});

// ROTA POST (Webhook Bitrix)
app.post('/webhook-bitrix', async (req, res) => {
    const APLICACAO = "Webhook Bitrix";
    const EMPRESA = EMPRESA_FIXA;
    const leadId = req.body.data && req.body.data.FIELDS ? req.body.data.FIELDS.ID : 'N/A';
    
    let telefone = req.body.phone || req.body.telefone || '';
    if (Array.isArray(telefone) && telefone.length > 0) {
        telefone = telefone[0]; 
    }
    
    if (leadId === 'N/A') {
        const resultadoErro = { sucesso: false, valor: "Lead ID faltando no payload", statusDetail: "Lead ID faltando", inputOriginal: telefone };
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        return res.status(400).send('Erro: Lead ID faltando');
    }

    if (telefone.trim() === '') {
        const resultadoErro = { sucesso: false, valor: "Telefone de entrada vazio/nulo", statusDetail: "Telefone de entrada vazio/nulo", inputOriginal: telefone };
        
        await atualizarBitrix(leadId, resultadoErro);
        
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        return res.status(200).send('OK (Telefone Vazio/Falha)');
    }

    try {
        const resultado = padronizarTelefoneBrasil(telefone);

        await atualizarBitrix(leadId, resultado);

        await registrarLogAgregado(resultado, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultado, leadId);

        res.status(200).send('OK');
    } catch (erro) {
        const resultadoErro = { sucesso: false, valor: `Erro interno: ${erro.message}`, statusDetail: "Erro interno do servidor", inputOriginal: telefone };

        await atualizarBitrix(leadId, resultadoErro); 
        
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        console.error("[WEBHOOK] Erro:", erro.message);
        res.status(500).send('Erro interno');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado porta ${PORT}`);
});
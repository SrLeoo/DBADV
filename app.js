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
const CAMPO_TELEFONE_ID = 'UF_CRM_1761804215';
const EMPRESA_FIXA = "Dutra Bitencourt Advocacia"; // Cliente mockado

// --- Funções de Lógica ---

function categorizarErro(num) {
    if (num.length < 11) return "Poucos caracteres (< 11)";
    if (num.length > 13) return "Muitos caracteres (> 13)";
    return "Comprimento inválido";
}

function padronizarTelefoneBrasil(input) {
    // VARIÁVEL CHAVE: Armazena o input original (bruto) antes de qualquer manipulação,
    // garantindo que o log mostre exatamente o que foi recebido.
    const inputOriginal = input || ''; 
    const DDI = '55';

    // 1. Limpa e isola o primeiro número da string (se houver vírgula, usa apenas o primeiro)
    const numLimpo = inputOriginal.split(',')[0].trim().replace(/\D/g, '');

    if (!inputOriginal || numLimpo.length === 0) 
        return { sucesso: false, valor: "Input vazio", statusDetail: "Input vazio", inputOriginal };

    // 2. Verifica o comprimento do número limpo
    // Aceita 11, 12 ou 13 dígitos (DDD + 9/8 dígitos ou DDI + DDD + 9/8 dígitos).
    if (![11, 12, 13].includes(numLimpo.length)) {
        const erroMsg = categorizarErro(numLimpo);
        // Retorna o input original e a mensagem de erro detalhada
        return { sucesso: false, valor: erroMsg, statusDetail: erroMsg, inputOriginal };
    }

    // 3. Adiciona DDI se necessário (Padronização)
    const valorPadronizado = numLimpo.startsWith(DDI)
        ? numLimpo
        : DDI + numLimpo;

    // Retorna o input original e o valor padronizado
    return { sucesso: true, valor: valorPadronizado, statusDetail: "Telefone Padronizado", inputOriginal };
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
            [CAMPO_FIXO_ID]: resultado.sucesso ? STATUS_BITRIX_SUCESSO : STATUS_BITRIX_FALHA
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

// Renomeado para 'registrarLogAgregado' para diferenciar da auditoria
async function registrarLogAgregado(resultado, empresa, aplicacao) {
    const sucesso = resultado.sucesso ? 1 : 0;
    const falha = resultado.sucesso ? 0 : 1;

    try {
        // Usa a função original salvarLog para logs agregados
        await salvarLog(empresa, aplicacao, sucesso, falha, 1);
    } catch (err) {
        console.error("[LOG] Erro ao salvar log agregado:", err.message);
    }
}

// NOVA FUNÇÃO: Registra o log na tabela audit_log_requests
async function registrarLogAuditoria(empresa, aplicacao, resultadoPadronizacao, leadId) {
    // Usa 'SUCESS' ou 'FAIL' conforme a nova estrutura da tabela
    const status = resultadoPadronizacao.sucesso ? "SUCESS" : "FAIL"; 
    
    // Constrói o novo statusDetail: Input Bruto + Resultado/Falha
    let detailMessage = `Input: ${resultadoPadronizacao.inputOriginal} | `;
    
    if (resultadoPadronizacao.sucesso) {
        detailMessage += `Resultado Padronizado: ${resultadoPadronizacao.valor}`;
    } else {
        detailMessage += `Falha: ${resultadoPadronizacao.statusDetail}`;
    }

    try {
        // Chama a nova função salvarAuditoria
        await salvarAuditoria(
            empresa,
            aplicacao, 
            status, 
            detailMessage, // Usa a mensagem detalhada
            leadId
        );
    } catch (err) {
        console.error("[LOG] Erro ao salvar log de auditoria:", err.message);
    }
}

// --- ROTAS ---

// ROTA GET (Bitrix chamando via URL)
app.get('/', async (req, res) => {
    const { telefoneInput: tel, leadId } = req.query;
    const APLICACAO = "Correção de telefone";
    const EMPRESA = EMPRESA_FIXA;

    if (!tel || !leadId) {
        // Resultado de erro específico para falta de parâmetros
        const resultadoErro = { sucesso: false, valor: "Parâmetros faltando", statusDetail: "Parâmetros faltando (tel ou leadId)", inputOriginal: tel || '' };
        
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId || 'N/A');
        
        return res.status(400).send("Erro: parâmetros faltando");
    }

    const resultado = padronizarTelefoneBrasil(tel);
    
    // 1. Atualiza o Bitrix
    await atualizarBitrix(leadId, resultado);

    // 2. Log Agregado
    await registrarLogAgregado(resultado, EMPRESA, APLICACAO);
    
    // 3. Log de Auditoria
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
    const telefone = req.body.phone || req.body.telefone || "";

    try {
        const resultado = padronizarTelefoneBrasil(telefone);

        // 1. Log Agregado
        await registrarLogAgregado(resultado, EMPRESA, APLICACAO);
        
        // 2. Log de Auditoria
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultado, leadId);

        res.status(200).send('OK');
    } catch (erro) {
        // Resultado de erro específico para erro interno no servidor
        const resultadoErro = { sucesso: false, valor: `Erro interno: ${erro.message}`, statusDetail: "Erro interno do servidor", inputOriginal: telefone };

        // 1. Log Agregado de Falha
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);

        // 2. Log de Auditoria de Falha
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        console.error("[WEBHOOK] Erro:", erro.message);
        res.status(500).send('Erro interno');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado porta ${PORT}`);
});
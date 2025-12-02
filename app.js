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
    // A verificação de < 11 é suficiente, pois 11, 12 e 13 agora são aceitos
    if (num.length < 11) return "Poucos caracteres. DDD (2) + Número (9) obrigatório, ou DDI + DDD + Número.";
    if (num.length > 13) return "Muitos caracteres (> 13)";
    return "Comprimento inválido";
}

function padronizarTelefoneBrasil(input) {
    // VARIÁVEL CHAVE: Armazena o input original (bruto)
    const inputOriginal = input || ''; 
    const DDI = '55';

    // 1. OTIMIZAÇÃO DE LIMPEZA: Isola o primeiro número (quebra por vírgula)
    // e remove todos os não-dígitos APENAS dessa primeira parte.
    const numBruto = inputOriginal.split(',')[0] || '';
    const numLimpo = numBruto.trim().replace(/\D/g, '');

    // 2. VERIFICAÇÃO REFORÇADA PARA INPUT VAZIO/NULO
    if (numLimpo.length === 0) {
        const errorMsg = "Entrada vazia ou sem dígitos.";
        return { sucesso: false, valor: errorMsg, statusDetail: errorMsg, inputOriginal };
    }

    // 3. Verifica o comprimento do número limpo
    // Aceita 11 (DDD+9 digitos), 12 (DDI+DDD+8 digitos) ou 13 (DDI+DDD+9 digitos)
    if (![11, 12, 13].includes(numLimpo.length)) {
        const erroMsg = categorizarErro(numLimpo);
        return { sucesso: false, valor: erroMsg, statusDetail: erroMsg, inputOriginal };
    }

    // 4. Adiciona DDI se necessário (Padronização)
    // Se o número tiver 11 dígitos, ele não começará com '55', então o DDI será adicionado.
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

    // Determina o valor do status (STRING simples, conforme última confirmação)
    const statusValue = resultado.sucesso ? STATUS_BITRIX_SUCESSO : STATUS_BITRIX_FALHA;

    const payload = {
        id: leadId,
        fields: {
            // Se falha, limpa o campo do telefone e seta o status de falha
            [CAMPO_TELEFONE_ID]: resultado.sucesso ? resultado.valor : '', 
            // Enviar o status como STRING simples
            [CAMPO_FIXO_ID]: statusValue 
        }
    };

    try {
        const { data } = await axios.post(`${BITRIX_WEBHOOK}crm.lead.update`, payload);
        
        if (!data.result) {
            // Log detalhado de erro retornado pela API do Bitrix
            console.error("[BITRIX] Erro API: Falha ao atualizar lead. Descrição:", 
                          data.error_description, 
                          "Payload enviado:", 
                          JSON.stringify(payload));
        } else {
            // Log de sucesso
            console.log(`[BITRIX SUCESSO] Lead ID ${leadId} atualizado para status: ${statusValue}`);
        }
    } catch (e) {
        // Log detalhado de erro de rede/conexão
        console.error("[BITRIX] Erro de rede/conexão ao atualizar lead:", 
                      e.message, 
                      "Payload enviado:", 
                      JSON.stringify(payload));
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
    
    // Constrói o novo statusDetail: Input Bruto | Resultado/Falha
    let detailMessage = `Input: ${resultadoPadronizacao.inputOriginal} | `;
    
    if (resultadoPadronizacao.sucesso) {
        // Formato para Sucesso: Input (parâmetro) | Resultado (telefone tratado)
        detailMessage += `Resultado: ${resultadoPadronizacao.valor}`;
    } else {
        // Formato para Falha: Input (parâmetro) | Falha: [Motivo]
        detailMessage += `Falha: ${resultadoPadronizacao.statusDetail}`;
    }

    try {
        // Chama a nova função salvarAuditoria
        await salvarAuditoria(
            empresa,
            aplicacao, 
            status, 
            detailMessage, // Usa a mensagem detalhada formatada
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

    // Lógica 1: Se leadId está faltando (impossível atualizar o Bitrix)
    if (!leadId) {
        const resultadoErro = { sucesso: false, valor: "Lead ID faltando", statusDetail: "Lead ID faltando", inputOriginal: tel || '' };
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, 'N/A');
        return res.status(400).send("Erro: leadId faltando");
    }
    
    // Lógica 2 (FALHA IMEDIATA): Se o telefone estiver faltando ou vazio.
    if (!tel || tel.trim() === '') {
        const resultadoErro = { sucesso: false, valor: "Telefone de entrada vazio/nulo", statusDetail: "Telefone de entrada vazio/nulo", inputOriginal: tel || '' };
        
        // 1. Atualiza o Bitrix imediatamente para FALHA (3026)
        await atualizarBitrix(leadId, resultadoErro);
        
        // 2. Log Agregado e 3. Log de Auditoria
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        // Retorna 200 OK informando a falha de padronização
        return res.status(200).json({
            sucesso: resultadoErro.sucesso,
            lead: leadId,
            valor: resultadoErro.valor
        });
    }

    // Lógica 3: Processamento padrão (Telefone e LeadId presentes e telefone não vazio)
    const resultado = padronizarTelefoneBrasil(tel);
    
    // 1. Atualiza o Bitrix (usará sucesso ou falha do padronizador)
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

    // Lógica 1: Se leadId está faltando (impossível atualizar o Bitrix)
    if (leadId === 'N/A') {
        const resultadoErro = { sucesso: false, valor: "Lead ID faltando no payload", statusDetail: "Lead ID faltando", inputOriginal: telefone };
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        return res.status(400).send('Erro: Lead ID faltando');
    }

    // Lógica 2 (FALHA IMEDIATA): Se o telefone estiver vazio.
    if (telefone.trim() === '') {
        const resultadoErro = { sucesso: false, valor: "Telefone de entrada vazio/nulo", statusDetail: "Telefone de entrada vazio/nulo", inputOriginal: telefone };
        
        // 1. Atualiza o Bitrix imediatamente para FALHA (3026)
        await atualizarBitrix(leadId, resultadoErro);
        
        // 2. Log Agregado e 3. Log de Auditoria
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        // Retorna 200 OK (Comunicação de falha de padronização bem-sucedida)
        return res.status(200).send('OK (Telefone Vazio/Falha)');
    }

    // Lógica 3: Processamento padrão (Telefone e LeadId presentes e telefone não vazio)
    try {
        const resultado = padronizarTelefoneBrasil(telefone);

        // 1. Atualiza o Bitrix (usará sucesso ou falha do padronizador)
        await atualizarBitrix(leadId, resultado);

        // 2. Log Agregado e 3. Log de Auditoria
        await registrarLogAgregado(resultado, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultado, leadId);

        res.status(200).send('OK');
    } catch (erro) {
        // Bloco de erro interno (mantido)
        const resultadoErro = { sucesso: false, valor: `Erro interno: ${erro.message}`, statusDetail: "Erro interno do servidor", inputOriginal: telefone };

        // 1. Atualiza o Bitrix (Em caso de erro interno, registra a falha no Bitrix)
        await atualizarBitrix(leadId, resultadoErro); 
        
        // 2. Log Agregado de Falha e 3. Log de Auditoria de Falha
        await registrarLogAgregado(resultadoErro, EMPRESA, APLICACAO);
        await registrarLogAuditoria(EMPRESA, APLICACAO, resultadoErro, leadId);
        
        console.error("[WEBHOOK] Erro:", erro.message);
        res.status(500).send('Erro interno');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado porta ${PORT}`);
});
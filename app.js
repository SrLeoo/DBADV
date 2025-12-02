const express = require('express');
const { salvarLog } = require('./conexao.js');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 80;
const { BITRIX_WEBHOOK } = process.env;

// Constantes para os códigos de status
const STATUS_SUCESSO = '2872';
const STATUS_FALHA = '3026';  
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

    // Validação de comprimento: aceita 13, 12 ou 11 dígitos.
    // 13: (DDI+DDD+9+8) - Móvel completo
    // 12: (DDI+DDD+8)   - Fixo completo (NOVA REGRA)
    // 11: (DDD+9+8)     - Móvel sem DDI
    if (num.length !== 13 && num.length !== 12 && !(num.length === 11 && !num.startsWith(DDI))) {
        console.log(`[PADRONIZADOR] Falha: ${num.length} dígitos. Retornando erro para o log.`);
        // Retorna a mensagem de erro
        return { sucesso: false, valor: categorizarErro(num) };
    }


    const valor = num.startsWith(DDI) ? num : (num.length === 11 || num.length === 12 ? DDI + num : null);

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
    
    const valorTelefone = resultadoPadronizacao.sucesso ? resultadoPadronizacao.valor : '';
    
    const valorFixo = resultadoPadronizacao.sucesso ? STATUS_SUCESSO : STATUS_FALHA;

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

    await enviarParaBitrix24(leadId, resultado);

    res.json({ 
        processamento_sucesso: resultado.sucesso, 
        lead_id_atualizado: leadId, 
        valor_padronizado_log: resultado.valor,
        status_fixo_enviado: resultado.sucesso ? STATUS_SUCESSO : STATUS_FALHA
    });
    console.log("[REQ] Finalizada (200).");
});

app.listen(PORT, () => console.log(`Servidor Webhook rodando na porta ${PORT} (vFinal-Status).`));

// --- NOVA IMPLEMENTAÇÃO
app.use(express.json()); // Permite ler o JSON que o Bitrix manda

// Essa é a Rota (o endereço) que você vai colocar lá no Bitrix
app.post('/webhook-bitrix', async (req, res) => {
    try {
        console.log(" Chamada do BITRIX!");
        
        // 1. Pegar o telefone que veio do Bitrix (O formato depende do Bitrix)
        // Vamos supor que ele mande algo como: { "phone": "11999998888", "company": "Cliente X" }
        const telefoneRecebido = req.body.phone; 
        const nomeEmpresa = req.body.company || "Bitrix Indefinido";

        // 2. Usar sua lógica antiga
        const resultado = padronizarTelefoneBrasil(telefoneRecebido);
        
        // 3. Regra de Validação
        const ehValido = resultado && resultado.startsWith('55') && resultado.length >= 12;

        // 4. Salvar no Banco (Unitário)
        // Aqui salvamos 1 requisição por vez
        const sucesso = ehValido ? 1 : 0;
        const falha = ehValido ? 0 : 1;
        
        await salvarLog(nomeEmpresa, "Webhook Bitrix", sucesso, falha, 1);

        console.log(` Processado: ${telefoneRecebido} -> ${resultado}`);
        
        // 5. Responder pro Bitrix que deu tudo certo
        res.status(200).send('Recebido com sucesso!');

    } catch (erro) {
        console.error("Erro no processamento:", erro);
        res.status(500).send('Erro interno');
    }
});

// Coloca o servidor pra rodar na porta 3000
app.listen(3000, () => {
    console.log('Servidor rodando! Esperando o Bitrix chamar...');
});
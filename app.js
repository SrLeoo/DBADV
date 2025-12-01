const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

/**

 * * @param {string} input - 
 * @returns {string} 
 */
function padronizarTelefoneBrasil(input) {

    const DDI_BRASIL = '55';
    

    let numeroLimpo = input.replace(/\D/g, '');
    

    if (numeroLimpo.startsWith(DDI_BRASIL)) {
        return numeroLimpo;
    } 
    
    if (numeroLimpo.length === 11) {
        return DDI_BRASIL + numeroLimpo;
    }
    

    return numeroLimpo;
}

app.get('/', (req, res) => {

    const telefoneInput = req.query.id; 

    if (!telefoneInput) {

        const mensagem = "Erro: Parâmetro 'id' faltando. Use o formato: /?id=<seu_telefone>";
        console.log(`[ERRO] ${mensagem}`);
        return res.status(400).send(`<h1>${mensagem}</h1>`);
    }

    const telefonePadronizado = padronizarTelefoneBrasil(telefoneInput);


    console.log(`[SUCESSO] Input Recebido: ${telefoneInput}`);
    console.log(`[LOG TERMINAL] Output Padronizado: ${telefonePadronizado}`);

    res.json({
        input_recebido: telefoneInput,
        output_padronizado: telefonePadronizado
    });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}/?id=199961463213814`);
});
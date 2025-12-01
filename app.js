const express = require('express');
const app = express();

const PORT = process.env.PORT || 80;

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

    const idInput = req.query.id;
    const telefoneInput = req.query.telefone

    if (!telefoneInput) {

        console.log(`[ERRO] ${mensagem}`);
        return res.status(400).send(`<h1>${mensagem}</h1>`);
    }





    const telefonePadronizado = padronizarTelefoneBrasil(telefoneInput);


    console.log(`[SUCESSO] Input Recebido: ${telefoneInput}`);
    console.log(`[LOG TERMINAL] ID: ${idInput}`)
    console.log(`[LOG TERMINAL] Output Padronizado: ${telefonePadronizado}`);

    res.json({
        input_recebido: telefoneInput,
        output_padronizado: telefonePadronizado
    });
});


app.listen(PORT, () => {
    console.log(`Acesse: https://dbadv-correcaotelefone.squareweb.app/(parametro)`);
});
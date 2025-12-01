const telefoneInput = "199961463213814"; 

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

const telefonePadronizado = padronizarTelefoneBrasil(telefoneInput);

console.log(`Output Padronizado: ${telefonePadronizado}`);
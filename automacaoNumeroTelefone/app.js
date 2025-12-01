const { salvarLog } = require('./conexao'); // Importamos a conexão
//const telefoneInput = ""; // Comentei para poder usar uma lista de inputs

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

//const telefonePadronizado = padronizarTelefoneBrasil(telefoneInput);  // Comentei para poder usar uma lista de inputs

//console.log(`Output Padronizado: ${telefonePadronizado}`);  // Comentei para poder usar uma lista de inputs

// --- NOVA INTEGRAÇÃO ---
async function executarProcessamento() {
    // 1. Simulação das entradas (Requests)
    const listaDeTelefones = [
        "11999998888",      // Válido
        "(11) 91234-5678",  // Válido
        "123",              // Inválido - O código original retorna "123")
        "5511977776666",    // Válido
        ""                  // Inválido
    ];

    let sucessos = 0;
    let falhas = 0;

    console.log("🚀 Iniciando processamento...");

    // 2. Loop para processar e contar
    for (const telefone of listaDeTelefones) {
        const resultado = padronizarTelefoneBrasil(telefone);
        
        // !!! Sua função original retorna o número limpo mesmo se ele for inválido (ex: "123").
        // Como não sabia se podia mexer na função, eu validei o RESULTADO dela aqui fora.
        // Critério: Para ser sucesso, tem que ter virado um número com DDI 55 e tamanho aceitável (12 ou 13 dígitos)
        
        const ehValido = resultado.startsWith('55') && resultado.length >= 12;

        if (ehValido) {
            sucessos++;
        } else {
            falhas++;
        }
    }

    const total = sucessos + falhas;

    // 3. Salvar no Banco
    // Passando os parâmetros na ordem: company, aplication, sucesso, falha, total
    await salvarLog("Automatize", "App Padronizador", sucessos, falhas, total);
    
    console.log("🏁 Processo finalizado.");
    process.exit();
}

// Executa a nova integração
executarProcessamento();
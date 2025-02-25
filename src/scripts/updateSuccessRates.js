// src/scripts/updateSuccessRates.js
/**
 * Script para atualizar as taxas de sucesso em todas as campanhas
 * Um script rápido para executar diretamente no ambiente
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledMessage = require('../models/ScheduledMessage');
const RemarketingContinuo = require('../models/RemarketingContinuo');

async function updateSuccessRates() {
    try {
        console.log('Iniciando atualização das taxas de sucesso...');
        
        // Conecta ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://darkvips:lombarde1@147.79.111.143:27017/botenagaja', { 
            useNewUrlParser: true, 
            useUnifiedTopology: true, 
            authSource: 'admin'
        });
        
        console.log('Conectado ao MongoDB');
        
        // Busca todas as campanhas de remarketing contínuo
        const campaigns = await RemarketingContinuo.find();
        
        console.log(`Encontradas ${campaigns.length} campanhas para atualizar`);
        
        for (const campaign of campaigns) {
            // Pula campanhas sem mensagens enviadas
            if (campaign.stats.totalMessagesTriggered === 0) {
                console.log(`Campanha ${campaign._id}: Sem mensagens enviadas, mantendo taxa em 0`);
                continue;
            }
            
            // Conta mensagens enviadas com sucesso
            const successfulAttempts = await ScheduledMessage.countDocuments({
                remarketingContinuoId: campaign._id,
                status: 'sent'
            });
            
            // Conta tentativas totais
            const totalAttempts = await ScheduledMessage.countDocuments({
                remarketingContinuoId: campaign._id,
                status: { $in: ['sent', 'failed'] }
            });
            
            // Calcula taxa de sucesso
            let successRate = 0;
            
            if (totalAttempts > 0) {
                successRate = (successfulAttempts / totalAttempts) * 100;
                successRate = Math.round(successRate * 10) / 10; // Arredonda para 1 casa decimal
            } else if (successfulAttempts > 0) {
                // Se temos mensagens enviadas mas nenhuma falha
                successRate = 100;
            }
            
            console.log(`Campanha ${campaign._id}: ${successfulAttempts} mensagens enviadas, ${totalAttempts} tentativas, ${successRate}% taxa de sucesso`);
            
            // Atualiza a taxa de sucesso
            await RemarketingContinuo.findByIdAndUpdate(campaign._id, {
                $set: {
                    'stats.successRate': successRate
                }
            });
        }
        
        console.log('Taxas de sucesso atualizadas com sucesso');
        
        // Desconecta do MongoDB
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB');
        
    } catch (error) {
        console.error('Erro durante a atualização das taxas de sucesso:', error);
        process.exit(1);
    }
}

// Executa a função de atualização
updateSuccessRates();
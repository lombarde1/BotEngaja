// src/scripts/fixLeadCounters.js
/**
 * Script para corrigir contadores de leads processados
 * Execute este script uma vez para corrigir os contadores existentes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledMessage = require('../models/ScheduledMessage');
const RemarketingContinuo = require('../models/RemarketingContinuo');

async function fixLeadCounters() {
    try {
        console.log('Iniciando correção de contadores de leads...');
        
        // Conecta ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://darkvips:lombarde1@147.79.111.143:27017/botenagaja', { 
            useNewUrlParser: true, 
            useUnifiedTopology: true, 
            authSource: 'admin'
        });
        
        console.log('Conectado ao MongoDB');
        
        // Busca todas as campanhas de remarketing contínuo
        const campaigns = await RemarketingContinuo.find();
        
        console.log(`Encontradas ${campaigns.length} campanhas para verificar`);
        
        for (const campaign of campaigns) {
            // Agrupa por leadId para contar leads únicos que receberam mensagens
            const uniqueLeads = await ScheduledMessage.aggregate([
                {
                    $match: {
                        remarketingContinuoId: campaign._id,
                        status: 'sent'
                    }
                },
                {
                    $group: {
                        _id: '$leadId',
                        count: { $sum: 1 }
                    }
                },
                {
                    $count: 'totalLeads'
                }
            ]);
            
            const totalLeadsProcessed = uniqueLeads[0]?.totalLeads || 0;
            
            // Conta o total de mensagens enviadas
            const totalMessages = await ScheduledMessage.countDocuments({
                remarketingContinuoId: campaign._id,
                status: 'sent'
            });
            
            console.log(`Campanha ${campaign._id}: ${totalLeadsProcessed} leads, ${totalMessages} mensagens`);
            
            // Atualiza as estatísticas da campanha
            await RemarketingContinuo.findByIdAndUpdate(campaign._id, {
                $set: {
                    'stats.totalLeadsProcessed': totalLeadsProcessed,
                    'stats.totalMessagesTriggered': totalMessages
                }
            });
        }
        
        console.log('Contadores corrigidos com sucesso');
        
        // Desconecta do MongoDB
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB');
        
    } catch (error) {
        console.error('Erro durante a correção de contadores:', error);
        process.exit(1);
    }
}

// Executa a função de correção
fixLeadCounters();
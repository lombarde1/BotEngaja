// src/scripts/cleanupScheduledMessages.js
/**
 * Script para limpeza de mensagens agendadas antigas
 * Recomendado executar como um cronjob diário
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledMessage = require('../models/ScheduledMessage');

async function cleanupOldMessages() {
    try {
        console.log('Iniciando limpeza de mensagens agendadas antigas...');
        
        // Conecta ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:root@cpanel.higorlabs.site:29084', { 
            useNewUrlParser: true, 
            useUnifiedTopology: true, 
            authSource: 'admin'
        });
        
        console.log('Conectado ao MongoDB');
        
        // Define datas de corte
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        // Remove mensagens enviadas há mais de um mês
        const sentResult = await ScheduledMessage.deleteMany({
            status: 'sent',
            sentAt: { $lt: oneMonthAgo }
        });
        
        console.log(`Removidas ${sentResult.deletedCount} mensagens enviadas há mais de um mês`);
        
        // Remove mensagens com falha há mais de uma semana
        const failedResult = await ScheduledMessage.deleteMany({
            status: 'failed',
            createdAt: { $lt: oneWeekAgo }
        });
        
        console.log(`Removidas ${failedResult.deletedCount} mensagens com falha há mais de uma semana`);
        
        // Remove mensagens canceladas há mais de uma semana
        const cancelledResult = await ScheduledMessage.deleteMany({
            status: 'cancelled',
            createdAt: { $lt: oneWeekAgo }
        });
        
        console.log(`Removidas ${cancelledResult.deletedCount} mensagens canceladas há mais de uma semana`);
        
        console.log('Limpeza concluída com sucesso');
        
        // Desconecta do MongoDB
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB');
        
    } catch (error) {
        console.error('Erro durante a limpeza:', error);
        process.exit(1);
    }
}

// Executa a função de limpeza
cleanupOldMessages();
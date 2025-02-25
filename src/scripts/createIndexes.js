// src/scripts/createIndexes.js
/**
 * Script para criar índices necessários para performance
 * Recomendado executar uma vez durante a configuração do sistema
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ScheduledMessage = require('../models/ScheduledMessage');
const RemarketingContinuo = require('../models/RemarketingContinuo');
const Lead = require('../models/Lead');

async function createIndexes() {
    try {
        console.log('Iniciando criação de índices...');
        
        // Conecta ao MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://darkvips:lombarde1@147.79.111.143:27017/botenagaja', { 
            useNewUrlParser: true, 
            useUnifiedTopology: true, 
            authSource: 'admin'
        });
        
        console.log('Conectado ao MongoDB');
        
        // Cria índices para ScheduledMessage
        console.log('Criando índices para ScheduledMessage...');
        await ScheduledMessage.collection.createIndex({ status: 1, scheduledTime: 1 });
        await ScheduledMessage.collection.createIndex({ remarketingContinuoId: 1, status: 1 });
        await ScheduledMessage.collection.createIndex({ leadId: 1 });
        await ScheduledMessage.collection.createIndex({ telegramId: 1 });
        
        // Cria índices para RemarketingContinuo
        console.log('Criando índices para RemarketingContinuo...');
        await RemarketingContinuo.collection.createIndex({ botId: 1, isActive: 1 });
        await RemarketingContinuo.collection.createIndex({ userId: 1 });
        
        // Cria índices para Lead
        console.log('Criando índices para Lead...');
        await Lead.collection.createIndex({ botId: 1, telegramId: 1 }, { unique: true });
        await Lead.collection.createIndex({ botId: 1, isActive: 1 });
        await Lead.collection.createIndex({ botId: 1, tags: 1 });
        await Lead.collection.createIndex({ lastInteraction: 1 });
        
        console.log('Índices criados com sucesso');
        
        // Desconecta do MongoDB
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB');
        
    } catch (error) {
        console.error('Erro durante a criação de índices:', error);
        process.exit(1);
    }
}

// Executa a função de criação de índices
createIndexes();
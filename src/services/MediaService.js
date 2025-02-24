// src/services/MediaService.js
const { Telegraf } = require('telegraf');
const Bot = require('../models/Bot');

class MediaService {
    async getMediaUrl(botId, fileId, userId) {
        try {
            // Busca o bot
            const bot = await Bot.findOne({ _id: botId, userId });
            if (!bot) {
                throw new Error('Bot não encontrado');
            }

            // Cria instância do bot
            const telegram = new Telegraf(bot.token).telegram;

            // Obtém o link do arquivo
            const fileLink = await telegram.getFileLink(fileId);
            
            return fileLink.href;
        } catch (error) {
            console.error('Erro ao obter URL da mídia:', error);
            throw error;
        }
    }

    async getFileInfo(botId, fileId, userId) {
        try {
            const bot = await Bot.findOne({ _id: botId, userId });
            if (!bot) {
                throw new Error('Bot não encontrado');
            }

            const telegram = new Telegraf(bot.token).telegram;
            return await telegram.getFile(fileId);
        } catch (error) {
            console.error('Erro ao obter informações do arquivo:', error);
            throw error;
        }
    }
}

module.exports = new MediaService();
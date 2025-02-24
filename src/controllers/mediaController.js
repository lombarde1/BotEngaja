// src/controllers/mediaController.js
const MediaService = require('../services/MediaService');

exports.getMediaUrl = async (req, res) => {
    try {
        const { botId, fileId } = req.params;
        const userId = req.userId;

        const url = await MediaService.getMediaUrl(botId, fileId, userId);
        res.json({ url });
    } catch (error) {
        console.error('Erro ao obter URL da mídia:', error);
        res.status(400).json({ error: 'Erro ao obter URL da mídia' });
    }
};

exports.getFileInfo = async (req, res) => {
    try {
        const { botId, fileId } = req.params;
        const userId = req.userId;

        const fileInfo = await MediaService.getFileInfo(botId, fileId, userId);
        res.json(fileInfo);
    } catch (error) {
        console.error('Erro ao obter informações do arquivo:', error);
        res.status(400).json({ error: 'Erro ao obter informações do arquivo' });
    }
};
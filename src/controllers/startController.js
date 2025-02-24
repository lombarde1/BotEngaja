// src/controllers/startController.js
const StartConfig = require('../models/StartConfig');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');

exports.createStartConfig = async (req, res) => {
    try {
        const { botId, flowId } = req.body;
        const userId = req.userId;

        // Verifica se o bot existe e pertence ao usuário
        const bot = await Bot.findOne({ _id: botId, userId });
        if (!bot) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        // Verifica se o fluxo existe e pertence ao usuário
        const flow = await Flow.findOne({ _id: flowId, userId });
        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        // Verifica se já existe configuração para este bot
        const existingConfig = await StartConfig.findOne({ botId });
        if (existingConfig) {
            return res.status(400).json({ 
                error: 'Já existe uma configuração de início para este bot',
                existingId: existingConfig._id
            });
        }

        // Cria a configuração
        const startConfig = await StartConfig.create({
            botId,
            flowId,
            userId,
            isActive: true
        });

        res.status(201).json(startConfig);
    } catch (error) {
        console.error('Erro ao criar configuração de início:', error);
        res.status(400).json({ error: 'Erro ao criar configuração de início' });
    }
};

exports.listStartConfigs = async (req, res) => {
    try {
        const userId = req.userId;
        const configs = await StartConfig.find({ userId })
            .populate('botId', 'name')
            .populate('flowId', 'name')
            .sort('-createdAt');

        res.json(configs);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao listar configurações de início' });
    }
};

exports.getStartConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;

        const config = await StartConfig.findOne({ _id: configId, userId })
            .populate('botId', 'name')
            .populate('flowId', 'name');

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json(config);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao buscar configuração de início' });
    }
};

exports.getStartConfigByBot = async (req, res) => {
    try {
        const { botId } = req.params;
        const userId = req.userId;

        const config = await StartConfig.findOne({ botId, userId })
            .populate('botId', 'name')
            .populate('flowId', 'name');

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json(config);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao buscar configuração de início' });
    }
};

exports.updateStartConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;
        const updates = req.body;

        // Remove campos que não podem ser atualizados
        delete updates.userId;
        delete updates.botId;
        delete updates.stats;

        if (updates.flowId) {
            // Verifica se o novo fluxo existe e pertence ao usuário
            const flow = await Flow.findOne({ _id: updates.flowId, userId });
            if (!flow) {
                return res.status(404).json({ error: 'Fluxo não encontrado' });
            }
        }

        const config = await StartConfig.findOneAndUpdate(
            { _id: configId, userId },
            updates,
            { new: true, runValidators: true }
        );

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json(config);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar configuração de início' });
    }
};

exports.deleteStartConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;

        const config = await StartConfig.findOneAndDelete({ _id: configId, userId });

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json({ message: 'Configuração de início removida com sucesso' });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao remover configuração de início' });
    }
};
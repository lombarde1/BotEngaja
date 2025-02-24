// src/controllers/welcomeController.js
const WelcomeConfig = require('../models/WelcomeConfig');
const Group = require('../models/Group');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');

exports.createWelcomeConfig = async (req, res) => {
    try {
        const { groupId, flowId } = req.body;
        const userId = req.userId;

        // Verifica se o grupo existe e pertence ao usuário
        const group = await Group.findOne({ _id: groupId, userId });
        if (!group) {
            return res.status(404).json({ error: 'Grupo não encontrado' });
        }

        // Verifica se o fluxo existe e pertence ao usuário
        const flow = await Flow.findOne({ _id: flowId, userId });
        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        // Verifica se já existe configuração para este grupo
        const existingConfig = await WelcomeConfig.findOne({ groupId });
        if (existingConfig) {
            return res.status(400).json({ error: 'Já existe uma configuração de boas-vindas para este grupo' });
        }

        // Cria a configuração
        const welcomeConfig = await WelcomeConfig.create({
            groupId,
            flowId,
            botId: group.botId,
            userId,
            isActive: true
        });

        res.status(201).json(welcomeConfig);
    } catch (error) {
        console.error('Erro ao criar configuração de boas-vindas:', error);
        res.status(400).json({ error: 'Erro ao criar configuração de boas-vindas' });
    }
};

exports.listWelcomeConfigs = async (req, res) => {
    try {
        const userId = req.userId;
        const configs = await WelcomeConfig.find({ userId })
            .populate('groupId', 'title')
            .populate('flowId', 'name')
            .populate('botId', 'name');

        res.json(configs);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao listar configurações de boas-vindas' });
    }
};

exports.getWelcomeConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;

        const config = await WelcomeConfig.findOne({ _id: configId, userId })
            .populate('groupId', 'title')
            .populate('flowId', 'name')
            .populate('botId', 'name');

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json(config);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao buscar configuração de boas-vindas' });
    }
};

exports.updateWelcomeConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;
        const updates = req.body;

        // Remove campos que não podem ser atualizados
        delete updates.userId;
        delete updates.botId;
        delete updates.groupId;
        delete updates.stats;

        if (updates.flowId) {
            // Verifica se o novo fluxo existe e pertence ao usuário
            const flow = await Flow.findOne({ _id: updates.flowId, userId });
            if (!flow) {
                return res.status(404).json({ error: 'Fluxo não encontrado' });
            }
        }

        const config = await WelcomeConfig.findOneAndUpdate(
            { _id: configId, userId },
            updates,
            { new: true, runValidators: true }
        );

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json(config);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar configuração de boas-vindas' });
    }
};

exports.deleteWelcomeConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const userId = req.userId;

        const config = await WelcomeConfig.findOneAndDelete({ _id: configId, userId });

        if (!config) {
            return res.status(404).json({ error: 'Configuração não encontrada' });
        }

        res.json({ message: 'Configuração de boas-vindas removida com sucesso' });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao remover configuração de boas-vindas' });
    }
};
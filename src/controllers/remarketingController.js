// src/controllers/remarketingController.js
const RemarketingCampaign = require('../models/RemarketingCampaign');
const Lead = require('../models/Lead');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');
const RemarketingService = require('../services/RemarketingService');

exports.createCampaign = async (req, res) => {
    try {
        const { name, description, botId, flowId, filter, schedule, throttling } = req.body;
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

        // Valida o agendamento
        if (schedule) {
            // Verifica se a data de início está no futuro
            if (schedule.startDate && new Date(schedule.startDate) <= new Date()) {
                return res.status(400).json({ error: 'Data de início deve ser no futuro' });
            }

            // Verifica formato do horário
            if (schedule.timeOfDay && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(schedule.timeOfDay)) {
                return res.status(400).json({ error: 'Formato de horário inválido. Use o formato HH:MM (24h)' });
            }

            // Para agendamentos semanais, requer dias da semana
            if (schedule.type === 'weekly' && (!schedule.daysOfWeek || !schedule.daysOfWeek.length)) {
                return res.status(400).json({ error: 'Dias da semana são obrigatórios para agendamentos semanais' });
            }
        }

        // Cria a campanha
        const campaign = await RemarketingCampaign.create({
            name,
            description,
            botId,
            userId,
            flowId,
            filter: filter || {},
            schedule: schedule || { type: 'once' },
            throttling: throttling || { messagesPerMinute: 20, delayBetweenMessages: 1 },
            status: 'draft'
        });

        // Atualiza a próxima execução
        if (schedule && schedule.startDate) {
            await RemarketingService.updateNextRun(campaign);
        }

        res.status(201).json(campaign);
    } catch (error) {
        console.error('Erro ao criar campanha:', error);
        res.status(400).json({ error: 'Erro ao criar campanha de remarketing' });
    }
};

exports.listCampaigns = async (req, res) => {
    try {
        const { botId, status, page = 1, limit = 20 } = req.query;
        const userId = req.userId;

        const query = { userId };

        if (botId) {
            // Verifica se o bot pertence ao usuário
            const bot = await Bot.findOne({ _id: botId, userId });
            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }
            query.botId = botId;
        }

        if (status) {
            query.status = status;
        }

        const options = {
            skip: (page - 1) * limit,
            limit: parseInt(limit),
            sort: { updatedAt: -1 }
        };

        const campaigns = await RemarketingCampaign.find(query, null, options)
            .populate('botId', 'name')
            .populate('flowId', 'name');

        const total = await RemarketingCampaign.countDocuments(query);

        res.json({
            campaigns,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erro ao listar campanhas:', error);
        res.status(400).json({ error: 'Erro ao listar campanhas de remarketing' });
    }
};

exports.getCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId })
            .populate('botId', 'name')
            .populate('flowId', 'name');

        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        res.json(campaign);
    } catch (error) {
        console.error('Erro ao buscar campanha:', error);
        res.status(400).json({ error: 'Erro ao buscar campanha de remarketing' });
    }
};

exports.updateCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;
        const updates = req.body;

        // Remove campos que não podem ser atualizados
        delete updates.userId;
        delete updates.stats;

        // Impede a atualização de campanhas em execução
        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Não é possível atualizar uma campanha em execução' });
        }

        // Verifica se o bot pertence ao usuário
        if (updates.botId) {
            const bot = await Bot.findOne({ _id: updates.botId, userId });
            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }
        }

        // Verifica se o fluxo pertence ao usuário
        if (updates.flowId) {
            const flow = await Flow.findOne({ _id: updates.flowId, userId });
            if (!flow) {
                return res.status(404).json({ error: 'Fluxo não encontrado' });
            }
        }

        // Valida o agendamento
        if (updates.schedule) {
            // Verifica se a data de início está no futuro para novas campanhas
            if (campaign.status === 'draft' && updates.schedule.startDate && new Date(updates.schedule.startDate) <= new Date()) {
                return res.status(400).json({ error: 'Data de início deve ser no futuro' });
            }

            // Verifica formato do horário
            if (updates.schedule.timeOfDay && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(updates.schedule.timeOfDay)) {
                return res.status(400).json({ error: 'Formato de horário inválido. Use o formato HH:MM (24h)' });
            }

            // Para agendamentos semanais, requer dias da semana
            if (updates.schedule.type === 'weekly' && (!updates.schedule.daysOfWeek || !updates.schedule.daysOfWeek.length)) {
                return res.status(400).json({ error: 'Dias da semana são obrigatórios para agendamentos semanais' });
            }
        }

        const updatedCampaign = await RemarketingCampaign.findOneAndUpdate(
            { _id: campaignId, userId },
            updates,
            { new: true, runValidators: true }
        );

        // Atualiza a próxima execução
        if (updates.schedule || updates.status === 'scheduled') {
            await RemarketingService.updateNextRun(updatedCampaign);
        }

        res.json(updatedCampaign);
    } catch (error) {
        console.error('Erro ao atualizar campanha:', error);
        res.status(400).json({ error: 'Erro ao atualizar campanha de remarketing' });
    }
};

exports.deleteCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        // Verifica se a campanha está em execução
        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Não é possível excluir uma campanha em execução' });
        }

        await RemarketingCampaign.findOneAndDelete({ _id: campaignId, userId });

        res.json({ message: 'Campanha removida com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir campanha:', error);
        res.status(400).json({ error: 'Erro ao excluir campanha de remarketing' });
    }
};

exports.scheduleCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { scheduleNow } = req.body;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status !== 'draft' && campaign.status !== 'paused') {
            return res.status(400).json({ error: 'Apenas campanhas em rascunho ou pausadas podem ser agendadas' });
        }

        // Se for para agendar agora, define a data de início para agora + 1 minuto
        if (scheduleNow) {
            const startDate = new Date();
            startDate.setMinutes(startDate.getMinutes() + 1);
            
            campaign.schedule.startDate = startDate;
            campaign.schedule.type = 'once'; // Execução única
        } else if (!campaign.schedule.startDate) {
            return res.status(400).json({ error: 'Data de início não definida' });
        }

        campaign.status = 'scheduled';
        await campaign.save();

        // Atualiza a próxima execução
        await RemarketingService.updateNextRun(campaign);

        res.json(campaign);
    } catch (error) {
        console.error('Erro ao agendar campanha:', error);
        res.status(400).json({ error: 'Erro ao agendar campanha de remarketing' });
    }
};

exports.pauseCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status !== 'scheduled' && campaign.status !== 'running') {
            return res.status(400).json({ error: 'Apenas campanhas agendadas ou em execução podem ser pausadas' });
        }

        campaign.status = 'paused';
        await campaign.save();

        res.json(campaign);
    } catch (error) {
        console.error('Erro ao pausar campanha:', error);
        res.status(400).json({ error: 'Erro ao pausar campanha de remarketing' });
    }
};

exports.cancelCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status === 'completed' || campaign.status === 'cancelled') {
            return res.status(400).json({ error: 'Campanha já finalizada ou cancelada' });
        }

        campaign.status = 'cancelled';
        await campaign.save();

        res.json(campaign);
    } catch (error) {
        console.error('Erro ao cancelar campanha:', error);
        res.status(400).json({ error: 'Erro ao cancelar campanha de remarketing' });
    }
};

exports.testCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { telegramId } = req.body;
        const userId = req.userId;

        if (!telegramId) {
            return res.status(400).json({ error: 'ID do Telegram é obrigatório' });
        }

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId })
            .populate('flowId')
            .populate('botId');
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (!campaign.flowId) {
            return res.status(400).json({ error: 'Fluxo não configurado' });
        }

        // Verifica se o lead existe
        const lead = await Lead.findOne({ 
            botId: campaign.botId._id,
            telegramId,
            isActive: true
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado ou inativo' });
        }

        // Envia teste
        const result = await RemarketingService.sendTestMessage(campaign, lead);

        if (!result.success) {
            return res.status(400).json({ error: result.message });
        }

        res.json({ 
            success: true, 
            message: 'Teste enviado com sucesso',
            details: result.details
        });
    } catch (error) {
        console.error('Erro ao testar campanha:', error);
        res.status(400).json({ error: 'Erro ao testar campanha de remarketing' });
    }
};

exports.getTargetedLeads = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId });
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        // Constrói a query baseada nos filtros da campanha
        const query = { 
            botId: campaign.botId,
            userId,
            isActive: true
        };

        if (campaign.filter.tags && campaign.filter.tags.length > 0) {
            query.tags = { $in: campaign.filter.tags };
        }

        if (campaign.filter.lastInteractionDays) {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - campaign.filter.lastInteractionDays);
            query.lastInteraction = { $gte: daysAgo };
        }

        if (campaign.filter.customFields) {
            for (const [key, value] of Object.entries(campaign.filter.customFields)) {
                query[`customFields.${key}`] = value;
            }
        }

        const options = {
            skip: (page - 1) * limit,
            limit: parseInt(limit),
            sort: { lastInteraction: -1 }
        };

        const leads = await Lead.find(query, null, options);
        const total = await Lead.countDocuments(query);

        res.json({
            leads,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erro ao buscar leads alvo:', error);
        res.status(400).json({ error: 'Erro ao buscar leads alvo' });
    }
};

exports.executeNow = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        const campaign = await RemarketingCampaign.findOne({ _id: campaignId, userId })
            .populate('flowId')
            .populate('botId');
        
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Campanha já está em execução' });
        }

        // Inicia a execução de forma assíncrona
        RemarketingService.executeRemarketingCampaign(campaign)
            .catch(error => console.error(`Erro ao executar campanha ${campaignId}:`, error));

        // Atualiza o status para "running"
        campaign.status = 'running';
        await campaign.save();

        res.json({ 
            success: true,
            message: 'Campanha iniciada com sucesso',
            campaign
        });
    } catch (error) {
        console.error('Erro ao executar campanha:', error);
        res.status(400).json({ error: 'Erro ao executar campanha de remarketing' });
    }
};
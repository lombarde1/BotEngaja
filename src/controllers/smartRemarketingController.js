// src/controllers/smartRemarketingController.js
const SmartRemarketingCampaign = require('../models/SmartRemarketingCampaign');
const LeadSequenceProgress = require('../models/LeadSequenceProgress');
const Lead = require('../models/Lead');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');
const SmartRemarketingService = require('../services/SmartRemarketingService');

exports.createCampaign = async (req, res) => {
    try {
        const { name, description, botId, sequence, filter, throttling } = req.body;
        const userId = req.userId;

        // Verifica se o bot existe e pertence ao usuário
        const bot = await Bot.findOne({ _id: botId, userId });
        if (!bot) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        // Verifica se os fluxos existem e pertencem ao usuário
        // E valida os parâmetros de tempo
        if (sequence && sequence.length > 0) {
            for (let i = 0; i < sequence.length; i++) {
                const step = sequence[i];
                
                // Verifica se o fluxo existe
                const flow = await Flow.findOne({ _id: step.flowId, userId });
                if (!flow) {
                    return res.status(404).json({ 
                        error: 'Fluxo não encontrado',
                        details: `Fluxo ${step.flowId} não encontrado ou não pertence ao usuário`
                    });
                }
                
                // Valida os parâmetros de tempo
                if (!step.timeInterval || !step.timeInterval.value || !step.timeInterval.unit) {
                    return res.status(400).json({
                        error: 'Configuração de tempo inválida',
                        details: `O passo ${i+1} deve ter um intervalo de tempo válido`
                    });
                }
                
                // Valida unidade de tempo
                if (!['minutes', 'hours', 'days'].includes(step.timeInterval.unit)) {
                    return res.status(400).json({
                        error: 'Unidade de tempo inválida',
                        details: `O passo ${i+1} tem uma unidade de tempo inválida. Use 'minutes', 'hours' ou 'days'`
                    });
                }
                
                // Valida timeOfDay apenas para dias
                if (step.timeInterval.unit !== 'days' && step.timeOfDay) {
                    return res.status(400).json({
                        error: 'Configuração de tempo inválida',
                        details: `O passo ${i+1} não pode ter timeOfDay configurado quando a unidade não é 'days'`
                    });
                }
                
                // Valida formato de timeOfDay
                if (step.timeOfDay && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(step.timeOfDay)) {
                    return res.status(400).json({
                        error: 'Formato de horário inválido',
                        details: `O passo ${i+1} tem um formato de timeOfDay inválido. Use o formato HH:MM (24h)`
                    });
                }
                
                // Verifica se os passos estão em ordem cronológica
                if (i > 0) {
                    const prevStep = sequence[i-1];
                    const prevTimeInMinutes = this.convertToMinutes(prevStep.timeInterval);
                    const currTimeInMinutes = this.convertToMinutes(step.timeInterval);
                    
                    if (currTimeInMinutes <= prevTimeInMinutes) {
                        return res.status(400).json({
                            error: 'Sequência de tempo inválida',
                            details: `O passo ${i+1} deve ocorrer depois do passo ${i}`
                        });
                    }
                }
            }
        }

        // Cria a campanha
        const campaign = await SmartRemarketingService.createCampaign({
            name,
            description,
            botId,
            userId,
            sequence: sequence || [],
            filter: filter || {},
            throttling: throttling || { messagesPerMinute: 20, delayBetweenMessages: 1 },
            isActive: false // Começa desativada para configuração
        });

        res.status(201).json(campaign);
    } catch (error) {
        console.error('Erro ao criar campanha de remarketing inteligente:', error);
        res.status(400).json({ error: 'Erro ao criar campanha de remarketing inteligente' });
    }
};

exports.convertToMinutes = (timeInterval) => {
    switch (timeInterval.unit) {
        case 'minutes':
            return timeInterval.value;
        case 'hours':
            return timeInterval.value * 60;
        case 'days':
            return timeInterval.value * 24 * 60;
        default:
            return 0;
    }
};


exports.listCampaigns = async (req, res) => {
    try {
        const { botId, isActive, page = 1, limit = 20 } = req.query;
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

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        const options = {
            skip: (page - 1) * limit,
            limit: parseInt(limit),
            sort: { updatedAt: -1 }
        };

        const campaigns = await SmartRemarketingCampaign.find(query, null, options)
            .populate('botId', 'name')
            .populate({
                path: 'sequence.flowId',
                select: 'name'
            });

        const total = await SmartRemarketingCampaign.countDocuments(query);

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
        res.status(400).json({ error: 'Erro ao listar campanhas de remarketing inteligente' });
    }
};

exports.getCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        const campaign = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId })
            .populate('botId', 'name')
            .populate({
                path: 'sequence.flowId',
                select: 'name'
            });

        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        res.json(campaign);
    } catch (error) {
        console.error('Erro ao buscar campanha:', error);
        res.status(400).json({ error: 'Erro ao buscar campanha de remarketing inteligente' });
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

        // Verifica se a campanha existe e pertence ao usuário
        const campaign = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        // Verifica se o bot pertence ao usuário
        if (updates.botId) {
            const bot = await Bot.findOne({ _id: updates.botId, userId });
            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }
        }

        // Verifica se os fluxos existem e pertencem ao usuário
        // E valida os parâmetros de tempo
        if (updates.sequence && updates.sequence.length > 0) {
            for (let i = 0; i < updates.sequence.length; i++) {
                const step = updates.sequence[i];
                
                // Verifica se o fluxo existe
                const flow = await Flow.findOne({ _id: step.flowId, userId });
                if (!flow) {
                    return res.status(404).json({ 
                        error: 'Fluxo não encontrado',
                        details: `Fluxo ${step.flowId} não encontrado ou não pertence ao usuário`
                    });
                }
                
                // Valida os parâmetros de tempo
                if (!step.timeInterval || !step.timeInterval.value || !step.timeInterval.unit) {
                    return res.status(400).json({
                        error: 'Configuração de tempo inválida',
                        details: `O passo ${i+1} deve ter um intervalo de tempo válido`
                    });
                }
                
                // Valida unidade de tempo
                if (!['minutes', 'hours', 'days'].includes(step.timeInterval.unit)) {
                    return res.status(400).json({
                        error: 'Unidade de tempo inválida',
                        details: `O passo ${i+1} tem uma unidade de tempo inválida. Use 'minutes', 'hours' ou 'days'`
                    });
                }
                
                // Valida timeOfDay apenas para dias
                if (step.timeInterval.unit !== 'days' && step.timeOfDay) {
                    return res.status(400).json({
                        error: 'Configuração de tempo inválida',
                        details: `O passo ${i+1} não pode ter timeOfDay configurado quando a unidade não é 'days'`
                    });
                }
                
                // Valida formato de timeOfDay
                if (step.timeOfDay && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(step.timeOfDay)) {
                    return res.status(400).json({
                        error: 'Formato de horário inválido',
                        details: `O passo ${i+1} tem um formato de timeOfDay inválido. Use o formato HH:MM (24h)`
                    });
                }
                
                // Verifica se os passos estão em ordem cronológica
                if (i > 0) {
                    const prevStep = updates.sequence[i-1];
                    const prevTimeInMinutes = this.convertToMinutes(prevStep.timeInterval);
                    const currTimeInMinutes = this.convertToMinutes(step.timeInterval);
                    
                    if (currTimeInMinutes <= prevTimeInMinutes) {
                        return res.status(400).json({
                            error: 'Sequência de tempo inválida',
                            details: `O passo ${i+1} deve ocorrer depois do passo ${i}`
                        });
                    }
                }
            }
        }

        // Atualiza a campanha
        const updatedCampaign = await SmartRemarketingService.updateCampaign(campaignId, updates);

        res.json(updatedCampaign);
    } catch (error) {
        console.error('Erro ao atualizar campanha:', error);
        res.status(400).json({ error: 'Erro ao atualizar campanha de remarketing inteligente' });
    }
};

exports.deleteCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        // Verifica se a campanha existe e pertence ao usuário
        const campaign = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        // Remove progresso de todos os leads
        await LeadSequenceProgress.deleteMany({ campaignId });

        // Remove a campanha
        await SmartRemarketingCampaign.findByIdAndDelete(campaignId);

        res.json({ message: 'Campanha removida com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir campanha:', error);
        res.status(400).json({ error: 'Erro ao excluir campanha de remarketing inteligente' });
    }
};

exports.toggleCampaignStatus = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { isActive } = req.body;
        const userId = req.userId;

        if (isActive === undefined) {
            return res.status(400).json({ error: 'O campo isActive é obrigatório' });
        }

        // Verifica se a campanha existe e pertence ao usuário
        const campaign = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        // Atualiza o status
        const updatedCampaign = await SmartRemarketingService.toggleCampaignStatus(campaignId, isActive);

        res.json(updatedCampaign);
    } catch (error) {
        console.error('Erro ao alterar status da campanha:', error);
        res.status(400).json({ error: 'Erro ao alterar status da campanha' });
    }
};

exports.getCampaignProgress = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.userId;

        // Verifica se a campanha existe e pertence ao usuário
        const campaignExists = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaignExists) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        const progress = await SmartRemarketingService.getCampaignProgress(campaignId);

        res.json(progress);
    } catch (error) {
        console.error('Erro ao obter progresso da campanha:', error);
        res.status(400).json({ error: 'Erro ao obter progresso da campanha' });
    }
};

exports.getCampaignLeads = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { status, page = 1, limit = 50 } = req.query;
        const userId = req.userId;

        // Verifica se a campanha existe e pertence ao usuário
        const campaignExists = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaignExists) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        const result = await SmartRemarketingService.getCampaignLeads(campaignId, {
            status,
            page: parseInt(page),
            limit: parseInt(limit)
        });

        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar leads da campanha:', error);
        res.status(400).json({ error: 'Erro ao buscar leads da campanha' });
    }
};

exports.resetLeadProgress = async (req, res) => {
    try {
        const { campaignId, leadId } = req.params;
        const userId = req.userId;

        // Verifica se a campanha existe e pertence ao usuário
        const campaignExists = await SmartRemarketingCampaign.findOne({ _id: campaignId, userId });
        if (!campaignExists) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        // Verifica se o lead existe e está na campanha
        const progress = await LeadSequenceProgress.findOne({ campaignId, leadId })
            .populate('leadId');
            
        if (!progress || !progress.leadId) {
            return res.status(404).json({ error: 'Lead não encontrado na campanha' });
        }

        const newProgress = await SmartRemarketingService.resetLeadProgress(campaignId, leadId);

        res.json({ 
            success: true, 
            message: 'Progresso do lead resetado com sucesso',
            progress: newProgress
        });
    } catch (error) {
        console.error('Erro ao resetar progresso do lead:', error);
        res.status(400).json({ error: 'Erro ao resetar progresso do lead' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const { botId } = req.query;
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

        // Estatísticas gerais
        const totalCampaigns = await SmartRemarketingCampaign.countDocuments(query);
        const activeCampaigns = await SmartRemarketingCampaign.countDocuments({
            ...query,
            isActive: true
        });

        // Estatísticas de leads nas campanhas
        const campaignsWithStats = await SmartRemarketingCampaign.find(query, {
            name: 1,
            botId: 1,
            isActive: 1,
            stats: 1
        }).populate('botId', 'name');

        // Agregação de estatísticas
        let totalLeadsEntered = 0;
        let totalMessagesSent = 0;
        let totalFlowsCompleted = 0;

        campaignsWithStats.forEach(campaign => {
            totalLeadsEntered += campaign.stats.totalLeadsEntered || 0;
            totalMessagesSent += campaign.stats.totalMessagesSent || 0;
            totalFlowsCompleted += campaign.stats.totalFlowsCompleted || 0;
        });

        // Estatísticas diárias (últimos 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyStats = [];
        const dailyMap = new Map();

        // Combina estatísticas diárias de todas as campanhas
        campaignsWithStats.forEach(campaign => {
            if (campaign.stats.dailyStats && campaign.stats.dailyStats.length > 0) {
                campaign.stats.dailyStats.forEach(stat => {
                    const statDate = new Date(stat.date);
                    if (statDate >= thirtyDaysAgo) {
                        const dateKey = statDate.toISOString().split('T')[0];
                        
                        if (!dailyMap.has(dateKey)) {
                            dailyMap.set(dateKey, {
                                date: dateKey,
                                messagesSent: 0,
                                newLeads: 0,
                                completedFlows: 0
                            });
                        }
                        
                        const existingStat = dailyMap.get(dateKey);
                        existingStat.messagesSent += stat.messagesSent || 0;
                        existingStat.newLeads += stat.newLeads || 0;
                        existingStat.completedFlows += stat.completedFlows || 0;
                    }
                });
            }
        });

        // Converte para array e ordena por data
        Array.from(dailyMap.values()).forEach(stat => {
            dailyStats.push(stat);
        });
        
        dailyStats.sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            totalCampaigns,
            activeCampaigns,
            totalLeadsEntered,
            totalMessagesSent,
            totalFlowsCompleted,
            campaignsStats: campaignsWithStats.map(campaign => ({
                id: campaign._id,
                name: campaign.name,
                botId: campaign.botId._id,
                botName: campaign.botId.name,
                isActive: campaign.isActive,
                leadsEntered: campaign.stats.totalLeadsEntered || 0,
                messagesSent: campaign.stats.totalMessagesSent || 0,
                flowsCompleted: campaign.stats.totalFlowsCompleted || 0
            })),
            dailyStats
        });
    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(400).json({ error: 'Erro ao obter estatísticas de campanhas' });
    }
};
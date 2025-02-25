// src/controllers/remarketingContinuoController.js
const RemarketingContinuo = require('../models/RemarketingContinuo');
const ScheduledMessage = require('../models/ScheduledMessage');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');
const Lead = require('../models/Lead');
const mongoose = require('mongoose');

// Criar nova configuração de remarketing contínuo
exports.createRemarketingContinuo = async (req, res) => {
    try {
        const { name, description, botId, scheduledFlows } = req.body;
        const userId = req.userId;

        // Verifica se o bot existe e pertence ao usuário
        const bot = await Bot.findOne({ _id: botId, userId });
        if (!bot) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        // Verifica se os fluxos existem e pertencem ao usuário
        if (scheduledFlows && scheduledFlows.length > 0) {
            for (const flow of scheduledFlows) {
                const flowExists = await Flow.findOne({ _id: flow.flowId, userId });
                if (!flowExists) {
                    return res.status(404).json({ error: `Fluxo ${flow.flowId} não encontrado` });
                }
            }
        }

        // Organiza os fluxos por ordem
        const organizedFlows = scheduledFlows ? scheduledFlows.map((flow, index) => ({
            ...flow,
            order: index + 1
        })) : [];

        // Cria a configuração de remarketing contínuo
        const remarketingContinuo = await RemarketingContinuo.create({
            name,
            description,
            userId,
            botId,
            scheduledFlows: organizedFlows
        });

        // Se houver leads já existentes, agenda mensagens para eles
        await scheduleMessagesForExistingLeads(remarketingContinuo);

        return res.status(201).json(remarketingContinuo);

    } catch (error) {
        console.error('Erro ao criar remarketing contínuo:', error);
        return res.status(400).json({ error: 'Erro ao criar remarketing contínuo' });
    }
};

// Listar todas as configurações de remarketing contínuo
exports.listRemarketingContinuo = async (req, res) => {
    try {
        const { botId } = req.query;
        const userId = req.userId;

        const query = { userId };
        if (botId) query.botId = botId;

        const remarketings = await RemarketingContinuo.find(query)
            .populate('botId', 'name')
            .sort('-createdAt');

        return res.json(remarketings);
    } catch (error) {
        console.error('Erro ao listar remarketing contínuo:', error);
        return res.status(400).json({ error: 'Erro ao listar remarketing contínuo' });
    }
};

// Obter uma configuração específica de remarketing contínuo
exports.getRemarketingContinuo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const remarketing = await RemarketingContinuo.findOne({ _id: id, userId })
            .populate('botId', 'name')
            .populate('scheduledFlows.flowId', 'name');

        if (!remarketing) {
            return res.status(404).json({ error: 'Remarketing contínuo não encontrado' });
        }

        return res.json(remarketing);
    } catch (error) {
        console.error('Erro ao buscar remarketing contínuo:', error);
        return res.status(400).json({ error: 'Erro ao buscar remarketing contínuo' });
    }
};

// Atualizar uma configuração de remarketing contínuo
exports.updateRemarketingContinuo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const updates = req.body;

        // Não permite atualizar userId
        delete updates.userId;

        // Se estiver atualizando os fluxos agendados
        if (updates.scheduledFlows) {
            // Verifica se os fluxos existem e pertencem ao usuário
            for (const flow of updates.scheduledFlows) {
                const flowExists = await Flow.findOne({ _id: flow.flowId, userId });
                if (!flowExists) {
                    return res.status(404).json({ error: `Fluxo ${flow.flowId} não encontrado` });
                }
            }

            // Organiza os fluxos por ordem
            updates.scheduledFlows = updates.scheduledFlows.map((flow, index) => ({
                ...flow,
                order: index + 1
            }));
        }

        // Busca configuração atual para comparar alterações
        const oldRemarketing = await RemarketingContinuo.findOne({ _id: id, userId });
        if (!oldRemarketing) {
            return res.status(404).json({ error: 'Remarketing contínuo não encontrado' });
        }

        // Atualiza a configuração
        const remarketing = await RemarketingContinuo.findOneAndUpdate(
            { _id: id, userId },
            updates,
            { new: true, runValidators: true }
        );

        // Se a configuração foi ativada ou os fluxos mudaram, agenda mensagens para leads existentes
        if (
            (!oldRemarketing.isActive && remarketing.isActive) ||
            JSON.stringify(oldRemarketing.scheduledFlows) !== JSON.stringify(remarketing.scheduledFlows)
        ) {
            // Cancela agendamentos pendentes
            await ScheduledMessage.updateMany(
                { 
                    remarketingContinuoId: remarketing._id,
                    status: 'pending'
                },
                { status: 'cancelled' }
            );

            // Cria novos agendamentos
            await scheduleMessagesForExistingLeads(remarketing);
        }

        return res.json(remarketing);
    } catch (error) {
        console.error('Erro ao atualizar remarketing contínuo:', error);
        return res.status(400).json({ error: 'Erro ao atualizar remarketing contínuo' });
    }
};

// Excluir uma configuração de remarketing contínuo
exports.deleteRemarketingContinuo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const remarketing = await RemarketingContinuo.findOneAndDelete({ _id: id, userId });

        if (!remarketing) {
            return res.status(404).json({ error: 'Remarketing contínuo não encontrado' });
        }

        // Cancela todos os agendamentos pendentes
        await ScheduledMessage.updateMany(
            { remarketingContinuoId: id, status: 'pending' },
            { status: 'cancelled' }
        );

        return res.json({ message: 'Remarketing contínuo excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir remarketing contínuo:', error);
        return res.status(400).json({ error: 'Erro ao excluir remarketing contínuo' });
    }
};

// Obter estatísticas de um remarketing contínuo
// No arquivo remarketingContinuoController.js, corrija a função getRemarketingContinuoStats:

exports.getRemarketingContinuoStats = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const remarketing = await RemarketingContinuo.findOne({ _id: id, userId });
        if (!remarketing) {
            return res.status(404).json({ error: 'Remarketing contínuo não encontrado' });
        }

        // Busca estatísticas detalhadas
        const pendingCount = await ScheduledMessage.countDocuments({
            remarketingContinuoId: id,
            status: 'pending'
        });

        const sentCount = await ScheduledMessage.countDocuments({
            remarketingContinuoId: id,
            status: 'sent'
        });

        const failedCount = await ScheduledMessage.countDocuments({
            remarketingContinuoId: id,
            status: 'failed'
        });

        // Agrega por dia - Corrigindo a criação do ObjectId
        const dailyStats = await ScheduledMessage.aggregate([
            {
                $match: {
                    remarketingContinuoId: new mongoose.Types.ObjectId(id), // Corrigido aqui
                    status: 'sent'
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$sentAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        return res.json({
            stats: remarketing.stats,
            detailedStats: {
                pending: pendingCount,
                sent: sentCount,
                failed: failedCount,
                daily: dailyStats
            }
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return res.status(400).json({ error: 'Erro ao buscar estatísticas' });
    }
};

// Função para agendar mensagens para leads existentes
async function scheduleMessagesForExistingLeads(remarketingConfig) {
    try {
        if (!remarketingConfig.isActive || !remarketingConfig.scheduledFlows.length) {
            return;
        }

        // Busca todos os leads ativos para o bot
        const leads = await Lead.find({
            botId: remarketingConfig.botId,
            isActive: true
        });

        console.log(`Agendando mensagens para ${leads.length} leads existentes`);

        const now = new Date();
        const scheduledMessages = [];

        // Para cada lead, cria agendamentos para cada fluxo
        for (const lead of leads) {
            for (const scheduledFlow of remarketingConfig.scheduledFlows) {
                if (!scheduledFlow.isActive) continue;

                // Calcula o horário agendado baseado no horário de criação do lead
                const scheduledTime = new Date(lead.createdAt);
                scheduledTime.setMinutes(scheduledTime.getMinutes() + scheduledFlow.delayMinutes);

                // Se o horário já passou, não agenda
                if (scheduledTime <= now) continue;

                scheduledMessages.push({
                    userId: remarketingConfig.userId,
                    botId: remarketingConfig.botId,
                    leadId: lead._id,
                    telegramId: lead.telegramId,
                    flowId: scheduledFlow.flowId,
                    scheduledTime,
                    remarketingContinuoId: remarketingConfig._id,
                    scheduledFlowId: scheduledFlow._id,
                    status: 'pending'
                });
            }
        }

        // Insere os agendamentos em lote para melhor performance
        if (scheduledMessages.length > 0) {
            await ScheduledMessage.insertMany(scheduledMessages);
            console.log(`${scheduledMessages.length} mensagens agendadas com sucesso`);
        }

        return true;
    } catch (error) {
        console.error('Erro ao agendar mensagens para leads existentes:', error);
        return false;
    }
}

// Função para agendar mensagens para um novo lead
exports.scheduleMessagesForNewLead = async (lead) => {
    try {
        // Busca todas as configurações de remarketing contínuo ativas para o bot
        const remarketingConfigs = await RemarketingContinuo.find({
            botId: lead.botId,
            isActive: true
        });

        if (!remarketingConfigs.length) {
            return;
        }

        console.log(`Agendando mensagens para o novo lead ${lead._id} com base em ${remarketingConfigs.length} configurações de remarketing`);

        const scheduledMessages = [];

        // Para cada configuração, cria agendamentos para cada fluxo
        for (const config of remarketingConfigs) {
            for (const scheduledFlow of config.scheduledFlows) {
                if (!scheduledFlow.isActive) continue;

                // Calcula o horário agendado baseado no horário de criação do lead
                const scheduledTime = new Date(lead.createdAt);
                scheduledTime.setMinutes(scheduledTime.getMinutes() + scheduledFlow.delayMinutes);

                scheduledMessages.push({
                    userId: config.userId,
                    botId: config.botId,
                    leadId: lead._id,
                    telegramId: lead.telegramId,
                    flowId: scheduledFlow.flowId,
                    scheduledTime,
                    remarketingContinuoId: config._id,
                    scheduledFlowId: scheduledFlow._id,
                    status: 'pending'
                });
            }
        }

        // Insere os agendamentos em lote para melhor performance
        if (scheduledMessages.length > 0) {
            console.log(scheduledMessages)
            await ScheduledMessage.insertMany(scheduledMessages);
            console.log(`${scheduledMessages.length} mensagens agendadas para o novo lead`);
        }

        return true;
    } catch (error) {
        console.error('Erro ao agendar mensagens para novo lead:', error);
        return false;
    }
};
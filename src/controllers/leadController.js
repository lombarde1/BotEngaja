// src/controllers/leadController.js
const Lead = require('../models/Lead');
const Bot = require('../models/Bot');

exports.listLeads = async (req, res) => {
    try {
        const { botId, isActive, tag, search, page = 1, limit = 50 } = req.query;
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
        
        if (tag) {
            query.tags = tag;
        }
        
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { username: searchRegex },
                { telegramId: search }
            ];
        }
        
        const options = {
            skip: (page - 1) * limit,
            limit: parseInt(limit),
            sort: { lastInteraction: -1 }
        };
        
        const leads = await Lead.find(query, null, options).populate('botId', 'name');
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
        console.error('Erro ao listar leads:', error);
        res.status(400).json({ error: 'Erro ao listar leads' });
    }
};

exports.getLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const userId = req.userId;
        
        const lead = await Lead.findOne({ _id: leadId, userId })
            .populate('botId', 'name');
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado' });
        }
        
        res.json(lead);
    } catch (error) {
        console.error('Erro ao buscar lead:', error);
        res.status(400).json({ error: 'Erro ao buscar lead' });
    }
};

exports.updateLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const userId = req.userId;
        const updates = req.body;
        
        // Remove campos que não podem ser atualizados
        delete updates.userId;
        delete updates.botId;
        delete updates.telegramId;
        delete updates.messageHistory;
        
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, userId },
            updates,
            { new: true, runValidators: true }
        );
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado' });
        }
        
        res.json(lead);
    } catch (error) {
        console.error('Erro ao atualizar lead:', error);
        res.status(400).json({ error: 'Erro ao atualizar lead' });
    }
};

exports.addTag = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { tag } = req.body;
        const userId = req.userId;
        
        if (!tag) {
            return res.status(400).json({ error: 'Tag é obrigatória' });
        }
        
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, userId },
            { $addToSet: { tags: tag } },
            { new: true }
        );
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado' });
        }
        
        res.json(lead);
    } catch (error) {
        console.error('Erro ao adicionar tag:', error);
        res.status(400).json({ error: 'Erro ao adicionar tag' });
    }
};

exports.removeTag = async (req, res) => {
    try {
        const { leadId, tag } = req.params;
        const userId = req.userId;
        
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, userId },
            { $pull: { tags: tag } },
            { new: true }
        );
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado' });
        }
        
        res.json(lead);
    } catch (error) {
        console.error('Erro ao remover tag:', error);
        res.status(400).json({ error: 'Erro ao remover tag' });
    }
};

exports.bulkAddTag = async (req, res) => {
    try {
        const { botId, leadIds, tag } = req.body;
        const userId = req.userId;
        
        if (!tag) {
            return res.status(400).json({ error: 'Tag é obrigatória' });
        }
        
        if (!leadIds || !leadIds.length) {
            return res.status(400).json({ error: 'IDs de leads são obrigatórios' });
        }
        
        // Verifica se o bot pertence ao usuário
        if (botId) {
            const bot = await Bot.findOne({ _id: botId, userId });
            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }
        }
        
        const query = { 
            _id: { $in: leadIds }, 
            userId 
        };
        
        if (botId) {
            query.botId = botId;
        }
        
        const result = await Lead.updateMany(
            query,
            { $addToSet: { tags: tag } }
        );
        
        res.json({
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Erro ao adicionar tag em massa:', error);
        res.status(400).json({ error: 'Erro ao adicionar tag em massa' });
    }
};

exports.bulkRemoveTag = async (req, res) => {
    try {
        const { botId, leadIds, tag } = req.body;
        const userId = req.userId;
        
        if (!tag) {
            return res.status(400).json({ error: 'Tag é obrigatória' });
        }
        
        // Verifica se o bot pertence ao usuário
        if (botId) {
            const bot = await Bot.findOne({ _id: botId, userId });
            if (!bot) {
                return res.status(404).json({ error: 'Bot não encontrado' });
            }
        }
        
        const query = { userId };
        
        if (leadIds && leadIds.length) {
            query._id = { $in: leadIds };
        }
        
        if (botId) {
            query.botId = botId;
        }
        
        const result = await Lead.updateMany(
            query,
            { $pull: { tags: tag } }
        );
        
        res.json({
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Erro ao remover tag em massa:', error);
        res.status(400).json({ error: 'Erro ao remover tag em massa' });
    }
};

exports.setCustomField = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { key, value } = req.body;
        const userId = req.userId;
        
        if (!key) {
            return res.status(400).json({ error: 'Nome do campo é obrigatório' });
        }
        
        const lead = await Lead.findOne({ _id: leadId, userId });
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead não encontrado' });
        }
        
        // Usa o operador $set com notação de ponto para atualizar um campo específico
        const updateQuery = {};
        updateQuery[`customFields.${key}`] = value;
        
        const updatedLead = await Lead.findByIdAndUpdate(
            leadId,
            { $set: updateQuery },
            { new: true }
        );
        
        res.json(updatedLead);
    } catch (error) {
        console.error('Erro ao definir campo personalizado:', error);
        res.status(400).json({ error: 'Erro ao definir campo personalizado' });
    }
};

exports.getLeadStats = async (req, res) => {
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
        const totalLeads = await Lead.countDocuments(query);
        const activeLeads = await Lead.countDocuments({ ...query, isActive: true });
        
        // Leads por bot
        const leadsByBot = await Lead.aggregate([
            { $match: query },
            { $group: {
                _id: '$botId',
                count: { $sum: 1 },
                active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } }
            }},
            { $lookup: {
                from: 'bots',
                localField: '_id',
                foreignField: '_id',
                as: 'bot'
            }},
            { $unwind: '$bot' },
            { $project: {
                botId: '$_id',
                botName: '$bot.name',
                count: 1,
                active: 1
            }}
        ]);
        
        // Top tags
        const topTags = await Lead.aggregate([
            { $match: query },
            { $unwind: '$tags' },
            { $group: {
                _id: '$tags',
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: {
                tag: '$_id',
                count: 1,
                _id: 0
            }}
        ]);
        
        // Novos leads por dia (últimos 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const newLeadsByDay = await Lead.aggregate([
            { $match: { ...query, createdAt: { $gte: thirtyDaysAgo } } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } },
            { $project: {
                date: '$_id',
                count: 1,
                _id: 0
            }}
        ]);
        
        res.json({
            total: totalLeads,
            active: activeLeads,
            inactive: totalLeads - activeLeads,
            bots: leadsByBot,
            topTags,
            dailyGrowth: newLeadsByDay
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas de leads:', error);
        res.status(400).json({ error: 'Erro ao buscar estatísticas de leads' });
    }
};
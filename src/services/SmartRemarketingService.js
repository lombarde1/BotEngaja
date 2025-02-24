// src/services/SmartRemarketingService.js
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const SmartRemarketingCampaign = require('../models/SmartRemarketingCampaign');
const LeadSequenceProgress = require('../models/LeadSequenceProgress');
const Lead = require('../models/Lead');
const Bot = require('../models/Bot');
const messageUtils = require('../utils/messageUtils');


const DEBUG = true;

// Função de log para depuração
function debug(message, data = null) {
    if (DEBUG) {
        console.log(`[SMART-REMARKETING] ${message}`);
        if (data) {
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

class SmartRemarketingService {
    constructor() {
        this.initialize();
    }

    async initialize() {
        try {
            console.log('Iniciando serviço de remarketing inteligente...');
            
            // Cronograma para verificar novas leads a cada hora
            cron.schedule('0 * * * *', async () => {
                await this.checkNewLeads();
            });
            
            // Processa a cada 1 minuto em vez de cada 5 minutos
            cron.schedule('*/1 * * * *', async () => {
                await this.processPendingSequences();
            });
            
            // Executa imediatamente ao iniciar
            setTimeout(async () => {
                console.log('Executando verificação inicial de sequências pendentes...');
                await this.processPendingSequences();
            }, 10000); // 10 segundos após iniciar
            
            console.log('Serviço de remarketing inteligente inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar serviço de remarketing inteligente:', error);
        }
    }

    async checkNewLeads() {
        try {
            console.log('Verificando novos leads para campanhas inteligentes...');
            
            // Busca todas as campanhas ativas
            const campaigns = await SmartRemarketingCampaign.find({ isActive: true });
            
            for (const campaign of campaigns) {
                // Busca todos os leads do bot que não estão em nenhuma sequência desta campanha
                const existingLeadsInSequence = await LeadSequenceProgress.find({ 
                    campaignId: campaign._id 
                }).distinct('leadId');
                
                const query = { 
                    botId: campaign.botId,
                    isActive: true,
                    _id: { $nin: existingLeadsInSequence }
                };
                
                // Aplica filtros de tags
                if (campaign.filter.tags && campaign.filter.tags.length > 0) {
                    query.tags = { $in: campaign.filter.tags };
                }
                
                // Aplica filtros de exclusão de tags
                if (campaign.filter.excludeTags && campaign.filter.excludeTags.length > 0) {
                    query.tags = { ...(query.tags || {}), $nin: campaign.filter.excludeTags };
                }
                
                // Aplica filtros de campos personalizados
                if (campaign.filter.customFields) {
                    for (const [key, value] of Object.entries(campaign.filter.customFields)) {
                        query[`customFields.${key}`] = value;
                    }
                }
                
                // Encontra novos leads qualificados
                const leads = await Lead.find(query);
                console.log(`Campanha ${campaign._id}: encontrados ${leads.length} novos leads`);
                
                // Adiciona cada lead à sequência
                for (const lead of leads) {
                    await this.addLeadToSequence(lead, campaign);
                }
                
                // Atualiza estatísticas
                await SmartRemarketingCampaign.updateOne(
                    { _id: campaign._id },
                    { $inc: { 'stats.totalLeadsEntered': leads.length } }
                );
                
                // Atualiza estatísticas diárias
                if (leads.length > 0) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    await SmartRemarketingCampaign.updateOne(
                        { 
                            _id: campaign._id,
                            'stats.dailyStats.date': today
                        },
                        { 
                            $inc: { 'stats.dailyStats.$.newLeads': leads.length }
                        }
                    );
                    
                    // Se não existir estatística para hoje, cria
                    const statsUpdated = await SmartRemarketingCampaign.updateOne(
                        { 
                            _id: campaign._id,
                            'stats.dailyStats.date': { $ne: today }
                        },
                        { 
                            $push: { 
                                'stats.dailyStats': {
                                    date: today,
                                    messagesSent: 0,
                                    newLeads: leads.length,
                                    completedFlows: 0
                                }
                            }
                        }
                    );
                }
            }
        } catch (error) {
            console.error('Erro ao verificar novos leads:', error);
        }
    }

    async addLeadToSequence(lead, campaign) {
        try {
            debug(`Adicionando lead ${lead._id} à campanha ${campaign._id}`);
            
            // Verifica se a campanha tem passos de sequência
            if (!campaign.sequence || campaign.sequence.length === 0) {
                debug("Campanha não tem passos de sequência");
                return null;
            }
            
            // Cria registro de progresso
            const firstStep = campaign.sequence[0];
            const now = new Date();
            
            // Calcula a data para enviar o primeiro passo com base na unidade de tempo
            const nextStepDate = this.calculateNextStepTime(now, firstStep);
            
            debug(`Próximo passo agendado para: ${nextStepDate.toISOString()}`);
            
            // Verifique se já existe um progresso para este lead nesta campanha
            const existingProgress = await LeadSequenceProgress.findOne({
                leadId: lead._id,
                campaignId: campaign._id
            });
            
            if (existingProgress) {
                debug(`Progresso já existe para lead ${lead._id}`);
                return existingProgress;
            }
            
            const progress = await LeadSequenceProgress.create({
                leadId: lead._id,
                campaignId: campaign._id,
                startedAt: now,
                nextStepScheduledFor: nextStepDate,
                stepProgress: []
            });
            
            debug(`Lead ${lead._id} adicionado à sequência. Próximo passo em ${nextStepDate}`);
            
            return progress;
        } catch (error) {
            console.error(`Erro ao adicionar lead ${lead._id} à sequência:`, error);
            return null;
        }
    }
    

    // Método auxiliar para calcular o próximo tempo de execução
    calculateNextStepTime(baseTime, step) {
        const nextStepDate = new Date(baseTime);
        
        // Aplica o intervalo de tempo com base na unidade
        switch (step.timeInterval.unit) {
            case 'minutes':
                nextStepDate.setMinutes(nextStepDate.getMinutes() + step.timeInterval.value);
                break;
                
            case 'hours':
                nextStepDate.setHours(nextStepDate.getHours() + step.timeInterval.value);
                break;
                
            case 'days':
                nextStepDate.setDate(nextStepDate.getDate() + step.timeInterval.value);
                
                // Se tiver horário específico configurado, aplica
                if (step.timeOfDay) {
                    const [hours, minutes] = step.timeOfDay.split(':').map(Number);
                    nextStepDate.setHours(hours, minutes, 0, 0);
                    
                    // Se a data calculada já passou hoje, agenda para amanhã
                    if (nextStepDate < baseTime) {
                        nextStepDate.setDate(nextStepDate.getDate() + 1);
                    }
                }
                break;
        }
        
        return nextStepDate;
    }

    async processPendingSequences() {
        try {
            const now = new Date();
            
            // Encontra todos os progressos que têm passos programados para agora ou antes
            const pendingProgress = await LeadSequenceProgress.find({
                nextStepScheduledFor: { $lte: now },
                isCompleted: false
            }).populate('campaignId').populate('leadId');
            
            if (pendingProgress.length > 0) {
                console.log(`Encontrados ${pendingProgress.length} passos de sequência pendentes`);
            }
            
            // Agrupa por campanha para respeitar throttling
            const campaignGroups = pendingProgress.reduce((groups, progress) => {
                const campaignId = progress.campaignId._id.toString();
                if (!groups[campaignId]) {
                    groups[campaignId] = [];
                }
                groups[campaignId].push(progress);
                return groups;
            }, {});
            
            // Processa cada grupo de campanha
            for (const [campaignId, progressGroup] of Object.entries(campaignGroups)) {
                const campaign = progressGroup[0].campaignId;
                
                // Obtém o bot
                const bot = await Bot.findById(campaign.botId);
                if (!bot) {
                    console.error(`Bot não encontrado para campanha ${campaignId}`);
                    continue;
                }
                
                // Cria instância do bot
                const telegram = new Telegraf(bot.token);
                
                try {
                    // Processa cada progresso respeitando throttling
                    let messageCount = 0;
                    const throttleLimit = campaign.throttling?.messagesPerMinute || 20;
                    const throttleDelay = campaign.throttling?.delayBetweenMessages || 1;
                    
                    for (const progress of progressGroup) {
                        // Se atingiu o limite, aguarda
                        if (messageCount >= throttleLimit) {
                            console.log(`Throttling: aguardando 60 segundos para campanha ${campaignId}...`);
                            await new Promise(resolve => setTimeout(resolve, 60 * 1000));
                            messageCount = 0;
                        }
                        
                        // Pequeno delay entre mensagens
                        if (messageCount > 0) {
                            await new Promise(resolve => setTimeout(resolve, throttleDelay * 1000));
                        }
                        
                        // Processa este passo da sequência com retry
                        const success = await this.processSequenceStepWithRetry(telegram, progress);
                        
                        if (success) {
                            messageCount++;
                        }
                    }
                } finally {
                    // Fecha a conexão do bot
                    await telegram.telegram.close();
                }
            }
        } catch (error) {
            console.error('Erro ao processar sequências pendentes:', error);
        }
    }

    async processSequenceStepWithRetry(telegram, progress, maxRetries = 3, initialBackoff = 5000) {
        let currentRetry = 0;
        let backoff = initialBackoff;
        
        while (currentRetry <= maxRetries) {
            try {
                // Processa o passo normalmente
                return await this.processSequenceStep(telegram, progress);
            } catch (error) {
                // Verifica se é um erro de rate limit do Telegram
                if (error.response && error.response.error_code === 429) {
                    const retryAfter = error.response.parameters?.retry_after || 1;
                    currentRetry++;
                    
                    if (currentRetry <= maxRetries) {
                        console.log(`Rate limit atingido. Tentativa ${currentRetry}/${maxRetries}. Aguardando ${retryAfter} segundos...`);
                        // Aguarda o tempo recomendado pelo Telegram ou usa backoff exponencial
                        const waitTime = Math.max(retryAfter * 1000, backoff);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        backoff *= 2; // Backoff exponencial
                    } else {
                        console.error(`Falha após ${maxRetries} tentativas devido a rate limit.`);
                        throw error;
                    }
                } else {
                    // Se não for erro de rate limit, lança o erro
                    throw error;
                }
            }
        }
        
        return false;
    }


  async processSequenceStep(telegram, progress) {
    try {
        const campaign = progress.campaignId;
        const lead = progress.leadId;
        
        console.log(`Processando sequência para lead ${lead?._id} (${lead?.firstName}) na campanha ${campaign?._id} (${campaign?.name})`);
        
        // Se o lead não está ativo, marca sequência como completada
        if (!lead || !lead.isActive) {
            console.log(`Lead ${lead?._id} não está ativo. Marcando sequência como completada.`);
            await LeadSequenceProgress.updateOne(
                { _id: progress._id },
                { 
                    $set: { 
                        isCompleted: true,
                        completedAt: new Date()
                    } 
                }
            );
            return false;
        }
            
            // Obtém o próximo passo
            const nextStepIndex = progress.lastStepIndex + 1;
            
            // Se não há mais passos, marca como completada
            if (nextStepIndex >= campaign.sequence.length) {
                await LeadSequenceProgress.updateOne(
                    { _id: progress._id },
                    { 
                        $set: { 
                            isCompleted: true,
                            completedAt: new Date()
                        } 
                    }
                );
                
                await SmartRemarketingCampaign.updateOne(
                    { _id: campaign._id },
                    { $inc: { 'stats.totalFlowsCompleted': 1 } }
                );
                
                // Atualiza estatística diária
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                await SmartRemarketingCampaign.updateOne(
                    { 
                        _id: campaign._id,
                        'stats.dailyStats.date': today
                    },
                    { 
                        $inc: { 'stats.dailyStats.$.completedFlows': 1 }
                    }
                );
                
                return false;
            }
            
            const currentStep = campaign.sequence[nextStepIndex];
            
            // Verifica se o passo está ativo
            if (!currentStep.active) {
                // Atualiza para o próximo passo
                const nextNextStepIndex = nextStepIndex + 1;
                
                if (nextNextStepIndex >= campaign.sequence.length) {
                    // Chegou ao fim, marca como completada
                    await LeadSequenceProgress.updateOne(
                        { _id: progress._id },
                        { 
                            $set: { 
                                isCompleted: true,
                                completedAt: new Date(),
                                lastStepIndex: nextStepIndex
                            } 
                        }
                    );
                } else {
                    // Agenda o próximo passo
                    const nextStep = campaign.sequence[nextNextStepIndex];
                    const now = new Date();
                    
                    // Calcula o tempo para o próximo passo usando o método auxiliar
                    const nextStepDate = this.calculateNextStepTime(now, nextStep);
                    
                    await LeadSequenceProgress.updateOne(
                        { _id: progress._id },
                        { 
                            $set: { 
                                lastStepIndex: nextStepIndex,
                                nextStepScheduledFor: nextStepDate
                            } 
                        }
                    );
                }
                
                return false;
            }
            
            // Busca o fluxo
            const Flow = require('../models/Flow');
            const flow = await Flow.findById(currentStep.flowId);
            
            if (!flow) {
                console.error(`Fluxo ${currentStep.flowId} não encontrado para passo ${nextStepIndex}`);
                
                // Registra erro e passa para o próximo passo
                await LeadSequenceProgress.updateOne(
                    { _id: progress._id },
                    {
                        $push: {
                            stepProgress: {
                                stepIndex: nextStepIndex,
                                flowId: currentStep.flowId,
                                scheduledFor: progress.nextStepScheduledFor,
                                sentAt: new Date(),
                                success: false,
                                error: 'Fluxo não encontrado'
                            }
                        }
                    }
                );
                
                return false;
            }
            
            // Envia o fluxo para o lead
            try {
                // Simula contexto para envio
                const ctx = {
                    chat: {
                        id: lead.telegramId,
                        type: 'private',
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        username: lead.username
                    },
                    from: {
                        id: lead.telegramId,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        username: lead.username,
                        language_code: lead.languageCode
                    },
                    telegram: telegram.telegram,
                    reply: async (text, extra) => {
                        return telegram.telegram.sendMessage(lead.telegramId, text, extra);
                    }
                };
                
                // Atualiza última interação do lead
                await Lead.updateOne(
                    { _id: lead._id },
                    { $set: { lastInteraction: new Date() } }
                );
                
                // Executa cada passo do fluxo
                let flowSuccess = true;
                let messagesSent = 0;
                
                for (const step of flow.steps) {
                    try {
                        // Aplica delay se especificado
                        if (step.delay > 0) {
                            await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
                        }
                        
                        // Processa variáveis no conteúdo
                        const processedContent = {
                            text: step.content.text ? await messageUtils.processVariables(step.content.text, {
                                user: ctx.from,
                                chat: ctx.chat,
                                bot: await telegram.telegram.getMe(),
                                messageCount: 0,
                                memberCount: 1,
                                activeMembers: 1,
                                memberSince: lead.createdAt,
                                isAdmin: false,
                                userMessageCount: 0
                            }) : null,
                            caption: step.content.caption ? await messageUtils.processVariables(step.content.caption, {
                                user: ctx.from,
                                chat: ctx.chat,
                                bot: await telegram.telegram.getMe(),
                                messageCount: 0,
                                memberCount: 1,
                                activeMembers: 1,
                                memberSince: lead.createdAt,
                                isAdmin: false,
                                userMessageCount: 0
                            }) : null
                        };
                        
                        // Prepara opções da mensagem
                        const options = {
                            parse_mode: 'HTML'
                        };
                        
                        // Adiciona botões se existirem
                        if (step.buttons && step.buttons.length > 0) {
                            options.reply_markup = {
                                inline_keyboard: messageUtils.prepareButtons(step.buttons)
                            };
                        }
                        
                        // Envia a mensagem
                        const sentMessage = await messageUtils.sendStepMessage(ctx, step, processedContent, options);
                        
                        // Registra a mensagem no histórico do lead
                        await Lead.updateOne(
                            { _id: lead._id },
                            {
                                $push: {
                                    messageHistory: {
                                        messageId: sentMessage?.message_id?.toString(),
                                        type: step.type,
                                        timestamp: new Date(),
                                        success: true,
                                        flowId: flow._id,
                                        campaignId: campaign._id
                                    }
                                }
                            }
                        );
                        
                        messagesSent++;
                        
                    } catch (error) {
                        console.error(`Erro ao enviar passo ${step.order} para lead ${lead.telegramId}:`, error);
                        
                        // Registra o erro no histórico do lead
                        await Lead.updateOne(
                            { _id: lead._id },
                            {
                                $push: {
                                    messageHistory: {
                                        type: step.type,
                                        timestamp: new Date(),
                                        success: false,
                                        flowId: flow._id,
                                        campaignId: campaign._id,
                                        error: error.message
                                    }
                                }
                            }
                        );
                        
                        // Verifica bloqueio
                        if (error.description && (
                            error.description.includes('bot was blocked') || 
                            error.description.includes('user is deactivated') ||
                            error.description.includes('chat not found')
                        )) {
                            // Marca lead como inativo
                            await Lead.updateOne(
                                { _id: lead._id },
                                { $set: { isActive: false } }
                            );
                            
                            flowSuccess = false;
                            break;
                        }
                    }
                }
                
                // Atualiza estatísticas da campanha
                await SmartRemarketingCampaign.updateOne(
                    { _id: campaign._id },
                    { $inc: { 'stats.totalMessagesSent': messagesSent } }
                );
                
                // Atualiza estatística diária
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                await SmartRemarketingCampaign.updateOne(
                    { 
                        _id: campaign._id,
                        'stats.dailyStats.date': today
                    },
                    { 
                        $inc: { 'stats.dailyStats.$.messagesSent': messagesSent }
                    }
                );
                
                // Se não existir estatística para hoje, cria
                const statsUpdated = await SmartRemarketingCampaign.updateOne(
                    { 
                        _id: campaign._id,
                        'stats.dailyStats.date': { $ne: today }
                    },
                    { 
                        $push: { 
                            'stats.dailyStats': {
                                date: today,
                                messagesSent: messagesSent,
                                newLeads: 0,
                                completedFlows: 0
                            }
                        }
                    }
                );
                
                // Se o fluxo não foi enviado com sucesso, marca a sequência como completa
                if (!flowSuccess) {
                    await LeadSequenceProgress.updateOne(
                        { _id: progress._id },
                        { 
                            $set: { 
                                isCompleted: true,
                                completedAt: new Date()
                            },
                            $push: {
                                stepProgress: {
                                    stepIndex: nextStepIndex,
                                    flowId: currentStep.flowId,
                                    scheduledFor: progress.nextStepScheduledFor,
                                    sentAt: new Date(),
                                    success: false,
                                    error: 'Lead bloqueou o bot'
                                }
                            }
                        }
                    );
                    
                    return false;
                }
                
                // Registra progresso
                await LeadSequenceProgress.updateOne(
                    { _id: progress._id },
                    {
                        $push: {
                            stepProgress: {
                                stepIndex: nextStepIndex,
                                flowId: currentStep.flowId,
                                scheduledFor: progress.nextStepScheduledFor,
                                sentAt: new Date(),
                                success: true
                            }
                        }
                    }
                );
                
                // Atualiza para o próximo passo
                const nextNextStepIndex = nextStepIndex + 1;
                
                if (nextNextStepIndex >= campaign.sequence.length) {
                    // Chegou ao fim, marca como completada
                    await LeadSequenceProgress.updateOne(
                        { _id: progress._id },
                        { 
                            $set: { 
                                isCompleted: true,
                                completedAt: new Date(),
                                lastStepIndex: nextStepIndex
                            } 
                        }
                    );
                    
                    await SmartRemarketingCampaign.updateOne(
                        { _id: campaign._id },
                        { $inc: { 'stats.totalFlowsCompleted': 1 } }
                    );
                    
                    // Atualiza estatística diária para fluxos completados
                    await SmartRemarketingCampaign.updateOne(
                        { 
                            _id: campaign._id,
                            'stats.dailyStats.date': today
                        },
                        { 
                            $inc: { 'stats.dailyStats.$.completedFlows': 1 }
                        }
                    );
                } else {
                    // Agenda o próximo passo
                    const nextStep = campaign.sequence[nextNextStepIndex];
                    const now = new Date();
                    
                    // Calcula o tempo para o próximo passo usando o método auxiliar
                    const nextStepDate = this.calculateNextStepTime(now, nextStep);
                    
                    await LeadSequenceProgress.updateOne(
                        { _id: progress._id },
                        { 
                            $set: { 
                                lastStepIndex: nextStepIndex,
                                nextStepScheduledFor: nextStepDate,
                                lastStepSentAt: new Date()
                            } 
                        }
                    );
                }
                
                return true;
                
            } catch (error) {
                console.error(`Erro ao enviar fluxo para lead ${lead.telegramId}:`, error);
                
                // Registra erro
                await LeadSequenceProgress.updateOne(
                    { _id: progress._id },
                    {
                        $push: {
                            stepProgress: {
                                stepIndex: nextStepIndex,
                                flowId: currentStep.flowId,
                                scheduledFor: progress.nextStepScheduledFor,
                                sentAt: new Date(),
                                success: false,
                                error: error.message
                            }
                        }
                    }
                );
                
                return false;
            }
            
        } catch (error) {
            console.error(`Erro ao processar passo da sequência ${progress._id}:`, error);
            return false;
        }
    }

    // Métodos para integração com a captura de leads

    async onNewLead(lead) {
        try {
            // Busca campanhas ativas para o bot deste lead
            const campaigns = await SmartRemarketingCampaign.find({ 
                botId: lead.botId,
                isActive: true
            });

            console.log(`Verificando ${campaigns.length} campanhas para o novo lead ${lead._id}`);

            for (const campaign of campaigns) {
                // Verifica se o lead se qualifica para a campanha
                const qualifies = await this.checkLeadQualification(lead, campaign);
                
                if (qualifies) {
                    await this.addLeadToSequence(lead, campaign);
                    
                    // Atualiza estatísticas
                    await SmartRemarketingCampaign.updateOne(
                        { _id: campaign._id },
                        { $inc: { 'stats.totalLeadsEntered': 1 } }
                    );
                    
                    // Atualiza estatísticas diárias
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const dailyStatsExists = await SmartRemarketingCampaign.findOne({
                        _id: campaign._id,
                        'stats.dailyStats.date': today
                    });
                    
                    if (dailyStatsExists) {
                        await SmartRemarketingCampaign.updateOne(
                            { 
                                _id: campaign._id,
                                'stats.dailyStats.date': today
                            },
                            { 
                                $inc: { 'stats.dailyStats.$.newLeads': 1 }
                            }
                        );
                    } else {
                        await SmartRemarketingCampaign.updateOne(
                            { _id: campaign._id },
                            { 
                                $push: { 
                                    'stats.dailyStats': {
                                        date: today,
                                        messagesSent: 0,
                                        newLeads: 1,
                                        completedFlows: 0
                                    }
                                }
                            }
                        );
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao processar novo lead ${lead._id}:`, error);
        }
    }

    async checkLeadQualification(lead, campaign) {
        try {
            // Verifica tags
            if (campaign.filter.tags && campaign.filter.tags.length > 0) {
                const hasRequiredTags = campaign.filter.tags.some(tag => lead.tags.includes(tag));
                if (!hasRequiredTags) {
                    return false;
                }
            }
            
            // Verifica tags de exclusão
            if (campaign.filter.excludeTags && campaign.filter.excludeTags.length > 0) {
                const hasExcludedTags = campaign.filter.excludeTags.some(tag => lead.tags.includes(tag));
                if (hasExcludedTags) {
                    return false;
                }
            }
            
            // Verifica campos personalizados
            if (campaign.filter.customFields) {
                for (const [key, value] of Object.entries(campaign.filter.customFields)) {
                    if (lead.customFields.get(key) !== value) {
                        return false;
                    }
                }
            }
            
            return true;
        } catch (error) {
            console.error(`Erro ao verificar qualificação do lead ${lead._id}:`, error);
            return false;
        }
    }

    // Métodos para operações de campanha

    async createCampaign(data) {
        try {
            const campaign = await SmartRemarketingCampaign.create(data);
            return campaign;
        } catch (error) {
            console.error('Erro ao criar campanha:', error);
            throw error;
        }
    }

    async updateCampaign(campaignId, data) {
        try {
            const campaign = await SmartRemarketingCampaign.findByIdAndUpdate(
                campaignId,
                data,
                { new: true }
            );
            return campaign;
        } catch (error) {
            console.error(`Erro ao atualizar campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async toggleCampaignStatus(campaignId, isActive) {
        try {
            const campaign = await SmartRemarketingCampaign.findByIdAndUpdate(
                campaignId,
                { isActive },
                { new: true }
            );
            return campaign;
        } catch (error) {
            console.error(`Erro ao alterar status da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async getCampaignProgress(campaignId) {
        try {
            const campaign = await SmartRemarketingCampaign.findById(campaignId);
            if (!campaign) {
                throw new Error('Campanha não encontrada');
            }
            
            const totalLeads = await LeadSequenceProgress.countDocuments({ campaignId });
            const activeLeads = await LeadSequenceProgress.countDocuments({ 
                campaignId, 
                isCompleted: false 
            });
            const completedLeads = await LeadSequenceProgress.countDocuments({ 
                campaignId, 
                isCompleted: true 
            });
            
            // Progresso por passo
            const stepProgress = [];
            
            for (let i = 0; i < campaign.sequence.length; i++) {
                const step = campaign.sequence[i];
                const leadsAtStep = await LeadSequenceProgress.countDocuments({
                    campaignId,
                    lastStepIndex: i
                });
                
                stepProgress.push({
                    stepIndex: i,
                    timeInterval: step.timeInterval,
                    flowId: step.flowId,
                    leadsAtStep
                });
            }
            
            return {
                campaign,
                progress: {
                    totalLeads,
                    activeLeads,
                    completedLeads,
                    stepProgress
                }
            };
            
        } catch (error) {
            console.error(`Erro ao obter progresso da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async getCampaignLeads(campaignId, { status, page = 1, limit = 50 }) {
        try {
            const query = { campaignId };
            
            if (status === 'active') {
                query.isCompleted = false;
            } else if (status === 'completed') {
                query.isCompleted = true;
            }
            
            const total = await LeadSequenceProgress.countDocuments(query);
            
            const progressList = await LeadSequenceProgress.find(query)
                .populate('leadId')
                .skip((page - 1) * limit)
                .limit(limit)
                .sort({ startedAt: -1 });
            
            return {
                leads: progressList,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };
            
        } catch (error) {
            console.error(`Erro ao obter leads da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async resetLeadProgress(campaignId, leadId) {
        try {
            // Remove o progresso atual
            await LeadSequenceProgress.deleteOne({
                campaignId,
                leadId
            });
            
            // Busca o lead e a campanha
            const lead = await Lead.findById(leadId);
            const campaign = await SmartRemarketingCampaign.findById(campaignId);
            
            if (!lead || !campaign) {
                throw new Error('Lead ou campanha não encontrados');
            }
            
            // Adiciona o lead à sequência novamente
            return await this.addLeadToSequence(lead, campaign);
            
        } catch (error) {
            console.error(`Erro ao resetar progresso do lead ${leadId} na campanha ${campaignId}:`, error);
            throw error;
        }
    }

    // Métodos adicionais para suportar funcionalidades avançadas

    async getCampaignAnalytics(campaignId) {
        try {
            const campaign = await SmartRemarketingCampaign.findById(campaignId);
            if (!campaign) {
                throw new Error('Campanha não encontrada');
            }
            
            // Obtém todos os leads na campanha
            const allProgress = await LeadSequenceProgress.find({ campaignId })
                .populate('leadId');
            
            // Contagens base
            const totalLeads = allProgress.length;
            const completedLeads = allProgress.filter(p => p.isCompleted).length;
            const activeLeads = totalLeads - completedLeads;
            
            // Taxa de conclusão
            const completionRate = totalLeads > 0 ? (completedLeads / totalLeads) * 100 : 0;
            
            // Calcula tempo médio de conclusão (em dias)
            let averageCompletionTime = 0;
            const completedProgresses = allProgress.filter(p => p.isCompleted && p.completedAt && p.startedAt);
            
            if (completedProgresses.length > 0) {
                const completionTimes = completedProgresses.map(p => {
                    const diffMs = p.completedAt.getTime() - p.startedAt.getTime();
                    return diffMs / (1000 * 60 * 60 * 24); // Converte para dias
                });
                
                averageCompletionTime = completionTimes.reduce((acc, time) => acc + time, 0) / completionTimes.length;
            }
            
            // Taxa de conversão por passo
            const stepsConversion = [];
            
            for (let i = 0; i < campaign.sequence.length; i++) {
                const reachedThisStep = allProgress.filter(p => p.lastStepIndex >= i).length;
                const conversionRate = totalLeads > 0 ? (reachedThisStep / totalLeads) * 100 : 0;
                
                stepsConversion.push({
                    stepIndex: i,
                    description: campaign.sequence[i].description || `Passo ${i + 1}`,
                    reachedCount: reachedThisStep,
                    conversionRate
                });
            }
            
            // Desempenho por dia da semana
            const weekdayPerformance = [0, 0, 0, 0, 0, 0, 0]; // Domingo a Sábado
            const weekdayLeads = [0, 0, 0, 0, 0, 0, 0];
            
            for (const progress of allProgress) {
                if (progress.startedAt) {
                    const weekday = progress.startedAt.getDay();
                    weekdayLeads[weekday]++;
                    
                    if (progress.isCompleted) {
                        weekdayPerformance[weekday]++;
                    }
                }
            }
            
            const weekdayConversion = weekdayLeads.map((leads, index) => ({
                day: index,
                dayName: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][index],
                leads: leads,
                completed: weekdayPerformance[index],
                rate: leads > 0 ? (weekdayPerformance[index] / leads) * 100 : 0
            }));
            
            return {
                overview: {
                    totalLeads,
                    activeLeads,
                    completedLeads,
                    completionRate,
                    averageCompletionTime,
                    messagesSent: campaign.stats.totalMessagesSent || 0
                },
                stepConversion: stepsConversion,
                timeAnalysis: {
                    weekdayConversion
                },
                campaignDuration: {
                    startDate: campaign.createdAt,
                    daysActive: Math.ceil((new Date() - campaign.createdAt) / (1000 * 60 * 60 * 24))
                }
            };
            
        } catch (error) {
            console.error(`Erro ao obter análise da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async getCampaignPerformanceByTag(campaignId) {
        try {
            // Busca todos os leads na campanha
            const progressList = await LeadSequenceProgress.find({ campaignId })
                .populate('leadId');
            
            // Agrupa por tags
            const tagStats = {};
            
            for (const progress of progressList) {
                if (progress.leadId && progress.leadId.tags) {
                    for (const tag of progress.leadId.tags) {
                        if (!tagStats[tag]) {
                            tagStats[tag] = {
                                tag,
                                totalLeads: 0,
                                completedLeads: 0,
                                activeLeads: 0
                            };
                        }
                        
                        tagStats[tag].totalLeads++;
                        
                        if (progress.isCompleted) {
                            tagStats[tag].completedLeads++;
                        } else {
                            tagStats[tag].activeLeads++;
                        }
                    }
                }
            }
            
            // Converte para array e adiciona taxas
            const result = Object.values(tagStats).map(stat => ({
                ...stat,
                completionRate: stat.totalLeads > 0 ? (stat.completedLeads / stat.totalLeads) * 100 : 0
            }));
            
            // Ordena por número total de leads
            result.sort((a, b) => b.totalLeads - a.totalLeads);
            
            return result;
            
        } catch (error) {
            console.error(`Erro ao obter performance por tag da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async cloneCampaign(campaignId, newName) {
        try {
            const campaign = await SmartRemarketingCampaign.findById(campaignId);
            if (!campaign) {
                throw new Error('Campanha não encontrada');
            }
            
            // Cria um novo objeto sem o _id e outros campos específicos
            const campaignData = campaign.toObject();
            delete campaignData._id;
            delete campaignData.createdAt;
            delete campaignData.updatedAt;
            delete campaignData.__v;
            
            // Reseta estatísticas
            campaignData.stats = {
                totalLeadsEntered: 0,
                totalMessagesSent: 0,
                totalFlowsCompleted: 0,
                dailyStats: []
            };
            
            // Define o novo nome e desativa por padrão
            campaignData.name = newName || `${campaign.name} (clone)`;
            campaignData.isActive = false;
            
            // Cria a nova campanha
            const newCampaign = await SmartRemarketingCampaign.create(campaignData);
            
            return newCampaign;
            
        } catch (error) {
            console.error(`Erro ao clonar campanha ${campaignId}:`, error);
            throw error;
        }
    }

    async pauseAllCampaignLeads(campaignId) {
        try {
            // Marca como completadas todas as sequências ativas
            const result = await LeadSequenceProgress.updateMany(
                { campaignId, isCompleted: false },
                { 
                    $set: { 
                        isCompleted: true,
                        completedAt: new Date()
                    } 
                }
            );
            
            return {
                success: true,
                affectedLeads: result.modifiedCount
            };
            
        } catch (error) {
            console.error(`Erro ao pausar todos os leads da campanha ${campaignId}:`, error);
            throw error;
        }
    }

    // Método para adicionar tag aos leads que completaram a sequência
    async tagCompletedLeads(campaignId, tag) {
        try {
            // Busca todos os leads que completaram a sequência
            const completedProgress = await LeadSequenceProgress.find({
                campaignId,
                isCompleted: true
            }).populate('leadId');
            
            const leadIds = completedProgress
                .filter(p => p.leadId)
                .map(p => p.leadId._id);
            
            // Adiciona a tag a todos os leads
            const result = await Lead.updateMany(
                { _id: { $in: leadIds } },
                { $addToSet: { tags: tag } }
            );
            
            return {
                success: true,
                tagsAdded: result.modifiedCount
            };
            
        } catch (error) {
            console.error(`Erro ao adicionar tag aos leads da campanha ${campaignId}:`, error);
            throw error;
        }
    }
}

// Exporta uma instância única do serviço
module.exports = new SmartRemarketingService();
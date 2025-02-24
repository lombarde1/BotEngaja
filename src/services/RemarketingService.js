// src/services/RemarketingService.js
const { Telegraf } = require('telegraf');
const RemarketingCampaign = require('../models/RemarketingCampaign');
const Lead = require('../models/Lead');
const Bot = require('../models/Bot');
const cron = require('node-cron');
const BotManager = require('./BotManager');

class RemarketingService {
    constructor() {
        this.cronJobs = new Map();
        this.runningCampaigns = new Map();
        this.initialize();
    }

    async initialize() {
        try {
            console.log('Iniciando serviço de remarketing...');
            
            // Configura verificação periódica a cada 1 minuto
            cron.schedule('* * * * *', async () => {
                await this.checkScheduledCampaigns();
            });

            // Inicializa campanhas já agendadas
            await this.initializeScheduledCampaigns();
            
            console.log('Serviço de remarketing inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar serviço de remarketing:', error);
        }
    }

    async initializeScheduledCampaigns() {
        try {
            // Busca campanhas agendadas
            const campaigns = await RemarketingCampaign.find({ 
                status: 'scheduled',
                'schedule.startDate': { $exists: true }
            }).populate('flowId').populate('botId');

            console.log(`Encontradas ${campaigns.length} campanhas agendadas`);

            // Atualiza o cálculo da próxima execução para cada campanha
            for (const campaign of campaigns) {
                await this.updateNextRun(campaign);
            }
        } catch (error) {
            console.error('Erro ao inicializar campanhas agendadas:', error);
        }
    }

    async checkScheduledCampaigns() {
        try {
            const now = new Date();
            
            // Busca campanhas agendadas que devem ser executadas (próxima execução <= agora)
            const campaigns = await RemarketingCampaign.find({
                status: 'scheduled',
                'stats.nextRun': { $lte: now }
            }).populate('flowId').populate('botId');

            if (campaigns.length > 0) {
                console.log(`Encontradas ${campaigns.length} campanhas a serem executadas`);
            }

            // Executa cada campanha
            for (const campaign of campaigns) {
                try {
                    // Evita execuções duplicadas
                    if (this.runningCampaigns.has(campaign._id.toString())) {
                        console.log(`Campanha ${campaign._id} já está em execução`);
                        continue;
                    }

                    // Verifica se a campanha tem um fluxo e bot válidos
                    if (!campaign.flowId || !campaign.botId) {
                        console.error(`Campanha ${campaign._id} com fluxo ou bot inválido`);
                        await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                            status: 'error',
                            $push: {
                                'stats.history': {
                                    runDate: new Date(),
                                    error: 'Fluxo ou bot inválido'
                                }
                            }
                        });
                        continue;
                    }

                    // Atualiza status para "running"
                    await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                        status: 'running'
                    });

                    // Executa a campanha em background
                    this.executeRemarketingCampaign(campaign)
                        .catch(error => console.error(`Erro ao executar campanha ${campaign._id}:`, error));

                } catch (error) {
                    console.error(`Erro ao processar campanha ${campaign._id}:`, error);
                }
            }
        } catch (error) {
            console.error('Erro ao verificar campanhas agendadas:', error);
        }
    }

    async updateNextRun(campaign) {
        try {
            if (!campaign.schedule || !campaign.schedule.startDate) {
                return null;
            }

            const startDate = new Date(campaign.schedule.startDate);
            let nextRun = null;

            const now = new Date();

            switch (campaign.schedule.type) {
                case 'once':
                    // Execução única: próxima execução é a data de início
                    nextRun = startDate;
                    break;

                case 'daily':
                    // Execução diária: próxima execução é hoje ou amanhã no horário especificado
                    nextRun = new Date(now);
                    
                    // Define a hora do dia
                    if (campaign.schedule.timeOfDay) {
                        const [hours, minutes] = campaign.schedule.timeOfDay.split(':').map(Number);
                        nextRun.setHours(hours, minutes, 0, 0);
                    } else {
                        // Se não tiver horário, usa a hora da data de início
                        nextRun.setHours(
                            startDate.getHours(),
                            startDate.getMinutes(),
                            0,
                            0
                        );
                    }

                    // Se já passou da hora hoje, agenda para amanhã
                    if (nextRun <= now) {
                        nextRun.setDate(nextRun.getDate() + 1);
                    }
                    break;

                case 'weekly':
                    // Execução semanal: próxima execução é o próximo dia da semana especificado
                    const daysOfWeek = campaign.schedule.daysOfWeek || [0]; // Padrão: domingo
                    nextRun = new Date(now);

                    // Define a hora do dia
                    if (campaign.schedule.timeOfDay) {
                        const [hours, minutes] = campaign.schedule.timeOfDay.split(':').map(Number);
                        nextRun.setHours(hours, minutes, 0, 0);
                    } else {
                        // Se não tiver horário, usa a hora da data de início
                        nextRun.setHours(
                            startDate.getHours(),
                            startDate.getMinutes(),
                            0,
                            0
                        );
                    }

                    // Encontra o próximo dia da semana válido
                    let daysToAdd = 0;
                    const currentDay = nextRun.getDay();
                    
                    // Ordena os dias da semana
                    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
                    
                    // Procura o próximo dia válido
                    const futureDays = sortedDays.filter(day => day > currentDay);
                    if (futureDays.length > 0) {
                        // Próximo dia esta semana
                        daysToAdd = futureDays[0] - currentDay;
                    } else {
                        // Próximo dia na próxima semana
                        daysToAdd = 7 - currentDay + sortedDays[0];
                    }

                    // Se for hoje e já passou da hora, procura o próximo dia
                    if (daysToAdd === 0 && nextRun <= now) {
                        if (sortedDays.length > 1) {
                            const nextDayIndex = sortedDays.findIndex(day => day === currentDay) + 1;
                            if (nextDayIndex < sortedDays.length) {
                                daysToAdd = sortedDays[nextDayIndex] - currentDay;
                            } else {
                                daysToAdd = 7 - currentDay + sortedDays[0];
                            }
                        } else {
                            daysToAdd = 7; // Próxima semana, mesmo dia
                        }
                    }

                    nextRun.setDate(nextRun.getDate() + daysToAdd);
                    break;
            }

            // Verifica se tem data de término e se já passou
            if (campaign.schedule.endDate && new Date(campaign.schedule.endDate) < now) {
                // Campanha encerrada
                await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                    status: 'completed',
                    'stats.nextRun': null
                });
                return null;
            }

            // Atualiza a próxima execução
            if (nextRun) {
                await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                    'stats.nextRun': nextRun
                });
                console.log(`Próxima execução da campanha ${campaign._id} agendada para ${nextRun}`);
                return nextRun;
            }

            return null;
        } catch (error) {
            console.error(`Erro ao atualizar próxima execução da campanha ${campaign._id}:`, error);
            return null;
        }
    }

    async executeRemarketingCampaign(campaign) {
        try {
            console.log(`Iniciando execução da campanha ${campaign._id}...`);
            
            // Marca como em execução
            this.runningCampaigns.set(campaign._id.toString(), true);
            
            // Constrói a query baseada nos filtros da campanha
            const query = { 
                botId: campaign.botId._id,
                isActive: true
            };

            if (campaign.filter && campaign.filter.tags && campaign.filter.tags.length > 0) {
                query.tags = { $in: campaign.filter.tags };
            }

            if (campaign.filter && campaign.filter.lastInteractionDays) {
                const daysAgo = new Date();
                daysAgo.setDate(daysAgo.getDate() - campaign.filter.lastInteractionDays);
                query.lastInteraction = { $gte: daysAgo };
            }

            if (campaign.filter && campaign.filter.customFields) {
                for (const [key, value] of Object.entries(campaign.filter.customFields)) {
                    query[`customFields.${key}`] = value;
                }
            }

            // Busca os leads
            const leads = await Lead.find(query);
            console.log(`Campanha ${campaign._id}: encontrados ${leads.length} leads`);

            // Inicializa estatísticas
            const stats = {
                runDate: new Date(),
                targeted: leads.length,
                sent: 0,
                succeeded: 0,
                failed: 0,
                blocked: 0
            };

            // Atualiza estatísticas na campanha
            await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                'stats.totalTargeted': leads.length
            });

            // Se não encontrou leads, finaliza
            if (leads.length === 0) {
                return await this.finalizeCampaign(campaign, stats);
            }

            // Cria instância do bot
            const bot = new Telegraf(campaign.botId.token);
            let throttleCount = 0;
            const throttleLimit = campaign.throttling?.messagesPerMinute || 20;
            const throttleDelay = campaign.throttling?.delayBetweenMessages || 1;

            // Processa cada lead
            for (const lead of leads) {
                try {
                    // Throttling: limita o número de mensagens por minuto
                    if (throttleCount >= throttleLimit) {
                        console.log(`Throttling: aguardando 60 segundos...`);
                        await new Promise(resolve => setTimeout(resolve, 60 * 1000));
                        throttleCount = 0;
                    }

                    // Pequeno delay entre mensagens
                    if (throttleCount > 0) {
                        await new Promise(resolve => setTimeout(resolve, throttleDelay * 1000));
                    }

                    // Envia mensagem para o lead
                    const success = await this.sendRemarketingMessage(bot, campaign, lead);
                    
                    // Atualiza estatísticas
                    stats.sent++;
                    if (success) {
                        stats.succeeded++;
                    } else {
                        stats.failed++;
                    }

                    throttleCount++;
                } catch (error) {
                    console.error(`Erro ao enviar mensagem para lead ${lead._id}:`, error)
                    // Se for erro de bot bloqueado, marca o lead como inativo
                    if (error.description && (
                        error.description.includes('bot was blocked') || 
                        error.description.includes('user is deactivated') ||
                        error.description.includes('chat not found')
                    )) {
                        lead.isActive = false;
                        await lead.save();
                        stats.blocked++;
                    }
                    
                    stats.failed++;
                }
            }

            await bot.telegram.close();
            return await this.finalizeCampaign(campaign, stats);
        } catch (error) {
            console.error(`Erro ao executar campanha ${campaign._id}:`, error);
            
            // Atualiza status para "error"
            await RemarketingCampaign.findByIdAndUpdate(campaign._id, {
                status: 'error',
                $push: {
                    'stats.history': {
                        runDate: new Date(),
                        error: error.message
                    }
                }
            });

            // Remove da lista de campanhas em execução
            this.runningCampaigns.delete(campaign._id.toString());
            
            throw error;
        }
    }

    async finalizeCampaign(campaign, stats) {
        try {
            // Atualiza estatísticas da campanha
            const updateData = {
                $inc: {
                    'stats.totalSent': stats.sent,
                    'stats.totalSucceeded': stats.succeeded,
                    'stats.totalFailed': stats.failed,
                    'stats.totalBlocked': stats.blocked
                },
                $set: {
                    'stats.lastRun': stats.runDate
                },
                $push: {
                    'stats.history': stats
                }
            };

            // Define o próximo status
            let nextStatus = 'completed';
            
            // Se é recorrente, volta para "scheduled" e calcula próxima execução
            if (campaign.schedule && (campaign.schedule.type === 'daily' || campaign.schedule.type === 'weekly')) {
                const hasEndDate = campaign.schedule.endDate && new Date(campaign.schedule.endDate) > new Date();
                
                if (!hasEndDate || hasEndDate) {
                    nextStatus = 'scheduled';
                    await this.updateNextRun(campaign);
                }
            }

            updateData.$set.status = nextStatus;

            // Atualiza a campanha
            await RemarketingCampaign.findByIdAndUpdate(campaign._id, updateData);
            
            console.log(`Campanha ${campaign._id} finalizada. Status: ${nextStatus}`);
            console.log(`Estatísticas: ${JSON.stringify(stats)}`);
            
            // Remove da lista de campanhas em execução
            this.runningCampaigns.delete(campaign._id.toString());
            
            return { success: true, stats };
        } catch (error) {
            console.error(`Erro ao finalizar campanha ${campaign._id}:`, error);
            this.runningCampaigns.delete(campaign._id.toString());
            throw error;
        }
    }

    async sendRemarketingMessage(bot, campaign, lead) {
        try {
            console.log(`Enviando mensagem para lead ${lead.telegramId}...`);
            
            // Simula um objeto de contexto para o BotManager
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
                telegram: bot.telegram,
                reply: async (text, extra) => {
                    return bot.telegram.sendMessage(lead.telegramId, text, extra);
                }
            };

            // Atualiza última interação do lead
            lead.lastInteraction = new Date();
            await lead.save();

            // Executa o fluxo usando o BotManager
            for (const step of campaign.flowId.steps) {
                console.log(`Executando step ${step.order} para lead ${lead.telegramId}`);
                
                try {
                    // Aplica delay se especificado
                    if (step.delay > 0) {
                        await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
                    }

                    // Processa variáveis no conteúdo
                    const processedContent = {
                        text: step.content.text ? await BotManager.processVariables(step.content.text, {
                            user: ctx.from,
                            chat: ctx.chat,
                            bot: await bot.telegram.getMe(),
                            messageCount: 0,
                            memberCount: 1,
                            activeMembers: 1,
                            memberSince: lead.createdAt,
                            isAdmin: false,
                            userMessageCount: 0
                        }) : null,
                        caption: step.content.caption ? await BotManager.processVariables(step.content.caption, {
                            user: ctx.from,
                            chat: ctx.chat,
                            bot: await bot.telegram.getMe(),
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
                            inline_keyboard: BotManager.prepareButtons(step.buttons)
                        };
                    }

                    // Envia a mensagem baseada no tipo
                    const sentMessage = await BotManager.sendStepMessage(ctx, step, processedContent, options);
                    
                    // Registra a mensagem no histórico do lead
                    lead.messageHistory.push({
                        messageId: sentMessage?.message_id?.toString(),
                        type: step.type,
                        timestamp: new Date(),
                        success: true,
                        flowId: campaign.flowId._id,
                        campaignId: campaign._id
                    });
                    
                    await lead.save();
                    
                    console.log(`Step ${step.order} executado com sucesso para lead ${lead.telegramId}`);
                } catch (error) {
                    console.error(`Erro ao executar step ${step.order} para lead ${lead.telegramId}:`, error);
                    
                    // Registra o erro no histórico do lead
                    lead.messageHistory.push({
                        type: step.type,
                        timestamp: new Date(),
                        success: false,
                        flowId: campaign.flowId._id,
                        campaignId: campaign._id,
                        error: error.message
                    });
                    
                    await lead.save();
                    
                    // Se for erro de bot bloqueado, propaga o erro
                    if (error.description && (
                        error.description.includes('bot was blocked') || 
                        error.description.includes('user is deactivated') ||
                        error.description.includes('chat not found')
                    )) {
                        throw error;
                    }
                }
            }

            return true;
        } catch (error) {
            console.error(`Erro ao enviar mensagem para lead ${lead.telegramId}:`, error);
            throw error;
        }
    }

    async sendTestMessage(campaign, lead) {
        try {
            // Verifica se o bot e o fluxo estão configurados
            if (!campaign.botId || !campaign.flowId) {
                return { 
                    success: false, 
                    message: 'Bot ou fluxo não configurado' 
                };
            }

            // Cria instância do bot
            const bot = new Telegraf(campaign.botId.token);
            
            try {
                // Tenta enviar a mensagem
                await this.sendRemarketingMessage(bot, campaign, lead);
                
                await bot.telegram.close();
                
                return { 
                    success: true, 
                    message: 'Mensagem de teste enviada com sucesso',
                    details: {
                        leadId: lead._id,
                        telegramId: lead.telegramId,
                        steps: campaign.flowId.steps.length
                    }
                };
            } catch (error) {
                await bot.telegram.close();
                
                if (error.description && (
                    error.description.includes('bot was blocked') || 
                    error.description.includes('user is deactivated') ||
                    error.description.includes('chat not found')
                )) {
                    // Marca o lead como inativo
                    lead.isActive = false;
                    await lead.save();
                    
                    return { 
                        success: false, 
                        message: 'Lead não pode receber mensagens (bot bloqueado ou usuário desativado)',
                        details: { error: error.message }
                    };
                }
                
                return { 
                    success: false, 
                    message: 'Erro ao enviar mensagem de teste',
                    details: { error: error.message }
                };
            }
        } catch (error) {
            console.error(`Erro ao enviar mensagem de teste:`, error);
            return { 
                success: false, 
                message: 'Erro ao enviar mensagem de teste',
                details: { error: error.message }
            };
        }
    }
}

// Exporta uma instância única do RemarketingService
module.exports = new RemarketingService();
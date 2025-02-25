// src/services/SchedulerService.js - Versão corrigida para evitar duplicação

const ScheduledMessage = require('../models/ScheduledMessage');
const RemarketingContinuo = require('../models/RemarketingContinuo');
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');
const { Telegraf } = require('telegraf');
const messageUtils = require('../utils/messageUtils');

// Mapa para controlar o tempo de espera por bot
const botRateLimits = new Map();

// Mapa para controlar mensagens em processamento
const processingMessages = new Set();

class SchedulerService {
    constructor() {
        this.isRunning = false;
        this.processInterval = 60000; // 1 minuto
        
        // Inicia o processamento
        this.startProcessing();
        
        console.log('Serviço de agendamento de mensagens iniciado');
    }

    async startProcessing() {
        // Executa imediatamente e depois a cada intervalo definido
        this.processScheduledMessages();
        
        // Configura o intervalo para execução periódica
        setInterval(() => {
            this.processScheduledMessages();
        }, this.processInterval);
    }

    async processScheduledMessages() {
        // Evita execuções concorrentes
        if (this.isRunning) {
            console.log('[SchedulerService] Processamento já em andamento, pulando ciclo');
            return;
        }

        this.isRunning = true;

        try {
            console.log('[SchedulerService] Verificando mensagens agendadas...');
            
            const now = new Date();
            
            // Busca mensagens pendentes cujo horário já chegou
            // Usa limit para processamento em lotes
            const pendingMessages = await ScheduledMessage.find({
                status: 'pending',
                scheduledTime: { $lte: now }
            })
            .limit(10) // Reduzido para controle de taxa
            .populate('botId', 'token')
            .populate('flowId')
            .populate('leadId')
            .sort('scheduledTime');

            if (pendingMessages.length === 0) {
                console.log('[SchedulerService] Nenhuma mensagem agendada para processar');
                this.isRunning = false;
                return;
            }

            console.log(`[SchedulerService] Processando ${pendingMessages.length} mensagens agendadas`);

            // Agrupar mensagens por botId para melhor controle de taxa
            const messagesByBot = {};
            
            pendingMessages.forEach(message => {
                const botId = message.botId?._id?.toString();
                if (!botId) return;
                
                if (!messagesByBot[botId]) {
                    messagesByBot[botId] = [];
                }
                messagesByBot[botId].push(message);
            });
            
            // Processar mensagens bot por bot com intervalo entre eles
            for (const botId in messagesByBot) {
                // Verifica se este bot está em rate limit
                const rateLimitInfo = botRateLimits.get(botId);
                if (rateLimitInfo) {
                    const { until } = rateLimitInfo;
                    if (until > Date.now()) {
                        const waitTime = Math.ceil((until - Date.now()) / 1000);
                        console.log(`[SchedulerService] Bot ${botId} em rate limit. Aguardando ${waitTime} segundos...`);
                        continue; // Pula este bot neste ciclo
                    } else {
                        // Remove a limitação se já passou o tempo
                        botRateLimits.delete(botId);
                    }
                }
                
                // Processa as mensagens deste bot uma a uma com pequenos intervalos
                const botMessages = messagesByBot[botId];
                
                for (const message of botMessages) {
                    // Verifica se a mensagem já está sendo processada
                    const messageId = message._id.toString();
                    if (processingMessages.has(messageId)) {
                        console.log(`[SchedulerService] Mensagem ${messageId} já está sendo processada, pulando`);
                        continue;
                    }
                    
                    // Marca a mensagem como em processamento
                    processingMessages.add(messageId);
                    
                    // Imediatamente marca a mensagem como "em processamento" no banco de dados
                    // para evitar que ela seja pegada por outra instância do processador
                    await ScheduledMessage.findByIdAndUpdate(messageId, {
                        status: 'processing'
                    });
                    
                    try {
                        await this.processMessage(message);
                        // Pequena pausa entre mensagens do mesmo bot (1 segundo)
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        if (error.response && error.response.error_code === 429) {
                            // Lidar com rate limit
                            const retryAfter = error.response.parameters?.retry_after || 300;
                            console.log(`[SchedulerService] Rate limit para bot ${botId}. Aguardando ${retryAfter} segundos...`);
                            
                            // Registra o rate limit para este bot
                            botRateLimits.set(botId, {
                                until: Date.now() + (retryAfter * 1000)
                            });
                            
                            // Atualiza a mensagem para ser tentada novamente mais tarde
                            const newScheduledTime = new Date(Date.now() + (retryAfter * 1000));
                            await ScheduledMessage.findByIdAndUpdate(messageId, {
                                status: 'pending', // Volta para pending
                                scheduledTime: newScheduledTime
                            });
                            
                            // Pula o resto das mensagens deste bot
                            break;
                        } else {
                            // Outros erros são tratados normalmente
                            console.error(`[SchedulerService] Erro ao processar mensagem ${messageId}:`, error);
                            
                            // Marca como falha se não for rate limit
                            await ScheduledMessage.findByIdAndUpdate(messageId, {
                                status: 'failed',
                                error: error.message
                            });
                        }
                    } finally {
                        // Remove a mensagem da lista de processamento
                        processingMessages.delete(messageId);
                    }
                }
                
                // Pausa entre diferentes bots (3 segundos)
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            console.log('[SchedulerService] Processamento concluído');
        } catch (error) {
            console.error('[SchedulerService] Erro no processamento:', error);
        } finally {
            this.isRunning = false;
        }
    }

    async processMessage(message) {
        let bot = null;
        
        try {
            // Verifica se temos todas as informações necessárias
            if (!message.botId || !message.botId.token || !message.flowId || !message.leadId) {
                console.error(`[SchedulerService] Mensagem ${message._id} com dados incompletos`);
                
                await ScheduledMessage.findByIdAndUpdate(message._id, {
                    status: 'failed',
                    error: 'Dados incompletos'
                });
                
                return;
            }

            // Cria instância do bot
            bot = new Telegraf(message.botId.token);
            
            // Verifica se o lead está ativo
            if (!message.leadId.isActive) {
                console.log(`[SchedulerService] Lead ${message.leadId._id} não está ativo`);
                
                await ScheduledMessage.findByIdAndUpdate(message._id, {
                    status: 'cancelled',
                    error: 'Lead inativo'
                });
                
                return;
            }

            // Obtém info do bot
            const botInfo = await bot.telegram.getMe();
            
            // Executa o fluxo
            console.log(`[SchedulerService] Enviando fluxo ${message.flowId._id} para ${message.telegramId}`);
            
            // Verifica se o fluxo tem passos
            if (!message.flowId.steps || message.flowId.steps.length === 0) {
                console.log(`[SchedulerService] Fluxo ${message.flowId._id} não tem passos definidos`);
                
                await ScheduledMessage.findByIdAndUpdate(message._id, {
                    status: 'failed',
                    error: 'Fluxo sem passos definidos'
                });
                
                return;
            }
            
            // Executa cada passo do fluxo - com um console.log para ajudar no debug
            console.log(`[SchedulerService] Fluxo tem ${message.flowId.steps.length} passos`);
            
            // Executa cada passo do fluxo
            for (let i = 0; i < message.flowId.steps.length; i++) {
                const step = message.flowId.steps[i];
                console.log(`[SchedulerService] Processando passo ${i+1}/${message.flowId.steps.length}: tipo ${step.type}`);
                
                // Processa variáveis no conteúdo
                const processedContent = {
                    text: step.content && step.content.text ? await messageUtils.processVariables(step.content.text, {
                        user: message.leadId,
                        chat: { id: message.telegramId, type: 'private' },
                        bot: botInfo
                    }) : null,
                    caption: step.content && step.content.caption ? await messageUtils.processVariables(step.content.caption, {
                        user: message.leadId,
                        chat: { id: message.telegramId, type: 'private' },
                        bot: botInfo
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

                // Aplica delay se especificado
                if (step.delay > 0) {
                    console.log(`[SchedulerService] Aguardando delay de ${step.delay} segundos`);
                    await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
                }

                // Envia a mensagem com tratamento de rate limit
                console.log(`[SchedulerService] Enviando mensagem do tipo ${step.type}`);
                await this.sendStepMessageWithRateLimit(bot, message.telegramId, step, processedContent, options, message.botId._id.toString());
                
                // Adiciona um intervalo entre os passos do fluxo (2 segundos)
                if (i < message.flowId.steps.length - 1) { // Se não for o último passo
                    console.log(`[SchedulerService] Intervalo entre passos (2s)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Atualiza status da mensagem
            await ScheduledMessage.findByIdAndUpdate(message._id, {
                status: 'sent',
                sentAt: new Date()
            });

            // Verifica se este lead já foi contabilizado para esta campanha
            const leadProcessed = await ScheduledMessage.findOne({
                remarketingContinuoId: message.remarketingContinuoId,
                leadId: message.leadId._id,
                status: 'sent',
                _id: { $ne: message._id } // Exclui a mensagem atual
            });

            // Calcula a taxa de sucesso
            // Primeiro, conta o total de mensagens (enviadas + falhas)
            const totalAttempts = await ScheduledMessage.countDocuments({
                remarketingContinuoId: message.remarketingContinuoId,
                status: { $in: ['sent', 'failed'] }
            });

            // Depois, conta apenas as mensagens enviadas com sucesso
            const successfulAttempts = await ScheduledMessage.countDocuments({
                remarketingContinuoId: message.remarketingContinuoId,
                status: 'sent'
            });

            // Calcula a taxa de sucesso (evita divisão por zero)
            const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 100;

            // Prepara os dados para atualização
            const updateData = {
                $inc: {
                    'stats.totalMessagesTriggered': 1
                },
                $set: {
                    'stats.lastExecutionTime': new Date(),
                    'stats.successRate': Math.round(successRate * 10) / 10 // Arredonda para 1 casa decimal
                }
            };

            // Incrementa o contador de leads processados apenas se for a primeira mensagem
            if (!leadProcessed) {
                updateData.$inc = updateData.$inc || {};
                updateData.$inc['stats.totalLeadsProcessed'] = 1;
            }

            // Atualiza as estatísticas
            await RemarketingContinuo.findByIdAndUpdate(
                message.remarketingContinuoId,
                updateData
            );

            console.log(`[SchedulerService] Fluxo enviado com sucesso para ${message.telegramId}`);

        } catch (error) {
            console.error(`[SchedulerService] Erro ao processar mensagem ${message._id}:`, error);
            
            // Verifica se é um erro de rate limit
            if (error.response && error.response.error_code === 429) {
                // Propaga o erro para ser tratado no método chamador
                throw error;
            }
            
            // Atualiza status da mensagem com erro
            await ScheduledMessage.findByIdAndUpdate(message._id, {
                status: 'failed',
                error: error.message
            });
        } finally {
            // Encerra instância do bot (apenas se não for um erro de rate limit)
            if (bot) {
                try {
                    await bot.telegram.close();
                } catch (closeError) {
                    // Ignora erros ao fechar, pois podem ser relacionados ao rate limit
                    if (!closeError.response || closeError.response.error_code !== 429) {
                        console.error('[SchedulerService] Erro ao encerrar bot:', closeError);
                    }
                }
            }
        }
    }

    async sendStepMessageWithRateLimit(bot, chatId, step, processedContent, options, botId) {
        try {
            // Verifica se o conteúdo da mensagem é válido com base no tipo de passo
            if (!this.isValidStepContent(step, processedContent)) {
                console.log(`[SchedulerService] Conteúdo inválido para o passo do tipo ${step.type}, pulando`);
                return; // Pula este passo se o conteúdo for inválido
            }
            
            switch (step.type) {
                case 'text':
                    if (!processedContent.text) {
                        console.log('[SchedulerService] Mensagem de texto sem conteúdo, pulando');
                        return;
                    }
                    await bot.telegram.sendMessage(chatId, processedContent.text, options);
                    break;
                case 'photo':
                    if (!step.content.fileId && !step.content.mediaUrl) {
                        console.log('[SchedulerService] Mensagem de foto sem fileId ou mediaUrl, pulando');
                        return;
                    }
                    await bot.telegram.sendPhoto(
                        chatId,
                        step.content.fileId || step.content.mediaUrl,
                        {
                            ...options,
                            caption: processedContent.caption
                        }
                    );
                    break;
                case 'video':
                    if (!step.content.fileId && !step.content.mediaUrl) {
                        console.log('[SchedulerService] Mensagem de vídeo sem fileId ou mediaUrl, pulando');
                        return;
                    }
                    await bot.telegram.sendVideo(
                        chatId,
                        step.content.fileId || step.content.mediaUrl,
                        {
                            ...options,
                            caption: processedContent.caption
                        }
                    );
                    break;
                case 'audio':
                    if (!step.content.fileId && !step.content.mediaUrl) {
                        console.log('[SchedulerService] Mensagem de áudio sem fileId ou mediaUrl, pulando');
                        return;
                    }
                    await bot.telegram.sendAudio(
                        chatId,
                        step.content.fileId || step.content.mediaUrl,
                        {
                            ...options,
                            caption: processedContent.caption,
                            title: step.content.title,
                            performer: step.content.performer
                        }
                    );
                    break;
                case 'document':
                    if (!step.content.fileId && !step.content.mediaUrl) {
                        console.log('[SchedulerService] Mensagem de documento sem fileId ou mediaUrl, pulando');
                        return;
                    }
                    await bot.telegram.sendDocument(
                        chatId,
                        step.content.fileId || step.content.mediaUrl,
                        {
                            ...options,
                            caption: processedContent.caption,
                            filename: step.content.filename
                        }
                    );
                    break;
                case 'sticker':
                    if (!step.content.fileId && !step.content.mediaUrl) {
                        console.log('[SchedulerService] Mensagem de sticker sem fileId ou mediaUrl, pulando');
                        return;
                    }
                    await bot.telegram.sendSticker(
                        chatId,
                        step.content.fileId || step.content.mediaUrl,
                        options
                    );
                    break;
                default:
                    console.log(`[SchedulerService] Tipo de passo desconhecido: ${step.type}, pulando`);
                    return;
            }
            
            console.log(`[SchedulerService] Mensagem do tipo ${step.type} enviada com sucesso`);
        } catch (error) {
            if (error.response && error.response.error_code === 429) {
                const retryAfter = error.response.parameters?.retry_after || 300;
                console.log(`[SchedulerService] Rate limit atingido. Aguardando ${retryAfter} segundos`);
                
                // Registra o rate limit para este bot
                botRateLimits.set(botId, {
                    until: Date.now() + (retryAfter * 1000)
                });
                
                // Propaga o erro para ser tratado no nível superior
                throw error;
            }
            // Propaga outros erros
            throw error;
        }
    }
    
    // Método para validar o conteúdo do passo antes de enviar
    isValidStepContent(step, processedContent) {
        if (!step || !step.content) {
            console.log('[SchedulerService] Passo sem conteúdo definido');
            return false;
        }
        
        switch (step.type) {
            case 'text':
                return !!processedContent.text;
            case 'photo':
            case 'video':
            case 'audio':
            case 'document':
            case 'sticker':
                return !!(step.content.fileId || step.content.mediaUrl);
            default:
                return false;
        }
    }
}

// Exporta uma instância única
module.exports = new SchedulerService();
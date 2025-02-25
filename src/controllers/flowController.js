// src/controllers/flowController.js
const Flow = require('../models/Flow');
const Bot = require('../models/Bot');
const { Telegraf } = require('telegraf');


async function processVariables(text, context) {
    if (!text) return text;

    const {
        user,
        chat,
        bot,
        messageCount,
        memberCount,
        activeMembers,
        memberSince,
        isAdmin,
        userMessageCount
    } = context;

    // Cria objeto com data/hora atual
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', { 
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

    // Mapeamento de variáveis
    const variables = {
        // Usuário
        '{user.name}': `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        '{user.first_name}': user.first_name || '',
        '{user.last_name}': user.last_name || '',
        '{user.username}': user.username ? `@${user.username}` : '',
        '{user.id}': user.id.toString(),
        '{user.language}': user.language_code || 'pt',

        // Chat/Grupo
        '{chat.name}': chat.title || chat.first_name || '',
        '{chat.id}': chat.id.toString(),
        '{chat.type}': chat.type,
        '{chat.members_count}': memberCount?.toString() || '0',
        '{chat.description}': chat.description || '',
        '{chat.invite_link}': chat.invite_link || '',

        // Bot
        '{bot.name}': bot.first_name || '',
        '{bot.username}': `@${bot.username}` || '',
        '{bot.link}': `https://t.me/${bot.username}` || '',

        // Data/Hora
        '{date.full}': dateFormatter.format(now),
        '{date.day}': now.getDate().toString().padStart(2, '0'),
        '{date.month}': (now.getMonth() + 1).toString().padStart(2, '0'),
        '{date.year}': now.getFullYear().toString(),
        '{date.weekday}': weekdayFormatter.format(now),
        '{time.full}': now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        '{time.hour}': now.getHours().toString().padStart(2, '0'),
        '{time.minute}': now.getMinutes().toString().padStart(2, '0'),

        // Contagens
        '{count.messages}': messageCount?.toString() || '0',
        '{count.members}': memberCount?.toString() || '0',
        '{count.active_members}': activeMembers?.toString() || '0',

        // Status
        '{status.member_since}': memberSince ? dateFormatter.format(new Date(memberSince)) : 'N/A',
        '{status.is_admin}': isAdmin ? 'Sim' : 'Não',
        '{status.messages_sent}': userMessageCount?.toString() || '0'
    };

    // Substitui todas as variáveis no texto
    let processedText = text;
    for (const [variable, value] of Object.entries(variables)) {
        processedText = processedText.replace(new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }

    return processedText;
}

exports.createFlow = async (req, res) => {
    try {
        const { name, description, botId, type, steps, triggerEvents } = req.body;
        const userId = req.userId;

        // Verifica se o bot existe e pertence ao usuário
        const bot = await Bot.findOne({ _id: botId, userId });
        if (!bot) {
            return res.status(404).json({ error: 'Bot não encontrado' });
        }

        // Valida e organiza os steps
        const organizedSteps = steps.map((step, index) => ({
            ...step,
            order: index + 1
        }));

        const flow = await Flow.create({
            name,
            description,
            userId,
            botId,
            type,
            steps: organizedSteps,
            triggerEvents
        });

        res.status(201).json(flow);
    } catch (error) {
        console.error('Erro ao criar fluxo:', error);
        res.status(400).json({ error: 'Erro ao criar fluxo' });
    }
};

exports.listFlows = async (req, res) => {
    try {
        const { botId, type } = req.query;
        const userId = req.userId;

        const query = { userId };
        if (botId) query.botId = botId;
        if (type) query.type = type;

        const flows = await Flow.find(query)
            .populate('botId', 'name')
            .sort('-createdAt');

        res.json(flows);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao listar fluxos' });
    }
};

exports.getFlow = async (req, res) => {
    try {
        const { flowId } = req.params;
        const userId = req.userId;

        const flow = await Flow.findOne({ _id: flowId, userId })
            .populate('botId', 'name');

        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        res.json(flow);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao buscar fluxo' });
    }
};

exports.updateFlow = async (req, res) => {
    try {
        const { flowId } = req.params;
        const userId = req.userId;
        const updates = req.body;

        // Não permite atualizar userId
        delete updates.userId;

        // Se houver steps, reorganiza a ordem
        if (updates.steps) {
            updates.steps = updates.steps.map((step, index) => ({
                ...step,
                order: index + 1
            }));
        }

        const flow = await Flow.findOneAndUpdate(
            { _id: flowId, userId },
            updates,
            { new: true, runValidators: true }
        );

        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        res.json(flow);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar fluxo' });
    }
};

exports.deleteFlow = async (req, res) => {
    try {
        const { flowId } = req.params;
        const userId = req.userId;

        const flow = await Flow.findOneAndDelete({ _id: flowId, userId });

        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        res.json({ message: 'Fluxo deletado com sucesso' });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao deletar fluxo' });
    }
};


exports.executeFlow = async (req, res) => {
    try {
        const { flowId, chatId } = req.body;
        const userId = req.userId;

        const flow = await Flow.findOne({ _id: flowId, userId })
            .populate('botId', 'token');

        if (!flow) {
            return res.status(404).json({ error: 'Fluxo não encontrado' });
        }

        const bot = new Telegraf(flow.botId.token);
        let completedSteps = 0;
        let totalSteps = flow.steps.length;

        // Obtém informações do contexto
        const chatInfo = await bot.telegram.getChat(chatId);
        const botInfo = await bot.telegram.getMe();
        
        // Para mensagens em grupos, obtém informações adicionais
        let memberCount = 0;
        let messageCount = 0;
        let activeMembers = 0;
        let memberSince = null;
        let isAdmin = false;
        let userMessageCount = 0;

        if (chatInfo.type !== 'private') {
            try {
                memberCount = await bot.telegram.getChatMembersCount(chatId);
                
                // Busca estatísticas do grupo no banco de dados
                const groupStats = await Group.findOne({ 
                    chatId: chatId.toString(),
                    botId: flow.botId
                });

                if (groupStats) {
                    messageCount = groupStats.stats?.totalMessages || 0;
                    activeMembers = groupStats.stats?.activeUsers || 0;
                }
            } catch (error) {
                console.error('Erro ao obter estatísticas do grupo:', error);
            }
        }

        // Executa cada passo do fluxo em sequência
        for (const step of flow.steps) {
            try {
                // Aplica delay se especificado
                if (step.delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
                }

                // Verifica condições de tempo
                if (step.conditions?.timeRestrictions) {
                    const { timeStart, timeEnd, daysOfWeek } = step.conditions.timeRestrictions;
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMinute = now.getMinutes();
                    const currentDay = now.getDay();

                    if (daysOfWeek && !daysOfWeek.includes(currentDay)) {
                        continue;
                    }

                    if (timeStart && timeEnd) {
                        const [startHour, startMinute] = timeStart.split(':').map(Number);
                        const [endHour, endMinute] = timeEnd.split(':').map(Number);
                        const currentTime = currentHour * 60 + currentMinute;
                        const startTime = startHour * 60 + startMinute;
                        const endTime = endHour * 60 + endMinute;

                        if (currentTime < startTime || currentTime > endTime) {
                            continue;
                        }
                    }
                }

                // Prepara os botões inline se existirem
                let inlineKeyboard;
              // Prepara os botões inline se existirem
              let messageOptions = {
                parse_mode: 'HTML'
            };

            if (step.buttons && step.buttons.length > 0) {
                // Organiza os botões em linhas
                const keyboard = [];
                const buttonsPerRow = 2; // Número de botões por linha
                
                for (let i = 0; i < step.buttons.length; i += buttonsPerRow) {
                    const row = step.buttons.slice(i, i + buttonsPerRow).map(btn => {
                        if (btn.type === 'url') {
                            return {
                                text: btn.text,
                                url: btn.value
                            };
                        } else if (btn.type === 'nextStep') {
                            return {
                                text: btn.text,
                                callback_data: `next_step:${btn.nextStepId}`
                            };
                        } else {
                            return {
                                text: btn.text,
                                callback_data: btn.value
                            };
                        }
                    });
                    keyboard.push(row);
                }

                messageOptions.reply_markup = {
                    inline_keyboard: keyboard
                };
            }

                // Opções comuns para todas as mensagens
                const commonOptions = {
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard
                };

                // Contexto para processamento de variáveis
                const variableContext = {
                    user: chatInfo,
                    chat: chatInfo,
                    bot: botInfo,
                    messageCount,
                    memberCount,
                    activeMembers,
                    memberSince,
                    isAdmin,
                    userMessageCount
                };

                // Processa o conteúdo com as variáveis
                if (step.content.text) {
                    step.content.text = await processVariables(step.content.text, variableContext);
                }
                if (step.content.caption) {
                    step.content.caption = await processVariables(step.content.caption, variableContext);
                }


                // Envia a mensagem baseada no tipo
                switch (step.type) {
                    case 'text':
                       await bot.telegram.sendMessage(chatId, step.content.text, commonOptions);
                        break;

                    case 'photo':
                        await bot.telegram.sendPhoto(
                            chatId, 
                            step.content.fileId || step.content.mediaUrl,
                            {
                                ...commonOptions,
                                caption: step.content.caption
                            }
                        );
                        break;

                    case 'video':
                        await bot.telegram.sendVideo(
                            chatId,
                            step.content.fileId || step.content.mediaUrl,
                            {
                                ...commonOptions,
                                caption: step.content.caption
                            }
                        );
                        break;

                    case 'audio':
                        await bot.telegram.sendAudio(
                            chatId,
                            step.content.fileId || step.content.mediaUrl,
                            {
                                ...commonOptions,
                                caption: step.content.caption,
                                title: step.content.title,
                                performer: step.content.performer
                            }
                        );
                        break;

                    case 'voice':
                        await bot.telegram.sendVoice(
                            chatId,
                            step.content.fileId || step.content.mediaUrl,
                            {
                                ...commonOptions,
                                caption: step.content.caption
                            }
                        );
                        break;

                    case 'document':
                        await bot.telegram.sendDocument(
                            chatId,
                            step.content.fileId || step.content.mediaUrl,
                            {
                                ...commonOptions,
                                caption: step.content.caption,
                                filename: step.content.filename
                            }
                        );
                        break;

                    case 'sticker':
                        await bot.telegram.sendSticker(
                            chatId,
                            step.content.fileId || step.content.mediaUrl,
                            commonOptions
                        );
                        break;

                    case 'location':
                        await bot.telegram.sendLocation(
                            chatId,
                            step.content.latitude,
                            step.content.longitude,
                            commonOptions
                        );
                        break;

                    case 'contact':
                        await bot.telegram.sendContact(
                            chatId,
                            step.content.phoneNumber,
                            step.content.firstName,
                            {
                                ...commonOptions,
                                last_name: step.content.lastName
                            }
                        );
                        break;

                    case 'poll':
                        await bot.telegram.sendPoll(
                            chatId,
                            step.content.question,
                            step.content.options,
                            {
                                ...commonOptions,
                                is_anonymous: step.content.isAnonymous,
                                type: step.content.type,
                                allows_multiple_answers: step.content.allowsMultipleAnswers
                            }
                        );
                        break;
                }

                // Incrementa contador de passos concluídos
                completedSteps++;

                // Registra a interação do passo
                await Flow.updateOne(
                    { _id: flowId },
                    {
                        $push: {
                            'stats.interactions': {
                                stepId: step._id,
                                stepOrder: step.order,
                                timestamp: new Date(),
                                success: true
                            }
                        }
                    }
                );

            } catch (error) {
                console.error(`Erro ao executar passo ${step.order}:`, error);
                
                // Registra o erro na interação
                await Flow.updateOne(
                    { _id: flowId },
                    {
                        $push: {
                            'stats.interactions': {
                                stepId: step._id,
                                stepOrder: step.order,
                                timestamp: new Date(),
                                success: false,
                                error: error.message
                            }
                        }
                    }
                );
            }
        }

        // Calcula e atualiza estatísticas finais
        const completionRate = (completedSteps / totalSteps) * 100;
        await Flow.updateOne(
            { _id: flowId },
            {
                $inc: { 'stats.timesTriggered': 1 },
                $set: {
                    'stats.lastTriggered': new Date(),
                    'stats.completionRate': completionRate,
                    'stats.lastCompletionRate': completionRate,
                    'stats.lastExecutionStats': {
                        completedSteps,
                        totalSteps,
                        completionRate,
                        timestamp: new Date()
                    }
                }
            }
        );

        await bot.telegram.close();
        res.json({ 
            success: true, 
            message: 'Fluxo executado com sucesso',
            stats: {
                completedSteps,
                totalSteps,
                completionRate
            }
        });

    } catch (error) {
        console.error('Erro ao executar fluxo:', error);
        res.status(400).json({ 
            error: 'Erro ao executar fluxo',
            details: error.message
        });
    }
};
// src/utils/messageUtils.js
/**
 * Módulo utilitário para processamento de mensagens e variáveis
 * que será compartilhado entre BotManager e SmartRemarketingService
 */

/**
 * Processa variáveis em um texto usando o contexto fornecido
 * @param {string} text - Texto com variáveis para substituir
 * @param {Object} context - Contexto com valores para substituição
 * @returns {string} - Texto processado
 */
exports.processVariables = async function(text, context) {
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
};

/**
 * Prepara botões para mensagens Telegram
 * @param {Array} buttons - Array de objetos de botão
 * @returns {Array} - Array formatado para o Telegram
 */
exports.prepareButtons = function(buttons) {
    const keyboard = [];
    const buttonsPerRow = 2;

    for (let i = 0; i < buttons.length; i += buttonsPerRow) {
        const row = buttons.slice(i, i + buttonsPerRow).map(btn => {
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

    return keyboard;
};

/**
 * Envia uma mensagem baseada no tipo de passo
 * @param {Object} ctx - Contexto do Telegram
 * @param {Object} step - Configuração do passo
 * @param {Object} processedContent - Conteúdo processado
 * @param {Object} options - Opções adicionais
 * @returns {Object} - Mensagem enviada
 */
exports.sendStepMessage = async function(ctx, step, processedContent, options) {
    try {
        let sentMessage;
        
        switch (step.type) {
            case 'text':
                sentMessage = await ctx.reply(processedContent.text, options);
                break;
            case 'photo':
                sentMessage = await ctx.telegram.sendPhoto(
                    ctx.chat.id,
                    step.content.fileId || step.content.mediaUrl,
                    {
                        ...options,
                        caption: processedContent.caption
                    }
                );
                break;
            case 'video':
                sentMessage = await ctx.telegram.sendVideo(
                    ctx.chat.id,
                    step.content.fileId || step.content.mediaUrl,
                    {
                        ...options,
                        caption: processedContent.caption
                    }
                );
                break;
            case 'audio':
                sentMessage = await ctx.telegram.sendAudio(
                    ctx.chat.id,
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
                sentMessage = await ctx.telegram.sendDocument(
                    ctx.chat.id,
                    step.content.fileId || step.content.mediaUrl,
                    {
                        ...options,
                        caption: processedContent.caption,
                        filename: step.content.filename
                    }
                );
                break;
            case 'sticker':
                sentMessage = await ctx.telegram.sendSticker(
                    ctx.chat.id,
                    step.content.fileId || step.content.mediaUrl,
                    options
                );
                break;
            default:
                return null;
        }
        
        return sentMessage;
    } catch (error) {
        console.error(`Erro ao enviar mensagem do tipo ${step.type}:`, error);
        throw error;
    }
};
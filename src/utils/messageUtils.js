// src/utils/messageUtils.js

// Função para processar variáveis em texto
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
        '{user.name}': `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim(),
        '{user.first_name}': user.first_name || user.firstName || '',
        '{user.last_name}': user.last_name || user.lastName || '',
        '{user.username}': user.username ? `@${user.username}` : '',
        '{user.id}': (user.id || user.telegramId || '').toString(),
        '{user.language}': user.language_code || user.languageCode || 'pt',

        // Chat/Grupo
        '{chat.name}': chat.title || chat.first_name || '',
        '{chat.id}': chat.id.toString(),
        '{chat.type}': chat.type,
        '{chat.members_count}': memberCount?.toString() || '0',
        '{chat.description}': chat.description || '',
        '{chat.invite_link}': chat.invite_link || '',

        // Bot
        '{bot.name}': bot?.first_name || '',
        '{bot.username}': bot?.username ? `@${bot.username}` : '',
        '{bot.link}': bot?.username ? `https://t.me/${bot.username}` : '',

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

// Função para preparar botões inline
exports.prepareButtons = function(buttons) {
    if (!buttons || !buttons.length) {
        return [];
    }

    // Organiza os botões em linhas (2 botões por linha)
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

// Função para enviar mensagem baseada no tipo
exports.sendStepMessage = async function(ctx, step, processedContent, options) {
    try {
        let sentMessage;
        
        switch (step.type) {
            case 'text':
                sentMessage = await ctx.telegram.sendMessage(ctx.chat.id, processedContent.text, options);
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
        }
        
        return sentMessage;
    } catch (error) {
        console.error(`Erro ao enviar mensagem do tipo ${step.type}:`, error);
        throw error;
    }
};
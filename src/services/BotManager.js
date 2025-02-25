// src/services/BotManager.js
const { Telegraf } = require('telegraf');
const Redis = require('ioredis');
const Bot = require('../models/Bot');
const Group = require('../models/Group');
const User = require('../models/User');
const WelcomeConfig = require('../models/WelcomeConfig');
const Flow = require('../models/Flow');
const StartConfig = require('../models/StartConfig');
const Lead = require('../models/Lead');
const messageUtils = require('../utils/messageUtils');
const remarketingContinuoController = require('../controllers/remarketingContinuoController');

class BotManager {
    constructor() {
        this.redisClient = new Redis({
            host: '147.79.111.143',
            port: 6379,
            password: 'darklindo',
        });
        
        this.activeBots = new Map();
        this.initialize();

        // Reinicializa os bots a cada 1 hora para garantir que todos estão rodando
        setInterval(() => {
            this.initialize();
        }, 60 * 60 * 1000);
    }

    async initialize() {
        try {
            console.log('Iniciando BotManager...');
            
            // Para todos os bots ativos antes de reiniciar
            for (const [botId, bot] of this.activeBots) {
                await this.stopBot(botId);
            }
            
            // Limpa o map de bots ativos
            this.activeBots.clear();

            // Busca todos os bots ativos no banco
            const bots = await Bot.find().populate('userId');
            console.log(`Encontrados ${bots.length} bots para inicializar`);

            // Inicia cada bot
            for (const bot of bots) {
                await this.startBot(bot);
            }

            console.log(`BotManager inicializado com ${this.activeBots.size} bots ativos`);
        } catch (error) {
            console.error('Erro ao inicializar BotManager:', error);
        }
    }
    async startBot(botDoc) {
        try {
            console.log(`Iniciando bot ${botDoc._id}...`);
            
            const bot = new Telegraf(botDoc.token);
    
            // Handler para atualizações (debug)
            // Handler para debug
        bot.use((ctx, next) => {
            console.log('Update recebido:', ctx.update);
            return next();
        });
        
        bot.command('start', async (ctx) => {
            try {
                console.log('=== Comando /start detectado ===');
                await this.handleStartCommand(ctx, botDoc);
            } catch (error) {
                console.error('Erro ao processar comando /start:', error);
            }
        });

        // Handler para eventos de membros
        bot.on(['new_chat_members', 'left_chat_member', 'chat_member'], async (ctx) => {
            try {
                console.log('=== Evento de Membro ===');
                console.log('Tipo de update:', ctx.updateType);
                console.log('Contexto completo:', ctx.update);

                // Caso 1: Novo membro via new_chat_members
                if (ctx.message?.new_chat_members) {
                    console.log('Detectado: new_chat_members');
                    await this.handleNewMembers(ctx, botDoc);
                }
                // Caso 2: Alteração de status via chat_member
                else if (ctx.chatMember) {
                    console.log('Detectado: chat_member');
                    const newStatus = ctx.chatMember.new_chat_member.status;
                    const oldStatus = ctx.chatMember.old_chat_member.status;
                    
                    // Se o novo status é 'member' e o antigo não era
                    if (newStatus === 'member' && oldStatus !== 'member') {
                        console.log('Membro entrou via chat_member');
                        await this.handleNewMembers(ctx, botDoc);
                    }
                }
                
            } catch (error) {
                console.error('Erro no handler de eventos de membro:', error);
            }
        });
    
            // Handler geral para mensagens
            bot.on('message', async (ctx) => {
                try {
                    // Ignora eventos de entrada/saída de membros
                    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
                        return;
                    }
                    
                    console.log('Mensagem normal recebida:', ctx.message);
                    await this.handleMessage(ctx, botDoc);
                } catch (error) {
                    console.error('Erro ao processar mensagem:', error);
                }
            });
    
            // Handler para erros
            bot.catch((err, ctx) => {
                console.error('Error no bot:', err);
                console.error('Contexto do erro:', ctx.update);
            });
    
            await bot.launch({
                dropPendingUpdates: true // Ignora updates antigos ao iniciar
            });
    
            this.activeBots.set(botDoc._id.toString(), {
                instance: bot,
                userId: botDoc.userId._id.toString()
            });
    
            console.log(`Bot ${botDoc._id} iniciado com sucesso`);
        } catch (error) {
            console.error(`Erro ao iniciar bot ${botDoc._id}:`, error);
        }
    }


  // Adicione a importação no topo do arquivo BotManager.js

// Modifique o método handleStartCommand para capturar informações do lead
async handleStartCommand(ctx, botDoc) {
    try {
        const chat = ctx.chat;
        const from = ctx.from;
        
        console.log('Processando comando /start');
        console.log('Usuário:', from);
        console.log('Chat:', chat);

        // Ignora se for um grupo
        if (chat.type !== 'private') {
            console.log('Ignorando /start em grupo/supergrupo');
            return;
        }

        // Salva ou atualiza o lead
        await this.saveOrUpdateLead(botDoc, from);

        // Busca configuração de start para este bot
        const startConfig = await StartConfig.findOne({
            botId: botDoc._id,
            isActive: true
        }).populate('flowId');

        console.log('Config de start:', startConfig ? {
            id: startConfig._id,
            flowId: startConfig.flowId?._id,
            isActive: startConfig.isActive,
            steps: startConfig.flowId?.steps?.length || 0
        } : 'Não encontrada');

        if (!startConfig || !startConfig.flowId) {
            console.log('Configuração de start não encontrada ou sem fluxo');
            await ctx.reply('Olá! Eu sou um bot. Como posso ajudar?');
            return;
        }

        console.log('Iniciando execução do fluxo de start...');

        // Executa o fluxo para o usuário
        await this.executeFlowToUser(ctx, startConfig.flowId, from, botDoc, startConfig._id);

        console.log('Fluxo de start executado com sucesso');

    } catch (error) {
        console.error('Erro ao processar comando /start:', error);
    }
}

// Adicione este novo método para salvar ou atualizar leads
async saveOrUpdateLead(botDoc, user) {
    try {
        console.log('Salvando/atualizando lead:', user.id);
        
        // Verifica se o lead já existe
        let lead = await Lead.findOne({
            botId: botDoc._id,
            telegramId: user.id.toString()
        });
        
        if (lead) {
            // Atualiza o lead existente
            lead.firstName = user.first_name || lead.firstName;
            lead.lastName = user.last_name || lead.lastName;
            lead.username = user.username || lead.username;
            lead.languageCode = user.language_code || lead.languageCode;
            lead.lastInteraction = new Date();
            lead.isActive = true; // Reativa o lead se estava inativo
            
            await lead.save();
            console.log('Lead atualizado:', lead._id);
            return lead;
        } else {
            // Cria um novo lead
            lead = await Lead.create({
                botId: botDoc._id,
                userId: botDoc.userId,
                telegramId: user.id.toString(),
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                languageCode: user.language_code || 'pt',
                isActive: true,
                tags: ['start'] // Adiciona tag "start" por padrão
            });
            
            console.log('Novo lead criado:', lead._id);
            
           
                try {
                    console.log(`Agendando mensagens de remarketing contínuo para o novo lead ${lead._id}`);
                    await remarketingContinuoController.scheduleMessagesForNewLead(lead);
                } catch (error) {
                    console.error('Erro ao agendar mensagens de remarketing contínuo:', error);
                }
          
            
            return lead;
        }
    } catch (error) {
        console.error('Erro ao salvar/atualizar lead:', error);
        throw error;
    }
}

// Adicione este método para executar o fluxo para um usuário específico
async executeFlowToUser(ctx, flow, user, botDoc, sourceId = null, sourceType = 'startConfig') {
    try {
        // Registra o lead se não for uma execução de teste
        let lead = null;
        if (!sourceType.includes('test')) {
            lead = await this.saveOrUpdateLead(botDoc, user);
        }
        
        // Executa o fluxo para o usuário
        for (const step of flow.steps) {
            console.log(`\nExecutando step ${step.order} do tipo ${step.type}`);
            
            try {
                // Aplica delay se especificado
                if (step.delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, step.delay * 1000));
                }

                // Processa variáveis no conteúdo
                const processedContent = {
                    text: step.content.text ? await this.processVariables(step.content.text, {
                        user: user,
                        chat: ctx.chat,
                        bot: ctx.botInfo,
                        messageCount: 0,
                        memberCount: 1,
                        activeMembers: 1,
                        memberSince: new Date(),
                        isAdmin: false,
                        userMessageCount: 0
                    }) : null,
                    caption: step.content.caption ? await this.processVariables(step.content.caption, {
                        user: user,
                        chat: ctx.chat,
                        bot: ctx.botInfo,
                        messageCount: 0,
                        memberCount: 1,
                        activeMembers: 1,
                        memberSince: new Date(),
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
                        inline_keyboard: this.prepareButtons(step.buttons)
                    };
                }

                // Envia a mensagem baseada no tipo
                const sentMessage = await this.sendStepMessage(ctx, step, processedContent, options);
                
                // Registra a mensagem no histórico do lead
                if (lead && sentMessage) {
                    lead.messageHistory.push({
                        messageId: sentMessage.message_id?.toString(),
                        type: step.type,
                        timestamp: new Date(),
                        success: true,
                        flowId: flow._id
                    });
                    
                    await lead.save();
                }
                
                console.log(`Step ${step.order} executado com sucesso`);

            } catch (stepError) {
                console.error(`Erro ao executar passo ${step.order}:`, stepError);
                
                // Registra o erro no histórico do lead
                if (lead) {
                    lead.messageHistory.push({
                        type: step.type,
                        timestamp: new Date(),
                        success: false,
                        flowId: flow._id,
                        error: stepError.message
                    });
                    
                    await lead.save();
                }
            }
        }

        // Atualiza estatísticas
        if (sourceType === 'startConfig' && sourceId) {
            await StartConfig.updateOne(
                { _id: sourceId },
                {
                    $inc: { 'stats.totalTriggered': 1 },
                    $set: { 'stats.lastTriggered': new Date() },
                    $push: {
                        'stats.recentUsers': {
                            userId: user.id.toString(),
                            username: user.username || '',
                            triggeredAt: new Date()
                        }
                    }
                }
            );
        } else if (sourceType === 'remarketingCampaign' && sourceId) {
            // Atualizado pelas funções de remarketing
        }

        return true;
    } catch (error) {
        console.error('Erro ao executar fluxo para usuário:', error);
        return false;
    }
}

// Modifique o método sendStepMessage para retornar a mensagem enviada
async sendStepMessage(ctx, step, processedContent, options) {
    return messageUtils.sendStepMessage(ctx, step, processedContent, options);
}

    async handleNewMembers(ctx, botDoc) {
        try {
            const chat = ctx.chat;
            
            // Identifica os novos membros dependendo do tipo de evento
            let newMembers = [];
            if (ctx.chatMember) {
                // Evento chat_member
                if (ctx.chatMember.new_chat_member && 
                    ctx.chatMember.new_chat_member.status === 'member') {
                    newMembers = [ctx.chatMember.new_chat_member.user];
                }
            } else if (ctx.message && ctx.message.new_chat_members) {
                // Evento new_chat_members tradicional
                newMembers = ctx.message.new_chat_members;
            }
            
            console.log('\n=== Processando Novos Membros ===');
            console.log('Chat ID:', chat.id);
            console.log('Bot ID:', botDoc._id);
            console.log('Novos membros:', newMembers);
    
            if (!newMembers.length) {
                console.log('Nenhum novo membro para processar');
                return;
            }

        // Ignora se não for um grupo
        if (chat.type !== 'group' && chat.type !== 'supergroup') {
            console.log('Ignorando: não é um grupo');
            return;
        }

        // Busca configuração de boas-vindas para este grupo
        const group = await Group.findOne({
            chatId: chat.id.toString(),
            botId: botDoc._id
        });

        console.log('Grupo encontrado:', group ? {
            id: group._id,
            title: group.title,
            chatId: group.chatId
        } : 'Não encontrado');

        if (!group) {
            console.log('Grupo não encontrado no banco de dados');
            return;
        }

        const welcomeConfig = await WelcomeConfig.findOne({
            groupId: group._id,
            isActive: true
        }).populate('flowId');

        console.log('Config de boas-vindas:', welcomeConfig ? {
            id: welcomeConfig._id,
            flowId: welcomeConfig.flowId?._id,
            isActive: welcomeConfig.isActive,
            steps: welcomeConfig.flowId?.steps?.length || 0
        } : 'Não encontrada');

        if (!welcomeConfig || !welcomeConfig.flowId) {
            console.log('Configuração de boas-vindas não encontrada ou sem fluxo');
            return;
        }

        // Para cada novo membro, executa o fluxo de boas-vindas
        for (const member of newMembers) {
            console.log('\nProcessando membro:', {
                id: member.id,
                username: member.username,
                firstName: member.first_name
            });

            // Ignora se for o próprio bot
            if (member.id === ctx.botInfo.id) {
                console.log('Ignorando: é o próprio bot');
                continue;
            }

            try {
                // Execute o fluxo para o novo membro
                console.log('Iniciando execução do fluxo...');

                for (const step of welcomeConfig.flowId.steps) {
                    console.log(`\nExecutando step ${step.order} do tipo ${step.type}`);
                    
                    try {
                        // Processa variáveis no conteúdo
                        const processedContent = {
                            text: step.content.text ? await this.processVariables(step.content.text, {
                                user: member,
                                chat: chat,
                                bot: ctx.botInfo
                            }) : null,
                            caption: step.content.caption ? await this.processVariables(step.content.caption, {
                                user: member,
                                chat: chat,
                                bot: ctx.botInfo
                            }) : null
                        };

                        // Envia a mensagem
                        await this.sendStepMessage(ctx, step, processedContent, {
                            parse_mode: 'HTML'
                        });

                        console.log(`Step ${step.order} executado com sucesso`);
                    } catch (stepError) {
                        console.error(`Erro ao executar step ${step.order}:`, stepError);
                    }
                }

                console.log('Fluxo executado com sucesso para o membro');

            } catch (memberError) {
                console.error(`Erro ao processar boas-vindas para membro:`, memberError);
            }
        }
    } catch (error) {
        console.error('Erro ao processar novos membros:', error);
    }
}
    
    // Adicione este método auxiliar à classe BotManager
async sendStepMessage(ctx, step, processedContent, options) {
    switch (step.type) {
        case 'text':
            await ctx.reply(processedContent.text, options);
            break;
        case 'photo':
            await ctx.telegram.sendPhoto(
                ctx.chat.id,
                step.content.fileId || step.content.mediaUrl,
                {
                    ...options,
                    caption: processedContent.caption
                }
            );
            break;
        case 'video':
            await ctx.telegram.sendVideo(
                ctx.chat.id,
                step.content.fileId || step.content.mediaUrl,
                {
                    ...options,
                    caption: processedContent.caption
                }
            );
            break;
        case 'audio':
            await ctx.telegram.sendAudio(
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
            await ctx.telegram.sendDocument(
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
            await ctx.telegram.sendSticker(
                ctx.chat.id,
                step.content.fileId || step.content.mediaUrl,
                options
            );
            break;
    }
}

// Método auxiliar para preparar botões
prepareButtons(buttons) {
    return messageUtils.prepareButtons(buttons);
}

// Método para processar variáveis do membro novo
async processVariables(text, context) {
    return messageUtils.processVariables(text, context);
}

    async handleMessage(ctx, botDoc) {
      const message = ctx.message;
      const chat = ctx.chat;
      

      try {
        await Bot.findByIdAndUpdate(
            botDoc._id,
            {
                $inc: { 'stats.totalMessages': 1 },
                $set: { 'stats.lastActivity': new Date() },
                $addToSet: { 'stats.activeChats': chat.id.toString() }
            },
            { new: true }
        );
    } catch (error) {
        console.error('Erro ao atualizar métricas do bot:', error);
    }
    
        // Verifica se é mensagem de grupo
        if (chat.type === 'group' || chat.type === 'supergroup') {
            // Verifica se o grupo está cadastrado
            const group = await Group.findOne({
                botId: botDoc._id,
                chatId: chat.id.toString(),
                status: 'active'
            });

            if (group) {
                // Atualiza estatísticas do grupo
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Incrementa total de mensagens
                group.stats.totalMessages = (group.stats.totalMessages || 0) + 1;

                // Atualiza última atividade
                group.stats.lastActivity = new Date();

                // Atualiza mensagens por dia
                const todayStats = group.stats.messagesPerDay.find(
                    stat => new Date(stat.date).getTime() === today.getTime()
                );

                if (todayStats) {
                    todayStats.count += 1;
                } else {
                    group.stats.messagesPerDay.push({
                        date: today,
                        count: 1
                    });
                }

                // Mantém apenas os últimos 30 dias de estatísticas
                group.stats.messagesPerDay = group.stats.messagesPerDay
                    .filter(stat => {
                        const diffTime = Math.abs(today - new Date(stat.date));
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays <= 30;
                    })
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                // Atualiza usuários ativos (baseado nas últimas 24 horas)
                const activeUserKey = `active_users:${group._id}:${message.from.id}`;
                await this.redisClient.set(activeUserKey, '1', 'EX', 24 * 60 * 60);

                // Conta usuários ativos
                const activeUsersPattern = `active_users:${group._id}:*`;
                const activeUsersKeys = await this.redisClient.keys(activeUsersPattern);
                group.stats.activeUsers = activeUsersKeys.length;

                // Salva as atualizações
                await group.save();
            }
        }

          // Verifica se é o comando /addgp
          if (message.text === '/addgp') {
            // Verifica se é um grupo ou supergrupo
            if (chat.type !== 'group' && chat.type !== 'supergroup') {
                await ctx.reply('❌ Este comando só pode ser usado em grupos!');
                return;
            }

            try {
                // Verifica se o grupo já está cadastrado
                const existingGroup = await Group.findOne({
                    botId: botDoc._id,
                    chatId: chat.id.toString(),
                    status: { $ne: 'left' }
                });

                if (existingGroup) {
                    await ctx.reply('❌ Este grupo já está cadastrado no sistema!');
                    return;
                }

                // Obtém informações do bot no grupo
                const botInfo = await ctx.telegram.getMe();
                const botMember = await ctx.telegram.getChatMember(chat.id, botInfo.id);
                const membersCount = await ctx.telegram.getChatMembersCount(chat.id);
                const isAdmin = ['administrator', 'creator'].includes(botMember.status);

                if (!isAdmin) {
                    await ctx.reply('❌ Para funcionar corretamente, o bot precisa ser administrador do grupo!\n\nPor favor, me adicione como administrador e tente novamente.');
                    return;
                }

                // Busca informações do usuário
                const user = await User.findById(botDoc.userId);
                if (!user) {
                    await ctx.reply('❌ Erro ao processar o comando. Usuário não encontrado.');
                    return;
                }

                // Verifica limite de grupos do usuário
                const userGroupCount = await Group.countDocuments({
                    userId: user._id,
                    status: { $ne: 'left' }
                });

                if (userGroupCount >= user.limits.maxGroups) {
                    await ctx.reply(`❌ Limite de grupos atingido!\n\nSeu plano atual (${user.subscription.plan}) permite até ${user.limits.maxGroups} grupos.\n\nAtualize seu plano para adicionar mais grupos.`);
                    return;
                }

                // Cria o grupo no banco de dados
                const group = await Group.create({
                    botId: botDoc._id,
                    userId: user._id,
                    chatId: chat.id.toString(),
                    title: chat.title,
                    type: chat.type,
                    membersCount,
                    permissions: {
                        canSendMessages: botMember.can_send_messages || false,
                        canDeleteMessages: botMember.can_delete_messages || false,
                        isAdmin: true
                    }
                });

                // Mensagem de sucesso com emojis
                const successMessage = `
🎉 Grupo adicionado com sucesso!

📱 Conta: ${user.name}
🤖 Bot: ${botInfo.first_name}
👥 Grupo: ${chat.title}
👤 Membros: ${membersCount}

✅ O bot está pronto para usar!
                `;

                await ctx.reply(successMessage);

            } catch (error) {
                console.error('Erro ao processar comando /addgp:', error);
                await ctx.reply('❌ Ocorreu um erro ao adicionar o grupo. Por favor, tente novamente mais tarde.');
            }
            return;
        }

      // Estrutura base da mensagem
      const messageData = {
          messageId: message.message_id.toString(),
          chatId: chat.id.toString(),
          userId: message.from.id.toString(),
          username: message.from.username || '',
          firstName: message.from.first_name || '',
          lastName: message.from.last_name || '',
          text: message.text || '',
          type: this.getMessageType(message),
          timestamp: Date.now(),
          botId: botDoc._id.toString(),
          ownerUserId: botDoc.userId._id.toString()
      };
  
      // Obtém informações de mídia separadamente
      const mediaInfo = await this.getMediaInfo(message);
      
      // Se houver mídia, converte para string JSON antes de salvar
      if (mediaInfo) {
          messageData.media = JSON.stringify(mediaInfo);
      } else {
          messageData.media = null;
      }
  
      console.log('Mensagem para salvar:', {
          ...messageData,
          media: mediaInfo // Log do objeto original para debug
      });
  
      await this.saveMessage(messageData);
      await this.updateChatInfo(messageData);
  }

  async getMediaInfo(message) {
      // Se for texto puro, retorna null
      if (message.text && !message.photo && !message.video && !message.document && !message.voice && !message.audio) {
          return null;
      }
  
      // Para fotos
      if (message.photo) {
          const photo = message.photo[message.photo.length - 1]; // Pega a maior resolução
          return {
              type: 'photo',
              file_id: photo.file_id,
              file_unique_id: photo.file_unique_id,
              width: photo.width,
              height: photo.height,
              file_size: photo.file_size,
              caption: message.caption || ''
          };
      }
  
      // Para vídeos
      if (message.video) {
          return {
              type: 'video',
              file_id: message.video.file_id,
              file_unique_id: message.video.file_unique_id,
              width: message.video.width,
              height: message.video.height,
              duration: message.video.duration,
              file_size: message.video.file_size,
              mime_type: message.video.mime_type,
              caption: message.caption || ''
          };
      }
  
      // Para documentos
      if (message.document) {
          return {
              type: 'document',
              file_id: message.document.file_id,
              file_unique_id: message.document.file_unique_id,
              file_name: message.document.file_name,
              mime_type: message.document.mime_type,
              file_size: message.document.file_size,
              caption: message.caption || ''
          };
      }
  
      // Para áudios
      if (message.audio) {
          return {
              type: 'audio',
              file_id: message.audio.file_id,
              file_unique_id: message.audio.file_unique_id,
              duration: message.audio.duration,
              performer: message.audio.performer,
              title: message.audio.title,
              file_name: message.audio.file_name,
              mime_type: message.audio.mime_type,
              file_size: message.audio.file_size,
              caption: message.caption || ''
          };
      }
  
      // Para mensagens de voz
      if (message.voice) {
          return {
              type: 'voice',
              file_id: message.voice.file_id,
              file_unique_id: message.voice.file_unique_id,
              duration: message.voice.duration,
              mime_type: message.voice.mime_type,
              file_size: message.voice.file_size
          };
      }
  
      // Para stickers
      if (message.sticker) {
          return {
              type: 'sticker',
              file_id: message.sticker.file_id,
              file_unique_id: message.sticker.file_unique_id,
              width: message.sticker.width,
              height: message.sticker.height,
              is_animated: message.sticker.is_animated,
              is_video: message.sticker.is_video,
              emoji: message.sticker.emoji,
              set_name: message.sticker.set_name,
              file_size: message.sticker.file_size
          };
      }
  
      return null;
  }

    getMessageType(message) {
        if (message.text) return 'text';
        if (message.photo) return 'photo';
        if (message.document) return 'document';
        if (message.voice) return 'voice';
        if (message.audio) return 'audio';
        if (message.video) return 'video';
        if (message.sticker) return 'sticker';
        return 'other';
    }

async saveMessage(messageData) {
    const { botId, chatId, messageId, ownerUserId } = messageData;
    
    try {
        // A media já deve estar como string JSON ou null neste ponto
        const messageKey = `msg:${ownerUserId}:${botId}:${chatId}:${messageId}`;
        
        // Salva a mensagem
        const dataToSave = { ...messageData };
        
        // Converte campos para string para o Redis
        Object.keys(dataToSave).forEach(key => {
            if (dataToSave[key] === null) {
                dataToSave[key] = '';
            } else if (typeof dataToSave[key] !== 'string') {
                dataToSave[key] = String(dataToSave[key]);
            }
        });

        // Salva no Redis
        await this.redisClient.hmset(messageKey, dataToSave);
        
        // Adiciona à lista ordenada
        await this.redisClient.zadd(
            `chat:${ownerUserId}:${botId}:${chatId}:messages`,
            messageData.timestamp,
            messageId
        );

        // Define expiração
        await this.redisClient.expire(messageKey, 30 * 24 * 60 * 60);
        
    } catch (error) {
        console.error('Erro ao salvar mensagem:', error);
    }
}

    async updateChatInfo(messageData) {
        const { botId, chatId, username, firstName, lastName, timestamp, ownerUserId } = messageData;
        
        try {
            // Chave para o chat
            const chatKey = `chatinfo:${ownerUserId}:${botId}:${chatId}`;
            
            // Atualiza informações do chat
            const chatInfo = {
                lastMessageAt: timestamp,
                username: username,
                firstName: firstName,
                lastName: lastName
            };

            // Incrementa contador de mensagens não lidas
            const unreadCount = await this.redisClient.hincrby(chatKey, 'unreadCount', 1);
            chatInfo.unreadCount = unreadCount;

            // Salva informações atualizadas
            await this.redisClient.hmset(chatKey, chatInfo);
            
            // Atualiza lista de chats do bot
            await this.redisClient.zadd(
                `bot:${ownerUserId}:${botId}:chats`,
                timestamp,
                chatId
            );
            
        } catch (error) {
            console.error('Erro ao atualizar chat:', error);
        }
    }

    async stopBot(botId) {
        try {
            const botData = this.activeBots.get(botId);
            if (botData) {
                await botData.instance.stop();
                this.activeBots.delete(botId);
                console.log(`Bot ${botId} parado com sucesso`);
            }
        } catch (error) {
            console.error(`Erro ao parar bot ${botId}:`, error);
        }
    }

    async addBot(botDoc) {
        await this.startBot(botDoc);
    }

    async removeBot(botId) {
        await this.stopBot(botId);
    }
}

// Exporta uma instância única do BotManager
module.exports = new BotManager();
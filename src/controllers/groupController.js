// src/controllers/groupController.js
const Group = require('../models/Group');
const Bot = require('../models/Bot');
const { Telegraf } = require('telegraf');

// Função auxiliar para verificar se o bot é admin
async function checkBotIsAdmin(bot, chatId, botInfo) {
    console.log('Verificando status de admin...');
    console.log('BOT INFO:', botInfo);
    try {
      const botMember = await bot.telegram.getChatMember(chatId, botInfo.id);
      return ['administrator', 'creator'].includes(botMember.status);
    } catch (error) {
      console.error('Erro ao verificar status de admin:', error);
      return false;
    }
  }


  exports.listGroups = async (req, res) => {
    try {
      const userId = req.userId;
      const groups = await Group.find({ userId })
        .populate('botId', 'name botInfo token');
  
      // Verifica status de admin para cada grupo
      const groupsWithStatus = await Promise.all(groups.map(async (group) => {
        let bot = null;
        try {
          bot = new Telegraf(group.botId.token);
          
          // Primeiro obtém as informações do bot
          const botInfo = await bot.telegram.getMe();
          console.log('Bot info obtido para grupo', group._id, ':', botInfo);
          
          const isAdmin = await checkBotIsAdmin(bot, group.chatId, botInfo);
          console.log('Status de admin para grupo', group._id, ':', isAdmin);
          
          return {
            ...group.toObject(),
            adminStatus: isAdmin ? 'active' : 'needs_permission',
            botId: {
              name: group.botId.name,
              botInfo: group.botId.botInfo
            }
          };
        } catch (error) {
          console.error(`Erro ao verificar status do grupo ${group._id}:`, error);
          return {
            ...group.toObject(),
            adminStatus: 'error',
            botId: {
              name: group.botId.name,
              botInfo: group.botId.botInfo
            }
          };
        } finally {
          if (bot) {
            try {
              await bot.stop();
              console.log('Bot parado com sucesso para grupo', group._id);
            } catch (error) {
              console.error('Erro ao parar bot para grupo', group._id, ':', error);
            }
          }
        }
      }));
  
      return res.json(groupsWithStatus);
    } catch (error) {
      console.error('Erro ao listar grupos:', error);
      return res.status(400).json({ error: 'Erro ao listar grupos' });
    }
  };
  
  
  exports.getGroupMetrics = async (req, res) => {
    let bot = null;
    try {
      const { groupId } = req.params;
      const userId = req.userId;
  
      const group = await Group.findOne({ _id: groupId, userId })
        .populate('botId', 'name botInfo token');
  
      if (!group) {
        return res.status(404).json({ error: 'Grupo não encontrado' });
      }
  
      bot = new Telegraf(group.botId.token);
  
      // Primeiro obtém as informações do bot
      const botInfo = await bot.telegram.getMe();
      
      // Verifica se o bot é admin
      const isAdmin = await checkBotIsAdmin(bot, group.chatId, botInfo);
      if (!isAdmin) {
        return res.status(400).json({
          error: 'Bot não é administrador',
          details: 'O bot precisa ser administrador para obter métricas'
        });
      }
  
      // Obtém a contagem atual de membros
      const currentMembers = await bot.telegram.getChatMembersCount(group.chatId);
  
      // Atualiza as informações do grupo
      group.membersCount = currentMembers;
      group.stats.lastActivity = new Date();
      await group.save();
  
      // Prepara a resposta
      const response = {
        id: group._id,
        title: group.title,
        bot: {
          name: group.botId.name,
          username: group.botId.botInfo.username
        },
        metrics: {
          membersCount: group.membersCount,
          totalMessages: group.stats.totalMessages || 0,
          activeUsers: group.stats.activeUsers || 0,
          messagesPerDay: group.stats.messagesPerDay || []
        },
        status: group.status,
        permissions: group.permissions,
        lastActivity: group.stats.lastActivity
      };
  
      return res.json(response);
  
    } catch (error) {
      console.error('Erro ao buscar métricas:', error);
      // Verifica se a resposta já foi enviada
      if (!res.headersSent) {
        return res.status(400).json({ error: 'Erro ao buscar métricas do grupo' });
      }
    } finally {
      if (bot) {
        try {
          // Verifica se o bot está rodando antes de tentar pará-lo
          if (bot.telegram && bot.telegram.token) {
            await bot.telegram.close();
          }
        } catch (error) {
          console.error('Erro ao finalizar bot:', error);
        }
      }
    }
  };
  exports.updateGroup = async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.userId;
      const updates = req.body;
  
      const group = await Group.findOne({ _id: groupId, userId })
        .populate('botId', 'token');
  
      if (!group) {
        return res.status(404).json({ error: 'Grupo não encontrado' });
      }
  
      const bot = new Telegraf(group.botId.token);
  
      try {
        // Verifica se o bot é admin
        const isAdmin = await checkBotIsAdmin(bot, group.chatId);
        if (!isAdmin) {
          return res.status(400).json({
            error: 'Bot não é administrador',
            details: 'O bot precisa ser administrador para atualizar o grupo'
          });
        }
  
        // Não permite atualizar campos sensíveis
        delete updates.userId;
        delete updates.botId;
        delete updates.chatId;
  
        const updatedGroup = await Group.findOneAndUpdate(
          { _id: groupId, userId },
          updates,
          { new: true, runValidators: true }
        );
  
        res.json(updatedGroup);
      } finally {
        bot.stop();
      }
    } catch (error) {
      console.error('Erro ao atualizar grupo:', error);
      res.status(400).json({ error: 'Erro ao atualizar grupo' });
    }
  };
  
  exports.leaveGroup = async (req, res) => {
    let bot = null;
    try {
      const { groupId } = req.params;
      const userId = req.userId;
  
      const group = await Group.findOne({ _id: groupId, userId })
        .populate('botId', 'token');
  
      if (!group) {
        return res.status(404).json({ error: 'Grupo não encontrado' });
      }
  
      bot = new Telegraf(group.botId.token);
  
      try {
        // Obtém informações do bot
        const botInfo = await bot.telegram.getMe();
        console.log('Bot info obtido:', botInfo);
  
        try {
          // Tenta sair do grupo
          await bot.telegram.leaveChat(group.chatId);
          console.log('Bot saiu do grupo com sucesso');
        } catch (error) {
          if (error.description?.includes('bot is not a member')) {
            console.log('Bot já não está no grupo');
          } else {
            throw error;
          }
        }
  
        // Remove o grupo do banco de dados
        await Group.deleteOne({ _id: groupId });
        console.log('Grupo removido do banco de dados');
  
        return res.json({ 
          success: true, 
          message: 'Bot removido do grupo e grupo excluído do banco de dados' 
        });
      } catch (error) {
        console.error('Erro ao executar operações do bot:', error);
        throw error;
      }
    } catch (error) {
      console.error('Erro ao sair do grupo:', error);
      return res.status(400).json({ error: 'Erro ao sair do grupo' });
    } finally {
      if (bot) {
        try {
          await bot.stop();
          console.log('Bot parado com sucesso');
        } catch (error) {
          console.error('Erro ao parar bot:', error);
        }
      }
    }
  };

  
  exports.checkBotPermissions = async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.userId;
  
      const group = await Group.findOne({ _id: groupId, userId })
        .populate('botId', 'token');
  
      if (!group) {
        return res.status(404).json({ error: 'Grupo não encontrado' });
      }
  
      const bot = new Telegraf(group.botId.token);
  
      try {
        const isAdmin = await checkBotIsAdmin(bot, group.chatId);
  
        if (!isAdmin) {
          return res.status(400).json({
            error: 'Bot não é administrador',
            details: 'O bot precisa ser administrador para funcionar corretamente',
            status: 'needs_permission'
          });
        }
  
        const botMember = await bot.telegram.getChatMember(group.chatId, bot.botInfo.id);
  
        const permissions = {
          canSendMessages: botMember.can_send_messages || false,
          canDeleteMessages: botMember.can_delete_messages || false,
          isAdmin: true,
          status: 'active'
        };
  
        // Atualiza permissões no banco
        group.permissions = permissions;
        await group.save();
  
        res.json(permissions);
      } finally {
        bot.stop();
      }
    } catch (error) {
      console.error('Erro ao verificar permissões:', error);
      res.status(400).json({ error: 'Erro ao verificar permissões' });
    }
  };

  exports.listAvailableGroups = async (req, res) => {
    let bot = null;
    try {
      const { botId } = req.params;
      const userId = req.userId;
  
      // Verifica se o bot existe e pertence ao usuário
      const botDoc = await Bot.findOne({ _id: botId, userId });
      if (!botDoc) {
        return res.status(404).json({ error: 'Bot não encontrado' });
      }
  
      bot = new Telegraf(botDoc.token);
  
      // Busca grupos já cadastrados para este bot
      const existingGroups = await Group.find({ 
        botId, 
        status: { $ne: 'left' } 
      });
      const existingGroupIds = existingGroups.map(g => g.chatId);
  
      // Primeiro obtém as informações do bot
      const botInfo = await bot.telegram.getMe();
      console.log('Bot info obtido:', botInfo);
  
      // Obtém os updates do bot
      const updates = await bot.telegram.getUpdates(0, 100);
      console.log('Updates recebidos:', updates.length);
      
      // Mapeia todos os chats únicos dos updates
      const chats = new Map();
      
      // Para cada update, verifica se é de um grupo
      for (const update of updates) {
        if (update.message?.chat) {
          const chat = update.message.chat;
          if ((chat.type === 'group' || chat.type === 'supergroup') && !existingGroupIds.includes(chat.id.toString())) {
            chats.set(chat.id, chat);
          }
        }
      }
  
      console.log('Grupos encontrados:', chats.size);
  
      // Converte os chats para array e obtém informações adicionais
      const availableGroups = await Promise.all(
        Array.from(chats.values()).map(async (chat) => {
          try {
            // Passa o botInfo obtido anteriormente
            const isAdmin = await checkBotIsAdmin(bot, chat.id, botInfo);
            const membersCount = await bot.telegram.getChatMembersCount(chat.id);
  
            return {
              chatId: chat.id.toString(),
              title: chat.title,
              type: chat.type,
              membersCount,
              isAdmin,
              username: chat.username
            };
          } catch (error) {
            console.error(`Erro ao obter informações do grupo ${chat.id}:`, error);
            return null;
          }
        })
      );
  
      // Filtra os grupos null e ordena por título
      const validGroups = availableGroups
        .filter(group => group !== null)
        .sort((a, b) => a.title.localeCompare(b.title));
  
      console.log('Grupos válidos encontrados:', validGroups.length);
  
      return res.json(validGroups);
    } catch (error) {
      console.error('Erro ao listar grupos disponíveis:', error);
      return res.status(400).json({ 
        error: 'Erro ao listar grupos disponíveis',
        details: error.message
      });
    } finally {
      if (bot) {
        try {
          await bot.stop();
        } catch (error) {
          console.error('Erro ao parar bot:', error);
        }
      }
    }
  };

// API modificada para adicionar grupo usando chatId
exports.addGroup = async (req, res) => {
    let bot = null;
    try {
      const { botId, chatId } = req.body;
      const userId = req.userId;
  
      // Verifica se o bot existe e pertence ao usuário
      const botDoc = await Bot.findOne({ _id: botId, userId });
      if (!botDoc) {
        return res.status(404).json({ error: 'Bot não encontrado' });
      }
  
      // Verifica se o grupo já está cadastrado
      const existingGroup = await Group.findOne({ 
        botId, 
        chatId,
        status: { $ne: 'left' }
      });
  
      if (existingGroup) {
        return res.status(400).json({ error: 'Grupo já cadastrado para este bot' });
      }
  
      bot = new Telegraf(botDoc.token);
  
      // Primeiro obtém as informações do bot
      const botInfo = await bot.telegram.getMe();
      console.log('Bot info obtido:', botInfo);
  
      // Obtém informações do grupo
      const chat = await bot.telegram.getChat(chatId);
      console.log('Chat info obtido:', chat);
  
      const botMember = await bot.telegram.getChatMember(chatId, botInfo.id);
      console.log('Bot member info:', botMember);
  
      const membersCount = await bot.telegram.getChatMembersCount(chatId);
      console.log('Members count:', membersCount);
  
      const isAdmin = await checkBotIsAdmin(bot, chatId, botInfo);
      console.log('Is admin:', isAdmin);
  
      if (!isAdmin) {
        return res.status(400).json({
          error: 'Bot não é administrador',
          details: 'O bot precisa ser administrador do grupo para funcionar corretamente'
        });
      }
  
      // Cria o grupo no banco de dados
      const group = await Group.create({
        botId,
        userId,
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
  
      console.log('Grupo criado com sucesso:', group);
      return res.status(201).json(group);
  
    } catch (error) {
      console.error('Erro ao adicionar grupo:', error);
      return res.status(400).json({ 
        error: 'Erro ao adicionar grupo',
        details: error.message 
      });
    } finally {
      if (bot) {
        try {
          await bot.stop();
          console.log('Bot parado com sucesso');
        } catch (error) {
          console.error('Erro ao parar bot:', error);
        }
      }
    }
  };
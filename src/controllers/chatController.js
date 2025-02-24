// src/controllers/chatController.js
const Redis = require('ioredis');
const Bot = require('../models/Bot');
const { Telegraf } = require('telegraf');

const redisClient = new Redis({
  host: '147.79.111.143',
  port: 6379,
  password: 'darklindo',
});

exports.listChats = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.userId;

    // Verifica se o bot pertence ao usuário
    const bot = await Bot.findOne({ _id: botId, userId });
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    // Obtém lista de chats ordenada por última mensagem
    const chatIds = await redisClient.zrevrange(`bot:${userId}:${botId}:chats`, 0, -1);
    console.log('Chat IDs encontrados:', chatIds);
    
    // Obtém informações de cada chat
    const chats = await Promise.all(chatIds.map(async (chatId) => {
      const chatInfo = await redisClient.hgetall(`chatinfo:${userId}:${botId}:${chatId}`);
      if (!chatInfo || Object.keys(chatInfo).length === 0) {
        console.log(`Chat info não encontrado para chat ${chatId}`);
        return null;
      }
      return {
        chatId,
        ...chatInfo,
        lastMessageAt: parseInt(chatInfo.lastMessageAt),
        unreadCount: parseInt(chatInfo.unreadCount || '0')
      };
    }));

    // Filtra chats que não foram encontrados
    const validChats = chats.filter(chat => chat !== null);
  //  console.log('Chats válidos:', validChats);

    return res.json(validChats);
  } catch (error) {
    console.error('Erro ao listar chats:', error);
    return res.status(400).json({ error: 'Erro ao listar chats' });
  }
};

exports.getChatMessages = async (req, res) => {
    try {
      const { botId, chatId } = req.params;
      const { page = 0, limit = 50 } = req.query;
      const userId = req.userId;
  
      // Verifica se o bot pertence ao usuário
      const bot = await Bot.findOne({ _id: botId, userId });
      if (!bot) {
        return res.status(404).json({ error: 'Bot não encontrado' });
      }
  
      const start = page * limit;
      const end = start + limit - 1;
  
      // Obtém IDs das mensagens ordenadas por timestamp
      const messageIds = await redisClient.zrevrange(
        `chat:${userId}:${botId}:${chatId}:messages`,
        start,
        end
      );
  
      // Obtém as mensagens
      const messages = await Promise.all(messageIds.map(async (messageId) => {
        const message = await redisClient.hgetall(`msg:${userId}:${botId}:${chatId}:${messageId}`);
        if (!message || Object.keys(message).length === 0) {
          return null;
        }
  
        // Processa o campo media
        let mediaData = null;
        if (message.media && message.media !== '' && message.media !== 'null') {
          try {
            mediaData = JSON.parse(message.media);
          } catch (error) {
       //    console.error(`Erro ao parsear media para mensagem ${messageId}:`, error);
         //   console.error('Conteúdo da media:', message.media);
            mediaData = null;
          }
        }
  
        return {
          ...message,
          timestamp: parseInt(message.timestamp || '0'),
          media: mediaData
        };
      }));
  
      // Filtra mensagens nulas
      const validMessages = messages.filter(msg => msg !== null);
  
      // Obtém o total de mensagens para paginação
      const totalMessages = await redisClient.zcard(`chat:${userId}:${botId}:${chatId}:messages`);
  
      // Reseta contador de mensagens não lidas
      await redisClient.hset(`chatinfo:${userId}:${botId}:${chatId}`, 'unreadCount', 0);
  
      return res.json({
        messages: validMessages.map(msg => ({
          ...msg,
          media: msg.media, // Garante que media é um objeto ou null
          type: msg.type || 'text' // Garante que type sempre existe
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalMessages,
          hasMore: totalMessages > (page + 1) * limit
        }
      });
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      return res.status(400).json({ error: 'Erro ao buscar mensagens' });
    }
  };


  exports.sendMessage = async (req, res) => {
    let telegram = null;
    try {
      const { botId, chatId } = req.params;
      const { text } = req.body;
      const userId = req.userId;
  
      // Verifica se o texto foi fornecido
      if (!text || text.trim() === '') {
        return res.status(400).json({ error: 'Texto da mensagem é obrigatório' });
      }
  
      // Verifica se o bot pertence ao usuário
      const bot = await Bot.findOne({ _id: botId, userId });
      if (!bot) {
        return res.status(404).json({ error: 'Bot não encontrado' });
      }
  
      try {
        // Inicializa o bot
        telegram = new Telegraf(bot.token);
  
        // Primeiro vamos obter as informações do bot para garantir que está funcionando
        const botInfo = await telegram.telegram.getMe();
        console.log('Bot info:', botInfo);
  
        // Envia a mensagem
        console.log('Enviando mensagem para chat:', chatId);
        const sentMessage = await telegram.telegram.sendMessage(chatId, text);
        console.log('Mensagem enviada:', sentMessage);
  
        // Gera os dados da mensagem no mesmo formato que recebemos
        const messageData = {
          messageId: sentMessage.message_id.toString(),
          chatId: chatId.toString(),
          userId: botInfo.id.toString(),
          username: botInfo.username || '',
          firstName: botInfo.first_name || '',
          lastName: '',
          text: sentMessage.text,
          type: 'text',
          timestamp: Date.now(),
          botId: botId.toString(),
          ownerUserId: userId,
          media: null,
          fromMe: true
        };
  
        // Salva a mensagem no Redis
        const messageKey = `msg:${userId}:${botId}:${chatId}:${messageData.messageId}`;
        await redisClient.hmset(messageKey, messageData);
        
        // Adiciona à lista ordenada de mensagens
        await redisClient.zadd(
          `chat:${userId}:${botId}:${chatId}:messages`,
          messageData.timestamp,
          messageData.messageId
        );
  
        // Atualiza informações do chat
        const chatKey = `chatinfo:${userId}:${botId}:${chatId}`;
        await redisClient.hmset(chatKey, {
          lastMessageAt: messageData.timestamp,
          username: messageData.username,
          firstName: messageData.firstName,
          lastName: messageData.lastName
        });
  
        // Atualiza lista de chats do bot
        await redisClient.zadd(
          `bot:${userId}:${botId}:chats`,
          messageData.timestamp,
          chatId
        );
  
        return res.json({
          success: true,
          message: messageData
        });
  
      } catch (telegramError) {
        console.error('Erro ao enviar mensagem pelo Telegram:', telegramError);
        
        if (telegramError.description?.includes('bot was blocked')) {
          return res.status(400).json({ 
            error: 'Bot foi bloqueado pelo usuário',
            details: 'O usuário precisa desbloquear o bot para receber mensagens'
          });
        }
  
        if (telegramError.description?.includes('chat not found')) {
          return res.status(400).json({ 
            error: 'Chat não encontrado',
            details: 'O chat pode ter sido deletado ou o bot removido'
          });
        }
  
        throw telegramError;
      }
  
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      return res.status(400).json({ 
        error: 'Erro ao enviar mensagem',
        details: error.message
      });
    } finally {
      // Garante que o bot seja parado mesmo em caso de erro
      if (telegram) {
        try {
          await telegram.stop();
          console.log('Bot parado com sucesso');
        } catch (error) {
          console.error('Erro ao parar bot:', error);
        }
      }
    }
  };

exports.searchMessages = async (req, res) => {
  try {
    const { botId, chatId } = req.params;
    const { query } = req.query;
    const userId = req.userId;

    // Verifica se o bot pertence ao usuário
    const bot = await Bot.findOne({ _id: botId, userId });
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    // Obtém todas as mensagens do chat
    const messageIds = await redisClient.zrange(
      `chat:${userId}:${botId}:${chatId}:messages`,
      0,
      -1
    );

    // Filtra mensagens que contêm o texto da busca
    const messages = [];
    for (const messageId of messageIds) {
      const message = await redisClient.hgetall(`msg:${userId}:${botId}:${chatId}:${messageId}`);
      if (message.text && message.text.toLowerCase().includes(query.toLowerCase())) {
        if (message.media && typeof message.media === 'string') {
          try {
            message.media = JSON.parse(message.media);
          } catch (error) {
            console.error('Erro ao parsear media:', error);
          }
        }
        messages.push({
          ...message,
          timestamp: parseInt(message.timestamp)
        });
      }
    }

    return res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    return res.status(400).json({ error: 'Erro ao buscar mensagens' });
  }
};

exports.getChatInfo = async (req, res) => {
  try {
    const { botId, chatId } = req.params;
    const userId = req.userId;

    // Verifica se o bot pertence ao usuário
    const bot = await Bot.findOne({ _id: botId, userId });
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    // Obtém informações do chat
    const chatInfo = await redisClient.hgetall(`chatinfo:${userId}:${botId}:${chatId}`);
    if (!chatInfo || Object.keys(chatInfo).length === 0) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    return res.json({
      ...chatInfo,
      lastMessageAt: parseInt(chatInfo.lastMessageAt),
      unreadCount: parseInt(chatInfo.unreadCount || '0')
    });
  } catch (error) {
    console.error('Erro ao buscar informações do chat:', error);
    return res.status(400).json({ error: 'Erro ao buscar informações do chat' });
  }
};
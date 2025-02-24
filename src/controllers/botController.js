// src/controllers/botController.js
const Bot = require('../models/Bot');
const User = require('../models/User');
const { Telegraf } = require('telegraf');
const BotManager = require('../services/BotManager');

// Função auxiliar para validar token do bot
async function validateBotToken(token) {
  try {
    const bot = new Telegraf(token);
    const botInfo = await bot.telegram.getMe();
    return {
      valid: true,
      info: {
        username: botInfo.username,
        firstName: botInfo.first_name,
        botId: botInfo.id.toString()
      }
    };
  } catch (error) {
    console.error('Erro ao validar token:', error);
    return {
      valid: false,
      error: error.message
    };
  }
}

exports.createBot = async (req, res) => {
  try {
    const { name, token } = req.body;
    const userId = req.userId;

    // Verifica se o usuário existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verifica limites do plano
    const userBots = await Bot.countDocuments({ userId });
    if (userBots >= user.limits.maxGroups) {
      return res.status(400).json({ 
        error: 'Limite de bots atingido',
        currentCount: userBots,
        maxLimit: user.limits.maxGroups
      });
    }

    // Verifica se já existe um bot com este token
    const existingBot = await Bot.findOne({ token });
    if (existingBot) {
      return res.status(400).json({ error: 'Token já está em uso' });
    }

    // Valida o token do bot
    const validation = await validateBotToken(token);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Token inválido',
        details: validation.error
      });
    }

    // Cria o bot
    const bot = await Bot.create({
      name,
      token,
      userId,
      status: 'active',
      botInfo: validation.info
    });

    try {
        // Inicia o bot no BotManager
        console.log('Iniciando bot no BotManager...');
         BotManager.addBot(bot);
        console.log('Bot iniciado com sucesso no BotManager');
      } catch (error) {
        console.error('Erro ao iniciar bot no BotManager:', error);
        // Não falha a criação se o BotManager falhar
      }
    
    res.status(201).json(bot);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    res.status(400).json({ error: 'Erro ao criar bot' });
  }
};

exports.listBots = async (req, res) => {
  try {
    const userId = req.userId;
    const bots = await Bot.find({ userId }).select('-token'); // Não retorna o token por segurança

    res.json(bots);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao listar bots' });
  }
};

exports.getBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.userId;

    const bot = await Bot.findOne({ _id: botId, userId }).select('-token');
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    res.json(bot);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao buscar bot' });
  }
};

exports.updateBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.userId;
    const updates = req.body;

    // Não permite atualizar userId
    delete updates.userId;

    // Se estiver atualizando o token, valida primeiro
    if (updates.token) {
      const validation = await validateBotToken(updates.token);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Token inválido',
          details: validation.error
        });
      }
      updates.botInfo = validation.info;
      updates.status = 'active';
    }

    const bot = await Bot.findOneAndUpdate(
      { _id: botId, userId },
      updates,
      { new: true, runValidators: true }
    ).select('-token');

    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    res.json(bot);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar bot' });
  }
};

exports.deleteBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const userId = req.userId;

    const bot = await Bot.findOneAndDelete({ _id: botId, userId });
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    try {
        // Remove o bot do BotManager
        console.log('Removendo bot do BotManager...');
        await BotManager.removeBot(botId);
        console.log('Bot removido com sucesso do BotManager');
      } catch (error) {
        console.error('Erro ao remover bot do BotManager:', error);
        // Não falha a deleção se o BotManager falhar
      }
      
    res.json({ message: 'Bot deletado com sucesso' });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao deletar bot' });
  }
};

exports.validateToken = async (req, res) => {
  try {
    const { token } = req.body;

    const validation = await validateBotToken(token);
    res.json(validation);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao validar token' });
  }
};
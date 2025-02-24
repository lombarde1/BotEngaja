// src/controllers/userController.js
const User = require('../models/User');
const Redis = require('ioredis');

const redisClient = new Redis({
  host: '147.79.111.143',
  port: 6379,
  password: 'darklindo',
});

exports.getProfile = async (req, res) => {
  try {
    console.log('=== Debug Profile Route ===');
    console.log('userId da requisição:', req.userId);
    console.log('Headers da requisição:', req.headers);
    // Por enquanto, vamos retornar o primeiro usuário encontrado
    const user = await User.findOne();
    
    if (!user) {
      return res.status(404).json({ error: 'Nenhum usuário encontrado' });
    }

    const response = {
      id: user._id,
      name: user.name,
      email: user.email,
      subscription: {
        plan: user.subscription.plan,
        status: user.subscription.status,
        validUntil: user.subscription.validUntil,
      },
      limits: user.limits,
      usage: {
        groupsCount: 0,
        messagesCount: 0,
        contactsCount: 0
      },
      createdAt: user.createdAt
    };

    res.json(response);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao buscar perfil' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Por enquanto, atualiza o primeiro usuário encontrado
    const user = await User.findOne();
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (email) {
      user.email = email;
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      email: user.email
    });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar perfil' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    // Por enquanto, atualiza o primeiro usuário encontrado
    const user = await User.findOne().select('+password');
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar senha' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    // Por enquanto, deleta o primeiro usuário encontrado
    const user = await User.findOne();
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await User.findByIdAndDelete(user._id);

    res.json({ message: 'Conta deletada com sucesso' });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao deletar conta' });
  }
};
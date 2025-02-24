// src/controllers/subscriptionController.js
const User = require('../models/User');
const Redis = require('ioredis');

const redisClient = new Redis({
  host: '147.79.111.143',
  port: 6379,
  password: 'darklindo',
});

exports.updateSubscription = async (req, res) => {
  try {
    const { plan } = req.body;
    
    if (!['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    user.subscription.plan = plan;
    user.subscription.validUntil = new Date(+new Date() + 30*24*60*60*1000); // +30 dias
    
    await user.save();

    // Atualiza cache no Redis
    await redisClient.set(`user:${user.id}:plan`, plan);
    
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar assinatura' });
  }
};

exports.checkSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      plan: user.subscription.plan,
      status: user.subscription.status,
      validUntil: user.subscription.validUntil,
      limits: user.limits
    });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao verificar assinatura' });
  }
};
// src/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'sua-chave-secreta-aqui'; // Use a mesma chave em todos os lugares!

exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (await User.findOne({ email })) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const user = await User.create({
      email,
      password,
      name
    });

    user.password = undefined;

    const token = jwt.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: '7d'
    });

    console.log('Token gerado com secret:', JWT_SECRET);
    console.log('Token completo:', token);

    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: 'Falha no registro' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    if (!await user.comparePassword(password)) {
      return res.status(400).json({ error: 'Senha inválida' });
    }

    user.password = undefined;

    const token = jwt.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: '7d'
    });

    console.log('Token gerado no login com secret:', JWT_SECRET);
    console.log('Token completo:', token);

    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: 'Falha no login' });
  }
};
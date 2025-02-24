// src/models/Bot.js
const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'inactive'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  botInfo: {
    username: String,
    firstName: String,
    botId: String
  },
  settings: {
    welcomeMessage: {
      type: String,
      default: 'Bem-vindo!'
    }
  },
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalUsers: {
      type: Number,
      default: 0
    },
    lastActivity: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Atualiza o updatedAt antes de salvar
botSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Bot = mongoose.model('Bot', botSchema);

module.exports = Bot;
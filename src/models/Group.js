// src/models/Group.js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['group', 'supergroup'],
    required: true
  },
  membersCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'left'],
    default: 'active'
  },
  permissions: {
    canSendMessages: {
      type: Boolean,
      default: false
    },
    canDeleteMessages: {
      type: Boolean,
      default: false
    },
    isAdmin: {
      type: Boolean,
      default: false
    }
  },
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    lastActivity: Date,
    messagesPerDay: [{
      date: Date,
      count: Number
    }]
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
groupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
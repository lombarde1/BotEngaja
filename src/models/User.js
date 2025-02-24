// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  name: {
    type: String,
    required: true
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'active'
    },
    validUntil: {
      type: Date,
      default: () => new Date(+new Date() + 30*24*60*60*1000) // 30 dias trial
    }
  },
  limits: {
    maxGroups: {
      type: Number,
      default: 1
    },
    maxMessagesPerDay: {
      type: Number,
      default: 100
    },
    maxContacts: {
      type: Number,
      default: 100
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para hash da senha
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Método para comparar senha
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Middleware para atualizar limites baseado no plano
userSchema.pre('save', function(next) {
  if (this.isModified('subscription.plan')) {
    switch (this.subscription.plan) {
      case 'free':
        this.limits = {
          maxGroups: 1,
          maxMessagesPerDay: 100,
          maxContacts: 100
        };
        break;
      case 'pro':
        this.limits = {
          maxGroups: 5,
          maxMessagesPerDay: 1000,
          maxContacts: 1000
        };
        break;
      case 'enterprise':
        this.limits = {
          maxGroups: 20,
          maxMessagesPerDay: 5000,
          maxContacts: 5000
        };
        break;
    }
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
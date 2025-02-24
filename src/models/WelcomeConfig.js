// src/models/WelcomeConfig.js
const mongoose = require('mongoose');

const welcomeConfigSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
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
    isActive: {
        type: Boolean,
        default: true
    },
    stats: {
        totalTriggered: {
            type: Number,
            default: 0
        },
        lastTriggered: Date,
        recentMembers: [{
            userId: String,
            username: String,
            triggeredAt: Date
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

// Índices compostos para garantir unicidade e performance
welcomeConfigSchema.index({ groupId: 1, botId: 1 }, { unique: true });

// Middleware para atualizar updatedAt
welcomeConfigSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const WelcomeConfig = mongoose.model('WelcomeConfig', welcomeConfigSchema);

module.exports = WelcomeConfig;
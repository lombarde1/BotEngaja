// src/models/StartConfig.js
const mongoose = require('mongoose');

const startConfigSchema = new mongoose.Schema({
    botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bot',
        required: true
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
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
        recentUsers: [{
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
startConfigSchema.index({ botId: 1 }, { unique: true });

// Middleware para atualizar updatedAt
startConfigSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const StartConfig = mongoose.model('StartConfig', startConfigSchema);

module.exports = StartConfig;
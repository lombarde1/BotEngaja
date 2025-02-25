// src/models/Lead.js
const mongoose = require('mongoose');

const messageHistorySchema = new mongoose.Schema({
    messageId: String,
    type: {
        type: String,
        enum: ['text', 'photo', 'video', 'audio', 'document', 'sticker', 'other'],
        default: 'text'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow'
    },
    success: {
        type: Boolean,
        default: true
    },
    error: String
});

const leadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bot',
        required: true
    },
    telegramId: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        default: ''
    },
    lastName: {
        type: String,
        default: ''
    },
    username: {
        type: String,
        default: ''
    },
    languageCode: {
        type: String,
        default: 'pt'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [{
        type: String
    }],
    messageHistory: [messageHistorySchema],
    lastInteraction: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índice para busca rápida
leadSchema.index({ botId: 1, telegramId: 1 }, { unique: true });

// Índice para busca por tag
leadSchema.index({ botId: 1, tags: 1 });

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
// src/models/Lead.js
const mongoose = require('mongoose');

const messageHistorySchema = new mongoose.Schema({
    messageId: String,
    type: {
        type: String,
        enum: ['text', 'photo', 'video', 'audio', 'document', 'sticker', 'voice'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    success: {
        type: Boolean,
        default: true
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow'
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SmartRemarketingCampaign'
    },
    error: String
});

const leadSchema = new mongoose.Schema({
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
    telegramId: {
        type: String,
        required: true
    },
    firstName: String,
    lastName: String,
    username: String,
    languageCode: String,
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [String],
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: () => new Map()
    },
    messageHistory: [messageHistorySchema],
    lastInteraction: {
        type: Date,
        default: Date.now
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

// Índices
leadSchema.index({ botId: 1, telegramId: 1 }, { unique: true });
leadSchema.index({ botId: 1, tags: 1 });
leadSchema.index({ isActive: 1 });

// Middleware para atualizar updatedAt
leadSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
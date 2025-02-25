// src/models/ScheduledMessage.js
const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
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
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
    },
    telegramId: {
        type: String,
        required: true
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
    scheduledTime: {
        type: Date,
        required: true,
        index: true // Importante para consultas rápidas
    },
    remarketingContinuoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RemarketingContinuo',
        required: true
    },
    scheduledFlowId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'cancelled'],
        default: 'pending'
    },
    sentAt: Date,
    error: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índice composto para buscar mensagens pendentes de forma eficiente
scheduledMessageSchema.index({ status: 1, scheduledTime: 1 });

const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);

module.exports = ScheduledMessage;
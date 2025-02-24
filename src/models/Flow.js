// src/models/Flow.js
const mongoose = require('mongoose');

const messageStepSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['text', 'photo', 'video', 'audio', 'document', 'sticker'],
        required: true
    },
    content: {
        text: String,
        mediaUrl: String,
        caption: String,
        fileId: String
    },
    delay: {
        type: Number,
        default: 0, // Delay em segundos
        min: 0,
        max: 300 // Máximo de 5 minutos
    },
    conditions: {
        timeRestrictions: {
            daysOfWeek: [Number], // 0-6 (Domingo-Sábado)
            timeStart: String, // formato "HH:mm"
            timeEnd: String
        },
        userProperties: {
            hasUsername: Boolean,
            isGroupAdmin: Boolean
        }
    },
    buttons: [{
        type: {
            type: String,
            enum: ['url', 'callback', 'nextStep'],
            required: true
        },
        text: {
            type: String,
            required: true
        },
        value: String, // URL, callback data ou ID do próximo passo
        nextStepId: String
    }],
    order: {
        type: Number,
        required: true
    }
});

const flowSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
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
    type: {
        type: String,
        enum: ['welcome', 'remarketing', 'custom'],
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    steps: [messageStepSchema],
    triggerEvents: {
        onStart: Boolean,
        onJoinGroup: Boolean,
        scheduledTime: {
            enabled: Boolean,
            cronExpression: String
        }
    },
    stats: {
        timesTriggered: {
            type: Number,
            default: 0
        },
        completionRate: {
            type: Number,
            default: 0
        },
        lastTriggered: Date,
        interactions: [{
            stepId: String,
            buttonClicks: Number,
            timestamp: Date
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

// Middleware para atualizar updatedAt
flowSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Flow = mongoose.model('Flow', flowSchema);

module.exports = Flow;
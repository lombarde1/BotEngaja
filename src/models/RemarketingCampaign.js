// src/models/RemarketingCampaign.js
const mongoose = require('mongoose');

const remarketingCampaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
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
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
        default: 'draft'
    },
    filter: {
        tags: [String],
        lastInteractionDays: Number,
        customFields: Object
    },
    schedule: {
        type: {
            type: String,
            enum: ['once', 'daily', 'weekly'],
            default: 'once'
        },
        startDate: Date,
        endDate: Date,
        timeOfDay: String, // formato "HH:mm"
        daysOfWeek: [Number], // 0-6 (Domingo-Sábado)
        timezone: {
            type: String,
            default: 'America/Sao_Paulo'
        }
    },
    throttling: {
        messagesPerMinute: {
            type: Number,
            default: 20,
            max: 30,
            min: 1
        },
        delayBetweenMessages: {
            type: Number,
            default: 1
        }
    },
    stats: {
        totalTargeted: {
            type: Number,
            default: 0
        },
        totalSent: {
            type: Number,
            default: 0
        },
        totalSucceeded: {
            type: Number,
            default: 0
        },
        totalFailed: {
            type: Number,
            default: 0
        },
        totalBlocked: {
            type: Number,
            default: 0
        },
        lastRun: Date,
        nextRun: Date,
        history: [{
            runDate: Date,
            targeted: Number,
            sent: Number,
            succeeded: Number,
            failed: Number,
            blocked: Number
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

// Índices
remarketingCampaignSchema.index({ userId: 1, botId: 1 });
remarketingCampaignSchema.index({ status: 1 });
remarketingCampaignSchema.index({ 'schedule.startDate': 1 });

// Middleware para atualizar updatedAt
remarketingCampaignSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const RemarketingCampaign = mongoose.model('RemarketingCampaign', remarketingCampaignSchema);

module.exports = RemarketingCampaign;
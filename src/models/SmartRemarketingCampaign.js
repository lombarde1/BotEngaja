// src/models/SmartRemarketingCampaign.js
const mongoose = require('mongoose');

const sequenceStepSchema = new mongoose.Schema({
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
    timeInterval: {
        value: {
            type: Number,
            required: true,
            min: 0
        },
        unit: {
            type: String,
            enum: ['minutes', 'hours', 'days'],
            default: 'days'
        }
    },
    timeOfDay: {
        type: String,
        default: null // Formato HH:MM - será usado apenas para unidade 'days'
    },
    active: {
        type: Boolean,
        default: true
    },
    description: String
});

const smartRemarketingSchema = new mongoose.Schema({
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
    isActive: {
        type: Boolean,
        default: true
    },
    filter: {
        tags: [String],
        excludeTags: [String],
        customFields: Object
    },
    sequence: [sequenceStepSchema],
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
        totalLeadsEntered: {
            type: Number,
            default: 0
        },
        totalMessagesSent: {
            type: Number,
            default: 0
        },
        totalFlowsCompleted: {
            type: Number,
            default: 0
        },
        dailyStats: [{
            date: Date,
            messagesSent: Number,
            newLeads: Number,
            completedFlows: Number
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
smartRemarketingSchema.index({ userId: 1, botId: 1 });
smartRemarketingSchema.index({ isActive: 1 });

// Middleware para atualizar updatedAt
smartRemarketingSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Middleware para validar configurações de tempo
sequenceStepSchema.pre('validate', function(next) {
    // timeOfDay só deve ser usado com unidade 'days'
    if (this.timeInterval.unit !== 'days' && this.timeOfDay) {
        this.timeOfDay = null;
    }
    
    // Valida o formato do timeOfDay
    if (this.timeOfDay && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(this.timeOfDay)) {
        this.invalidate('timeOfDay', 'Formato de horário inválido. Use o formato HH:MM (24h)');
    }
    
    next();
});

const SmartRemarketingCampaign = mongoose.model('SmartRemarketingCampaign', smartRemarketingSchema);

module.exports = SmartRemarketingCampaign;
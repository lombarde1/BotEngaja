// src/models/RemarketingContinuo.js
const mongoose = require('mongoose');

const scheduledFlowSchema = new mongoose.Schema({
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
    delayMinutes: {
        type: Number,
        required: true,
        min: 1
    },
    isActive: {
        type: Boolean,
        default: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    order: {
        type: Number,
        default: 0
    }
});

const remarketingContinuoSchema = new mongoose.Schema({
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
    isActive: {
        type: Boolean,
        default: true
    },
    scheduledFlows: [scheduledFlowSchema],
    stats: {
        totalLeadsProcessed: {
            type: Number,
            default: 0
        },
        totalMessagesTriggered: {
            type: Number,
            default: 0
        },
        lastExecutionTime: Date,
        successRate: {
            type: Number,
            default: 0
        }
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
remarketingContinuoSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const RemarketingContinuo = mongoose.model('RemarketingContinuo', remarketingContinuoSchema);

module.exports = RemarketingContinuo;
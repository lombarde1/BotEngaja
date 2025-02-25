// src/models/LeadSequenceProgress.js
const mongoose = require('mongoose');

const stepProgressSchema = new mongoose.Schema({
    stepIndex: {
        type: Number,
        required: true
    },
    flowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flow',
        required: true
    },
    scheduledFor: {
        type: Date,
        required: true
    },
    sentAt: {
        type: Date,
        required: true
    },
    success: {
        type: Boolean,
        default: true
    },
    error: String
});

const leadSequenceProgressSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SmartRemarketingCampaign',
        required: true
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    lastStepIndex: {
        type: Number,
        default: -1 // Inicia com -1 para indicar que nenhum passo foi processado
    },
    nextStepScheduledFor: {
        type: Date,
        required: true
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    completedAt: {
        type: Date,
        default: null
    },
    stepProgress: [stepProgressSchema],
    
    // Novos campos para controle de processamento
    processingStep: {
        type: Number,
        default: null
    },
    processingStartedAt: {
        type: Date,
        default: null
    },
    lastStepSentAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // Adiciona createdAt e updatedAt
});

// Índices para melhorar performance
leadSequenceProgressSchema.index({ leadId: 1, campaignId: 1 }, { unique: true });
leadSequenceProgressSchema.index({ nextStepScheduledFor: 1, isCompleted: 1 });
leadSequenceProgressSchema.index({ processingStep: 1, processingStartedAt: 1 });

const LeadSequenceProgress = mongoose.model('LeadSequenceProgress', leadSequenceProgressSchema);

module.exports = LeadSequenceProgress;
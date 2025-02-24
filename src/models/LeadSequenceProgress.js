// src/models/LeadSequenceProgress.js
const mongoose = require('mongoose');

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
        default: -1 // -1 significa que nenhum passo foi concluído ainda
    },
    lastStepSentAt: Date,
    nextStepScheduledFor: Date,
    isCompleted: {
        type: Boolean,
        default: false
    },
    completedAt: Date,
    stepProgress: [{
        stepIndex: Number,
        flowId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Flow'
        },
        scheduledFor: Date,
        sentAt: Date,
        success: Boolean,
        error: String
    }]
});

// Índices para queries eficientes
leadSequenceProgressSchema.index({ leadId: 1, campaignId: 1 }, { unique: true });
leadSequenceProgressSchema.index({ nextStepScheduledFor: 1, isCompleted: 1 });
leadSequenceProgressSchema.index({ campaignId: 1, isCompleted: 1 });

const LeadSequenceProgress = mongoose.model('LeadSequenceProgress', leadSequenceProgressSchema);

module.exports = LeadSequenceProgress;
// src/routes/smartRemarketingRoutes.js
const express = require('express');
const router = express.Router();
const smartRemarketingController = require('../controllers/smartRemarketingController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas de gerenciamento de campanhas
router.post('/campaigns', smartRemarketingController.createCampaign);
router.get('/campaigns', smartRemarketingController.listCampaigns);
router.get('/campaigns/:campaignId', smartRemarketingController.getCampaign);
router.put('/campaigns/:campaignId', smartRemarketingController.updateCampaign);
router.delete('/campaigns/:campaignId', smartRemarketingController.deleteCampaign);

// Rotas de controle e análise
router.patch('/campaigns/:campaignId/status', smartRemarketingController.toggleCampaignStatus);
router.get('/campaigns/:campaignId/progress', smartRemarketingController.getCampaignProgress);
router.get('/campaigns/:campaignId/leads', smartRemarketingController.getCampaignLeads);
router.post('/campaigns/:campaignId/leads/:leadId/reset', smartRemarketingController.resetLeadProgress);

// Estatísticas
router.get('/stats', smartRemarketingController.getStats);

module.exports = router;
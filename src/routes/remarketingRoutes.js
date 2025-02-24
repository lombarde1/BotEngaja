// src/routes/remarketingRoutes.js
const express = require('express');
const router = express.Router();
const remarketingController = require('../controllers/remarketingController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas de gerenciamento de campanhas
router.post('/campaigns', remarketingController.createCampaign);
router.get('/campaigns', remarketingController.listCampaigns);
router.get('/campaigns/:campaignId', remarketingController.getCampaign);
router.put('/campaigns/:campaignId', remarketingController.updateCampaign);
router.delete('/campaigns/:campaignId', remarketingController.deleteCampaign);

// Rotas de controle de campanhas
router.post('/campaigns/:campaignId/schedule', remarketingController.scheduleCampaign);
router.post('/campaigns/:campaignId/pause', remarketingController.pauseCampaign);
router.post('/campaigns/:campaignId/cancel', remarketingController.cancelCampaign);
router.post('/campaigns/:campaignId/execute', remarketingController.executeNow);
router.post('/campaigns/:campaignId/test', remarketingController.testCampaign);
router.get('/campaigns/:campaignId/leads', remarketingController.getTargetedLeads);

module.exports = router;
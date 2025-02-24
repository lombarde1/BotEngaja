// src/routes/leadRoutes.js
const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

router.get('/', leadController.listLeads);
router.get('/stats', leadController.getLeadStats);
router.get('/:leadId', leadController.getLead);
router.put('/:leadId', leadController.updateLead);
router.post('/:leadId/tags', leadController.addTag);
router.delete('/:leadId/tags/:tag', leadController.removeTag);
router.post('/tags', leadController.bulkAddTag);
router.delete('/tags', leadController.bulkRemoveTag);
router.post('/:leadId/custom-fields', leadController.setCustomField);

module.exports = router;
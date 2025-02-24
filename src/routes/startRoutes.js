// src/routes/startRoutes.js
const express = require('express');
const router = express.Router();
const startController = require('../controllers/startController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

router.post('/', startController.createStartConfig);
router.get('/', startController.listStartConfigs);
router.get('/:configId', startController.getStartConfig);
router.get('/bot/:botId', startController.getStartConfigByBot);
router.put('/:configId', startController.updateStartConfig);
router.delete('/:configId', startController.deleteStartConfig);

module.exports = router;
// src/routes/welcomeRoutes.js
const express = require('express');
const router = express.Router();
const welcomeController = require('../controllers/welcomeController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

router.post('/', welcomeController.createWelcomeConfig);
router.get('/', welcomeController.listWelcomeConfigs);
router.get('/:configId', welcomeController.getWelcomeConfig);
router.put('/:configId', welcomeController.updateWelcomeConfig);
router.delete('/:configId', welcomeController.deleteWelcomeConfig);

module.exports = router;
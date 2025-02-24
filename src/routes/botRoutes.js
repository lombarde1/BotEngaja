// src/routes/botRoutes.js
const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas para gerenciamento de bots
router.post('/', botController.createBot);
router.get('/', botController.listBots);
router.get('/:botId', botController.getBot);
router.put('/:botId', botController.updateBot);
router.delete('/:botId', botController.deleteBot);

// Rota para validação de token
router.post('/validate-token', botController.validateToken);

module.exports = router;
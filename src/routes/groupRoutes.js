// src/routes/groupRoutes.js
const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Nova rota para listar grupos disponíveis
router.get('/available/:botId', groupController.listAvailableGroups);

// Rotas de gerenciamento de grupos
router.post('/', groupController.addGroup);
router.get('/', groupController.listGroups);
router.get('/:groupId/metrics', groupController.getGroupMetrics);
router.put('/:groupId', groupController.updateGroup);
router.delete('/:groupId', groupController.leaveGroup);
router.get('/:groupId/permissions', groupController.checkBotPermissions);

module.exports = router;
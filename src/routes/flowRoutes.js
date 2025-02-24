// src/routes/flowRoutes.js
const express = require('express');
const router = express.Router();
const flowController = require('../controllers/flowController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas de CRUD
router.post('/', flowController.createFlow);
router.get('/', flowController.listFlows);
router.get('/:flowId', flowController.getFlow);
router.put('/:flowId', flowController.updateFlow);
router.delete('/:flowId', flowController.deleteFlow);

// Rota de execução
router.post('/execute', flowController.executeFlow);

module.exports = router;
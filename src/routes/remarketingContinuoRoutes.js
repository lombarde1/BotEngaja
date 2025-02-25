// src/routes/remarketingContinuoRoutes.js
const express = require('express');
const router = express.Router();
const remarketingContinuoController = require('../controllers/remarketingContinuoController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas de CRUD para remarketing contínuo
router.post('/', remarketingContinuoController.createRemarketingContinuo);
router.get('/', remarketingContinuoController.listRemarketingContinuo);
router.get('/:id', remarketingContinuoController.getRemarketingContinuo);
router.put('/:id', remarketingContinuoController.updateRemarketingContinuo);
router.delete('/:id', remarketingContinuoController.deleteRemarketingContinuo);

// Rota para estatísticas
router.get('/:id/stats', remarketingContinuoController.getRemarketingContinuoStats);

module.exports = router;
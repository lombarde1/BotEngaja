// src/routes/mediaRoutes.js
const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas para gerenciamento de mídia
router.get('/:botId/:fileId/url', mediaController.getMediaUrl);
router.get('/:botId/:fileId/info', mediaController.getFileInfo);

module.exports = router;
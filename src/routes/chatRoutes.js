// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

// Rotas de chat
router.get('/bot/:botId/chats', chatController.listChats);
router.get('/bot/:botId/chat/:chatId', chatController.getChatInfo);
router.get('/bot/:botId/chat/:chatId/messages', chatController.getChatMessages);
router.get('/bot/:botId/chat/:chatId/search', chatController.searchMessages);

// Nova rota para enviar mensagem
router.post('/bot/:botId/chat/:chatId/message', chatController.sendMessage);

module.exports = router;
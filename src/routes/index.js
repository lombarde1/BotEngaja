// src/routes/index.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const authController = require('../controllers/authController');
const subscriptionController = require('../controllers/subscriptionController');
const userRoutes = require('./userRoutes');


// Rotas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);

// Rotas protegidas
router.use(authMiddleware);
router.use('/user', userRoutes);

router.put('/subscription', subscriptionController.updateSubscription);
router.get('/subscription', subscriptionController.checkSubscription);

module.exports = router;
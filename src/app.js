require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const routes = require('./routes');
const botRoutes = require('./routes/botRoutes');
const groupRoutes = require('./routes/groupRoutes');
const chatRoutes = require('./routes/chatRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const flowRoutes = require('./routes/flowRoutes');
const welcomeRoutes = require('./routes/welcomeRoutes');
const startRoutes = require('./routes/startRoutes');
const leadRoutes = require('./routes/leadRoutes');
const remarketingRoutes = require('./routes/remarketingRoutes');
const smartRemarketingRoutes = require('./routes/smartRemarketingRoutes');

const app = express();

// Conexão com MongoDB
mongoose.connect('mongodb://darkvips:lombarde1@147.79.111.143:27017/botenagaja', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    authSource: 'admin'
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite de 100 requisições por IP
});

// Middlewares
app.use(helmet()); // Segurança
// Configuração detalhada do CORS
app.use(cors({
  origin: function(origin, callback) {
    console.log('Requisição origem:', origin);
    callback(null, true); // Permite todas as origens por enquanto
  },
  credentials: true
}));

// Log de todas as requisições
app.use((req, res, next) => {
 // console.log('=== Nova Requisição ===');
 // console.log('Método:', req.method);
 // console.log('URL:', req.url);
 // console.log('Origin:', req.headers.origin);
 // console.log('Authorization:', req.headers.authorization);
  next();
});
//app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
//app.use(limiter); // Rate limiting

// Routes
app.use('/api', routes);
app.use('/api/bots', botRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/welcome', welcomeRoutes);
app.use('/api/start', startRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/remarketing', remarketingRoutes);
app.use('/api/smart-remarketing', smartRemarketingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Erros de validação do Mongoose
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Erro de validação',
            details: Object.values(err.errors).map(error => error.message)
        });
    }

    // Erros de cast do Mongoose (ex: ID inválido)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Dados inválidos',
            details: err.message
        });
    }

    // Erros de duplicate key do MongoDB
    if (err.code === 11000) {
        return res.status(400).json({
            error: 'Dados duplicados',
            details: 'Um registro com estes dados já existe'
        });
    }

    // Erro genérico
    res.status(500).json({
        error: 'Erro interno do servidor',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    console.log('Closing HTTP server.');
    
    // Fecha o servidor HTTP
    server.close(() => {
        console.log('HTTP server closed.');
        
        // Fecha conexão com MongoDB
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
});

const PORT = process.env.PORT || 8652;
require('./services/BotManager');

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
// src/services/RedisLockService.js
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

class RedisLockService {
    constructor(redisConfig) {
        this.redisClient = new Redis(redisConfig);
        this.lockPrefix = 'lock:remarketing:';
        this.statePrefix = 'state:remarketing:';
        
        // Flag para verificar se o client está ativo
        this.isConnected = false;
        
        // Monitor Redis connection status
        this.redisClient.on('connect', () => {
            console.log('Redis connected successfully');
            this.isConnected = true;
        });
        
        this.redisClient.on('error', (err) => {
            console.error('Redis connection error:', err);
            this.isConnected = false;
        });
        
        this.redisClient.on('close', () => {
            console.log('Redis connection closed');
            this.isConnected = false;
        });
        
        this.redisClient.on('reconnecting', () => {
            console.log('Redis reconnecting...');
        });
    }
    
    /**
     * Tenta adquirir um lock com token único
     * @param {string} resourceId - ID do recurso a ser bloqueado
     * @param {number} ttl - Tempo de vida do lock em segundos
     * @returns {Promise<string|null>} - Token do lock ou null se não conseguir
     */
    async acquireLock(resourceId, ttl = 120) {
        const lockKey = `${this.lockPrefix}${resourceId}`;
        const lockToken = uuidv4();
        
        // Usa SET NX para garantir atomicidade
        const result = await this.redisClient.set(lockKey, lockToken, 'NX', 'EX', ttl);
        
        if (result === 'OK') {
            return lockToken;
        }
        
        return null;
    }
    
    /**
     * Libera um lock se o token corresponder
     * @param {string} resourceId - ID do recurso bloqueado
     * @param {string} lockToken - Token obtido ao adquirir o lock
     * @returns {Promise<boolean>} - Se foi liberado com sucesso
     */
    async releaseLock(resourceId, lockToken) {
        const lockKey = `${this.lockPrefix}${resourceId}`;
        
        // Script Lua para garantir que só liberamos nosso próprio lock
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        
        const result = await this.redisClient.eval(script, 1, lockKey, lockToken);
        return result === 1;
    }
    
    /**
     * Verifica se um recurso está bloqueado
     * @param {string} resourceId - ID do recurso
     * @returns {Promise<boolean>} - Se está bloqueado
     */
    async isLocked(resourceId) {
        const lockKey = `${this.lockPrefix}${resourceId}`;
        const exists = await this.redisClient.exists(lockKey);
        return exists === 1;
    }
    
    /**
     * Atualiza o TTL de um lock existente
     * @param {string} resourceId - ID do recurso
     * @param {string} lockToken - Token do lock
     * @param {number} ttl - Novo TTL em segundos
     * @returns {Promise<boolean>} - Se o TTL foi atualizado
     */
    async extendLock(resourceId, lockToken, ttl = 120) {
        const lockKey = `${this.lockPrefix}${resourceId}`;
        
        // Verificar se o lock ainda pertence a nós
        const currentToken = await this.redisClient.get(lockKey);
        if (currentToken !== lockToken) {
            return false;
        }
        
        const updated = await this.redisClient.expire(lockKey, ttl);
        return updated === 1;
    }
    
    /**
     * Armazena estado de processamento no Redis
     * @param {string} progressId - ID do progresso
     * @param {object} state - Objeto com estado
     * @param {number} ttl - TTL em segundos
     */
    async saveProgressState(progressId, state, ttl = 3600) {
        const stateKey = `${this.statePrefix}${progressId}`;
        await this.redisClient.set(stateKey, JSON.stringify(state), 'EX', ttl);
    }
    
    /**
     * Recupera estado de processamento do Redis
     * @param {string} progressId - ID do progresso
     * @returns {Promise<object|null>} - Estado ou null
     */
    async getProgressState(progressId) {
        const stateKey = `${this.statePrefix}${progressId}`;
        const state = await this.redisClient.get(stateKey);
        
        if (state) {
            try {
                return JSON.parse(state);
            } catch (e) {
                console.error('Erro ao parsear estado do Redis:', e);
                return null;
            }
        }
        
        return null;
    }
    
    /**
     * Remove estado de processamento
     * @param {string} progressId - ID do progresso
     */
    async removeProgressState(progressId) {
        const stateKey = `${this.statePrefix}${progressId}`;
        await this.redisClient.del(stateKey);
    }
    
    /**
     * Incrementa contador com expiração
     * @param {string} counterName - Nome do contador
     * @param {number} ttl - TTL em segundos 
     * @returns {Promise<number>} - Valor atual
     */
    async incrementCounter(counterName, ttl = 86400) {
        const key = `counter:${counterName}`;
        const value = await this.redisClient.incr(key);
        
        // Configura TTL se for um novo contador
        if (value === 1) {
            await this.redisClient.expire(key, ttl);
        }
        
        return value;
    }
    
    /**
     * Obtém valor atual do contador
     * @param {string} counterName - Nome do contador
     * @returns {Promise<number>} - Valor atual ou 0
     */
    async getCounter(counterName) {
        const key = `counter:${counterName}`;
        const value = await this.redisClient.get(key);
        return value ? parseInt(value, 10) : 0;
    }
    
    /**
     * Adiciona item a uma lista com limite de tamanho
     * @param {string} listName - Nome da lista
     * @param {string} value - Valor a adicionar
     * @param {number} maxItems - Máximo de itens
     * @param {number} ttl - TTL em segundos
     */
    async addToLimitedList(listName, value, maxItems = 100, ttl = 86400) {
        const key = `list:${listName}`;
        
        // Adiciona à lista
        await this.redisClient.lpush(key, value);
        
        // Limita o tamanho
        await this.redisClient.ltrim(key, 0, maxItems - 1);
        
        // Define TTL apenas se for uma nova lista
        const keyExists = await this.redisClient.exists(key);
        if (keyExists === 1) {
            await this.redisClient.expire(key, ttl);
        }
    }
    
    /**
     * Obtém itens de uma lista
     * @param {string} listName - Nome da lista
     * @param {number} start - Índice inicial
     * @param {number} end - Índice final
     * @returns {Promise<Array>} - Itens da lista
     */
    async getListItems(listName, start = 0, end = -1) {
        const key = `list:${listName}`;
        return await this.redisClient.lrange(key, start, end);
    }
    
    /**
     * Adiciona entrada de log com timestamp
     * @param {string} category - Categoria do log
     * @param {string} message - Mensagem
     * @param {Object} data - Dados adicionais
     */
    async addLog(category, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            category,
            message,
            data
        };
        
        const logKey = `logs:${category}`;
        
        // Adiciona log ao início da lista
        await this.redisClient.lpush(logKey, JSON.stringify(logEntry));
        
        // Limita tamanho da lista de logs
        await this.redisClient.ltrim(logKey, 0, 999);
        
        // Expira logs após 7 dias
        await this.redisClient.expire(logKey, 7 * 86400);
    }
    
    /**
     * Obtém logs recentes
     * @param {string} category - Categoria do log
     * @param {number} limit - Limite de logs
     * @returns {Promise<Array>} - Logs recentes
     */
    async getLogs(category, limit = 100) {
        const logKey = `logs:${category}`;
        const logs = await this.redisClient.lrange(logKey, 0, limit - 1);
        
        return logs.map(log => {
            try {
                return JSON.parse(log);
            } catch (e) {
                return { error: 'Invalid log format', raw: log };
            }
        });
    }
    
    /**
     * Fecha a conexão com o Redis
     */
    async disconnect() {
        await this.redisClient.quit();
    }
}

// Exporta uma instância pré-configurada
module.exports = new RedisLockService({
    host: '147.79.111.143',
    port: 6379,
    password: 'darklindo',
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    // Aumenta o tempo máximo de reconexão
    maxRetriesPerRequest: 3,
    // Ativa Cluster modo falso para compatibilidade
    enableOfflineQueue: true
});
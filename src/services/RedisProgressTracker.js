// src/services/RedisProgressTracker.js
const Redis = require('ioredis');
const LeadSequenceProgress = require('../models/LeadSequenceProgress');

class RedisProgressTracker {
    constructor(redisConfig) {
        this.redisClient = new Redis(redisConfig);
        
        // Prefixos para chaves Redis
        this.processingQueuePrefix = 'remarketing:processing:';
        this.scheduledQueuePrefix = 'remarketing:scheduled:';
        this.campaignLeadsPrefix = 'remarketing:campaign:';
        this.leadStatePrefix = 'remarketing:lead:';
        this.statsPrefix = 'remarketing:stats:';
        
        // Flag para verificar se o client está ativo
        this.isConnected = false;
        
        // Configuração de retry
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 segundo
        
        // Monitor Redis connection status
        this.redisClient.on('connect', () => {
            console.log('Progress Tracker: Redis connected successfully');
            this.isConnected = true;
        });
        
        this.redisClient.on('error', (err) => {
            console.error('Progress Tracker: Redis connection error:', err);
            this.isConnected = false;
        });
        
        // Adiciona handler para reconexão
        this.redisClient.on('reconnecting', () => {
            console.log('Progress Tracker: Attempting to reconnect to Redis...');
        });
        
        this.redisClient.on('ready', () => {
            console.log('Progress Tracker: Redis client is ready');
            this.isConnected = true;
        });
    }
    
  /**
 * Marca um progresso como "em processamento" no Redis
 * @param {string} progressId - ID do progresso
 * @param {number} stepIndex - Índice do passo
 * @param {Object} metadata - Metadados adicionais
 * @param {number} ttl - Tempo de vida em segundos
 * @returns {Promise<boolean>}
 */
async markAsProcessing(progressId, stepIndex, metadata = {}, ttl = 300) {
    try {
        const processingKey = `${this.processingQueuePrefix}${progressId}:${stepIndex}`;
        
        // VERIFICAÇÃO DUPLA - para garantir que não tenha sido marcado entre a verificação e a execução
        const alreadyProcessing = await this.redisClient.exists(processingKey);
        if (alreadyProcessing === 1) {
            console.log(`BLOQUEIO DUPLO: ${processingKey} já está sendo processado`);
            return false;
        }
        
        const data = {
            progressId,
            stepIndex,
            startedAt: new Date().toISOString(),
            ...metadata
        };
        
        const result = await this.redisClient.set(
            processingKey, 
            JSON.stringify(data), 
            'NX', // Apenas define se não existir
            'EX', 
            ttl
        );
        
        if (result === 'OK') {
            console.log(`Marcado com sucesso: ${processingKey}`);
            
            // IMPORTANTE: Remover dos conjuntos agendados APÓS marcar como em processamento
            const prefix = `${this.scheduledQueuePrefix}`;
            const keys = await this.redisClient.keys(`${prefix}*`);
            
            for (const key of keys) {
                // Para cada conjunto agendado, tenta remover este item
                const itemJson = await this.redisClient.zrange(key, 0, -1);
                
                for (const item of itemJson) {
                    try {
                        const parsedItem = JSON.parse(item);
                        
                        if (parsedItem.progressId === progressId && parsedItem.stepIndex === stepIndex) {
                            console.log(`Removendo item ${progressId}:${stepIndex} do conjunto ${key}`);
                            await this.redisClient.zrem(key, item);
                        }
                    } catch (e) {
                        // Ignora erros de parsing
                    }
                }
            }
            
            return true;
        } else {
            console.log(`Não foi possível marcar ${processingKey} (já existe ou erro)`);
            return false;
        }
    } catch (error) {
        console.error('Erro ao marcar progresso como processando:', error);
        return false;
    }
}
    
    /**
     * Verifica se um progresso está sendo processado
     * @param {string} progressId - ID do progresso
     * @param {number} stepIndex - Índice do passo
     * @returns {Promise<boolean>}
     */
    async isProcessing(progressId, stepIndex) {
        const processingKey = `${this.processingQueuePrefix}${progressId}:${stepIndex}`;
        
        try {
            const exists = await this.redisClient.exists(processingKey);
            return exists === 1;
        } catch (error) {
            console.error('Erro ao verificar se progresso está sendo processado:', error);
            return false; // Assume que não está sendo processado em caso de erro
        }
    }
    
    /**
     * Remove a marcação de processamento
     * @param {string} progressId - ID do progresso
     * @param {number} stepIndex - Índice do passo
     * @returns {Promise<boolean>}
     */
    async unmarkProcessing(progressId, stepIndex) {
        const processingKey = `${this.processingQueuePrefix}${progressId}:${stepIndex}`;
        
        try {
            const result = await this.redisClient.del(processingKey);
            return result === 1;
        } catch (error) {
            console.error('Erro ao remover marcação de processamento:', error);
            return false;
        }
    }
    

    /**
 * Remove o estado de progresso de um lead específico
 * @param {string} leadId - ID do lead
 * @param {string} campaignId - ID da campanha (opcional)
 * @returns {Promise<boolean>}
 */
async removeProgressState(leadId, campaignId = null) {
    try {
        if (campaignId) {
            // Remove apenas o estado específico da campanha
            const key = `${this.leadStatePrefix}${leadId}:${campaignId}`;
            await this.redisClient.del(key);
            
            // Remove também das listas de processamento
            const processingKeys = await this.redisClient.keys(`${this.processingQueuePrefix}${leadId}:*`);
            for (const key of processingKeys) {
                await this.redisClient.del(key);
            }
            
            // Remove da lista de leads da campanha
            const campaignKey = `${this.campaignLeadsPrefix}${campaignId}`;
            await this.redisClient.srem(campaignKey, leadId);
            
            console.log(`Estado do lead ${leadId} removido para campanha ${campaignId}`);
        } else {
            // Remove todos os estados do lead em todas as campanhas
            const stateKeys = await this.redisClient.keys(`${this.leadStatePrefix}${leadId}:*`);
            for (const key of stateKeys) {
                await this.redisClient.del(key);
            }
            
            // Remove de todas as listas de processamento
            const processingKeys = await this.redisClient.keys(`${this.processingQueuePrefix}${leadId}:*`);
            for (const key of processingKeys) {
                await this.redisClient.del(key);
            }
            
            // Remove de todas as listas de campanhas
            const campaignKeys = await this.redisClient.keys(`${this.campaignLeadsPrefix}*`);
            for (const key of campaignKeys) {
                await this.redisClient.srem(key, leadId);
            }
            
            console.log(`Todos os estados do lead ${leadId} foram removidos`);
        }
        
        return true;
    } catch (error) {
        console.error(`Erro ao remover estado do lead ${leadId}:`, error);
        return false;
    }
}

/**
 * Remove todos os dados de uma campanha do Redis
 * @param {string} campaignId - ID da campanha
 * @returns {Promise<boolean>}
 */
async removeCampaignData(campaignId) {
    try {
        // Obtém todos os leads da campanha
        const leads = await this.getCampaignLeads(campaignId);
        
        // Remove o estado de cada lead para esta campanha
        for (const leadId of leads) {
            await this.removeProgressState(leadId, campaignId);
        }
        
        // Remove a chave da lista de leads da campanha
        await this.redisClient.del(`${this.campaignLeadsPrefix}${campaignId}`);
        
        // Remove todas as estatísticas da campanha
        const statsKeys = await this.redisClient.keys(`${this.statsPrefix}${campaignId}:*`);
        for (const key of statsKeys) {
            await this.redisClient.del(key);
        }
        
        // Remove logs da campanha
        await this.redisClient.del(`remarketing:logs:${campaignId}`);
        
        console.log(`Todos os dados da campanha ${campaignId} foram removidos do Redis`);
        return true;
    } catch (error) {
        console.error(`Erro ao remover dados da campanha ${campaignId}:`, error);
        return false;
    }
}

    /**
     * Agenda um progresso para processamento futuro
     * @param {string} progressId - ID do progresso
     * @param {number} stepIndex - Índice do passo
     * @param {Date} scheduledFor - Data agendada
     * @param {Object} metadata - Metadados adicionais
     * @returns {Promise<boolean>}
     */
    async scheduleProcessing(progressId, stepIndex, scheduledFor, metadata = {}) {
        const timestamp = scheduledFor.getTime();
        const scheduledKey = `${this.scheduledQueuePrefix}${timestamp}`;
        
        const data = {
            progressId,
            stepIndex,
            scheduledFor: scheduledFor.toISOString(),
            ...metadata
        };
        
        try {
            // Adiciona ao sorted set com score = timestamp
            await this.redisClient.zadd(scheduledKey, timestamp, JSON.stringify(data));
            
            // Garante que a chave expira 1 hora após o tempo agendado (para limpeza)
            await this.redisClient.expire(scheduledKey, 3600 + Math.floor((timestamp - Date.now()) / 1000));
            
            return true;
        } catch (error) {
            console.error('Erro ao agendar processamento:', error);
            return false;
        }
    }
    /**
 * Busca progressos agendados que já deveriam ter sido processados
 * @param {number} limit - Limite de itens para retornar
 * @returns {Promise<Array>} - Lista de progressos pendentes
 */
async getPendingProcessing(limit = 10) { // Reduzido de 50 para 10 para limitar processamento paralelo
    const now = Date.now();
    
    try {
        // Pega todos os conjuntos agendados
        const keys = await this.redisClient.keys(`${this.scheduledQueuePrefix}*`);
        
        // Filtra conjuntos com timestamp <= agora
        const pendingKeys = keys.filter(key => {
            const timestamp = parseInt(key.split(':')[2], 10);
            return timestamp <= now;
        });
        
        if (pendingKeys.length === 0) {
            return [];
        }
        
        console.log(`Encontrados ${pendingKeys.length} conjuntos agendados pendentes`);
        
        // Junta todos os itens pendentes de todos os conjuntos
        let allPending = [];
        
        for (const key of pendingKeys) {
            // Processa um conjunto por vez para evitar sobrecarga
            const items = await this.redisClient.zrange(key, 0, -1);
            
            if (items.length > 0) {
                console.log(`Conjunto ${key} tem ${items.length} itens para processar`);
            }
            
            // Importante: Verificar quais já estão sendo processados ANTES de parsear
            const notBeingProcessed = [];
            
            for (const item of items) {
                try {
                    const parsedItem = JSON.parse(item);
                    const { progressId, stepIndex } = parsedItem;
                    
                    // Verifica se este item já está sendo processado
                    const processingKey = `${this.processingQueuePrefix}${progressId}:${stepIndex}`;
                    const isProcessing = await this.redisClient.exists(processingKey);
                    
                    if (isProcessing === 0) {
                        notBeingProcessed.push(parsedItem);
                    } else {
                        console.log(`Item ${progressId}:${stepIndex} já está sendo processado. Pulando.`);
                    }
                } catch (e) {
                    console.error('Erro ao parsear item agendado:', e);
                }
            }
            
            // Limita o número de itens por execução
            const itemsToProcess = notBeingProcessed.slice(0, limit - allPending.length);
            allPending = [...allPending, ...itemsToProcess];
            
            if (allPending.length >= limit) {
                console.log(`Limite de ${limit} itens atingido. Processando lote atual.`);
                break;
            }
            
            // NÃO remova os itens agendados ainda - isso será feito após processamento bem-sucedido
        }
        
        console.log(`Retornando ${allPending.length} itens para processamento`);
        
        // Limita e retorna (já filtramos os que estão sendo processados)
        return allPending;
    } catch (error) {
        console.error('Erro ao buscar progressos pendentes:', error);
        return [];
    }
}

    /**
     * Busca progressos do MongoDB que correspondem ao critério e atualiza Redis
     * @param {Date} cutoffDate - Data limite
     * @param {number} limit - Limite de itens
     * @returns {Promise<Array>} - Lista de progressos
     */
    async syncPendingFromMongoDB(cutoffDate, limit = 100) {
        try {
            // Busca no MongoDB
            const pendingProgress = await LeadSequenceProgress.find({
                nextStepScheduledFor: { $lte: cutoffDate },
                isCompleted: false
            })
            .populate('campaignId')
            .populate('leadId')
            .limit(limit);
            
            // Agenda no Redis
            for (const progress of pendingProgress) {
                if (!progress.campaignId || !progress.leadId) continue;
                
                const nextStepIndex = progress.lastStepIndex + 1;
                
                // Verifica se não está sendo processado
                const isProcessing = await this.isProcessing(progress._id.toString(), nextStepIndex);
                
                if (!isProcessing) {
                    await this.scheduleProcessing(
                        progress._id.toString(),
                        nextStepIndex,
                        progress.nextStepScheduledFor,
                        {
                            campaignId: progress.campaignId._id.toString(),
                            leadId: progress.leadId._id.toString()
                        }
                    );
                }
            }
            
            return pendingProgress;
        } catch (error) {
            console.error('Erro ao sincronizar progressos pendentes com MongoDB:', error);
            return [];
        }
    }
    
    /**
     * Atualiza estado do lead em relação à campanha
     * @param {string} leadId - ID do lead
     * @param {string} campaignId - ID da campanha
     * @param {Object} state - Estado para salvar
     * @param {number} ttl - TTL em segundos
     */
    async updateLeadState(leadId, campaignId, state, ttl = 86400) {
        const key = `${this.leadStatePrefix}${leadId}:${campaignId}`;
        
        try {
            await this.redisClient.set(key, JSON.stringify(state), 'EX', ttl);
            
            // Também adiciona à lista de leads da campanha se ainda não estiver
            const campaignKey = `${this.campaignLeadsPrefix}${campaignId}`;
            await this.redisClient.sadd(campaignKey, leadId);
            await this.redisClient.expire(campaignKey, 30 * 86400); // 30 dias
            
            return true;
        } catch (error) {
            console.error('Erro ao atualizar estado do lead:', error);
            return false;
        }
    }
    
    /**
     * Obtém estado atual do lead em relação à campanha
     * @param {string} leadId - ID do lead
     * @param {string} campaignId - ID da campanha
     * @returns {Promise<Object|null>}
     */
    async getLeadState(leadId, campaignId) {
        const key = `${this.leadStatePrefix}${leadId}:${campaignId}`;
        
        try {
            const state = await this.redisClient.get(key);
            
            if (!state) return null;
            
            return JSON.parse(state);
        } catch (error) {
            console.error('Erro ao obter estado do lead:', error);
            return null;
        }
    }
    
    /**
     * Atualiza contadores de estatísticas
     * @param {string} campaignId - ID da campanha
     * @param {string} metric - Nome da métrica
     * @param {number} value - Valor a incrementar 
     */
    async incrementStat(campaignId, metric, value = 1) {
        const dailyKey = `${this.statsPrefix}${campaignId}:${metric}:${this.getDateString()}`;
        const totalKey = `${this.statsPrefix}${campaignId}:${metric}:total`;
        
        try {
            await this.redisClient.incrby(dailyKey, value);
            await this.redisClient.expire(dailyKey, 90 * 86400); // 90 dias
            
            await this.redisClient.incrby(totalKey, value);
            
            return true;
        } catch (error) {
            console.error(`Erro ao incrementar estatística ${metric}:`, error);
            return false;
        }
    }
    
    /**
     * Obtém estatísticas de uma campanha
     * @param {string} campaignId - ID da campanha
     * @param {string} metric - Nome da métrica
     * @param {number} days - Número de dias para estatísticas diárias
     * @returns {Promise<Object>}
     */
    async getStats(campaignId, metric, days = 30) {
        const totalKey = `${this.statsPrefix}${campaignId}:${metric}:total`;
        
        try {
            // Obtém total
            const total = await this.redisClient.get(totalKey);
            
            // Obtém estatísticas diárias
            const dailyStats = [];
            const today = new Date();
            
            for (let i = 0; i < days; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                
                const dateString = this.getDateString(date);
                const dailyKey = `${this.statsPrefix}${campaignId}:${metric}:${dateString}`;
                
                const value = await this.redisClient.get(dailyKey);
                
                dailyStats.push({
                    date: dateString,
                    value: value ? parseInt(value, 10) : 0
                });
            }
            
            return {
                total: total ? parseInt(total, 10) : 0,
                daily: dailyStats.reverse() // Ordena do mais antigo para o mais recente
            };
        } catch (error) {
            console.error(`Erro ao obter estatística ${metric}:`, error);
            
            return {
                total: 0,
                daily: []
            };
        }
    }
    
    /**
     * Obtém string formatada da data (YYYY-MM-DD)
     * @param {Date} date - Data
     * @returns {string}
     */
    getDateString(date = new Date()) {
        return date.toISOString().split('T')[0];
    }
    
    /**
     * Obtém todos os leads ativos em uma campanha
     * @param {string} campaignId - ID da campanha
     * @returns {Promise<Array>}
     */
    async getCampaignLeads(campaignId) {
        const campaignKey = `${this.campaignLeadsPrefix}${campaignId}`;
        
        try {
            return await this.redisClient.smembers(campaignKey);
        } catch (error) {
            console.error('Erro ao obter leads da campanha:', error);
            return [];
        }
    }
    
    /**
     * Marca que um passo da sequência foi enviado com sucesso
     * @param {string} progressId - ID do progresso
     * @param {number} stepIndex - Índice do passo
     * @param {string} campaignId - ID da campanha 
     * @param {Object} metadata - Metadados adicionais
     */
    async markStepSent(progressId, stepIndex, campaignId, metadata = {}) {
        try {
            // Remove a marcação de processamento
            await this.unmarkProcessing(progressId, stepIndex);
            
            // Incrementa estatísticas
            await this.incrementStat(campaignId, 'steps_sent');
            await this.incrementStat(campaignId, 'messages_sent', metadata.messageCount || 1);
            
            // Salva log da ação
            const logKey = `remarketing:logs:${campaignId}`;
            const logEntry = {
                timestamp: new Date().toISOString(),
                action: 'step_sent',
                progressId,
                stepIndex,
                ...metadata
            };
            
            await this.redisClient.lpush(logKey, JSON.stringify(logEntry));
            await this.redisClient.ltrim(logKey, 0, 999); // Manter apenas 1000 logs recentes
            await this.redisClient.expire(logKey, 30 * 86400); // 30 dias
            
            return true;
        } catch (error) {
            console.error('Erro ao marcar passo como enviado:', error);
            return false;
        }
    }
    
    /**
     * Marca que a sequência foi concluída
     * @param {string} progressId - ID do progresso
     * @param {string} campaignId - ID da campanha
     * @param {string} leadId - ID do lead
     */
    async markSequenceCompleted(progressId, campaignId, leadId) {
        try {
            // Incrementa estatísticas
            await this.incrementStat(campaignId, 'sequences_completed');
            
            // Atualiza estado do lead
            await this.updateLeadState(leadId, campaignId, {
                status: 'completed',
                completedAt: new Date().toISOString()
            });
            
            // Salva log da ação
            const logKey = `remarketing:logs:${campaignId}`;
            const logEntry = {
                timestamp: new Date().toISOString(),
                action: 'sequence_completed',
                progressId,
                leadId
            };
            
            await this.redisClient.lpush(logKey, JSON.stringify(logEntry));
            await this.redisClient.ltrim(logKey, 0, 999);
            
            return true;
        } catch (error) {
            console.error('Erro ao marcar sequência como concluída:', error);
            return false;
        }
    }
    
    /**
     * Fecha a conexão com o Redis
     */
    async disconnect() {
        await this.redisClient.quit();
    }
}

// Exporta uma instância pré-configurada
module.exports = new RedisProgressTracker({
    host: '147.79.111.143',
    port: 6379,
    password: 'darklindo',
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true
});
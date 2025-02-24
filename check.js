// checkLeadProgress.js
const mongoose = require('mongoose');
const LeadSequenceProgress = require('./src/models/LeadSequenceProgress');
const Lead = require('./src/models/Lead');
const SmartRemarketingCampaign = require('./src/models/SmartRemarketingCampaign');

// Substitua com a string de conexão do seu banco MongoDB
const MONGO_URI = 'mongodb://darkvips:lombarde1@147.79.111.143:27017/botenagaja';

// Função para verificar o progresso do lead em todas as campanhas
async function checkLeadProgress(leadId) {
  console.log(`Verificando progresso do lead: ${leadId}\n`);
  
  try {
    // Conecta ao MongoDB
    await mongoose.connect(MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true, 
      authSource: 'admin'
    });
    
    console.log('Conectado ao MongoDB');
    
    // Busca o lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      console.log(`Lead não encontrado com ID: ${leadId}`);
      return;
    }
    
    console.log('Informações do Lead:');
    console.log(`- Nome: ${lead.firstName} ${lead.lastName}`);
    console.log(`- Username: ${lead.username || 'N/A'}`);
    console.log(`- Telegram ID: ${lead.telegramId}`);
    console.log(`- Status: ${lead.isActive ? 'Ativo' : 'Inativo'}`);
    console.log(`- Tags: ${lead.tags.join(', ') || 'Nenhuma'}`);
    console.log(`- Última interação: ${lead.lastInteraction}`);
    console.log(`- Criado em: ${lead.createdAt}\n`);
    
    // Verifica histórico de mensagens
    console.log('Histórico de Mensagens:');
    if (lead.messageHistory && lead.messageHistory.length > 0) {
      lead.messageHistory.forEach((msg, index) => {
        console.log(`${index+1}. Tipo: ${msg.type}, Data: ${msg.timestamp}, Sucesso: ${msg.success}`);
        if (!msg.success && msg.error) {
          console.log(`   Erro: ${msg.error}`);
        }
      });
    } else {
      console.log('Nenhuma mensagem no histórico.');
    }
    console.log('');
    
    // Busca progresso nas campanhas
    const progressList = await LeadSequenceProgress.find({ leadId })
      .populate('campaignId');
    
    if (progressList.length === 0) {
      console.log('Lead não está em nenhuma campanha de remarketing.');
      return;
    }
    
    console.log(`Lead está em ${progressList.length} campanhas:\n`);
    
    // Detalha cada progresso
    for (const progress of progressList) {
      const campaign = progress.campaignId;
      
      console.log(`Campanha: ${campaign.name} (${campaign._id})`);
      console.log(`- Status: ${progress.isCompleted ? 'Completada' : 'Em andamento'}`);
      console.log(`- Iniciada em: ${progress.startedAt}`);
      console.log(`- Último passo enviado: ${progress.lastStepIndex}`);
      console.log(`- Próximo passo agendado para: ${progress.nextStepScheduledFor}`);
      
      if (progress.stepProgress && progress.stepProgress.length > 0) {
        console.log('\nProgresso dos passos:');
        progress.stepProgress.forEach((step, index) => {
          console.log(`${index+1}. Passo ${step.stepIndex}, Agendado: ${step.scheduledFor}, Enviado: ${step.sentAt}, Sucesso: ${step.success}`);
          if (!step.success && step.error) {
            console.log(`   Erro: ${step.error}`);
          }
        });
      } else {
        console.log('\nNenhum passo processado ainda.');
      }
      
      // Verifica se já é hora de enviar o próximo passo
      const now = new Date();
      if (!progress.isCompleted && progress.nextStepScheduledFor <= now) {
        console.log('\n*** ALERTA: Existe um passo pendente que deveria ter sido enviado! ***');
        console.log(`Data agendada: ${progress.nextStepScheduledFor}`);
        console.log(`Data atual: ${now}`);
        console.log('O job de processamento de sequências pode não estar funcionando corretamente.');
      }
      
      console.log('\n' + '-'.repeat(50) + '\n');
    }
    
  } catch (error) {
    console.error('Erro ao verificar progresso:', error);
  } finally {
    // Fecha a conexão com o MongoDB
    await mongoose.connection.close();
    console.log('Conexão com MongoDB fechada');
  }
}

// Função principal
(async () => {
  // Substitua com o ID do lead que você quer verificar
  const leadId = process.argv[2];
  
  if (!leadId) {
    console.error('Por favor, forneça o ID do lead como argumento:');
    console.error('node checkLeadProgress.js 67bcf2b085e976303dfe5dc4');
    process.exit(1);
  }
  
  await checkLeadProgress(leadId);
  process.exit(0);
})();
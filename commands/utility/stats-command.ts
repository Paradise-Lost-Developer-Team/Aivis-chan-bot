import { 
  CommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder
} from 'discord.js';
import { ConversationTrackingService } from '../../utils/conversation-tracking-service';
import { PremiumUtils } from '../../utils/premium-utils';
import { UserConversationStats, TimeRangeFilter } from '../../utils/conversation-stats';
import { logError } from '../../utils/errorLogger';
import { createCanvas } from 'canvas';

export const data = new SlashCommandBuilder()
  .setName('統計')
  .setDescription('会話統計を表示します (プレミアム機能)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('個人')
      .setDescription('あなたの会話統計を表示します')
      .addStringOption(option =>
        option
          .setName('期間')
          .setDescription('統計の期間')
          .setRequired(false)
          .addChoices(
            { name: '今日', value: 'today' },
            { name: '今週', value: 'week' },
            { name: '今月', value: 'month' },
            { name: '全期間', value: 'all' }
          )
      )
      .addStringOption(option =>
        option
          .setName('タイプ')
          .setDescription('統計の種類')
          .setRequired(false)
          .addChoices(
            { name: '概要', value: 'summary' },
            { name: '単語', value: 'words' },
            { name: '活動時間', value: 'activity' },
            { name: '絵文字', value: 'emoji' },
            { name: 'コマンド', value: 'commands' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('サーバー')
      .setDescription('サーバーの会話統計を表示します (管理者権限が必要)')
      .addStringOption(option =>
        option
          .setName('期間')
          .setDescription('統計の期間')
          .setRequired(false)
          .addChoices(
            { name: '今日', value: 'today' },
            { name: '今週', value: 'week' },
            { name: '今月', value: 'month' },
            { name: '全期間', value: 'all' }
          )
      )
  );

export async function execute(interaction: CommandInteraction) {
  try {
    if (!interaction.guild) {
      await interaction.reply({ 
        content: 'この機能はサーバー内でのみ使用できます。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const premiumService = PremiumUtils.getInstance();
    const userId = interaction.user.id;
    
    // Bot製作者の管理サーバーの場合は常にプレミアム機能を許可
    if (interaction.guild.id !== 'YOUR_DEVELOPER_SERVER_ID') {
      // プレミアム機能のアクセスチェック
      const featureAccess = premiumService.checkFeatureAccess(userId, 'conversation-stats');
      
      if (!featureAccess.hasAccess) {
        await interaction.reply({ 
          content: featureAccess.message || 'この機能はプレミアム会員専用です。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }
    
    // ...existing code...
  } catch (error) {
    console.error('統計コマンドエラー:', error);
    logError('statsCommandError', error instanceof Error ? error : new Error(String(error)));
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ 
        content: '統計データの取得中にエラーが発生しました。しばらく経ってからもう一度お試しください。',
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({ 
        content: '統計データの取得中にエラーが発生しました。しばらく経ってからもう一度お試しください。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}
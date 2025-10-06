import {
  CommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { ConversationTrackingService } from '../../utils/conversation-tracking-service';
import { logError } from '../../utils/errorLogger';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('システム全体の利用状況、使用統計、アップタイムを表示します');

export async function execute(interaction: CommandInteraction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ConversationTrackingService に全体統計取得メソッドを実装しておく
    const trackingService = ConversationTrackingService.getInstance(interaction.client);
    const systemStats = await trackingService.getSystemConversationStats(); 
    // 例: { totalMessages, totalUsers, totalGuilds }

    // プロセス情報
    const uptimeSec = process.uptime();
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = Math.floor(uptimeSec % 60);
    const uptime = `${hours}h ${minutes}m ${seconds}s`;

    const mem = process.memoryUsage();
    const toMB = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';

    const embed = addCommonFooter(
      new EmbedBuilder()
        .setTitle('🤖 システム統計')
        .addFields(
          { name: '💬 総メッセージ数', value: `${systemStats.totalMessages}`, inline: true },
          { name: '👥 ユーザー数',      value: `${systemStats.totalUsers}`,    inline: true },
          { name: '🛡️ サーバー数',     value: `${systemStats.totalGuilds}`,   inline: true },
          { name: '⏱️ アップタイム',   value: uptime,                         inline: true },
          { name: '📈 RSSメモリ',       value: toMB(mem.rss),                  inline: true },
          { name: '📊 Heap 使用量',     value: toMB(mem.heapUsed),             inline: true }
        )
    );
    await interaction.editReply({ embeds: [embed], components: [getCommonLinksRow()] });
  } catch (error) {
    console.error('統計コマンドエラー:', error);
    logError('statsCommandError', error instanceof Error ? error : new Error(String(error)));
    const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
    await interaction[method]({
      embeds: [addCommonFooter(
        new EmbedBuilder()
          .setTitle('エラー')
          .setDescription('システム統計の取得中にエラーが発生しました。もう一度お試しください。')
          .setColor(0xff0000)
      )],
      flags: MessageFlags.Ephemeral,
      components: [getCommonLinksRow()]
    });
  }
}

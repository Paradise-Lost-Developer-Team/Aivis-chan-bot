"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const conversation_tracking_service_1 = require("../../utils/conversation-tracking-service");
const errorLogger_1 = require("../../utils/errorLogger");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('stats')
    .setDescription('システム全体の利用状況、使用統計、アップタイムを表示します');
async function execute(interaction) {
    try {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        // ConversationTrackingService に全体統計取得メソッドを実装しておく
        const trackingService = conversation_tracking_service_1.ConversationTrackingService.getInstance(interaction.client);
        const systemStats = await trackingService.getSystemConversationStats();
        // 例: { totalMessages, totalUsers, totalGuilds }
        // プロセス情報
        const uptimeSec = process.uptime();
        const hours = Math.floor(uptimeSec / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = Math.floor(uptimeSec % 60);
        const uptime = `${hours}h ${minutes}m ${seconds}s`;
        const mem = process.memoryUsage();
        const toMB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('🤖 システム統計')
            .addFields({ name: '💬 総メッセージ数', value: `${systemStats.totalMessages}`, inline: true }, { name: '👥 ユーザー数', value: `${systemStats.totalUsers}`, inline: true }, { name: '🛡️ サーバー数', value: `${systemStats.totalGuilds}`, inline: true }, { name: '⏱️ アップタイム', value: uptime, inline: true }, { name: '📈 RSSメモリ', value: toMB(mem.rss), inline: true }, { name: '📊 Heap 使用量', value: toMB(mem.heapUsed), inline: true })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        console.error('統計コマンドエラー:', error);
        (0, errorLogger_1.logError)('statsCommandError', error instanceof Error ? error : new Error(String(error)));
        const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
        await interaction[method]({
            content: 'システム統計の取得中にエラーが発生しました。もう一度お試しください。',
            flags: discord_js_1.MessageFlags.Ephemeral
        });
    }
}
//# sourceMappingURL=stats-command.js.map
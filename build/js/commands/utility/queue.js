"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const VoiceQueue_1 = require("../../utils/VoiceQueue");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('queue')
        .setDescription('読み上げキューを管理します')
        .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('現在のキュー状態を確認します'))
        .addSubcommand(subcommand => subcommand
        .setName('clear')
        .setDescription('読み上げキューをクリアします')),
    async execute(interaction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'status') {
            const status = (0, VoiceQueue_1.getQueueStatus)(interaction.guildId);
            await interaction.reply({
                content: `現在のキュー状態:\n▶️ 待機中メッセージ数: ${status.length}\n▶️ 処理中: ${status.processing ? 'はい' : 'いいえ'}`,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
        else if (subcommand === 'clear') {
            const clearedCount = (0, VoiceQueue_1.clearQueue)(interaction.guildId);
            await interaction.reply({
                content: `読み上げキューをクリアしました。${clearedCount}件のメッセージが削除されました。`,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    }
};
//# sourceMappingURL=queue.js.map
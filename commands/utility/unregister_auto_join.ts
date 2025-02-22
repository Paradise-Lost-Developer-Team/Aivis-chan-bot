import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags } from 'discord.js';
import { autoJoinChannels, loadAutoJoinChannels, saveAutoJoinChannels } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unregister_auto_join')
        .setDescription('TTSエンジンの自動参加チャンネルを解除します')
        ,
    async execute(interaction: CommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "サーバー内でのみ使用できるコマンドです。", flags: MessageFlags.Ephemeral });
            return;
    }
        const guildId = interaction.guildId!;
        if (autoJoinChannels[guildId]) {
            loadAutoJoinChannels();
            delete autoJoinChannels[guildId];
            saveAutoJoinChannels();  // ここで保存
            await interaction.reply("自動接続設定を解除しました。");
        } else {
            await interaction.reply({ content: "このサーバーには登録された自動接続設定がありません。", flags: MessageFlags.Ephemeral });
        }
    }
};
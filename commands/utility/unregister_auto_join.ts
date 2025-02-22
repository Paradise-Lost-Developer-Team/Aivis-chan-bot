import { CommandInteraction, MessageFlags } from 'discord.js';
import { autoJoinChannels, loadAutoJoinChannels, saveAutoJoinChannels } from '../../TTS-Engine';

async function unregisterAutoJoin(interaction: CommandInteraction) {
    const commandName = interaction.commandName;
    if (commandName === "unregister_auto_join") {
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
}

module.exports = { unregisterAutoJoin };
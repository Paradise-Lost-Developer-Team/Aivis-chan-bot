import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { voiceClients } from '../../utils/TTS-Engine';
import { instructLeaveConnectedBot } from '../../utils/botOrchestrator';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('ボイスチャンネルから退出します。'),

    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();
        
        const guildId = interaction.guildId!;

        try {
            // まずオーケストレータでサブボットの切断を試行
            // 実行者のボイスチャンネルIDがあればそれを渡し、特定のVCのみを切断させる
            const voiceChannelId = (interaction.member as any)?.voice?.channelId as string | undefined;
            const success = await instructLeaveConnectedBot(guildId, voiceChannelId);
            
            if (success) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('退出完了')
                            .setDescription('ボイスチャンネルから退出しました。')
                            .setColor(0x00bfff)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }

            // 直接接続の確認
            const voiceConnection = voiceClients[guildId];
            if (voiceConnection) {
                voiceConnection.destroy();
                delete voiceClients[guildId];
                
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('退出完了')
                            .setDescription('ボイスチャンネルから退出しました。')
                            .setColor(0x00bfff)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }

            // フォールバック: voiceClients の中に guildId に紐づく接続がないか走査して削除
            let foundAndDestroyed = false;
            for (const key of Object.keys(voiceClients)) {
                try {
                    const conn = (voiceClients as any)[key];
                    const connGuildId = conn?.joinConfig?.guildId ?? conn?.guildId ?? null;
                    if (connGuildId && connGuildId === guildId) {
                        try { conn.destroy?.(); } catch {};
                        try { delete (voiceClients as any)[key]; } catch {}
                        foundAndDestroyed = true;
                    }
                } catch (e) { continue; }
            }
            if (foundAndDestroyed) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('退出完了')
                            .setDescription('ボイスチャンネルから退出しました。')
                            .setColor(0x00bfff)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }

            // 接続していない場合
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('情報')
                        .setDescription('ボイスチャンネルに接続していません。')
                        .setColor(0xffff00)
                )],
                components: [getCommonLinksRow()]
            });

        } catch (error) {
            console.error('Leave command error:', error);
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('ボイスチャンネルからの退出に失敗しました。')
                        .setColor(0xff0000)
                )],
                components: [getCommonLinksRow()]
            });
        }
    }
};

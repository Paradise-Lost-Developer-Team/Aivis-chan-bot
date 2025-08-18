import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { voiceClients, deleteJoinChannelsConfig, loadJoinChannels } from '../../utils/TTS-Engine'; // Adjust the path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('BOTをチャンネルから退出します'),
    async execute(interaction: CommandInteraction) {
        const guildId = interaction.guildId!;
        const voiceClient = voiceClients[guildId];

        if (!voiceClient) {
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('未接続')
                        .setDescription('現在、ボイスチャンネルに接続していません。')
                        .setColor(0xffa500)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
            return;
        }

        try {
            await voiceClient.disconnect();
            delete voiceClients[guildId];
            deleteJoinChannelsConfig(guildId);
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('切断完了')
                        .setDescription('ボイスチャンネルから切断しました。')
                        .setColor(0x00bfff)
                        .addFields(
                            { name: '切断元', value: (() => {
                                const member = interaction.member as import('discord.js').GuildMember | null;
                                return member && member.voice && member.voice.channelId ? `<#${member.voice.channelId}>` : '不明';
                            })(), inline: true },
                            { name: '実行者', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
                )],
                components: [getCommonLinksRow()]
            });
            loadJoinChannels();
        } catch (error) {
            console.error(error);
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('ボイスチャンネルからの切断に失敗しました。')
                        .setColor(0xff0000)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
        }
    }
    }
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { voiceClients, deleteJoinChannelsConfig, loadJoinChannels } from '../../utils/TTS-Engine'; // Adjust the path as necessary
import { getBotInfos, pickLeastBusyBot, instructLeave } from '../../utils/botOrchestrator';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('BOTをチャンネルから退出します'),
    async execute(interaction: CommandInteraction) {

        await interaction.deferReply(); 

        const guildId = interaction.guildId!;
        const voiceClient = voiceClients[guildId];

        if (!voiceClient) {
            // botOrchestrator経由で対応を試みる
            try {
                // 最適なボット候補を取得（オーケストレーターからボット情報を取得して選定）
                const infos = await getBotInfos().catch(err => {
                    console.error('getBotInfos error:', err);
                    return null;
                });
                let candidateBotId: string | null = null;
                if (infos && Array.isArray(infos)) {
                    const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                    const picked = pickLeastBusyBot ? pickLeastBusyBot(eligible) : null;
                    if (picked) {
                        // picked.bot may be a string id or an object; try to extract a string to mention
                        if (typeof picked.bot === 'string') {
                            candidateBotId = picked.bot;
                        } else if (picked.bot && typeof picked.bot === 'object') {
                            const botObj = picked.bot as any;
                            if (typeof botObj.id === 'string') {
                                candidateBotId = botObj.id;
                            } else {
                                const strVal = Object.values(botObj).find(v => typeof v === 'string') as string | undefined;
                                candidateBotId = strVal ?? null;
                            }
                        }
                    }
                }
                if (candidateBotId) {
                    // candidateBotIdから対応するBotInfoオブジェクトを見つける
                    const bots = await getBotInfos().catch(err => {
                        console.error('getBotInfos error:', err);
                        return null;
                    });
                    const targetBot = bots?.find(b => b.ok && b.botId === candidateBotId);
                    
                    if (targetBot) {
                        // instructLeave に BotInfo オブジェクトを渡す
                        await instructLeave(targetBot.bot, { guildId });

                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('退出依頼を送信しました')
                                    .setDescription(`<@${candidateBotId}> にボイスチャンネルからの退出を依頼しました。反映まで少しお待ちください。`)
                                    .setColor(0x00bfff)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    } else {
                        // 該当するBotが見つからない場合
                        await interaction.editReply({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('エラー')
                                    .setDescription('該当するBotが見つかりませんでした。')
                                    .setColor(0xffa500)
                            )],
                            components: [getCommonLinksRow()]
                        });
                    }
                } else {
                    // オーケストレーターに該当ボットが見つからない場合は従来のメッセージを返す
                    await interaction.followUp({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('未接続')
                                .setDescription('現在、ボイスチャンネルに接続していません。')
                                .setColor(0xffa500)
                        )],
                        flags: MessageFlags.Ephemeral,
                        components: [getCommonLinksRow()]
                    });
                }
            } catch (err) {
                console.error('orchestrator leave error:', err);
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('オーケストレーターへの退出依頼に失敗しました。')
                            .setColor(0xff0000)
                    )],
                    flags: MessageFlags.Ephemeral,
                    components: [getCommonLinksRow()]
                });
            }
            return;
        }

        try {
            await voiceClient.disconnect();
            delete voiceClients[guildId];
            deleteJoinChannelsConfig(guildId);
            await interaction.editReply({
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
            await interaction.followUp({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('ボイスチャンネルからの切断に失敗しました。')
                        .setColor(0xff0000)
                )],
                components: [getCommonLinksRow()],
                flags: MessageFlags.Ephemeral
            });
        }
    }
    }
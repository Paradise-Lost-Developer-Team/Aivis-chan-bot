import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, VoiceChannel, TextChannel, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { autoJoinChannels, loadAutoJoinChannels, saveAutoJoinChannels } from '../../utils/TTS-Engine';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autojoin')
        .setDescription('TTSエンジンの自動参加チャンネル管理')
    .addSubcommand((sub: any) =>
            sub.setName('add')
                .setDescription('自動参加チャンネルを追加')
                .addChannelOption((option: any) =>
                    option.setName('voice_channel')
                        .setDescription('自動参加するチャンネル')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice))
                .addChannelOption((option: any) =>
                    option.setName('text_channel')
                        .setDescription('自動参加するテキストまたはボイスチャンネル（必須）')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice))
                .addBooleanOption((option: any) =>
                    option.setName('temp_voice')
                        .setDescription('TempVoice等の一時VCに追従する場合はTrue')
                        .setRequired(false))
        )
        .addSubcommand((sub: any) =>
            sub.setName('remove')
                .setDescription('自動参加チャンネル設定を解除')
        )
        .addSubcommand((sub: any) =>
            sub.setName('list')
                .setDescription('現在の自動参加設定を表示')
        ) ,
    async execute(interaction: CommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('サーバー内でのみ使用できるコマンドです。')
                        .setColor(0xff0000)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
            return;
        }
    const guildId = interaction.guildId;
    // ChatInputCommandInteraction型にキャストしてgetSubcommand()を利用
    const chatInput = interaction as ChatInputCommandInteraction;
    const sub = chatInput.options.getSubcommand();
    if (sub === 'add') {
            // register_auto_join.tsと同じ処理
            const voiceChannel = (interaction as any).options.get("voice_channel")?.channel as VoiceChannel;
            const rawTextChannel = (interaction as any).options.get("text_channel")?.channel;
            const textChannel = rawTextChannel && (rawTextChannel.type === ChannelType.GuildText)
                ? rawTextChannel as TextChannel
                : undefined;
            const textChannelAsVoice = rawTextChannel && (rawTextChannel.type === ChannelType.GuildVoice)
                ? rawTextChannel as VoiceChannel
                : undefined;
            let tempVoice = (interaction as any).options.get("temp_voice")?.value as boolean | undefined;

            if (!voiceChannel) {
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('ボイスチャンネルが指定されていません。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
                return;
            }

            loadAutoJoinChannels();
            
            let finalTextChannelId: string | undefined = undefined;
            if (textChannel) {
                finalTextChannelId = textChannel.id;
            } else if (textChannelAsVoice) {
                finalTextChannelId = textChannelAsVoice.id;
                const explicitTempVoice = tempVoice === true;
                const voiceMatch = !!(voiceChannel && textChannelAsVoice.id === voiceChannel.id);
                tempVoice = explicitTempVoice && voiceMatch;
            } else {
                const firstText = interaction.guild?.channels.cache
                    .filter(ch => ch.type === ChannelType.GuildText)
                    .first() as TextChannel | undefined;
                finalTextChannelId = firstText ? firstText.id : undefined;
            }

            autoJoinChannels[guildId] = {
                voiceChannelId: voiceChannel.id,
                textChannelId: finalTextChannelId,
                tempVoice: tempVoice === true,
                isManualTextChannelId: !!rawTextChannel
            };

            saveAutoJoinChannels();  // ここで保存
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('自動入室チャンネル設定')
                        .setDescription(`サーバー **${interaction.guild!.name}** の自動入室チャンネルを <#${voiceChannel.id}> に設定しました。`)
                        .setColor(0x00bfff)
                        .addFields(
                            { name: 'ボイスチャンネル', value: `<#${voiceChannel.id}>`, inline: true },
                            { name: 'テキストチャンネル', value: textChannel ? `<#${textChannel.id}>` : '自動判定', inline: true },
                            { name: '実行者', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '一時VC追従', value: tempVoice ? '有効' : '無効', inline: true }
                        )
                )],
                components: [getCommonLinksRow()]
            });
    } else if (sub === 'remove') {
            // unregister_auto_join.tsと同じ処理
            loadAutoJoinChannels();
            if (autoJoinChannels[guildId]) {
                // voiceChannelId, textChannelId, tempVoice など全て含めて解除
                delete autoJoinChannels[guildId];
                saveAutoJoinChannels();  // ここで保存
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('自動接続設定解除')
                            .setDescription('自動接続設定（temp_voice含む）を解除しました。')
                            .setColor(0x00bfff)
                    )],
                    components: [getCommonLinksRow()]
                });
            } else {
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('自動接続設定なし')
                            .setDescription('このサーバーには登録された自動接続設定がありません。')
                            .setColor(0xffa500)
                    )],
                    flags: MessageFlags.Ephemeral,
                    components: [getCommonLinksRow()]
                });
            }
        } else if (sub === 'list') {
            // 現在のサーバーの自動入室設定を表示
            loadAutoJoinChannels();
            const cfg = autoJoinChannels[guildId];
            if (!cfg) {
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('自動接続設定なし')
                            .setDescription('このサーバーには登録された自動接続設定がありません。')
                            .setColor(0xffa500)
                    )],
                    flags: MessageFlags.Ephemeral,
                    components: [getCommonLinksRow()]
                });
                return;
            }

            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('自動入室設定')
                        .setDescription(`サーバー **${interaction.guild!.name}** の自動入室設定を表示します。`)
                        .setColor(0x00bfff)
                        .addFields(
                            { name: 'ボイスチャンネル', value: `<#${cfg.voiceChannelId}>`, inline: true },
                            { name: 'テキストチャンネル', value: cfg.textChannelId ? `<#${cfg.textChannelId}>` : '自動判定', inline: true },
                            { name: '一時VC追従', value: cfg.tempVoice ? '有効' : '無効', inline: true },
                            { name: 'テキストチャンネル指定', value: cfg.isManualTextChannelId ? '手動指定' : '自動', inline: true }
                        )
                )],
                components: [getCommonLinksRow()]
            });
            return;
        }
    }
};

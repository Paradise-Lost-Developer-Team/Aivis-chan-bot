import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, VoiceChannel, TextChannel, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { autoJoinChannels, loadAutoJoinChannels, saveAutoJoinChannels } from '../../utils/TTS-Engine';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autojoin')
        .setDescription('TTSエンジンの自動参加チャンネル管理')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('自動参加チャンネルを追加')
                .addChannelOption(option =>
                    option.setName('voice_channel')
                        .setDescription('自動参加するチャンネル')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice))
                .addChannelOption(option =>
                    option.setName('text_channel')
                        .setDescription('自動参加するテキストチャンネル')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText))
                .addBooleanOption(option =>
                    option.setName('temp_voice')
                        .setDescription('TempVoice等の一時VCに追従する場合はTrue')
                        .setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('自動参加チャンネル設定を解除')
        ),
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
            const opts = (interaction as any).options as any;
            const voiceChannel = opts.get("voice_channel")?.channel as VoiceChannel;
            const textChannel = opts.get("text_channel")?.channel as TextChannel;
            const tempVoice = opts.get("temp_voice")?.value as boolean | undefined;

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
            autoJoinChannels[guildId] = {
                voiceChannelId: voiceChannel.id,
                textChannelId: textChannel ? textChannel.id : undefined,
                tempVoice: tempVoice === true, // undefinedならfalse扱い
                isManualTextChannelId: !!textChannel
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
        }
    }
};

import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, VoiceChannel, TextChannel, ChannelType, MessageFlags } from 'discord.js';
import { autoJoinChannels, loadAutoJoinChannels, saveAutoJoinChannels } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auto_join')
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
                embeds: [
                    {
                        title: 'エラー',
                        description: 'サーバー内でのみ使用できるコマンドです。',
                        color: 0xff0000
                    }
                ],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    const guildId = interaction.guildId;
    // ChatInputCommandInteraction型にキャストしてgetSubcommand()を利用
    const chatInput = interaction as ChatInputCommandInteraction;
    const sub = chatInput.options.getSubcommand();
        if (sub === 'add') {
            // register_auto_join.tsと同じ処理
            const voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
            const textChannel = interaction.options.get("text_channel")?.channel as TextChannel;
            const tempVoice = interaction.options.get("temp_voice")?.value as boolean | undefined;

            if (!voiceChannel) {
                await interaction.reply({
                    embeds: [
                        {
                            title: 'エラー',
                            description: 'ボイスチャンネルが指定されていません。',
                            color: 0xff0000
                        }
                    ]
                });
                return;
            }

            loadAutoJoinChannels();
            autoJoinChannels[guildId] = {
                voiceChannelId: voiceChannel.id,
                textChannelId: textChannel ? textChannel.id : voiceChannel.id,
                tempVoice: tempVoice === true // undefinedならfalse扱い
            };

            saveAutoJoinChannels();  // ここで保存
            await interaction.reply({
                embeds: [
                    {
                        title: '自動入室チャンネル設定',
                        description: `サーバー **${interaction.guild!.name}** の自動入室チャンネルを **${voiceChannel.name}** に設定しました。`,
                        color: 0x00bfff,
                        fields: [
                            { name: 'ボイスチャンネル', value: voiceChannel.name, inline: true },
                            { name: 'テキストチャンネル', value: textChannel ? `<#${textChannel.id}>` : `<#${voiceChannel.id}>`, inline: true },
                            { name: '一時VC追従', value: tempVoice ? '有効' : '無効', inline: true }
                        ]
                    }
                ]
            });
        } else if (sub === 'remove') {
            // unregister_auto_join.tsと同じ処理
            loadAutoJoinChannels();
            if (autoJoinChannels[guildId]) {
                // voiceChannelId, textChannelId, tempVoice など全て含めて解除
                delete autoJoinChannels[guildId];
                saveAutoJoinChannels();  // ここで保存
                await interaction.reply({
                    embeds: [
                        {
                            title: '自動接続設定解除',
                            description: '自動接続設定（temp_voice含む）を解除しました。',
                            color: 0x00bfff
                        }
                    ]
                });
            } else {
                await interaction.reply({
                    embeds: [
                        {
                            title: '自動接続設定なし',
                            description: 'このサーバーには登録された自動接続設定がありません。',
                            color: 0xffa500
                        }
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};

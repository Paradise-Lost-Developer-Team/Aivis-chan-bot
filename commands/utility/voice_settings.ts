import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { getSpeakerOptions, currentSpeaker, saveUserVoiceSettings } from '../../utils/TTS-Engine';
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicesettings')
        .setDescription('TTSエンジンの音声設定をまとめて管理')
        .addSubcommand((sub: any) =>
            sub.setName('intonation')
                .setDescription('感情表現の強さを設定')
                .addNumberOption((option: any) =>
                    option.setName('value')
                        .setDescription('感情表現強度レベル (0.0〜2.0)')
                        .setRequired(true))
        )
        .addSubcommand((sub: any) =>
            sub.setName('pitch')
                .setDescription('音高を設定')
                .addNumberOption((option: any) =>
                    option.setName('value')
                        .setDescription('音高レベル (-0.15〜0.15)')
                        .setRequired(true))
        )
        .addSubcommand((sub: any) =>
            sub.setName('speaker')
                .setDescription('話者を設定')
        )
        .addSubcommand((sub: any) =>
            sub.setName('speed')
                .setDescription('話速を設定')
                .addNumberOption((option: any) =>
                    option.setName('value')
                        .setDescription('話速 (0.5〜2.0)')
                        .setRequired(true))
        )
        .addSubcommand((sub: any) =>
            sub.setName('tempo')
                .setDescription('テンポを設定')
                .addNumberOption((option: any) =>
                    option.setName('value')
                        .setDescription('テンポ (0.5〜2.0)')
                        .setRequired(true))
        )
        .addSubcommand((sub: any) =>
            sub.setName('volume')
                .setDescription('音量を設定')
                .addNumberOption((option: any) =>
                    option.setName('value')
                        .setDescription('音量 (0.0〜2.0)')
                        .setRequired(true))
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'speaker') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
                if (!interaction.guild) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('このコマンドはサーバー内でのみ使用できます。')
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
                const guildId = interaction.guild.id;
                const speakerOptions = getSpeakerOptions();
                if (!speakerOptions || speakerOptions.length === 0) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('話者情報が読み込まれていません。設定ファイルを確認してください。')
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
                // 25件ごとに分割
                const chunkSize = 25;
                const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
                for (let i = 0; i < speakerOptions.length; i += chunkSize) {
                    const chunk = speakerOptions.slice(i, i + chunkSize);
                    const options = chunk.map((option: { label: string; value: string }) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(option.label)
                            .setValue(option.value)
                    );
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_speaker_${i / chunkSize}`)
                        .setPlaceholder('話者を選択してください')
                        .setOptions(options);
                    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
                }
                const response = await interaction.editReply({
                    content: '読み上げに使用する話者を選択してください：',
                    components: rows,
                });
                // インタラクションコレクタ
                try {
                    const collector = (await interaction.fetchReply() as any).createMessageComponentCollector({
                        componentType: ComponentType.StringSelect,
                        time: 60000
                    });
                    collector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
                        const selectedValue = selectInteraction.values[0];
                        if (!selectedValue.includes('-')) {
                            await selectInteraction.update({
                                content: '話者情報の形式が不正です。もう一度選択してください。',
                                components: rows
                            });
                            return;
                        }
                        const [speakerName, styleName, speakerId] = selectedValue.split('-');
                        const speakerIdNumber = parseInt(speakerId);
                        if (isNaN(speakerIdNumber)) {
                            await selectInteraction.update({
                                content: '話者IDが不正です。もう一度選択してください。',
                                components: rows
                            });
                            return;
                        }
                        currentSpeaker[selectInteraction.user.id] = speakerIdNumber;
                        // voiceSettingsにも保存
                        if (typeof voiceSettings === 'object') {
                            voiceSettings.speaker = voiceSettings.speaker || {};
                            voiceSettings.speaker[selectInteraction.user.id] = speakerIdNumber;
                        }
                        saveUserVoiceSettings();
                        await selectInteraction.update({
                            embeds: [addCommonFooter(
                                new EmbedBuilder()
                                    .setTitle('話者 設定完了')
                                    .setDescription(`あなたの話者を「${speakerName} - ${styleName}」に設定しました。`)
                                    .setColor(0x00bfff)
                            )],
                            components: []
                        });
                    });
                    collector.on('end', async (collected: any) => {
                        if (collected.size === 0) {
                            await interaction.editReply({
                                content: '操作がタイムアウトしました。もう一度コマンドを実行してください。',
                                components: []
                            });
                        }
                    });
                } catch (error) {
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('話者選択中にエラーが発生しました。')
                                .setColor(0xff0000)
                        )],
                        components: []
                    });
                }
            } catch (error) {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('話者設定中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )]
                });
            }
        } else if (sub === 'intonation') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const value = interaction.options.getNumber('value', true);
        if (value >= 0.0 && value <= 2.0) {
            voiceSettings.intonation[interaction.user.id] = value;
            saveUserVoiceSettings();
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('感情表現強度 設定完了')
                        .setDescription(`感情表現強度を ${value} に設定しました。`)
                        .setColor(0x00bfff)
                )]
            });
        } else {
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('感情表現強度は 0.0 から 2.0 の間でなければなりません。')
                        .setColor(0xff0000)
                )]
            });
        }
        } else if (sub === 'pitch') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const value = interaction.options.getNumber('value', true);
            if (value >= -0.15 && value <= 0.15) {
                voiceSettings.pitch[interaction.user.id] = value;
                saveUserVoiceSettings();
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('音高 設定完了')
                            .setDescription(`音高を ${value} に設定しました。`)
                            .setColor(0x00bfff)
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('音高は -0.15 から 0.15 の間でなければなりません。')
                            .setColor(0xff0000)
                    )]
                });
            }
        } else if (sub === 'speed') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const value = interaction.options.getNumber('value', true);
            if (value >= 0.5 && value <= 2.0) {
                voiceSettings.speed = voiceSettings.speed || {};
                voiceSettings.speed[interaction.user.id] = value;
                saveUserVoiceSettings();
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('話速 設定完了')
                            .setDescription(`話速を ${value} に設定しました。`)
                            .setColor(0x00bfff)
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('話速は 0.5 から 2.0 の間でなければなりません。')
                            .setColor(0xff0000)
                    )]
                });
            }
        } else if (sub === 'tempo') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const value = interaction.options.getNumber('value', true);
            if (value >= 0.5 && value <= 2.0) {
                voiceSettings.tempo = voiceSettings.tempo || {};
                voiceSettings.tempo[interaction.user.id] = value;
                saveUserVoiceSettings();
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('テンポ 設定完了')
                            .setDescription(`テンポを ${value} に設定しました。`)
                            .setColor(0x00bfff)
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('テンポは 0.5 から 2.0 の間でなければなりません。')
                            .setColor(0xff0000)
                    )]
                });
            }
        } else if (sub === 'volume') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const value = interaction.options.getNumber('value', true);
            if (value >= 0.0 && value <= 2.0) {
                voiceSettings.volume = voiceSettings.volume || {};
                voiceSettings.volume[interaction.user.id] = value;
                saveUserVoiceSettings();
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('音量 設定完了')
                            .setDescription(`音量を ${value} に設定しました。`)
                            .setColor(0x00bfff)
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('音量は 0.0 から 2.0 の間でなければなりません。')
                            .setColor(0xff0000)
                    )]
                });
            }
        }
    }
};

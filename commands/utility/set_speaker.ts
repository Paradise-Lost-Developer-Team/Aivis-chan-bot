import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, ChatInputCommandInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } from 'discord.js';
import { getSpeakerOptions, currentSpeaker, saveUserSpeakers } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_speaker')
        .setDescription('読み上げの話者を設定します。'),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            if (!interaction.guild) {
                await interaction.reply({
                    content: 'このコマンドはサーバー内でのみ使用できます。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const guildId = interaction.guild.id;
            
            // スピーカーオプションの取得 - TTS-Engineから直接読み込む
            const speakerOptions = getSpeakerOptions();
            console.log(`スピーカーオプション数: ${speakerOptions.length}`);
            
            if (!speakerOptions || speakerOptions.length === 0) {
                await interaction.reply({
                    content: 'スピーカー情報が読み込まれていません。設定ファイルを確認してください。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 25件ごとに分割して複数の選択メニューを作成
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
            
            // 選択メニューを含むメッセージを送信
            const response = await interaction.reply({
                content: '読み上げに使用する話者を選択してください：',
                components: rows,
                flags: MessageFlags.Ephemeral
            });
            
            // インタラクションコレクター
            try {
                const collector = response.createMessageComponentCollector({ 
                    componentType: ComponentType.StringSelect, 
                    time: 60000 // 1分間待機
                });
                
                collector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
                    const selectedValue = selectInteraction.values[0];
                    
                    // 話者情報の検証
                    if (!selectedValue.includes('-')) {
                        await selectInteraction.update({
                            content: '話者情報の形式が不正です。もう一度選択してください。',
                            components: rows
                        });
                        return;
                    }
                    
                    const [speakerName, styleName, speakerId] = selectedValue.split('-');
                    const speakerIdNumber = parseInt(speakerId);
                    
                    // スピーカーIDの検証
                    if (isNaN(speakerIdNumber)) {
                        await selectInteraction.update({
                            content: '話者IDが不正です。もう一度選択してください。',
                            components: rows
                        });
                        return;
                    }
                    // ユーザーごとに話者IDを保存
                    currentSpeaker[selectInteraction.user.id] = speakerIdNumber;
                    saveUserSpeakers();
                    await selectInteraction.update({
                        content: `あなたの話者を「${speakerName} - ${styleName}」に設定しました。`,
                        components: []
                    });
                });
                
                collector.on('end', async (collected) => {
                    if (collected.size === 0) {
                        // タイムアウト時
                        await interaction.editReply({
                            content: '操作がタイムアウトしました。もう一度コマンドを実行してください。',
                            components: []
                        });
                    }
                });
                
            } catch (error) {
                console.error('セレクトメニュー処理エラー:', error);
                await interaction.editReply({
                    content: 'エラーが発生しました。もう一度お試しください。',
                    components: []
                });
            }
        } catch (error) {
            console.error('スピーカー設定エラー:', error);
            await interaction.reply({
                content: 'エラーが発生しました。話者情報の読み込みに問題がある可能性があります。',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};
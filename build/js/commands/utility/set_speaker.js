"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_speaker')
        .setDescription('読み上げの話者を設定します。'),
    async execute(interaction) {
        try {
            if (!interaction.guild) {
                await interaction.reply({
                    content: 'このコマンドはサーバー内でのみ使用できます。',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            const guildId = interaction.guild.id;
            // スピーカーオプションの取得 - TTS-Engineから直接読み込む
            const speakerOptions = (0, TTS_Engine_1.getSpeakerOptions)();
            console.log(`スピーカーオプション数: ${speakerOptions.length}`);
            if (!speakerOptions || speakerOptions.length === 0) {
                await interaction.reply({
                    content: 'スピーカー情報が読み込まれていません。設定ファイルを確認してください。',
                    flags: discord_js_1.MessageFlags.Ephemeral
                });
                return;
            }
            // 25件ごとに分割して複数の選択メニューを作成
            const chunkSize = 25;
            const rows = [];
            for (let i = 0; i < speakerOptions.length; i += chunkSize) {
                const chunk = speakerOptions.slice(i, i + chunkSize);
                const options = chunk.map((option) => new discord_js_1.StringSelectMenuOptionBuilder()
                    .setLabel(option.label)
                    .setValue(option.value));
                const selectMenu = new discord_js_1.StringSelectMenuBuilder()
                    .setCustomId(`select_speaker_${i / chunkSize}`)
                    .setPlaceholder('話者を選択してください')
                    .setOptions(options);
                rows.push(new discord_js_1.ActionRowBuilder().addComponents(selectMenu));
            }
            // 選択メニューを含むメッセージを送信
            const response = await interaction.reply({
                content: '読み上げに使用する話者を選択してください：',
                components: rows,
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            // インタラクションコレクター
            try {
                const collector = response.createMessageComponentCollector({
                    componentType: discord_js_1.ComponentType.StringSelect,
                    time: 60000 // 1分間待機
                });
                collector.on('collect', async (selectInteraction) => {
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
                    TTS_Engine_1.currentSpeaker[selectInteraction.user.id] = speakerIdNumber;
                    (0, TTS_Engine_1.saveUserSpeakers)();
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
            }
            catch (error) {
                console.error('セレクトメニュー処理エラー:', error);
                await interaction.editReply({
                    content: 'エラーが発生しました。もう一度お試しください。',
                    components: []
                });
            }
        }
        catch (error) {
            console.error('スピーカー設定エラー:', error);
            await interaction.reply({
                content: 'エラーが発生しました。話者情報の読み込みに問題がある可能性があります。',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    },
};
//# sourceMappingURL=set_speaker.js.map
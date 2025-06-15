"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const subscription_1 = require("../../utils/subscription");
const smart_tts_1 = require("../../utils/smart-tts");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
const fs_1 = __importDefault(require("fs"));
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('smart-tts')
        .setDescription('Pro版/Premium版限定: AIスマート読み上げ設定')
        .addSubcommand(subcommand => subcommand
        .setName('settings')
        .setDescription('スマート読み上げの設定を変更')
        .addBooleanOption(option => option.setName('auto_breathing')
        .setDescription('自動息継ぎ（長文に自然な息継ぎを入れる）')
        .setRequired(false))
        .addBooleanOption(option => option.setName('sentence_optimization')
        .setDescription('文章最適化（句読点がない場合に自動追加）')
        .setRequired(false))
        .addBooleanOption(option => option.setName('emotion_detection')
        .setDescription('感情検出（Premium限定: 文章から感情を検出して声色を調整）')
        .setRequired(false))
        .addStringOption(option => option.setName('character_voice')
        .setDescription('キャラクター声モード（Premium限定）')
        .addChoices({ name: '標準', value: 'normal' }, { name: 'アニメ風', value: 'anime' }, { name: 'プロフェッショナル', value: 'professional' })
        .setRequired(false)))
        .addSubcommand(subcommand => subcommand
        .setName('test')
        .setDescription('スマート読み上げをテスト')
        .addStringOption(option => option.setName('text')
        .setDescription('テストするテキスト')
        .setRequired(true))),
    async execute(interaction) {
        try {
            // Pro版以上が必要
            const guildId = interaction.guildId;
            if (!(0, subscription_1.isProFeatureAvailable)(guildId, 'smart-tts')) {
                await interaction.reply({
                    content: 'このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。',
                    ephemeral: true
                });
                return;
            }
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'settings') {
                await handleSettingsSubcommand(interaction);
            }
            else if (subcommand === 'test') {
                await handleTestSubcommand(interaction);
            }
        }
        catch (error) {
            console.error('smart-ttsコマンド実行エラー:', error);
            await interaction.reply({
                content: 'コマンド実行中にエラーが発生しました。',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
    },
};
async function handleSettingsSubcommand(interaction) {
    const guildId = interaction.guildId;
    const isPremium = (0, subscription_1.isPremiumFeatureAvailable)(guildId, 'smart-tts');
    // 現在の設定を取得
    const currentSettings = (0, smart_tts_1.getSmartTTSSettings)(guildId);
    // 各オプションを取得
    const autoBreathing = interaction.options.getBoolean('auto_breathing');
    const sentenceOptimization = interaction.options.getBoolean('sentence_optimization');
    const emotionDetection = interaction.options.getBoolean('emotion_detection');
    const characterVoice = interaction.options.getString('character_voice');
    // 設定を更新（nullの場合は現在の値を維持）
    const newSettings = {};
    if (autoBreathing !== null)
        newSettings.autoBreathing = autoBreathing;
    if (sentenceOptimization !== null)
        newSettings.sentenceOptimization = sentenceOptimization;
    // Premium限定機能のチェック
    if (emotionDetection !== null) {
        if (isPremium || emotionDetection === false) {
            newSettings.autoEmotionDetection = emotionDetection;
        }
        else {
            await interaction.reply({
                content: '感情検出機能はPremium版限定機能です。Premium版へのアップグレードをご検討ください。',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            return;
        }
    }
    if (characterVoice !== null) {
        if (isPremium || characterVoice === 'normal') {
            newSettings.characterVoiceMode = characterVoice;
        }
        else {
            await interaction.reply({
                content: 'カスタムキャラクター声モードはPremium版限定機能です。Premium版へのアップグレードをご検討ください。',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
            return;
        }
    }
    // 設定を更新
    (0, smart_tts_1.updateSmartTTSSettings)(guildId, newSettings);
    // 更新後の設定を取得
    const updatedSettings = (0, smart_tts_1.getSmartTTSSettings)(guildId);
    // 返信用のEmbedを作成
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('AIスマート読み上げ設定')
        .setDescription('スマート読み上げの設定が更新されました')
        .setColor('#00AA00')
        .addFields({ name: '自動息継ぎ', value: updatedSettings.autoBreathing ? '✅ オン' : '❌ オフ', inline: true }, { name: '文章最適化', value: updatedSettings.sentenceOptimization ? '✅ オン' : '❌ オフ', inline: true }, { name: '感情検出', value: updatedSettings.autoEmotionDetection ? '✅ オン' : '❌ オフ', inline: true }, { name: '声モード', value: getVoiceModeDisplay(updatedSettings.characterVoiceMode), inline: true })
        .setFooter({ text: isPremium ? 'Premium版特典: すべての機能が利用可能です' : 'Pro版: 一部の機能はPremium版限定です' });
    await interaction.reply({
        embeds: [embed],
        flags: discord_js_1.MessageFlags.Ephemeral
    });
}
async function handleTestSubcommand(interaction) {
    const guildId = interaction.guildId;
    const text = interaction.options.getString('text', true);
    await interaction.deferReply({ ephemeral: true });
    // ボイスチャンネルに接続しているか確認
    const voiceClient = TTS_Engine_1.voiceClients[guildId];
    if (!voiceClient) {
        await interaction.editReply({
            content: 'テストにはボイスチャンネルに接続している必要があります。`/join` コマンドで接続してください。'
        });
        return;
    }
    try {
        const speakerId = TTS_Engine_1.currentSpeaker[guildId] || 888753760;
        // 音声生成と再生
        const audioPath = await (0, TTS_Engine_1.speakVoice)(text, speakerId, guildId);
        // 有効なファイルパスであることを確認
        if (typeof audioPath === 'string' && fs_1.default.existsSync(audioPath)) {
            const settings = (0, smart_tts_1.getSmartTTSSettings)(guildId);
            const settingsInfo = [
                `自動息継ぎ: ${settings.autoBreathing ? 'オン' : 'オフ'}`,
                `文章最適化: ${settings.sentenceOptimization ? 'オン' : 'オフ'}`,
                `感情検出: ${settings.autoEmotionDetection ? 'オン' : 'オフ'}`,
                `声モード: ${getVoiceModeDisplay(settings.characterVoiceMode)}`
            ].join('\n');
            await interaction.editReply({
                content: `テスト再生が完了しました。\n\n**現在の設定**\n${settingsInfo}`
            });
        }
        else {
            throw new Error('音声ファイルが生成できませんでした');
        }
    }
    catch (error) {
        console.error('テスト再生エラー:', error);
        await interaction.editReply({
            content: `テスト再生中にエラーが発生しました: ${error}`
        });
    }
}
function getVoiceModeDisplay(mode) {
    switch (mode) {
        case 'anime': return '🎭 アニメ風';
        case 'professional': return '🎯 プロフェッショナル';
        default: return '🔊 標準';
    }
}
//# sourceMappingURL=smart-tts.js.map
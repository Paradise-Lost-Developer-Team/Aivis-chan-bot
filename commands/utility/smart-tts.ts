import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from '../../utils/subscription';
import { getSmartTTSSettings, updateSmartTTSSettings, SmartTTSSettings } from '../../utils/smart-tts';
import { speakVoice, currentSpeaker, voiceClients, play_audio } from '../../utils/TTS-Engine';
import fs from 'fs';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('smart-tts')
        .setDescription('Pro版/Premium版限定: AIスマート読み上げ設定')
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('スマート読み上げの設定を変更')
                .addBooleanOption(option => 
                    option.setName('auto_breathing')
                        .setDescription('自動息継ぎ（長文に自然な息継ぎを入れる）')
                        .setRequired(false))
                .addBooleanOption(option => 
                    option.setName('sentence_optimization')
                        .setDescription('文章最適化（句読点がない場合に自動追加）')
                        .setRequired(false))
                .addBooleanOption(option => 
                    option.setName('emotion_detection')
                        .setDescription('感情検出（Premium限定: 文章から感情を検出して声色を調整）')
                        .setRequired(false))
                .addStringOption(option => 
                    option.setName('character_voice')
                        .setDescription('キャラクター声モード（Premium限定）')
                        .addChoices(
                            { name: '標準', value: 'normal' },
                            { name: 'アニメ風', value: 'anime' },
                            { name: 'プロフェッショナル', value: 'professional' }
                        )
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('スマート読み上げをテスト')
                .addStringOption(option =>
                    option.setName('text')
                        .setDescription('テストするテキスト')
                        .setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            // Pro版以上が必要
            const guildId = interaction.guildId!;
            if (!isProFeatureAvailable(guildId)) {
                await interaction.reply({
                    content: 'このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。',
                    ephemeral: true
                });
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'settings') {
                await handleSettingsSubcommand(interaction);
            } else if (subcommand === 'test') {
                await handleTestSubcommand(interaction);
            }
        } catch (error) {
            console.error('smart-ttsコマンド実行エラー:', error);
            await interaction.reply({
                content: 'コマンド実行中にエラーが発生しました。',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

async function handleSettingsSubcommand(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const isPremium = isPremiumFeatureAvailable(guildId);
    
    // 現在の設定を取得
    const currentSettings = getSmartTTSSettings(guildId);
    
    // 各オプションを取得
    const autoBreathing = interaction.options.getBoolean('auto_breathing');
    const sentenceOptimization = interaction.options.getBoolean('sentence_optimization');
    const emotionDetection = interaction.options.getBoolean('emotion_detection');
    const characterVoice = interaction.options.getString('character_voice');
    
    // 設定を更新（nullの場合は現在の値を維持）
    const newSettings: Partial<SmartTTSSettings> = {};
    
    if (autoBreathing !== null) newSettings.autoBreathing = autoBreathing;
    if (sentenceOptimization !== null) newSettings.sentenceOptimization = sentenceOptimization;
    
    // Premium限定機能のチェック
    if (emotionDetection !== null) {
        if (isPremium || emotionDetection === false) {
            newSettings.autoEmotionDetection = emotionDetection;
        } else {
            await interaction.reply({
                content: '感情検出機能はPremium版限定機能です。Premium版へのアップグレードをご検討ください。',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
    
    if (characterVoice !== null) {
        if (isPremium || characterVoice === 'normal') {
            newSettings.characterVoiceMode = characterVoice;
        } else {
            await interaction.reply({
                content: 'カスタムキャラクター声モードはPremium版限定機能です。Premium版へのアップグレードをご検討ください。',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
    
    // 設定を更新
    updateSmartTTSSettings(guildId, newSettings);
    
    // 更新後の設定を取得
    const updatedSettings = getSmartTTSSettings(guildId);
    
    // 返信用のEmbedを作成
    const embed = new EmbedBuilder()
        .setTitle('AIスマート読み上げ設定')
        .setDescription('スマート読み上げの設定が更新されました')
        .setColor('#00AA00')
        .addFields(
            { name: '自動息継ぎ', value: updatedSettings.autoBreathing ? '✅ オン' : '❌ オフ', inline: true },
            { name: '文章最適化', value: updatedSettings.sentenceOptimization ? '✅ オン' : '❌ オフ', inline: true },
            { name: '感情検出', value: updatedSettings.autoEmotionDetection ? '✅ オン' : '❌ オフ', inline: true },
            { name: '声モード', value: getVoiceModeDisplay(updatedSettings.characterVoiceMode), inline: true }
        )
        .setFooter({ text: isPremium ? 'Premium版特典: すべての機能が利用可能です' : 'Pro版: 一部の機能はPremium版限定です' });
    
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

async function handleTestSubcommand(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const text = interaction.options.getString('text', true);

    await interaction.deferReply({ ephemeral: true });
    
    // ボイスチャンネルに接続しているか確認
    const voiceClient = voiceClients[guildId];
    if (!voiceClient) {
        await interaction.editReply({
            content: 'テストにはボイスチャンネルに接続している必要があります。`/join` コマンドで接続してください。'
        });
        return;
    }
    
    try {
        const speakerId = currentSpeaker[guildId] || 888753760;
        
        // 音声生成と再生
        const audioPath = await speakVoice(text, speakerId, guildId);
        
        // 有効なファイルパスであることを確認
        if (typeof audioPath === 'string' && fs.existsSync(audioPath)) {
            await play_audio(voiceClient, audioPath, guildId, null);
            
            const settings = getSmartTTSSettings(guildId);
            const settingsInfo = [
                `自動息継ぎ: ${settings.autoBreathing ? 'オン' : 'オフ'}`,
                `文章最適化: ${settings.sentenceOptimization ? 'オン' : 'オフ'}`,
                `感情検出: ${settings.autoEmotionDetection ? 'オン' : 'オフ'}`,
                `声モード: ${getVoiceModeDisplay(settings.characterVoiceMode)}`
            ].join('\n');
            
            await interaction.editReply({
                content: `テスト再生が完了しました。\n\n**現在の設定**\n${settingsInfo}`
            });
        } else {
            throw new Error('音声ファイルが生成できませんでした');
        }
    } catch (error) {
        console.error('テスト再生エラー:', error);
        await interaction.editReply({
            content: `テスト再生中にエラーが発生しました: ${error}`
        });
    }
}

function getVoiceModeDisplay(mode: string): string {
    switch (mode) {
        case 'anime': return '🎭 アニメ風';
        case 'professional': return '🎯 プロフェッショナル';
        default: return '🔊 標準';
    }
}

import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from '../../utils/subscription';
import { 
    getAvailableVoiceEffectPresets,
    updateProVoiceSettings,
    VOICE_EFFECT_PRESETS 
} from '../../utils/pro-features';
import { speakVoice, currentSpeaker, voiceClients, play_audio } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voice-effect')
        .setDescription('Pro版限定: 音声エフェクトを設定します')
        .addStringOption(option =>
            option.setName('preset')
                .setDescription('プリセットを選択')
                .setRequired(true)
                .addChoices(
                    { name: 'なし', value: 'none' },
                    { name: 'コンサートホール', value: 'concert' },
                    { name: 'ロボット', value: 'robot' },
                    { name: 'ささやき', value: 'whisper' },
                    { name: 'スタジアム', value: 'stadium' },
                    { name: '水中', value: 'underwater' },
                    { name: '電話', value: 'phone' },
                    { name: 'チップマンク', value: 'chipmunk' },
                    { name: '低音', value: 'deep' }
                ))
        .addBooleanOption(option =>
            option.setName('test')
                .setDescription('エフェクトをテスト再生するかどうか')
                .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        
        // Pro版か確認
        if (!isProFeatureAvailable(guildId)) {
            await interaction.reply({
                content: 'このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。',
                ephemeral: true
            });
            return;
        }
        
        const presetName = interaction.options.getString('preset', true);
        const testPlay = interaction.options.getBoolean('test') ?? false;
        
        // プリセットが利用可能か確認
        const availablePresets = getAvailableVoiceEffectPresets(guildId);
        if (!availablePresets.includes(presetName)) {
            await interaction.reply({
                content: `お使いのプランでは「${presetName}」エフェクトは利用できません。Premium版へのアップグレードをご検討ください。`,
                ephemeral: true
            });
            return;
        }
        
        // プリセットを適用
        const preset = VOICE_EFFECT_PRESETS[presetName as keyof typeof VOICE_EFFECT_PRESETS] || {};
        updateProVoiceSettings(guildId, preset);
        
        // 応答用のEmbedを作成
        const embed = new EmbedBuilder()
            .setTitle('音声エフェクト設定完了')
            .setDescription(`エフェクト「${getPresetDisplayName(presetName)}」を適用しました。`)
            .setColor('#00FF00');
        
        if (Object.keys(preset).length > 0) {
            embed.addFields(
                { name: '適用された効果', value: formatEffectDetails(preset) }
            );
        }
        
        // 設定完了を通知
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
        // テスト再生
        if (testPlay) {
            const voiceClient = voiceClients[guildId];
            if (voiceClient) {
                try {
                    const speakerId = currentSpeaker[guildId] || 888753760;
                    const testMessage = `「${getPresetDisplayName(presetName)}」エフェクトのテスト音声です。`;
                    const audioPath = await speakVoice(testMessage, speakerId, guildId);
                    await play_audio(voiceClient, audioPath, guildId, null);
                } catch (error) {
                    console.error('テスト再生エラー:', error);
                }
            }
        }
    },
};

// プリセット名を日本語表示用に変換
function getPresetDisplayName(presetName: string): string {
    const nameMap: { [key: string]: string } = {
        none: 'なし',
        concert: 'コンサートホール',
        robot: 'ロボット',
        whisper: 'ささやき',
        stadium: 'スタジアム',
        underwater: '水中',
        phone: '電話',
        chipmunk: 'チップマンク',
        deep: '低音'
    };
    
    return nameMap[presetName] || presetName;
}

// エフェクト詳細を文字列にフォーマット
function formatEffectDetails(effects: any): string {
    const details = [];
    
    if (effects.reverbLevel) details.push(`残響: ${effects.reverbLevel * 100}%`);
    if (effects.pitchVariation) details.push(`ピッチ変動: ${effects.pitchVariation > 0 ? '+' : ''}${effects.pitchVariation * 100}%`);
    if (effects.formantShift) details.push(`フォルマント: ${effects.formantShift > 0 ? '+' : ''}${effects.formantShift * 100}%`);
    if (effects.echoAmount) details.push(`エコー: ${effects.echoAmount * 100}%`);
    if (effects.chorusEffect) details.push(`コーラス効果: オン`);
    
    return details.join('\n') || 'エフェクトなし';
}

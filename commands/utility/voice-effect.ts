import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
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
        try {
            console.log('voice-effect コマンド実行開始');
            const guildId = interaction.guildId!;
            console.log(`サーバーID: ${guildId}`);
            
            // Pro版か確認
            console.log('Pro機能利用可能か確認中...');
            if (!isProFeatureAvailable(guildId)) {
                console.log('Pro機能は利用できません');
                await interaction.reply({
                    content: 'このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            console.log('Pro機能は利用可能です');
            
            const presetName = interaction.options.getString('preset', true);
            const testPlay = interaction.options.getBoolean('test') ?? false;
            console.log(`選択されたプリセット: ${presetName}, テスト再生: ${testPlay}`);
            
            // プリセットが利用可能か確認
            console.log('利用可能なプリセットを取得中...');
            const availablePresets = getAvailableVoiceEffectPresets(guildId);
            console.log(`利用可能なプリセット: ${availablePresets.join(', ')}`);
            
            if (!availablePresets.includes(presetName)) {
                console.log(`プリセット ${presetName} は利用できません`);
                await interaction.reply({
                    content: `お使いのプランでは「${presetName}」エフェクトは利用できません。Premium版へのアップグレードをご検討ください。`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // プリセットを適用
            console.log(`プリセット ${presetName} を適用中...`);
            const preset = VOICE_EFFECT_PRESETS[presetName as keyof typeof VOICE_EFFECT_PRESETS] || {};
            console.log('適用するプリセット設定:', preset);
            
            try {
                updateProVoiceSettings(guildId, preset);
                console.log('プリセットの適用が完了しました');
            } catch (error) {
                console.error('プリセット適用エラー:', error);
                await interaction.reply({
                    content: `エフェクト適用中にエラーが発生しました: ${error}`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 応答用のEmbedを作成
            const embed = new EmbedBuilder()
                .setTitle('音声エフェクト設定完了')
                .setDescription(`エフェクト「${getPresetDisplayName(presetName)}」を適用しました。`)
                .setColor('#00dd00');
            
            if (Object.keys(preset).length > 0) {
                embed.addFields(
                    { name: '適用された効果', value: formatEffectDetails(preset) }
                );
            }
            
            // 設定完了を通知
            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            
            // テスト再生
            if (testPlay) {
                console.log('テスト再生を実行します');
                const voiceClient = voiceClients[guildId];
                if (voiceClient) {
                    try {
                        console.log('ボイスクライアントが見つかりました');
                        const speakerId = currentSpeaker[guildId] || 888753760;
                        console.log(`使用するスピーカーID: ${speakerId}`);
                        
                        const testMessage = `「${getPresetDisplayName(presetName)}」エフェクトのテスト音声です。`;
                        console.log(`テスト文: "${testMessage}"`);
                        
                        console.log('音声ファイルを生成中...');
                        const audioPath = await speakVoice(testMessage, speakerId, guildId);
                        console.log(`生成された音声ファイル: ${audioPath}`);
                        
                        console.log('音声を再生中...');
                        await play_audio(voiceClient, audioPath, guildId, null);
                        console.log('再生完了');
                    } catch (error) {
                        console.error('テスト再生エラー:', error);
                        // テスト再生のエラーはユーザーに通知せず、ログだけ残す
                    }
                } else {
                    console.log('ボイスクライアントが見つかりません。ボイスチャンネルに接続されていない可能性があります。');
                    await interaction.followUp({
                        content: 'テスト再生にはボイスチャンネルに接続している必要があります。`/join` コマンドで接続してください。',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            
        } catch (error) {
            console.error('voice-effectコマンド実行エラー:', error);
            // すでに応答済みでなければエラー応答を送信
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '音声エフェクト設定中にエラーが発生しました。',
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.deferred) {
                await interaction.editReply('音声エフェクト設定中にエラーが発生しました。');
            } else {
                await interaction.followUp({
                    content: '音声エフェクト設定中にエラーが発生しました。',
                    flags: MessageFlags.Ephemeral
                });
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

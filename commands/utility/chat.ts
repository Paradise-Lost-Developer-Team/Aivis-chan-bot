
import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { speakVoice, voiceClients, voiceSettings, setJoinCommandChannel, setTextChannelForGuildInMap } from '../../utils/TTS-Engine';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { ConversationTrackingService } from '../../utils/conversation-tracking-service';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'data', 'config.json');
const { GEMINI_API_KEY } = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: 'あなたは親切なDiscordチャットボットです。',
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_UNSPECIFIED, threshold: HarmBlockThreshold.BLOCK_NONE },
    ]
});

// 会話履歴管理（安全な取得）
const getHistory = async (userId: string, guildId: string, client: any) => {
    try {
        const stats = ConversationTrackingService.getInstance(client);
        const userStats = stats.getUserStats(guildId, userId);
        // 直近10件のメッセージ履歴を返す
        return userStats?.history?.slice(-10) || [];
    } catch (error) {
        console.warn(`[Chat:pro] 会話履歴取得エラー:`, error);
        // ConversationTrackingServiceが利用できない場合は空履歴を返す
        return [];
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Google Gemini最新API対応AIチャットボット（会話履歴・画像・ストリーム・TTS連携）')
        .addStringOption(option =>
            option.setName('prompt').setDescription('プロンプトを入力してください').setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('image').setDescription('画像を添付（オプション）').setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const prompt = interaction.options.getString('prompt', true);
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;
        const imageAttachment = interaction.options.getAttachment('image');
        const attachments = imageAttachment ? [imageAttachment] : [];

        console.log(`[Chat:pro] AIチャット実行: user=${userId}, guild=${guildId}, prompt="${prompt.substring(0, 50)}..."`);

        let aiReply = ''; // TTS処理でも使用するためにスコープを拡張

        try {
            // 会話履歴取得
            const history = await getHistory(userId, guildId, interaction.client);
            const messages = [
                ...history.map((h: { role: string; content: string }) => ({ role: h.role, parts: [{ text: h.content }] })),
                { role: 'user', parts: [{ text: prompt }] }
            ];

            // 画像入力対応
            if (attachments.length > 0) {
                for (const att of attachments) {
                    if (att && att.contentType?.startsWith('image/')) {
                        console.log(`[Chat:pro] 画像処理中: ${att.name} (${att.contentType})`);
                        try {
                            // Fetch the image from the public URL and encode as base64
                            const response = await fetch(att.url);
                            const buffer = Buffer.from(await response.arrayBuffer());
                            (messages[messages.length - 1].parts as any).push({ 
                                inlineData: { 
                                    mimeType: att.contentType, 
                                    data: buffer.toString('base64') 
                                } 
                            });
                        } catch (imageError) {
                            console.error(`[Chat:pro] 画像処理エラー:`, imageError);
                        }
                    }
                }
            }

            // ストリーム応答の改善
            let lastUpdateTime = Date.now();
            const UPDATE_INTERVAL = 500; // 500ms間隔で更新

            try {
                const streamResult = await model.generateContentStream({ contents: messages });
                
                // ストリーム処理の修正
                for await (const chunk of streamResult.stream) {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        aiReply += chunkText;
                        
                        // Discord API制限を考慮した更新頻度調整
                        const now = Date.now();
                        if (now - lastUpdateTime > UPDATE_INTERVAL) {
                            try {
                                await interaction.editReply({
                                    embeds: [addCommonFooter(new EmbedBuilder()
                                        .setTitle('🤖 AIチャット応答（生成中...）')
                                        .setDescription(aiReply.length > 4000 ? aiReply.substring(0, 4000) + '...' : aiReply)
                                        .setColor(0x00bfff)
                                        .addFields({ name: '📝 プロンプト', value: prompt.length > 1000 ? prompt.substring(0, 1000) + '...' : prompt }))],
                                    components: [getCommonLinksRow()]
                                });
                                lastUpdateTime = now;
                            } catch (editError) {
                                console.error(`[Chat:pro] Discord編集エラー:`, editError);
                            }
                        }
                    }
                }
            } catch (streamError) {
                console.error(`[Chat:pro] ストリームエラー:`, streamError);
                // フォールバック: 非ストリーミング生成
                const result = await model.generateContent({ contents: messages });
                aiReply = result.response.text();
            }

            if (!aiReply) {
                aiReply = '申し訳ございません。応答を生成できませんでした。もう一度お試しください。';
            }

            // 最終応答を表示
            await interaction.editReply({
                embeds: [addCommonFooter(new EmbedBuilder()
                    .setTitle('🤖 AIチャット応答（完了）')
                    .setDescription(aiReply.length > 4000 ? aiReply.substring(0, 4000) + '...' : aiReply)
                    .setColor(0x00ff00)
                    .addFields({ name: '📝 プロンプト', value: prompt.length > 1000 ? prompt.substring(0, 1000) + '...' : prompt }))],
                components: [getCommonLinksRow()]
            });

            console.log(`[Chat:pro] AI応答完了: ${aiReply.length}文字`);

        } catch (error) {
            console.error(`[Chat:pro] 全体エラー:`, error);
            await interaction.editReply({
                embeds: [addCommonFooter(new EmbedBuilder()
                    .setTitle('❌ エラー')
                    .setDescription('AIチャットの処理中にエラーが発生しました。しばらく時間をおいてから再度お試しください。')
                    .setColor(0xff0000))],
                components: [getCommonLinksRow()]
            });
            return;
        }

        // TTS連携の改善（動的判定システムに対応）
        try {
            const vc = voiceClients[guildId];
            if (vc && vc.state.status === VoiceConnectionStatus.Ready) {
                console.log(`[Chat:pro] TTS開始: ${aiReply.length}文字`);
                
                // 適切なテキストチャンネルの設定
                const currentChannel = interaction.channel;
                if (currentChannel && currentChannel.type === ChannelType.GuildText) {
                    setTextChannelForGuildInMap(guildId, currentChannel as TextChannel);
                    // chatコマンド実行チャンネルも記録（動的判定で使用）
                    setJoinCommandChannel(guildId, interaction.channelId);
                    console.log(`[Chat:pro] テキストチャンネル設定: ${currentChannel.name}`);
                }
                
                // 音声設定の取得（デフォルト値付き）
                const speakerId = voiceSettings.speaker?.[userId] || 1;
                const volume = voiceSettings.volume?.[userId] || 1.0;
                const pitch = voiceSettings.pitch?.[userId] || 1.0;
                const speed = voiceSettings.speed?.[userId] || 1.0;
                
                // TTSの実行（長文の場合は切り詰め）
                const ttsText = aiReply.length > 500 ? aiReply.substring(0, 500) + '…以下略' : aiReply;
                
                // speakVoice関数の正しい引数形式を使用
                try {
                    await speakVoice(ttsText, speakerId, guildId);
                    console.log(`[Chat:pro] TTS完了`);
                } catch (ttsError) {
                    console.error(`[Chat:pro] TTSエラー:`, ttsError);
                    // TTS失敗時もエラー表示はしない（チャット応答は成功しているため）
                }
            } else {
                console.log(`[Chat:pro] 音声接続なし、TTSスキップ`);
            }
        } catch (ttsError) {
            console.error(`[Chat:pro] TTS処理エラー:`, ttsError);
            // TTS失敗時もメイン処理は継続
        }
    }
};

import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { speakVoice, voiceClients, voiceSettings } from '../../utils/TTS-Engine';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { ConversationTrackingService } from '../../utils/conversation-tracking-service';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'data', 'config.json');
const { GEMINI_API_KEY } = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro-latest',
    systemInstruction: 'あなたは親切なDiscordチャットボットです。',
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_UNSPECIFIED, threshold: HarmBlockThreshold.BLOCK_NONE },
    ]
});

// 会話履歴管理
const getHistory = async (userId: string, guildId: string, client: any) => {
    const stats = ConversationTrackingService.getInstance(client);
    const userStats = stats.getUserStats(guildId, userId);
    // 直近10件のメッセージ履歴を返す（例）
    // 実際はDBやファイルから取得する場合はここを拡張
        return userStats?.history?.slice(-10) || [];
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Google Gemini最新API対応AIチャットボット（会話履歴・画像・ストリーム・TTS連携）')
        .addStringOption(option =>
            option.setName('prompt').setDescription('プロンプトを入力してください').setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const prompt = interaction.options.getString('prompt', true);
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;
        const attachments = interaction.options.getAttachment('image') ? [interaction.options.getAttachment('image')] : [];

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
                    // Fetch the image from the public URL and encode as base64
                    const response = await fetch(att.url);
                    const buffer = Buffer.from(await response.arrayBuffer());
                    (messages[messages.length - 1].parts as any).push({ inlineData: { mimeType: att.contentType, data: buffer.toString('base64') } });
                }
            }
        }

        // ストリーム応答
        let aiReply = '';
        const streamResult = await model.generateContentStream({ contents: messages });
        // If streamResult.stream is an async iterable, use it directly
        if (streamResult.stream && typeof streamResult.stream[Symbol.asyncIterator] === 'function') {
            for await (const chunk of streamResult.stream) {
                if (chunk.text) {
                    aiReply += chunk.text;
                    // Discordに順次表示（編集）
                    await interaction.editReply({
                        embeds: [addCommonFooter(new EmbedBuilder()
                            .setTitle('AIチャット応答')
                            .setDescription(aiReply)
                            .setColor(0x00bfff)
                            .addFields({ name: 'プロンプト', value: prompt }))],
                        components: [getCommonLinksRow()]
                    });
                }
            }
        } else {
            // fallback: treat as a single response if streaming is not supported
            // Try to extract the text from the candidates array if present
            const candidates = (streamResult as any).candidates;
            if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts && candidates[0].content.parts.length > 0) {
                aiReply = candidates[0].content.parts.map((part: any) => part.text).join('');
                await interaction.editReply({
                    embeds: [addCommonFooter(new EmbedBuilder()
                        .setTitle('AIチャット応答')
                        .setDescription(aiReply)
                        .setColor(0x00bfff)
                        .addFields({ name: 'プロンプト', value: prompt }))],
                    components: [getCommonLinksRow()]
                });
            }
        }
        if (!aiReply) aiReply = '（応答がありませんでした）';

        // TTS連携（voiceSettingsから話者・音量・音高・感情など取得）
        const vc = voiceClients[guildId];
        if (vc && vc.state.status === VoiceConnectionStatus.Ready) {
            const speakerId = voiceSettings.speaker?.[userId] || 1;
            const options = {
                volume: voiceSettings.volume?.[userId],
                pitch: voiceSettings.pitch?.[userId],
                intonation: voiceSettings.intonation?.[userId],
                speed: voiceSettings.speed?.[userId],
                tempo: voiceSettings.tempo?.[userId],
            };
            // speakVoiceがoptions対応していなければ拡張が必要
            await speakVoice(aiReply, speakerId, guildId, options);
        }
    }
};
import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { speakVoice, voiceClients, currentSpeaker } from '../../utils/TTS-Engine';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'data', 'config.json');

// config読み込み (Gemini 設定)
const { GEMINI_PROJECT_ID, GEMINI_LOCATION } = JSON.parse(
    fs.readFileSync(configPath, 'utf-8')
);
// Initialize GoogleGenAI client for Vertex AI using default credentials
const ai = new GoogleGenAI({
    vertexai: true,
    project: GEMINI_PROJECT_ID,
    location: GEMINI_LOCATION,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Google Gemini 2.5 Proで動作するAIチャットボット')
        .addStringOption(option =>
            option
                .setName('prompt')
                .setDescription('プロンプトを入力してください')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        const prompt = interaction.options.getString('prompt', true);

        try {
            // チャットセッションを作成してユーザーのプロンプトを送信
            const chatSession = ai.chats.create({ model: 'models/chat-bison-001' });
            const response = await chatSession.sendMessage({
                message: prompt,
                config: { temperature: 0.7 },
            });

            // 応答テキストを抽出
            const aiReply = response.text ?? '（応答がありませんでした）';
            await interaction.editReply({
                embeds: [
                    {
                        title: 'AIチャット応答',
                        description: aiReply,
                        color: 0x00bfff,
                        fields: [
                            { name: 'プロンプト', value: prompt }
                        ]
                    }
                ]
            });

            // TTS読み上げ（ボイスチャンネル接続中のみ）
            const guildId = interaction.guildId!;
            const vc = voiceClients[guildId];
            if (vc && vc.state.status === VoiceConnectionStatus.Ready) {
                const speakerId = currentSpeaker[guildId] || 1;
                await speakVoice(aiReply, speakerId, guildId);
            }
        } catch (error) {
            console.error('チャットコマンド実行エラー：', error);
            await interaction.editReply({
                embeds: [
                    {
                        title: 'エラー',
                        description: 'AIチャットの実行中にエラーが発生しました。',
                        color: 0xff0000
                    }
                ]
            });
        }
    },
};
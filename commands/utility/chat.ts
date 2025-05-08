import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { speakVoice, voiceClients, currentSpeaker } from '../../utils/TTS-Engine';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(process.cwd(), 'data', 'config.json');

// config読み込み (Gemini 設定)
const { GEMINI_API_KEY, GEMINI_PROJECT_ID, GEMINI_LOCATION } = JSON.parse(
    fs.readFileSync(configPath, 'utf-8')
);
// GoogleGenAI クライアント初期化
const ai = new GoogleGenAI({
    vertexai: true,
    project: GEMINI_PROJECT_ID,
    location: GEMINI_LOCATION,
    apiKey: GEMINI_API_KEY,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('AI Chat Bot powered by Google Gemini 1.5 Pro')
        .addStringOption(option =>
        option.setName('prompt')
            .setDescription('Enter your prompt')
            .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        const prompt = interaction.options.getString('prompt', true);
        try {
        // create a chat session and send the user prompt
        const chatSession = ai.chats.create({ model: 'models/chat-bison-001' });
        const response = await chatSession.sendMessage({
            message: prompt,
            config: { temperature: 0.7 }
        });
        // extract text reply from the response
        const aiReply = response.text ?? '（応答がありませんでした）';
        await interaction.editReply(aiReply);

        // TTS読み上げ（ボイスチャンネル接続中のみ）
        const guildId = interaction.guildId!;
        const vc = voiceClients[guildId];
        if (vc && vc.state.status === VoiceConnectionStatus.Ready) {
            const speakerId = currentSpeaker[guildId] || 1;
            await speakVoice(aiReply, speakerId, guildId);
        }
        } catch (error) {
        console.error('チャットコマンド実行エラー:', error);
        await interaction.editReply('AI Chat の実行中にエラーが発生しました。');
        }
    }
};
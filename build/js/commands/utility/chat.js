"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
const voice_1 = require("@discordjs/voice");
const genai_1 = require("@google/genai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configPath = path.resolve(process.cwd(), 'data', 'config.json');
// config読み込み (Gemini 設定)
const { GEMINI_PROJECT_ID, GEMINI_LOCATION } = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
// Initialize GoogleGenAI client for Vertex AI using default credentials
const ai = new genai_1.GoogleGenAI({
    vertexai: true,
    project: GEMINI_PROJECT_ID,
    location: GEMINI_LOCATION,
});
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('chat')
        .setDescription('Google Gemini 1.5 Proで動作するAIチャットボット')
        .addStringOption(option => option
        .setName('prompt')
        .setDescription('プロンプトを入力してください')
        .setRequired(true)),
    async execute(interaction) {
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
            await interaction.editReply(aiReply);
            // TTS読み上げ（ボイスチャンネル接続中のみ）
            const guildId = interaction.guildId;
            const vc = TTS_Engine_1.voiceClients[guildId];
            if (vc && vc.state.status === voice_1.VoiceConnectionStatus.Ready) {
                const speakerId = TTS_Engine_1.currentSpeaker[guildId] || 1;
                await (0, TTS_Engine_1.speakVoice)(aiReply, speakerId, guildId);
            }
        }
        catch (error) {
            console.error('チャットコマンド実行エラー：', error);
            await interaction.editReply('AIチャットの実行中にエラーが発生しました。');
        }
    },
};
//# sourceMappingURL=chat.js.map
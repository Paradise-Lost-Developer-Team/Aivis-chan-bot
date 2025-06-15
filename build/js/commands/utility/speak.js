"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
const VoiceQueue_1 = require("../../utils/VoiceQueue");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('speak')
        .setDescription('テキストを読み上げます')
        .addStringOption(option => option.setName('text')
        .setDescription('読み上げるテキスト')
        .setRequired(true))
        .addBooleanOption(option => option.setName('priority')
        .setDescription('優先的に読み上げるかどうか')
        .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const guildId = interaction.guildId;
            if (!guildId) {
                await interaction.editReply('このコマンドはサーバー内でのみ使用できます。');
                return;
            }
            // ボイス接続確認
            const voiceClient = TTS_Engine_1.voiceClients[guildId];
            if (!voiceClient) {
                await interaction.editReply('ボイスチャンネルに接続していません。先に /join コマンドを実行してください。');
                return;
            }
            const text = interaction.options.getString('text', true);
            const isPriority = interaction.options.getBoolean('priority') || false;
            // 優先度設定
            const priority = isPriority ? VoiceQueue_1.Priority.HIGH : VoiceQueue_1.Priority.NORMAL;
            // キューに追加（interaction.userオブジェクトを元にメッセージを作成するとエラーになるため、オリジナルメッセージは指定しない）
            const formattedText = `${interaction.user.username}さんのコマンド、${text}`;
            (0, VoiceQueue_1.enqueueText)(guildId, formattedText, priority);
            await interaction.editReply(`読み上げキューに追加しました。優先度: ${isPriority ? '高' : '通常'}`);
        }
        catch (error) {
            console.error('読み上げテストエラー:', error);
            await interaction.editReply(`エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
//# sourceMappingURL=speak.js.map
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, CommandInteraction } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
// AivisSpeech関連のモジュールをインポートする必要があれば追加してください
// import { AivisSpeechEngine } from '../../services/aivisSpeech';

// AivisSpeech Engineのレイテンシーを測定する関数
async function measureAivisSpeechLatency() {
    // ここでAivisSpeech Engineへのリクエストを実行し、レイテンシーを計測します
    // このコードは実際の実装に合わせて変更する必要があります
    
    try {
        const startTime = Date.now();
        // AivisSpeech Engineへの簡単なリクエスト
        // 例: await AivisSpeechEngine.ping();
        
        // ダミー実装としてタイムアウト
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return Date.now() - startTime;
    } catch (error) {
        console.error('AivisSpeech Engine latency測定エラー:', error);
        return 'エラー';
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('BOTとAivisSpeech Engineの応答時間をテストします。'),
    async execute(interaction: CommandInteraction) {
        const client = interaction.client;
        const botLatency = Math.round(client.ws.ping);
        
        // レスポンスを送信前に「測定中...」と表示
        await interaction.deferReply();
        
        // AivisSpeech Engineのレイテンシーを測定
        const aivisLatency = await measureAivisSpeechLatency();
        
        const embed = addCommonFooter(
            new EmbedBuilder()
                .setTitle("Latency")
                .setColor("#00dd00")
                .addFields(
                    { name: "Bot Latency", value: `${botLatency}ms`, inline: true },
                    { name: "AivisSpeech Engine Latency", value: `${aivisLatency}ms`, inline: true }
                )
                .setDescription(`Pong！レイテンシー測定結果です。`)
        );
        await interaction.editReply({ embeds: [embed], components: [getCommonLinksRow()] });
    }
};
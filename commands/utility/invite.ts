import { EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Botの招待リンクを表示します'),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // 埋め込みメッセージを作成
        const embed = new EmbedBuilder()
            .setTitle('Bot招待リンク')
            .setDescription('下記のリンクからBotを招待できます:')
            .setColor(0x3498db)
            .addFields(
                { name: 'Bot 1', value: '[招待リンク 1](https://discord.com/oauth2/authorize?client_id=1333819940645638154)' },
                { name: 'Bot 2', value: '[招待リンク 2](https://discord.com/oauth2/authorize?client_id=1334732369831268352)' },
                { name: 'Bot 3', value: '[招待リンク 3](https://discord.com/oauth2/authorize?client_id=1334734681656262770)' }
            )
            .setFooter({ text: 'ご利用ありがとうございます。' })
            .setTimestamp();

        // 埋め込みメッセージを送信
        await interaction.reply({ embeds: [embed] });
    },
};

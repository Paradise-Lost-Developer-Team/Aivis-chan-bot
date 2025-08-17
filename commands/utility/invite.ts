import { EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Botの招待リンクを表示します'),
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // 埋め込みメッセージを作成
        const embed = addCommonFooter(
            new EmbedBuilder()
                .setTitle('Bot招待リンク')
                .setDescription('下記のリンクからBotを招待できます:')
                .setColor(0x3498db)
                .addFields(
                    { name: 'Bot 1', value: '[招待リンク 1](https://discord.com/oauth2/authorize?client_id=1333819940645638154)' },
                    { name: 'Bot 2', value: '[招待リンク 2](https://discord.com/oauth2/authorize?client_id=1334732369831268352)' },
                    { name: 'Bot 3', value: '[招待リンク 3](https://discord.com/oauth2/authorize?client_id=1334734681656262770)' },
                    { name: 'Bot 4', value: '[招待リンク 4](https://discord.com/oauth2/authorize?client_id=1365633502988472352)' },
                    { name: 'Bot 5', value: '[招待リンク 5](https://discord.com/oauth2/authorize?client_id=1365633586123771934)' },
                    { name: 'Bot 6', value: '[招待リンク 6](https://discord.com/oauth2/authorize?client_id=1365633656173101086)' }
                )
        );

        // 埋め込みメッセージを送信
        await interaction.reply({ embeds: [embed], components: [getCommonLinksRow()] });
    },
};

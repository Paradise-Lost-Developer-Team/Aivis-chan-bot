"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const builders_1 = require("@discordjs/builders");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('invite')
        .setDescription('Botの招待リンクを表示します'),
    async execute(interaction) {
        // 埋め込みメッセージを作成
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('Bot招待リンク')
            .setDescription('下記のリンクからBotを招待できます:')
            .setColor(0x3498db)
            .addFields({ name: 'Bot 1', value: '[招待リンク 1](https://discord.com/oauth2/authorize?client_id=1333819940645638154)' }, { name: 'Bot 2', value: '[招待リンク 2](https://discord.com/oauth2/authorize?client_id=1334732369831268352)' }, { name: 'Bot 3', value: '[招待リンク 3](https://discord.com/oauth2/authorize?client_id=1334734681656262770)' }, { name: 'Bot 4', value: '[招待リンク 4](https://discord.com/oauth2/authorize?client_id=1365633502988472352)' }, { name: 'Bot 5', value: '[招待リンク 5](https://discord.com/oauth2/authorize?client_id=1365633586123771934)' }, { name: 'Bot 6', value: '[招待リンク 6](https://discord.com/oauth2/authorize?client_id=1365633656173101086)' })
            .setFooter({ text: 'ご利用ありがとうございます。' })
            .setTimestamp();
        // 埋め込みメッセージを送信
        await interaction.reply({ embeds: [embed] });
    },
};
//# sourceMappingURL=invite.js.map
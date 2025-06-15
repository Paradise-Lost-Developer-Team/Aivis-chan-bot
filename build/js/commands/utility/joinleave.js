"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const joinLeaveManager_1 = require("../../utils/joinLeaveManager");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('joinleave')
        .setDescription('参加/退出通知の埋め込みをオンまたはオフにします')
        .addStringOption(option => option.setName('action')
        .setDescription('オンまたはオフを選択してください')
        .setRequired(true)
        .addChoices({ name: 'オン', value: 'enable' }, { name: 'オフ', value: 'disable' })),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const action = interaction.options.getString('action', true);
        if (action === 'enable') {
            (0, joinLeaveManager_1.enableJoinLeaveEmbed)(guildId);
            await interaction.reply({ content: '✅ 参加/退出通知の埋め込みを有効にしました', flags: discord_js_1.MessageFlags.Ephemeral });
        }
        else {
            (0, joinLeaveManager_1.disableJoinLeaveEmbed)(guildId);
            await interaction.reply({ content: '✅ 参加/退出通知の埋め込みを無効にしました', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    },
};
//# sourceMappingURL=joinleave.js.map
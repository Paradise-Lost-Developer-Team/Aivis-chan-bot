import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { enableJoinLeaveEmbed, disableJoinLeaveEmbed } from '../../utils/joinLeaveManager';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joinleave')
        .setDescription('参加/退出通知の埋め込みをオンまたはオフにします')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('オンまたはオフを選択してください')
                .setRequired(true)
                .addChoices(
                    { name: 'オン', value: 'enable' },
                    { name: 'オフ', value: 'disable' }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        const action = interaction.options.getString('action', true);
        if (action === 'enable') {
            enableJoinLeaveEmbed(guildId);
            await interaction.reply({ content: '✅ 参加/退出通知の埋め込みを有効にしました', flags: MessageFlags.Ephemeral });
        } else {
            disableJoinLeaveEmbed(guildId);
            await interaction.reply({ content: '✅ 参加/退出通知の埋め込みを無効にしました', flags: MessageFlags.Ephemeral });
        }
    },
};
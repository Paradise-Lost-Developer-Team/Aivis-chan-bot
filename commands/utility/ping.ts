import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, CommandInteraction } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('BOTの応答時間をテストします。'),
    async execute(interaction: CommandInteraction) {
        const client = interaction.client;
        const latency = Math.round(client.ws.ping);
        const embed = new EmbedBuilder()
            .setTitle("Latency")
            .setColor("#00ff00")
            .setDescription(`Pong！BotのPing値は${latency}msです。`);
        await interaction.reply({ embeds: [embed] });
    }
};
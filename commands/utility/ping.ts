import { EmbedBuilder } from 'discord.js';

module.exports = {
    name: 'ping',
    description: 'ボットのレイテンシをチェックします',
    async execute(interaction: { reply: (arg0: { embeds: EmbedBuilder[]; }) => any; }, client: { ws: { ping: number; }; }) {
        const latency = Math.round(client.ws.ping);
        const embed = new EmbedBuilder()
            .setTitle("Latency")
            .setColor("#00ff00")
            .setDescription(`Pong！BotのPing値は${latency}msです。`);
        await interaction.reply({ embeds: [embed] });
    }
};
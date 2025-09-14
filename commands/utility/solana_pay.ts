import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('solana_pay')
    .setDescription('Create a Solana payment QR link')
    .addNumberOption(opt => opt.setName('amount_sol').setDescription('Amount in SOL').setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    const amountSol = interaction.options.getNumber('amount_sol', true);
    const amountLamports = Math.round(amountSol * 1e9);
    // Call web dashboard's create-invoice endpoint (web service now owns invoice creation)
    try {
      const webBase = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web:80';
      const res = await fetch(`${webBase.replace(/\/$/, '')}/internal/solana/create-invoice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountLamports })
      });
      const body = await res.json();
      if (!body || !body.invoiceId) {
        await interaction.reply({ content: 'Failed to create invoice', ephemeral: true });
        return;
      }
      // Build pay page URL (public path on web service)
      const base = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web:80';
      const payUrl = `${base.replace(/\/$/, '')}/pay.html?receiver=${encodeURIComponent(body.receiver)}&amountLamports=${amountLamports}&invoiceId=${encodeURIComponent(body.invoiceId)}&rpc=${encodeURIComponent(body.rpc)}`;
      await interaction.reply({ content: `支払いリンク: ${payUrl}`, ephemeral: false });
    } catch (e: any) {
      console.error('solana_pay error', e);
      await interaction.reply({ content: 'エラーが発生しました', ephemeral: true });
    }
  }
}

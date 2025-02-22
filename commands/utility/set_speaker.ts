import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getSpeakerOptions } from 'set_voiceSettings'
import { handleSelectSpeaker } from 'speakers';

export async function handleSetSpeakerCommand(commandName: string, speakers: any[], interaction: any) {
    if (commandName === "set_speaker") {
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }
        const options = getSpeakerOptions();
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_speaker')
                    .setPlaceholder('話者を選択してください')
                    .addOptions(options)
            );
        await interaction.reply({ content: "話者を選択してください:", components: [row] });
        handleSelectSpeaker(interaction);
    }
}
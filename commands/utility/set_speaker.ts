import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, CommandInteractionOptionResolver, MessageFlags } from 'discord.js';
import { getSpeakerChoices, speakers, currentSpeaker, loadSpeakers } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName("set_speaker")
        .setDescription("スピーカーを設定する")
        .addNumberOption(option => 
        option.setName("speaker")
            .setDescription("設定するスピーカーのID")
            .setRequired(true)
        ),
    async execute(interaction: CommandInteraction) {
        loadSpeakers();
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }

        const options = interaction.options as CommandInteractionOptionResolver;
        const speaker = options.getNumber('speaker', true);
        if (speaker !== null) {
            currentSpeaker[interaction.guildId!] = speaker;
            await interaction.reply(`話者を ${speakers[speaker]} に設定しました。`);
        } else {
        await interaction.reply({ content: '無効な話者です。', flags: MessageFlags.Ephemeral });
    }
},
};
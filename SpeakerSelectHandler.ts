import { Client } from "discord.js";
import { currentSpeaker } from "./TTS-Engine";

export function SpeakerSelectHandler(client: Client) {
    client.on("interactionCreate", async interaction => {
        if (!interaction.isStringSelectMenu()) return;
        if (interaction.customId !== "select_speaker") return;
        
        const selectedValue = interaction.values[0];
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.reply({ content: "ギルド情報が取得できませんでした。", ephemeral: true });
            return;
        }
        // 値は "speakerName-styleName-123456" の形式と仮定し、最後の部分を話者IDとして取得
        const parts = selectedValue.split("-");
        const speakerId = parseInt(parts[parts.length - 1]);
        if (isNaN(speakerId)) {
            await interaction.reply({ content: "無効な話者IDです。", ephemeral: true });
            return;
        }
        currentSpeaker[guildId] = speakerId;
        await interaction.reply({ content: `話者を ${selectedValue} に変更しました。`, ephemeral: true });
    });
}

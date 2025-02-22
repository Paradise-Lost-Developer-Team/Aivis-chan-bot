import { Client } from "discord.js";
import { currentSpeaker, speakers } from "./TTS-Engine";

export function SpeakerSelectHandler(client: Client) {
    client.on("interactionCreate", async interaction => {
        if (!interaction.isStringSelectMenu()) return;
        if (interaction.customId !== "select_speaker") return;
        
        const selectedValue = interaction.values[0];
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.reply({ content: "ギルドIDが取得できませんでした。", components: [] });
            return;
        }
        // 値は "speakerName-styleName-123456" の形式と仮定し、最後の部分を話者IDとして取得
        const parts = selectedValue.split("-");
        const speakerId = parseInt(parts[parts.length - 1]);
        currentSpeaker[guildId] = speakerId;
        const selectedSpeaker = speakers.find(speaker => speaker.name === parts[0]);
            if (guildId) {
                if (selectedSpeaker) {
                    const selectedStyle = selectedSpeaker.styles.find((style: { id: number; }) => style.id === speakerId);
                    if (selectedStyle) {
                        await interaction.update({ content: `話者を ${selectedSpeaker.name} - ${selectedStyle.name} に設定しました。`, components: [] });
                        return;
                    } else {
                        await interaction.update({ content: "エラー: スタイルが見つかりませんでした。", components: [] });
                        return;
                    } 
                } else {
                    await interaction.update({ content: "エラー: 話者が見つかりませんでした。", components: [] });
                    return;
                }
            }
    });
}

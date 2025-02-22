import { Events, Interaction } from 'discord.js';
import { client } from './index';
import { currentSpeaker} from './TTS-Engine'; // Adjust the path as needed
import { speakers } from './set_voiceSettings'; // Adjust the path as needed

export function handleSelectSpeaker(interaction: Interaction) {
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        
        if (interaction.customId === 'select_speaker') {
            if (!interaction.values || interaction.values.length === 0) {
                console.error("Error: interaction.values is undefined or empty.");
                await interaction.update({ content: "エラー: 話者が選択されていません。", components: [] });
                return;
            }
    
            const selectedValue = interaction.values[0];
            const [selectedSpeakerName, selectedStyleName, selectedSpeakerId] = selectedValue.split('-');
            console.log(`Selected speaker ID: ${selectedSpeakerId}`); // デバッグ用ログ
            console.log(`Interaction guild ID: ${interaction.guildId}`); // デバッグ用ログ
            if (interaction.guildId) {
                currentSpeaker[interaction.guildId] = parseInt(selectedSpeakerId);
                console.log(`Current speaker for guild ${interaction.guildId}: ${currentSpeaker[interaction.guildId]}`); // デバッグ用ログ
                const selectedSpeaker = speakers.find(speaker => speaker.name === selectedSpeakerName);
                if (selectedSpeaker) {
                    const selectedStyle = selectedSpeaker.styles.find((style: { id: number; }) => style.id === parseInt(selectedSpeakerId));
                    if (selectedStyle) {
                        await interaction.update({ content: `話者を ${selectedSpeaker.name} - ${selectedStyle.name} に設定しました。`, components: [] });
                        return;
                    } else {
                        console.error("Error: selectedStyle is undefined.");
                        await interaction.update({ content: "エラー: スタイルが見つかりませんでした。", components: [] });
                    }
                } else {
                    console.error("Error: selectedSpeaker is undefined.");
                    await interaction.update({ content: "エラー: 話者が見つかりませんでした。", components: [] });
                }
            } else {
                console.error("Error: interaction.guildId is undefined.");
                await interaction.update({ content: "エラー: ギルドIDが取得できませんでした。", components: [] });
            }
        }
    });
}
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('engage-points')
        .setDescription('Check your raid engagement points'),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const userId = interaction.user.id;
        const points = await interaction.client.db.get(`points_${userId}`, 0);
        const username = await interaction.client.db.get(`xuser_${userId}`) || 'Not linked';

        const embed = createEmbed({
            title: 'Your Engage Points',
            description: `**X Account:** @${username}\n**Total Points:** **${points}**`,
            color: 0x1DA1F2,
            thumbnail: interaction.user.displayAvatarURL()
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { type: 'command', commandName: 'engage-points' })
};

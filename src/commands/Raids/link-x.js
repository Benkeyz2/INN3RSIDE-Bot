import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Link your X (Twitter) account for raids')
        .addStringOption(opt =>
            opt.setName('username')
                .setDescription('Your X username (without @)')
                .setRequired(true)
        ),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const username = interaction.options.getString('username').replace('@', '').trim().toLowerCase();
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        if (!username || username.length < 2) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Please enter a valid username.')]
            });
        }

        const linkData = {
            xUsername: username,
            userId: userId,
            guildId: guildId,
            linkedAt: Date.now()
        };

        // Save in the simplest possible way
        await interaction.client.db.set(`xlink_${userId}`, linkData);
        await interaction.client.db.set(`xlink_${userId}_${guildId}`, linkData);

        // Also save just the username as string
        await interaction.client.db.set(`xuser_${userId}`, username);

        logger.info(`X LINKED: ${userId} → @${username}`);

        // Immediately read it back to confirm
        const confirm = await interaction.client.db.get(`xuser_${userId}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'X Account Linked!',
                    `Successfully linked: **@${username}**\n\n` +
                    `Confirmation read-back: **${confirm || 'FAILED'}**\n\n` +
                    `Now click **Verify my engagement** on the raid.`
                )
            ]
        });
    }, { type: 'command', commandName: 'link-x' })
};

import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Link your X (Twitter) account')
        .addStringOption(opt =>
            opt.setName('username')
                .setDescription('Your X username without @')
                .setRequired(true)
        ),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raw = interaction.options.getString('username');
        const username = raw.replace('@', '').trim().toLowerCase();

        if (!username || username.length < 2) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Invalid Username', 'Please enter a valid X username.')]
            });
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const linkData = {
            userId,
            guildId,
            xUsername: username,
            linkedAt: new Date().toISOString(),
            tag: interaction.user.tag
        };

        try {
            // Save in multiple places for safety
            await interaction.client.db.set(`xlink:${userId}`, linkData);
            await interaction.client.db.set(`guild:${guildId}:xlink:${userId}`, linkData);
            await interaction.client.db.set(`userx:${userId}`, username); // simple version

            logger.info(`[LINK-X] Successfully linked @${username} for ${userId}`);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        'X Linked Successfully!',
                        `Your X account **@${username}** has been linked.\n\nNow go click **Verify my engagement** on the raid.`
                    )
                ]
            });
        } catch (error) {
            logger.error('Failed to save X link:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Database Error', 'Failed to save your link. Please contact the bot owner.')]

            });
        }
    }, { type: 'command', commandName: 'link-x' })
};

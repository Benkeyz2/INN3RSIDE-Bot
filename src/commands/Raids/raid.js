import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Link your X (Twitter) account to earn raid points')
        .addStringOption(opt =>
            opt.setName('username')
                .setDescription('Your X username (without @)')
                .setRequired(true)
        ),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const username = interaction.options.getString('username').replace('@', '').trim().toLowerCase();

        if (!username || username.length < 2 || username.length > 15) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Please provide a valid X username (without @).'
            });
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Save with a very clear key
        const linkData = {
            userId: userId,
            guildId: guildId,
            xUsername: username,
            linkedAt: Date.now(),
            linkedBy: interaction.user.tag
        };

        // Main key
        await interaction.client.db.set(`guild:\( {guildId}:xlink: \){userId}`, linkData);

        // Backup key
        await interaction.client.db.set(`xlink:\( {guildId}: \){userId}`, linkData);

        logger.info(`X linked: @${username} by ${userId} in ${guildId}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'X Account Linked Successfully!',
                    `You have linked: **@${username}**\n\nYou can now click **Verify my engagement** on any raid.`
                )
            ]
        });
    }, { type: 'command', commandName: 'link-x' })
};

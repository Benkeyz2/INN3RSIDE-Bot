import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Link your X username for raids')
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
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Invalid Username', 'Please enter a valid X username.')]
            });
        }

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // Save simple link
        await interaction.client.db.set(`xuser_${userId}`, username);
        await interaction.client.db.set(`xlink:${userId}`, {
            xUsername: username,
            discordId: userId,
            guildId: guildId,
            linkedAt: Date.now()
        });

        logger.info(`[LINK] ${userId} linked @${username}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'X Username Linked!',
                    `Successfully linked: **@${username}**\n\nYou can now join raids and click Verify after you Reply + Retweet.`
                )
            ]
        });
    }, { type: 'command', commandName: 'link-x' })
};

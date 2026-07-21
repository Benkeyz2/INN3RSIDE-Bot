import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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

        const username = interaction.options.getString('username').replace('@', '').trim();

        if (!username || username.length < 2) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Please provide a valid X username.'
            });
        }

        await interaction.client.db.set(
            `guild:\( {interaction.guild.id}:xlink: \){interaction.user.id}`,
            {
                userId: interaction.user.id,
                xUsername: username,
                linkedAt: Date.now()
            }
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'X Account Linked!',
                    `Successfully linked **@${username}**\n\nYou can now earn points from raids by clicking **Verify my engagement**.`
                )
            ]
        });
    }, { type: 'command', commandName: 'link-x' })
};

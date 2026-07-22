import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Link your X account (real OAuth like Origins)'),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const clientId = process.env.X_CLIENT_ID;
        const callbackURL = process.env.X_CALLBACK_URL;

        if (!clientId || !callbackURL) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Config Error', 'X API keys are missing on the server.')]
            });
        }

        // Create secure state
        const state = crypto.randomBytes(16).toString('hex') + `_${interaction.user.id}_${interaction.guild.id}`;

        // Save state for 10 minutes
        await interaction.client.db.set(`oauth_state:${state}`, {
            discordId: interaction.user.id,
            guildId: interaction.guild.id,
            createdAt: Date.now()
        }, 600);

        const scopes = encodeURIComponent('tweet.read users.read offline.access');
        const authURL = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackURL)}&scope=${scopes}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Link X Account')
                .setStyle(ButtonStyle.Link)
                .setURL(authURL)
                .setEmoji('🔗')
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Link your X Account',
                    'Click the button below to securely link your X account.\n\nYou will be taken to X to authorize (exactly like Origins).'
                )
            ],
            components: [row]
        });

        logger.info(`OAuth started for ${interaction.user.id}`);
    }, { type: 'command', commandName: 'link-x' })
};

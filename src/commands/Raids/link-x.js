import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import crypto from 'crypto';

import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { generatePKCE } from '../../utils/pkce.js';

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('link-x')
        .setDescription('Securely link your X account'),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {

        await InteractionHelper.safeDefer(interaction, {
            flags: ['Ephemeral']
        });

        const clientId = process.env.X_CLIENT_ID;
        const callbackURL = process.env.X_CALLBACK_URL;

        if (!clientId || !callbackURL) {

            return InteractionHelper.safeEditReply(interaction, {

                embeds: [
                    errorEmbed(
                        'Configuration Error',
                        'X OAuth is not configured.'
                    )
                ]

            });

        }

        const state =
            `${crypto.randomUUID()}_${interaction.user.id}_${interaction.guild.id}`;

        const pkce = generatePKCE();

        await interaction.client.db.set(

            `oauth_state:${state}`,

            {

                discordId: interaction.user.id,

                guildId: interaction.guild.id,

                verifier: pkce.verifier,

                createdAt: Date.now()

            },

            600

        );

        const params = new URLSearchParams({

            response_type: 'code',

            client_id: clientId,

            redirect_uri: callbackURL,

            scope: 'tweet.read users.read offline.access',

            state,

            code_challenge: pkce.challenge,

            code_challenge_method: 'S256'

        });

        const authURL =
            `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

        const row = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setLabel('Link X Account')

                    .setStyle(ButtonStyle.Link)

                    .setEmoji('🔗')

                    .setURL(authURL)

            );

        await InteractionHelper.safeEditReply(interaction, {

            embeds: [

                successEmbed(

                    'Link your X Account',

                    [
                        'Click the button below to authorize your X account.',
                        '',
                        'Your account will be securely linked using OAuth 2.0.',
                        '',
                        'This is a one time process.'
                    ].join('\n')

                )

            ],

            components: [row]

        });

        logger.info(

            `[X OAuth] Started for ${interaction.user.id}`

        );

    },

    {

        type: 'command',

        commandName: 'link-x'

    })

};

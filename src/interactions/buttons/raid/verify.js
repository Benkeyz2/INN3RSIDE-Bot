import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'raid_verify',
    async execute(interaction, client, args) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const raidId = args?.[0];
            const guildId = interaction.guild?.id;
            const userId = interaction.user.id;

            if (!raidId || !guildId) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Invalid raid data. Please start a new raid.')]
                });
            }

            // Try to get the raid
            let raid = await client.db.get(`guild:\( {guildId}:raids: \){raidId}`);

            // Fallback: try without guild prefix just in case
            if (!raid) {
                raid = await client.db.get(`raids:${raidId}`);
            }

            if (!raid) {
                logger.warn(`Raid not found: ${raidId} in guild ${guildId}`);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid data was not found. Please ask an admin to start a new raid.')]
                });
            }

            if (raid.active === false) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Closed', 'This raid has already ended.')]
                });
            }

            // Check if user linked X
            const link = await client.db.get(`guild:\( {guildId}:xlink: \){userId}`);
            if (!link || !link.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not Linked', 'You must first link your X account using `/link-x`')]
                });
            }

            // Check if already verified
            const alreadyKey = `guild:\( {guildId}:raid_eng: \){raidId}:${userId}`;
            const already = await client.db.get(alreadyKey);
            if (already) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
                });
            }

            // Calculate points
            const totalPoints = (Number(raid.pointsLike) || 0) + (Number(raid.pointsReply) || 0);

            // Save that this user verified
            await client.db.set(alreadyKey, {
                userId,
                raidId,
                points: totalPoints,
                xUsername: link.xUsername,
                verifiedAt: Date.now()
            });

            // Add points to user
            const pointsKey = `guild:\( {guildId}:engage_points: \){userId}`;
            const current = await client.db.get(pointsKey, { points: 0 });
            current.points = (Number(current.points) || 0) + totalPoints;
            current.xUsername = link.xUsername;
            await client.db.set(pointsKey, current);

            // Give reward role
            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    if (member && !member.roles.cache.has(raid.rewardRoleId)) {
                        await member.roles.add(raid.rewardRoleId);
                    }
                } catch (err) {
                    logger.warn('Failed to add reward role', { error: err.message });
                }
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Engagement Verified!',
                        `You earned **${totalPoints} points**!\n\n` +
                        `Your total engage points: **${current.points}**\n` +
                        `Linked X: **@${link.xUsername}**`
                    )
                ]
            });

            logger.info(`Raid verified successfully`, {
                userId,
                raidId,
                points: totalPoints,
                guildId
            });

        } catch (error) {
            logger.error('Error in raid_verify button:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong while verifying. Please try again.')]
            }).catch(() => {});
        }
    }
};

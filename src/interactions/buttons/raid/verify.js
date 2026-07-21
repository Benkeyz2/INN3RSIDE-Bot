import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'raid_verify',
    async execute(interaction, client, args) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const raidId = args?.[0];
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;

            if (!raidId) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Invalid raid. Please start a new one.')]
                });
            }

            // ===== GET RAID =====
            let raid = await client.db.get(`guild:\( {guildId}:raids: \){raidId}`);
            if (!raid) {
                raid = await client.db.get(`raids:${raidId}`);
            }

            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid no longer exists. Please ask admin to start a new raid.')]
                });
            }

            if (raid.active === false) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Closed', 'This raid has already ended.')]
                });
            }

            // ===== GET X LINK (multiple ways) =====
            let link = await client.db.get(`guild:\( {guildId}:xlink: \){userId}`);
            
            if (!link) {
                link = await client.db.get(`xlink:\( {guildId}: \){userId}`);
            }

            if (!link || !link.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'X Not Linked',
                        'You must link your X account first!\n\nUse the command:\n`/link-x username:YourXUsername`'
                    )]
                });
            }

            // ===== CHECK IF ALREADY VERIFIED =====
            const alreadyKey = `guild:\( {guildId}:raid_eng: \){raidId}:${userId}`;
            const already = await client.db.get(alreadyKey);
            
            if (already) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already claimed the points for this raid.')]
                });
            }

            // ===== GIVE POINTS =====
            const totalPoints = (Number(raid.pointsLike) || 0) + (Number(raid.pointsReply) || 0);

            // Save engagement
            await client.db.set(alreadyKey, {
                userId,
                raidId,
                points: totalPoints,
                xUsername: link.xUsername,
                verifiedAt: Date.now()
            });

            // Update total points
            const pointsKey = `guild:\( {guildId}:engage_points: \){userId}`;
            let current = await client.db.get(pointsKey, { points: 0 });
            current.points = (Number(current.points) || 0) + totalPoints;
            current.xUsername = link.xUsername;
            await client.db.set(pointsKey, current);

            // Give role
            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    if (member && !member.roles.cache.has(raid.rewardRoleId)) {
                        await member.roles.add(raid.rewardRoleId, 'Raid engagement reward');
                    }
                } catch (err) {
                    logger.warn('Could not give reward role', { error: err.message });
                }
            }

            // Success message
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Engagement Verified!',
                        `**+${totalPoints} points** earned!\n\n` +
                        `Your total engage points: **${current.points}**\n` +
                        `Linked X: **@${link.xUsername}**`
                    )
                ]
            });

            logger.info(`Raid verified`, {
                userId,
                username: link.xUsername,
                raidId,
                points: totalPoints,
                guildId
            });

        } catch (error) {
            logger.error('raid_verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Please try again or relink your X.')]
            }).catch(() => {});
        }
    }
};

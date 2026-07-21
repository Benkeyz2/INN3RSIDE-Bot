import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'raid_verify', // ← this is required by your bot
    async execute(interaction, client, args) {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raidId = args[0]; // comes from customId after the :
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Get raid
        const raid = await client.db.get(`guild:\( {guildId}:raids: \){raidId}`);
        if (!raid || !raid.active) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Raid Closed', 'This raid has already ended.')]
            });
        }

        // Check if linked
        const link = await client.db.get(`guild:\( {guildId}:xlink: \){userId}`);
        if (!link) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Not Linked', 'You must link your X account first using `/link-x`')]
            });
        }

        // Check if already verified
        const already = await client.db.get(`guild:\( {guildId}:raid_eng: \){raidId}:${userId}`);
        if (already) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
            });
        }

        // Give points
        const totalPoints = (raid.pointsLike || 0) + (raid.pointsReply || 0);

        // Save engagement
        await client.db.set(`guild:\( {guildId}:raid_eng: \){raidId}:${userId}`, {
            userId,
            raidId,
            points: totalPoints,
            xUsername: link.xUsername,
            verifiedAt: Date.now()
        });

        // Add to user total
        const userPointsKey = `guild:\( {guildId}:engage_points: \){userId}`;
        const current = await client.db.get(userPointsKey, { points: 0 });
        current.points = (current.points || 0) + totalPoints;
        await client.db.set(userPointsKey, current);

        // Give reward role
        if (raid.rewardRoleId) {
            try {
                const member = await interaction.guild.members.fetch(userId);
                await member.roles.add(raid.rewardRoleId);
            } catch (error) {
                logger.warn('Could not give reward role', { error: error.message });
            }
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Engagement Verified!',
                    `You earned **${totalPoints} points**!\n\n` +
                    `Your total engage points: **${current.points}**\n` +
                    `Linked X: **@${link.xUsername}**`
                )
            ]
        });

        logger.info(`Raid verified: ${userId} on ${raidId}`, { points: totalPoints });
    }
};

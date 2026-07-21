import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    customId: 'raid_verify_', // prefix match
    async execute(interaction) {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raidId = interaction.customId.replace('raid_verify_', '');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Get raid
        const raid = await interaction.client.db.get(`guild:\( {guildId}:raids: \){raidId}`);
        if (!raid || !raid.active) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Raid Closed', 'This raid has already ended.')]
            });
        }

        // Check if linked
        const link = await interaction.client.db.get(`guild:\( {guildId}:xlink: \){userId}`);
        if (!link) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Not Linked', 'You must link your X account first using `/link-x`')]
            });
        }

        // Check if already verified
        const already = await interaction.client.db.get(`guild:\( {guildId}:raid_eng: \){raidId}:${userId}`);
        if (already) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
            });
        }

        // Give points (Like + Reply for now)
        const totalPoints = (raid.pointsLike || 0) + (raid.pointsReply || 0);

        // Save engagement
        await interaction.client.db.set(`guild:\( {guildId}:raid_eng: \){raidId}:${userId}`, {
            userId,
            raidId,
            points: totalPoints,
            xUsername: link.xUsername,
            verifiedAt: Date.now()
        });

        // Add to user total engage points
        const userPointsKey = `guild:\( {guildId}:engage_points: \){userId}`;
        const current = await interaction.client.db.get(userPointsKey, { points: 0 });
        current.points = (current.points || 0) + totalPoints;
        await interaction.client.db.set(userPointsKey, current);

        // Give reward role if set
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

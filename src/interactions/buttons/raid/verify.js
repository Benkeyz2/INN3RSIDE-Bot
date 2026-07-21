import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'raid_verify',
    async execute(interaction, client, args) {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raidId = args?.[0];
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        try {
            // Get raid
            let raid = await client.db.get(`guild:${guildId}:raids:${raidId}`) || await client.db.get(`raids:${raidId}`);
            
            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'Raid data missing. Start a new raid.')]
                });
            }

            // ========== FIND LINK - SIMPLE & STRONG ==========
            let username = null;

            // Method 1
            let data = await client.db.get(`xlink:${userId}`);
            if (data?.xUsername) username = data.xUsername;

            // Method 2
            if (!username) {
                data = await client.db.get(`guild:${guildId}:xlink:${userId}`);
                if (data?.xUsername) username = data.xUsername;
            }

            // Method 3 (simplest)
            if (!username) {
                username = await client.db.get(`userx:${userId}`);
            }

            if (!username) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'X Not Linked',
                        'Still cannot find your X account.\n\nPlease run:\n`/link-x username:YourUsername`\n\nThen try Verify again immediately.'
                    )]
                });
            }

            // Check already verified
            const engKey = `eng:${raidId}:${userId}`;
            const already = await client.db.get(engKey);
            if (already) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already got the points for this raid.')]
                });
            }

            // Give points
            const points = (raid.pointsLike || 0) + (raid.pointsReply || 0);

            await client.db.set(engKey, { points, username, at: Date.now() });

            // Total points
            const totalKey = `engagepoints:${userId}`;
            let total = await client.db.get(totalKey, 0);
            total = Number(total) + points;
            await client.db.set(totalKey, total);

            // Role
            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(raid.rewardRoleId);
                } catch (e) {}
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ VERIFIED SUCCESSFULLY!',
                        `**+${points} points**\n\nYour X: **@${username}**\nTotal Points: **${total}**`
                    )
                ]
            });

            logger.info(`[VERIFY SUCCESS] ${userId} @${username} +${points}pts`);

        } catch (error) {
            logger.error('Verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Unexpected error. Try linking again.')]
            });
        }
    }
};

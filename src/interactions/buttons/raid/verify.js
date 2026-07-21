import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'raid_verify',
    async execute(interaction, client, args) {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raidId = args?.[0];
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            // Get raid
            let raid = await client.db.get(`guild:${guildId}:raids:${raidId}`) || 
                       await client.db.get(`raids:${raidId}`);

            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'Please start a new raid.')]
                });
            }

            // ========== FIND USERNAME - SIMPLE KEYS ==========
            let username = await client.db.get(`xuser_${userId}`);

            if (!username) {
                const data = await client.db.get(`xlink_${userId}`);
                if (data) username = data.xUsername;
            }

            if (!username) {
                const data2 = await client.db.get(`xlink_${userId}_${guildId}`);
                if (data2) username = data2.xUsername;
            }

            if (!username) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'X Not Linked',
                        'Still cannot find your link.\n\n' +
                        'Please run `/link-x` again and look at the confirmation message.\n' +
                        'If it says "Confirmation read-back: FAILED" then your database is in memory mode.'
                    )]
                });
            }

            // Already verified?
            const engKey = `eng_${raidId}_${userId}`;
            if (await client.db.get(engKey)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
                });
            }

            // Give points
            const points = (Number(raid.pointsLike) || 0) + (Number(raid.pointsReply) || 0);

            await client.db.set(engKey, true);

            // Total
            let total = await client.db.get(`points_${userId}`, 0);
            total = Number(total) + points;

            await client.db.set(`points_${userId}`, total);

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
                        '✅ VERIFIED!',
                        `**+${points} points** earned!\n\n` +
                        `X: **@${username}**\n` +
                        `Total Points: **${total}**`
                    )
                ]
            });

            logger.info(`VERIFY SUCCESS: ${userId} @${username} +${points}`);

        } catch (error) {
            logger.error('Verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong.')]
            });
        }
    }
};

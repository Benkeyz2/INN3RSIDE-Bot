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

            logger.info(`Verify clicked by ${userId} for raid ${raidId}`);

            // ========== FIND THE RAID ==========
            let raid = await client.db.get(`guild:${guildId}:raids:${raidId}`);
            if (!raid) raid = await client.db.get(`raids:${raidId}`);

            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid was not found. Please start a new raid.')]
                });
            }

            // ========== FIND THE X LINK (VERY AGGRESSIVE SEARCH) ==========
            let link = null;

            // Try all possible keys
            const possibleKeys = [
                `guild:${guildId}:xlink:${userId}`,
                `xlink:${guildId}:${userId}`,
                `guild:${guildId}:xlink:${userId.toLowerCase()}`,
                `xlink:${userId}`,
                `user:${userId}:xlink`,
                `xlink:${userId}:${guildId}`
            ];

            for (const key of possibleKeys) {
                const data = await client.db.get(key);
                if (data && data.xUsername) {
                    link = data;
                    logger.info(`Found X link using key: ${key}`);
                    break;
                }
            }

            if (!link || !link.xUsername) {
                // Last chance - try to get any xlink for this user
                logger.warn(`No X link found for user ${userId} in guild ${guildId}`);
                
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'X Account Not Linked',
                        'I cannot find your linked X account.\n\nPlease run this command again:\n\n`/link-x username:YourXUsername`\n\nThen click Verify again.'
                    )]
                });
            }

            // ========== ALREADY VERIFIED CHECK ==========
            const alreadyKey = `guild:${guildId}:raid_eng:${raidId}:${userId}`;
            const already = await client.db.get(alreadyKey);
            if (already) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Claimed', 'You already verified and got points for this raid.')]
                });
            }

            // ========== GIVE POINTS ==========
            const totalPoints = (Number(raid.pointsLike) || 0) + (Number(raid.pointsReply) || 0);

            await client.db.set(alreadyKey, {
                userId,
                raidId,
                points: totalPoints,
                xUsername: link.xUsername,
                verifiedAt: Date.now()
            });

            // Save total points
            const pointsKey = `guild:${guildId}:engage_points:${userId}`;
            let pointsData = await client.db.get(pointsKey, { points: 0 });
            pointsData.points = (Number(pointsData.points) || 0) + totalPointsPoints;
            pointsData.xUsername = link.xUsername;
            await client.db.set(pointsKey, pointsData);

            // Give role if exists
            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(raid.rewardRoleId);
                } catch (e) {
                    logger.warn('Role give failed', e.message);
                }
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ SUCCESS! Engagement Verified',
                        `You received **${totalPoints} points**!\n\n` +
                        `Total Points: **${pointsData.points}**\n` +
                        `X Account: **@${link.xUsername}**`
                    )
                ]
            });

            logger.info(`SUCCESS: ${userId} (@${link.xUsername}) got ${totalPoints} points`);

        } catch (error) {
            logger.error('Verify button crash:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Please try linking again with /link-x')]
            }).catch(() => {});
        }
    }
};

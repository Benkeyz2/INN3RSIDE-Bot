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
            // 1. Get the raid
            let raid = await client.db.get(`guild:${guildId}:raids:${raidId}`) || 
                       await client.db.get(`raids:${raidId}`);

            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid no longer exists. Please start a new one.')]
                });
            }

            if (raid.active === false || Date.now() > raid.endsAt) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Ended', 'This raid has already closed.')]
                });
            }

            // 2. Get the user's linked X account (real OAuth data)
            let linkData = await client.db.get(`xlink:${userId}`) || 
                           await client.db.get(`guild:${guildId}:xlink:${userId}`);

            if (!linkData || !linkData.accessToken || !linkData.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'X Not Linked',
                        'You must link your X account first.\n\nUse the command:\n`/link-x`'
                    )]
                });
            }

            // 3. Check if already verified for this raid
            const alreadyKey = `eng:${raidId}:${userId}`;
            const already = await client.db.get(alreadyKey);
            if (already) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
                });
            }

            // 4. REAL CHECK using X API
            const tweetId = extractTweetId(raid.tweetUrl);
            if (!tweetId) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Invalid tweet URL in this raid.')]
                });
            }

            const accessToken = linkData.accessToken;
            let hasLiked = false;
            let hasReplied = false;

            // --- Check if user liked the tweet ---
            try {
                const likeRes = await fetch(`https://api.twitter.com/2/users/${linkData.xId}/liked_tweets?max_results=100`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                const likeData = await likeRes.json();
                
                if (likeData.data) {
                    hasLiked = likeData.data.some(t => t.id === tweetId);
                }
            } catch (e) {
                logger.warn('Like check failed', e.message);
            }

            // --- Check if user replied to the tweet ---
            try {
                const replyRes = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${tweetId} from:${linkData.xUsername}&max_results=10`, {
                    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
                });
                const replyData = await replyRes.json();
                
                if (replyData.data && replyData.data.length > 0) {
                    hasReplied = true;
                }
            } catch (e) {
                logger.warn('Reply check failed', e.message);
            }

            // 5. Calculate points
            let earned = 0;
            let message = '';

            if (hasLiked) {
                earned += Number(raid.pointsLike) || 0;
                message += `❤️ Liked (+${raid.pointsLike})\n`;
            }
            if (hasReplied) {
                earned += Number(raid.pointsReply) || 0;
                message += `💬 Replied (+${raid.pointsReply})\n`;
            }

            if (earned === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'No Engagement Found',
                        `I could not find your Like or Reply on the tweet.\n\n` +
                        `Please make sure you:\n` +
                        `• Liked the post\n` +
                        `• Replied to the post\n\n` +
                        `Then click Verify again.`
                    )]
                });
            }

            // 6. Save and give points
            await client.db.set(alreadyKey, {
                liked: hasLiked,
                replied: hasReplied,
                points: earned,
                at: Date.now()
            });

            const pointsKey = `points_${userId}`;
            let total = await client.db.get(pointsKey, 0);
            total = Number(total) + earned;
            await client.db.set(pointsKey, total);

            // Give role if set
            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(raid.rewardRoleId);
                } catch (e) {}
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Engagement Verified!',
                        `${message}\n` +
                        `**Total earned this raid: ${earned} points**\n\n` +
                        `Your X: **@${linkData.xUsername}**\n` +
                        `All-time points: **${total}**`
                    )
                ]
            });

            logger.info(`[REAL VERIFY] ${userId} @${linkData.xUsername} → +${earned}pts (Liked: ${hasLiked}, Replied: ${hasReplied})`);

        } catch (error) {
            logger.error('Real verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong while checking your engagement. Please try again.')]
            });
        }
    }
};

// Helper to extract tweet ID from URL
function extractTweetId(url) {
    try {
        const match = url.match(/status\/(\d+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

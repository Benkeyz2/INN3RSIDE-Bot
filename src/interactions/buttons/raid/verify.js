import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE = 'https://api.twitterapi.io';

export default {
    name: 'raid_verify',
    async execute(interaction, client, args) {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const raidId = args?.[0];
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            // Get raid
            let raid = await client.db.get(`raids:${raidId}`) || await client.db.get(`guild:${guildId}:raids:${raidId}`);
            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid no longer exists.')]
                });
            }

            // Get real OAuth linked account
            let linkData = await client.db.get(`xlink:${userId}`) || await client.db.get(`guild:${guildId}:xlink:${userId}`);
            
            if (!linkData || !linkData.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('X Not Linked', 'Please run `/link-x` and authorize your X account first.')]
                });
            }

            const username = linkData.xUsername.toLowerCase();

            // Already verified?
            const alreadyKey = `eng:${raidId}:${userId}`;
            if (await client.db.get(alreadyKey)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Already Verified', 'You already claimed points for this raid.')]
                });
            }

            const tweetId = extractTweetId(raid.tweetUrl);
            if (!tweetId) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Error', 'Invalid tweet link.')]
                });
            }

            // ========== CHECK WITH TWITTERAPI.IO ==========
            let hasReplied = false;
            let hasRetweeted = false;

            // Check Reply
            try {
                const q = `conversation_id:${tweetId} from:${username}`;
                const res = await fetch(`${BASE}/twitter/tweet/advanced_search?query=${encodeURIComponent(q)}&queryType=Latest`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const data = await res.json();
                if (data.tweets && data.tweets.length > 0) hasReplied = true;
            } catch (e) {
                logger.warn('Reply check failed', e.message);
            }

            // Check Retweet
            try {
                const q = `retweets_of_tweet_id:${tweetId} from:${username}`;
                const res = await fetch(`${BASE}/twitter/tweet/advanced_search?query=${encodeURIComponent(q)}&queryType=Latest`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const data = await res.json();
                if (data.tweets && data.tweets.length > 0) hasRetweeted = true;
            } catch (e) {
                logger.warn('Retweet check failed', e.message);
            }

            let earned = 0;
            let details = [];

            if (hasReplied) {
                earned += Number(raid.pointsReply) || 0;
                details.push(`💬 Replied (+${raid.pointsReply})`);
            }
            if (hasRetweeted) {
                earned += Number(raid.pointsRetweet || raid.pointsLike) || 0;
                details.push(`🔁 Retweeted (+${raid.pointsRetweet || raid.pointsLike})`);
            }

            if (earned === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'No Engagement Found',
                        `Could not find your Reply or Retweet.\n\nPlease make sure you:\n• Replied to the tweet\n• Retweeted the tweet\n\nWait 20-30 seconds then try again.`
                    )]
                });
            }

            // Success
            await client.db.set(alreadyKey, { replied: hasReplied, retweeted: hasRetweeted, points: earned });

            const totalKey = `points_${userId}`;
            let total = Number(await client.db.get(totalKey, 0)) + earned;
            await client.db.set(totalKey, total);

            if (raid.rewardRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(raid.rewardRoleId);
                } catch (e) {}
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Verified with twitterapi.io!',
                        `${details.join('\n')}\n\n**Earned: ${earned} points**\nX: **@${username}**\nTotal Points: **${total}**`
                    )
                ]
            });

            logger.info(`[VERIFY SUCCESS] ${userId} @${username} +${earned}`);

        } catch (error) {
            logger.error('Verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Please try again.')]
            });
        }
    }
};

function extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
}

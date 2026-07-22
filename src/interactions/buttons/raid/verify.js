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
            let raid = await client.db.get(`raids:${raidId}`) || await client.db.get(`guild:${guildId}:raids:${raidId}`);
            if (!raid) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Raid Not Found', 'This raid no longer exists.')]
                });
            }

            const username = await client.db.get(`xuser_${userId}`);
            if (!username) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not Linked', 'Please link your X first using `/link-x username:YourName`')]
                });
            }

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

            // ===== CHECK WITH TWITTERAPI.IO =====
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
                logger.warn('Reply check error', e.message);
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
                logger.warn('Retweet check error', e.message);
            }

            let earned = 0;
            let details = [];

            if (hasReplied) {
                earned += Number(raid.pointsReply) || 0;
                details.push(`💬 Replied (+${raid.pointsReply})`);
            }
            if (hasRetweeted) {
                earned += Number(raid.pointsRetweet) || 0;
                details.push(`🔁 Retweeted (+${raid.pointsRetweet})`);
            }

            if (earned === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'No Engagement Found',
                        `I could not find your Reply or Retweet.\n\nPlease:\n• Reply to the tweet\n• Retweet the tweet\n\nWait 20 seconds then try again.`
                    )]
                });
            }

            // Give points
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
                        '✅ Verified!',
                        `${details.join('\n')}\n\n**Earned: ${earned} points**\nX: **@${username}**\nTotal: **${total}**`
                    )
                ]
            });

            logger.info(`[VERIFY SUCCESS] ${userId} @${username} +${earned}`);

        } catch (error) {
            logger.error('Verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Try again.')]
            });
        }
    }
};

function extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
}

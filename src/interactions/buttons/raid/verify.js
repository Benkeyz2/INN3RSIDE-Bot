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

            let linkData = await client.db.get(`xlink:${userId}`) || await client.db.get(`guild:${guildId}:xlink:${userId}`);
            if (!linkData || !linkData.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('X Not Linked', 'Please run `/link-x` and authorize first.')]
                });
            }

            const username = linkData.xUsername.toLowerCase().replace('@', '');
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

            let hasReplied = false;
            let hasRetweeted = false;
            let debugMessages = [];

            // ===== METHOD 1: Check user's recent tweets =====
            try {
                const userTweetsRes = await fetch(`${BASE}/twitter/user/last_tweets?userName=${username}&limit=20`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const userTweetsData = await userTweetsRes.json();
                debugMessages.push(`User tweets status: ${userTweetsRes.status}`);

                if (userTweetsData.tweets && Array.isArray(userTweetsData.tweets)) {
                    for (const t of userTweetsData.tweets) {
                        // Check reply
                        if (t.inReplyToStatusId === tweetId || t.conversationId === tweetId || (t.text && t.text.includes(tweetId))) {
                            hasReplied = true;
                        }
                        // Check retweet
                        if (t.retweetedTweet && (t.retweetedTweet.id === tweetId || t.retweeted_status?.id_str === tweetId)) {
                            hasRetweeted = true;
                        }
                        if (t.isRetweet && t.text && t.text.includes(tweetId)) {
                            hasRetweeted = true;
                        }
                    }
                }
            } catch (e) {
                debugMessages.push(`User tweets error: ${e.message}`);
            }

            // ===== METHOD 2: Advanced search for reply =====
            try {
                const replyQuery = `from:${username} conversation_id:${tweetId}`;
                const res = await fetch(`${BASE}/twitter/tweet/advanced_search?query=${encodeURIComponent(replyQuery)}&queryType=Latest`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const data = await res.json();
                debugMessages.push(`Reply search status: ${res.status}`);
                if (data.tweets && data.tweets.length > 0) hasReplied = true;
            } catch (e) {
                debugMessages.push(`Reply search error: ${e.message}`);
            }

            // ===== METHOD 3: Search for retweet =====
            try {
                const rtQuery = `from:${username} retweets_of:${tweetId}`;
                const res = await fetch(`${BASE}/twitter/tweet/advanced_search?query=${encodeURIComponent(rtQuery)}&queryType=Latest`, {
                    headers: { 'x-api-key': API_KEY }
                });
                const data = await res.json();
                debugMessages.push(`Retweet search status: ${res.status}`);
                if (data.tweets && data.tweets.length > 0) hasRetweeted = true;
            } catch (e) {
                debugMessages.push(`Retweet search error: ${e.message}`);
            }

            // Result
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
                        'No Engagement Detected',
                        `Still could not find your Reply or Retweet.\n\n` +
                        `**Debug Info:**\n\`\`\`${debugMessages.join('\n')}\`\`\`\n\n` +
                        `Make sure you used the exact linked account (@${username}) and wait 30-60 seconds after engaging.`
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

import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const API_KEY = process.env.TWITTERAPI_IO_KEY;
const BASE_URL = 'https://api.twitterapi.io';

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
                    embeds: [errorEmbed('Raid Not Found', 'This raid no longer exists.')]
                });
            }

            // Get linked X account
            let linkData = await client.db.get(`xlink:${userId}`) || 
                           await client.db.get(`guild:${guildId}:xlink:${userId}`);

            if (!linkData || !linkData.xUsername) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('X Not Linked', 'Please run `/link-x` first and authorize your account.')]
                });
            }

            const xUsername = linkData.xUsername.toLowerCase();

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
                    embeds: [errorEmbed('Error', 'Invalid tweet URL.')]
                });
            }

            // ========== CHECK WITH TWITTERAPI.IO ==========
            let hasRetweeted = false;
            let hasReplied = false;
            let debug = [];

            // 1. Check if user replied (using advanced search)
            try {
                const replyQuery = `conversation_id:${tweetId} from:${xUsername}`;
                const replyRes = await fetch(
                    `${BASE_URL}/twitter/tweet/advanced_search?query=${encodeURIComponent(replyQuery)}&queryType=Latest`,
                    {
                        headers: { 'x-api-key': API_KEY }
                    }
                );
                const replyData = await replyRes.json();
                debug.push(`Reply check status: ${replyRes.status}`);

                if (replyData.tweets && replyData.tweets.length > 0) {
                    hasReplied = true;
                }
            } catch (e) {
                debug.push(`Reply error: ${e.message}`);
            }

            // 2. Check if user retweeted (search for retweets from user)
            try {
                const rtQuery = `retweets_of_tweet_id:${tweetId} from:${xUsername}`;
                const rtRes = await fetch(
                    `${BASE_URL}/twitter/tweet/advanced_search?query=${encodeURIComponent(rtQuery)}&queryType=Latest`,
                    {
                        headers: { 'x-api-key': API_KEY }
                    }
                );
                const rtData = await rtRes.json();
                debug.push(`Retweet check status: ${rtRes.status}`);

                if (rtData.tweets && rtData.tweets.length > 0) {
                    hasRetweeted = true;
                }
            } catch (e) {
                debug.push(`Retweet error: ${e.message}`);
            }

            // ========== RESULT ==========
            let earned = 0;
            let details = [];

            // We now give points for Reply and Retweet (more reliable)
            if (hasReplied) {
                earned += Number(raid.pointsReply) || 0;
                details.push(`💬 Replied (+${raid.pointsReply})`);
            }
            if (hasRetweeted) {
                earned += Number(raid.pointsLike) || 0; // using like points slot for retweet
                details.push(`🔁 Retweeted (+${raid.pointsLike})`);
            }

            if (earned === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'No Engagement Found',
                        `I could not find your **Reply** or **Retweet** on the tweet.\n\n` +
                        `Please make sure you:\n` +
                        `• Replied to the post\n` +
                        `• Retweeted the post\n\n` +
                        `Wait 20-30 seconds after engaging, then try Verify again.\n\n` +
                        `Debug: \`${debug.join(' | ')}\``
                    )]
                });
            }

            // Success
            await client.db.set(alreadyKey, {
                replied: hasReplied,
                retweeted: hasRetweeted,
                points: earned,
                at: Date.now()
            });

            const pointsKey = `points_${userId}`;
            let total = Number(await client.db.get(pointsKey, 0)) + earned;
            await client.db.set(pointsKey, total);

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
                        `${details.join('\n')}\n\n` +
                        `**Earned: ${earned} points**\n` +
                        `X: **@${xUsername}**\n` +
                        `Total Points: **${total}**`
                    )
                ]
            });

            logger.info(`[twitterapi.io VERIFY] ${userId} @${xUsername} +${earned}pts`);

        } catch (error) {
            logger.error('Verify error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Please try again in 20 seconds.')]
            });
        }
    }
};

function extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
}

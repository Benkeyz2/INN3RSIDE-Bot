import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Start an X/Twitter engagement raid (like Origins Engage)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('tweet_url')
                .setDescription('Full link to the X/Twitter post')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('points_like')
                .setDescription('Points for liking the tweet')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption(opt =>
            opt.setName('points_reply')
                .setDescription('Points for replying to the tweet')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(opt =>
            opt.setName('duration')
                .setDescription('How long the raid lasts (e.g. 1d, 3d, 12h, 6h)')
                .setRequired(true)
        )
        .addRoleOption(opt =>
            opt.setName('reward_role')
                .setDescription('Role to give when they verify (optional)')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('image')
                .setDescription('Optional image URL for the embed (optional)')
                .setRequired(false)
        ),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'This command can only be used in a server.'
            });
        }

        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const tweetUrl = interaction.options.getString('tweet_url');
        const pointsLike = interaction.options.getInteger('points_like');
        const pointsReply = interaction.options.getInteger('points_reply');
        const durationRaw = interaction.options.getString('duration').toLowerCase();
        const rewardRole = interaction.options.getRole('reward_role');
        const customImage = interaction.options.getString('image');

        // Parse duration
        let durationMs = 0;
        const match = durationRaw.match(/^(\d+)(d|h|m)$/);
        if (!match) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Duration must be like `3d`, `12h` or `30m`'
            });
        }

        const amount = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'd') durationMs = amount * 24 * 60 * 60 * 1000;
        if (unit === 'h') durationMs = amount * 60 * 60 * 1000;
        if (unit === 'm') durationMs = amount * 60 * 1000;

        const endsAt = Date.now() + durationMs;
        const raidId = randomUUID();

        // Build the exact Origins-style embed
        const embed = createEmbed({
            author: {
                name: 'inn3rside Engage',
                iconURL: interaction.client.user.displayAvatarURL()
            },
            title: '⚔️ RAID IS LIVE',
            description:
                `**inn3rside just posted — engage to earn points.**\n\n` +
                `1. Link your X once → \`/link-x\`\n` +
                `2. Like / Reply / Retweet the tweet below\n` +
                `3. Points land automatically when the raid closes\n\n` +
                `📄 **The tweet**\n${tweetUrl}`,
            fields: [
                { name: '❤️ Like', value: `${pointsLike} pts`, inline: true },
                { name: '💬 Reply', value: `${pointsReply} pts`, inline: true },
                { name: '⏰ Closes', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                { name: '🎁 Reward role', value: rewardRole ? `${rewardRole}` : 'None', inline: false },
            ],
            image: customImage || 'https://i.imgur.com/8Km9tLL.png', // change later
            footer: {
                text: `Only linked members earn • started by ${interaction.user.username}`
            },
            timestamp: true,
            color: 0x1DA1F2
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Open Tweet')
                .setStyle(ButtonStyle.Link)
                .setURL(tweetUrl)
                .setEmoji('🔗'),
            new ButtonBuilder()
                .setLabel('Like')
                .setStyle(ButtonStyle.Link)
                .setURL(tweetUrl)
                .setEmoji('❤️'),
            new ButtonBuilder()
                .setLabel('Reply')
                .setStyle(ButtonStyle.Link)
                .setURL(tweetUrl)
                .setEmoji('💬')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`raid_verify_${raidId}`)
                .setLabel('Verify my engagement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

        const raidMessage = await interaction.channel.send({
            embeds: [embed],
            components: [row1, row2]
        });

        // Save raid to database
        const raidData = {
            raidId,
            tweetUrl,
            messageId: raidMessage.id,
            channelId: raidMessage.channel.id,
            guildId: interaction.guild.id,
            pointsLike,
            pointsReply,
            endsAt,
            rewardRoleId: rewardRole?.id || null,
            startedBy: interaction.user.id,
            active: true,
            createdAt: Date.now()
        };

        await interaction.client.db.set(`guild:\( {interaction.guild.id}:raids: \){raidId}`, raidData);

        // Also keep a list of active raids
        const activeRaids = await interaction.client.db.get(`guild:${interaction.guild.id}:active_raids`, []);
        activeRaids.push(raidId);
        await interaction.client.db.set(`guild:${interaction.guild.id}:active_raids`, activeRaids);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Raid Started!', `Raid is now live in \( {interaction.channel}.\nIt will close <t: \){Math.floor(endsAt / 1000)}:R>.`)]
        });

        logger.info(`Raid started: ${raidId}`, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            tweetUrl
        });
    }, { type: 'command', commandName: 'raid' })
};

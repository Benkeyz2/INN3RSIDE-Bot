import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { withErrorHandling, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Start an X/Twitter engagement raid')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('tweet_url')
                .setDescription('The full X/Twitter post link')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('points_like')
                .setDescription('Points for Like')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption(option =>
            option.setName('points_reply')
                .setDescription('Points for Reply')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration (example: 1h, 6h, 1d, 3d)')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('reward_role')
                .setDescription('Role to give after verify (optional)')
                .setRequired(false)
        ),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const tweetUrl = interaction.options.getString('tweet_url');
        const pointsLike = interaction.options.getInteger('points_like');
        const pointsReply = interaction.options.getInteger('points_reply');
        const durationRaw = interaction.options.getString('duration').toLowerCase();
        const rewardRole = interaction.options.getRole('reward_role');

        // Duration parser
        const match = durationRaw.match(/^(\d+)(d|h|m)$/);
        if (!match) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Duration must be like `1h`, `6h`, `1d` or `3d`'
            });
        }

        const amount = parseInt(match[1]);
        const unit = match[2];
        let durationMs = 0;

        if (unit === 'd') durationMs = amount * 86400000;
        if (unit === 'h') durationMs = amount * 3600000;
        if (unit === 'm') durationMs = amount * 60000;

        const endsAt = Date.now() + durationMs;
        const raidId = randomUUID();

        const embed = createEmbed({
            author: {
                name: 'inn3rside Engage',
                iconURL: interaction.client.user.displayAvatarURL()
            },
            title: '⚔️ RAID IS LIVE',
            description: `**inn3rside just posted — engage to earn points.**\n\n1. Link your X once → \`/link-x\`\n2. Like / Reply / Retweet the tweet below\n3. Click Verify after you engage\n\n📄 **The tweet**\n${tweetUrl}`,
            fields: [
                { name: '❤️ Like', value: `${pointsLike} pts`, inline: true },
                { name: '💬 Reply', value: `${pointsReply} pts`, inline: true },
                { name: '⏰ Closes', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                { name: '🎁 Reward role', value: rewardRole ? `${rewardRole}` : 'None', inline: false }
            ],
            footer: { text: `Only linked members earn • started by ${interaction.user.username}` },
            timestamp: true,
            color: 0x1DA1F2
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Retweet').setStyle(ButtonStyle.Link).setURL(tweetUrl).setEmoji('🔁'),
            new ButtonBuilder().setLabel('Like').setStyle(ButtonStyle.Link).setURL(tweetUrl).setEmoji('❤️'),
            new ButtonBuilder().setLabel('Reply').setStyle(ButtonStyle.Link).setURL(tweetUrl).setEmoji('💬')
        );

        const row2 = new ActionRowBuilder().addComponents(
            indButtonBuilder().setCustomId(`raid_verify:${raidId}`).setLabel('Verify my engagement').setStyle(ButtonStyle.Success).setEmoji('✅')
        );

        const raidMessage = await interaction.channel.send({
            embeds: [embed],
            components: [row1, row2]
        });

        const raidData = {
            raidId,
            tweetUrl,
            messageId: raidMessage.id,
            channelId: interaction.channel.id,
            guildId: interaction.guild.id,
            pointsLike,
            pointsReply,
            endsAt,
            rewardRoleId: rewardRole?.id || null,
            startedBy: interaction.user.id,
            active: true,
            createdAt: Date.now()
        };

        await interaction.client.db.set(`guild:${interaction.guild.id}:raids:${raidId}`, raidData);
        await interaction.client.db.set(`raids:${raidId}`, raidData);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Raid Started!', `Successfully started the raid!\nCloses: <t:${Math.floor(endsAt / 1000)}:R>`)]
        });

        logger.info(`New raid created: ${raidId}`);
    }, { type: 'command', commandName: 'raid' })
};

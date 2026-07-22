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
        .setDescription('Start an X engagement raid')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('tweet_url').setDescription('Full X post link').setRequired(true))
        .addIntegerOption(opt => opt.setName('points_reply').setDescription('Points for Reply').setRequired(true).setMinValue(1))
        .addIntegerOption(opt => opt.setName('points_retweet').setDescription('Points for Retweet').setRequired(true).setMinValue(1))
        .addStringOption(opt => opt.setName('duration').setDescription('Example: 1h, 6h, 1d, 3d').setRequired(true))
        .addRoleOption(opt => opt.setName('reward_role').setDescription('Role reward (optional)').setRequired(false)),

    category: 'Raids',

    execute: withErrorHandling(async (interaction) => {
        await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

        const tweetUrl = interaction.options.getString('tweet_url');
        const pointsReply = interaction.options.getInteger('points_reply');
        const pointsRetweet = interaction.options.getInteger('points_retweet');
        const durationRaw = interaction.options.getString('duration').toLowerCase();
        const rewardRole = interaction.options.getRole('reward_role');

        const match = durationRaw.match(/^(\d+)(d|h|m)$/);
        if (!match) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Duration must be like `1h`, `6h`, `1d` or `3d`'
            });
        }

        const amount = parseInt(match[1]);
        const unit = match[2];
        let durationMs = unit === 'd' ? amount * 86400000 : unit === 'h' ? amount * 3600000 : amount * 60000;

        const endsAt = Date.now() + durationMs;
        const raidId = randomUUID();

        const embed = createEmbed({
            author: { name: 'inn3rside Engage', iconURL: interaction.client.user.displayAvatarURL() },
            title: '⚔️ RAID IS LIVE',
            description: `**Engage to earn points!**\n\n1. Link your X → \`/link-x\`\n2. **Reply + Retweet** the post\n3. Click **Verify** below\n\n📄 **Tweet:**\n${tweetUrl}`,
            fields: [
                { name: '💬 Reply', value: `${pointsReply} pts`, inline: true },
                { name: '🔁 Retweet', value: `${pointsRetweet} pts`, inline: true },
                { name: '⏰ Ends', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                { name: '🎁 Role Reward', value: rewardRole ? `${rewardRole}` : 'None', inline: false }
            ],
            footer: { text: `Started by ${interaction.user.username}` },
            timestamp: true,
            color: 0x1DA1F2
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Retweet').setStyle(ButtonStyle.Link).setURL(tweetUrl).setEmoji('🔁'),
            new ButtonBuilder().setLabel('Reply').setStyle(ButtonStyle.Link).setURL(tweetUrl).setEmoji('💬')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`raid_verify:${raidId}`)
                .setLabel('Verify my engagement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

        const msg = await interaction.channel.send({ embeds: [embed], components: [row1, row2] });

        const raidData = {
            raidId,
            tweetUrl,
            messageId: msg.id,
            channelId: msg.channel.id,
            guildId: interaction.guild.id,
            pointsReply,
            pointsRetweet,
            endsAt,
            rewardRoleId: rewardRole?.id || null,
            active: true,
            createdAt: Date.now()
        };

        await interaction.client.db.set(`raids:${raidId}`, raidData);
        await interaction.client.db.set(`guild:${interaction.guild.id}:raids:${raidId}`, raidData);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Raid Started!', `Raid is now live!\nEnds: <t:${Math.floor(endsAt / 1000)}:R>`)]
        });

        logger.info(`Raid started: ${raidId}`);
    }, { type: 'command', commandName: 'raid' })
};

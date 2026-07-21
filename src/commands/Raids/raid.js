const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Retweet')                    // ← changed name
                .setStyle(ButtonStyle.Link)
                .setURL(tweetUrl)
                .setEmoji('🔁'),
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
                .setCustomId(`raid_verify:${raidId}`)   // ← IMPORTANT: now uses :
                .setLabel('Verify my engagement')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

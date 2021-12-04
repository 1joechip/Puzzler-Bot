// Made by 1joechip
// Polls reddit every 1 minute in a give subreddit for posts from select users
// Sends an alert in the discord that they posted 
// Admins can select to approve the post, (in my case that it was a puzzle)
// or remove it, if the post was not a puzzle

const { Client, Intents, MessageEmbed } = require('discord.js');
var fs = require('fs');
const config = require("./config");
let Parser = require('rss-parser');

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });
const SUB = "banano";
const announcementChannelID = "916442623265374298";
const SUB_URL = 'https://www.reddit.com/r/' + SUB + '/new.rss';
const TOKEN = config.token;
const PUZZLE_ADMINS = config.admins;
let parser = new Parser();

var recents = require("./recents");
var watching = require("./watching");

//console.log(watching);
//console.log(recents);
let announcementChannel;
client.once("ready", () => {
	console.log("Ready!");
	client.user.setActivity("for puzzles...", { type: "WATCHING" });

        // ID of my channel
        announcementChannel = client.channels.cache.get(announcementChannelID);
        startPolling();
});

client.on("messageCreate", async message => {
        if(message.author.bot) return;
        if(message.content === ".watching") {
                await message.reply({ embeds: [getWatching()] });
        }
        else if(message.content.startsWith(".watch ")) {
                const params = message.content.split(" ");
                if (params.length != 2) {
                        await message.reply("Format incorrect. Format: .watch [username]");
                } else {
                        let user = params[1];
                        await addWatch(user, message.author.username);
                        await message.reply("Successfully started watching for posts from u/" + user);
                }
        } else if(message.content.startsWith(".unwatch ")) {
                const params = message.content.split(" ");
                if (params.length != 2) {
                        await message.reply("Format incorrect. Format: .unwatch [username]");
                } else {
                        let user = params[1];
                        await unWatch(user.toLowerCase());
                        await message.reply("No longer watching for posts from u/" + user);
                }
        }
});

async function getFeed() {
        let feed = await parser.parseURL(SUB_URL);
        return feed;
}

function getWatching() {
        let embed = new MessageEmbed().setColor('#0099ff');
        embed.setTitle("Users I am watching for posts from");
        if (watching.length) {
                fields = [];
                for (const watcher of watching) {
                        fields.push({name: watcher.username.slice(1), value: "Added by: " + watcher.addedBy});
                }
                embed.addFields(fields);
        } else {
                embed.setDescription("Nothing to see here... I am not watching for posts from any users. \
                Try adding users for me to watch with .watch [username]");
        }
        return embed;
}

async function saveWatching() {
        fs.writeFile("watching.json", JSON.stringify(watching), function(err) {
                if (err) {
                        console.log(err);
                }
            });
}

async function saveRecents() {
        fs.writeFile("recents.json", JSON.stringify(recents), function(err) {
                if (err) {
                        console.log(err);
                }
        });
}

async function addWatch(username, by) {
        let newWatcher = {};
        let newUser = "/u/" + username;
        newWatcher.username = newUser;
        newWatcher.addedBy = by;
        watching.push(newWatcher);
        await saveWatching();
}
 
async function unWatch(username) {
        let inList = false;
        for (watcher of watching) {
                if (watcher.username.toLowerCase() === "/u/"+username) {
                        inList = true;
                }
        }
        if (inList) {
                watching = watching.filter(function(watcher) { return watcher.username.toLowerCase() != "/u/"+username; }); 
                await saveWatching();
        }
}

async function checkRecents(compare=false) {
        let tempRecents = [];
        let feed = await getFeed();
        for (const item of feed.items) {
                tempRecents.push(item.id);
        }
        if (compare) {
                if(!recents.includes(tempRecents[0])) {
                        let i = 1;
                        while (!recents.includes(tempRecents[i]) && i != tempRecents.length-1) {
                                i++;
                        }
                        let newPosts = []
                        for (let j = 0; j < i; j++) {
                                newPosts.push(feed.items[j]);
                        }
                        for (post of newPosts) {
                                for (watcher of watching) {
                                        if(post.author.toLowerCase() === watcher.username.toLowerCase()) {
                                                alertPost(post);
                                                console.log("Found new post from " + post.author);
                                        }
                                }
                        } 
                        recents = tempRecents;
                        await saveRecents();
                        return true;
                } else {
                        console.log("No new posts");
                        return false;
                }
        } else {
                recents = tempRecents;
                await saveRecents();
        }
}

async function alertPost(post) {
        let content = post.contentSnippet.split("\n");
        content = content.slice(0, content.length-1);
        content = content.join("\n");

        let embed = new MessageEmbed().setColor('#0099ff')
        .setTitle(post.title)
        .setAuthor("Posted by " + post.author.slice(1))
        .setURL(post.link)
        .addField('Content preview', content)
        .setTimestamp()
        .setFooter("Click the title to be taken to the post. Good luck!");
        let message = await announcementChannel.send({ embeds: [embed] });
        let ping = await announcementChannel.send("<@&916447522824794125>");
        ping.delete();
        await message.react("✅");
        await message.react("❌");

        const filter = (reaction, user) => {
                return !user.bot && ["✅", "❌"].includes(reaction.emoji.name) && PUZZLE_ADMINS.includes(user.id);
        }

        message.awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] })
	.then(collected => {
		const reaction = collected.first();

		if (reaction.emoji.name === '❌') {
                        message.delete();
		} else {
                        message.reactions.removeAll();
		}
	})
	.catch(collected => {
                message.reactions.removeAll();
	});
}

async function startPolling() {
        setInterval(async function(){ await checkRecents(true); }, 30000);
}

client.login(TOKEN);
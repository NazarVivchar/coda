const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const yts = require("yt-search");

const config = require('../configs/config.json');


const {
    prefix,
    token,
} = config.bot || {};

const client = new Discord.Client();
const queue = new Map();

client.login(token);

client.once('ready', () => {
    console.log('Ready!');
});
client.once('reconnecting', () => {
    console.warn('Reconnecting!');
});
client.once('disconnect', () => {
    console.error('Disconnect!');
});

client.on('message', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    await processMessage(message);
});


async function processMessage(message) {
    const authorHasAForbiddenRole = checkMemberHasAtLeastOneOfRoles(message, ['Fucking slaves']);

    if (authorHasAForbiddenRole) {
        await message.channel.send("You are a bad **slave**. Your **master** is ***very*** unhappy 🔪");

        return kickMember(message);
    }

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith(`${prefix}play`)) {
        try {
            return await execute(message, serverQueue);
        } catch (e) {
            console.error(e);
            return message.channel.send("A nasty error has occur. Tell my father **SirStrash** about it");
        }
    }

    if (message.content.startsWith(`${prefix}skip`)) {
        return skip(message, serverQueue);
    }

    if (message.content.startsWith(`${prefix}stop`)) {
        return stop(message, serverQueue);
    }

    if (message.content.startsWith(`${prefix}queue`)) {
        return writeQueue(message, serverQueue);
    }

    return message.channel.send("Sorry, I couldn't understand your command 😥");
}

async function execute(message, serverQueue) {
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel)
        return message.channel.send(
            "You need to be in a voice channel to play music!"
        );

    const permissions = voiceChannel.permissionsFor(message.client.user);

    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need the permissions to join and speak in your voice channel"
        );
    }

    const messageParts = message.content.split(" ");
    const potentialUrl = messageParts[1];

    let song;

    if (isYouTubeUrl(potentialUrl)) {
        const songInfo = await ytdl.getInfo(potentialUrl);

        const {videoDetails} = songInfo;
        song = {
            title: videoDetails.title,
            url: videoDetails.video_url
        };
    } else {
        const fullSongName = messageParts.slice(1).join(" ");
        const {videos} = await yts(fullSongName);
        if (!videos.length) {
            return message.channel.send(`No songs matching "${fullSongName}" were found`);
        }
        song = {
            title: videos[0].title,
            url: videos[0].url
        };
    }

    if (!serverQueue) {
        const queueContract = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: false
        };

        queue.set(message.guild.id, queueContract);

        queueContract.songs.push(song);

        await writeMessageAfterAddedToQueue(message, song, queueContract.songs);

        try {
            queueContract.connection = await voiceChannel.join();
            play(message.guild, queueContract);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }

        return;
    }

    serverQueue.songs.push(song);

    return writeMessageAfterAddedToQueue(message, song, serverQueue.songs);
}

async function skip(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music"
        );
    if (!serverQueue?.songs)
        return message.channel.send("There is no song that I could skip");

    await message.channel.send(`Skipping **${serverQueue.songs[0].title}**`);

    serverQueue.connection.dispatcher.end();
}

async function stop(message, serverQueue) {
    if (!message.member.voice.channel)
        return message.channel.send(
            "You have to be in a voice channel to stop the music"
        );

    if (!serverQueue)
        return message.channel.send("There is no song that I could stop");

    await message.channel.send(`Stopping. Bye 👋`);

    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}

async function writeQueue(message, serverQueue) {
    if (!serverQueue?.songs) {
        return message.channel.send("Nothing is playing at the moment");
    }

    const {songs} = serverQueue;

    let textToSend = 'Of course, my lord. Here is current queue:';

    for (let i = 0; i < songs.length; ++i) {
        textToSend = `${textToSend}\n\t${i + 1}) **${songs[i].title}**`;

        if (i === 0) {
            textToSend = `${textToSend} _(currently playing)_`;
        }
    }

    return message.channel.send(textToSend);
}

function play(guild, queueContract) {
    const song = queueContract.songs[0];
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url,), {bitrate: 96000,})
        .on("start", () => queueContract.playing = true)
        .on("finish", () => {
            serverQueue.songs.shift();
            queueContract.playing = false;
            play(guild, serverQueue);
        })
        .on("error", error => {
                queueContract.playing = false;
                console.error(error)
            }
        );
    dispatcher.setVolumeLogarithmic(1);
    serverQueue.textChannel.send(`🎵 Now playing: **${song.title}**. Enjoy `);
}

function isYouTubeUrl(url) {
    return url && ytdl.validateURL(url);
}

function checkMemberHasAtLeastOneOfRoles(message, rolesToCheck = []) {
    const {member} = message;
    const memberRoles = member.roles.cache;

    if (!rolesToCheck.length) {
        return false;
    }

    return memberRoles.some(role => rolesToCheck.includes(role.name));
}

async function kickMember(message) {
    return message.member.voice.setChannel(null)
}

async function writeMessageAfterAddedToQueue(message, song, songs) {
    if (songs.length > 1) {
        const whenWillBePlayed = songs.length === 2 ? "currently playing song" : `${songs.length - 1} songs in the queue`;
        await message.channel.send(`Yes my lord. **${song.title}** will be played after ${whenWillBePlayed}`);
    }
}


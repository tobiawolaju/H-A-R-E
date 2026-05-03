const config = require('../config');
const { log, core } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

class Heartbeat {
  constructor() {
    this.interval = null;
    this.playlistIndex = 0;
  }

  start(gateways) {
    log('Heartbeat started');
    this.interval = setInterval(() => {
      this.pulse(gateways);
    }, config.HEARTBEAT_INTERVAL);

    // Initial pulse
    this.pulse(gateways);
  }

  async pulse(gateways) {
    core('Heartbeat pulse...');
    
    // Update Spotify Status if Gateway supports it
    const discord = gateways.find(g => g.name === 'discord');
    if (discord && discord.client?.isReady()) {
      await this.updateSpotify(discord);
    }
  }

  async updateSpotify(discordGateway) {
    try {
      const playlistFile = await fs.readJson(path.resolve(config.SPOTIFY_PLAYLIST_PATH));
      const playlist = playlistFile.playlist;
      
      if (playlist && playlist.length > 0) {
        const pick = playlist[this.playlistIndex % playlist.length];
        this.playlistIndex++;
        
        const { SpotifyRPC } = require('discord.js-selfbot-v13');
        const spotify = new SpotifyRPC(discordGateway.client)
          .setAssetsLargeText(pick.albumName || 'Album')
          .setState(pick.artistName || 'Unknown Artist')
          .setDetails(pick.songTitle || 'Unknown Track');

        const startMs = Date.now();
        spotify.setStartTimestamp(startMs);
        if (pick.durationMs) {
          spotify.setEndTimestamp(startMs + pick.durationMs);
        }

        // Helper for Discord Spotify integration
        const extractTrackId = (url) => url?.includes('track/') ? url.split('track/')[1].split('?')[0] : url;
        const extractImageHash = (url) => {
            if (url?.includes('image/')) return 'spotify:' + url.split('image/')[1].split('?')[0];
            if (url?.startsWith('spotify:')) return url;
            return null;
        };

        const trackId = extractTrackId(pick.spotifyTrackUrl);
        const imageHash = extractImageHash(pick.albumCoverUrl);
        
        if (trackId) spotify.setSongId(trackId);
        if (imageHash) spotify.setAssetsLargeImage(imageHash);

        discordGateway.client.user.setActivity(spotify);
        log(`Updated Spotify status: ${pick.songTitle}`);
      }
    } catch (err) {
      log(`Spotify update skipped: ${err.message}`);
    }
  }

  stop() {
    clearInterval(this.interval);
    log('Heartbeat stopped');
  }
}

module.exports = new Heartbeat();

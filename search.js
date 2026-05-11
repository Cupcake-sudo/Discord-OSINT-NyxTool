const constants = require('./constants');
const { HAS_FILTERS, PAGE_SIZE, SEARCH_DELAY_MIN_MS, SEARCH_DELAY_MAX_MS } = constants;

function randomDelay() {
  return Math.floor(Math.random() * (SEARCH_DELAY_MAX_MS - SEARCH_DELAY_MIN_MS + 1)) + SEARCH_DELAY_MIN_MS;
}

function sleepWithCounter(label) {
  const total = randomDelay();
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const remaining = Math.max(0, (total - (Date.now() - start)) / 1000).toFixed(1);
      statusSet(label + '  ' + remaining + 's');
      if (Date.now() - start >= total) {
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
}

const { statusSet, statusLog, delay } = require('./terminal');
const { discordAPI } = require('./api');
const { downloadFile } = require('./fileHandler');
const { stripEmoji, formatUserTag, extractUsernameFromMessage, extractFileUrls, countFileTypes, fileTypeSummaryStr } = require('./utils');

function setCatMood(mood) { require('./terminal').setCatMood(mood); }

async function searchGuildForMentions(guildId, guildName, onTargetResolved, onProgress) {
  let targetResolved = false;
  const collected    = [];
  const channelMap   = {};
  let offset         = 0;
  let total          = null;
  let page           = 0;
  let maxId          = null;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'ears up, scanning every ping... [' + collected.length + ' found]'
      : 'perking ears... sniffing for mentions...'
    );

    let url = '/guilds/' + guildId + '/messages/search' +
      '?mentions=' + constants.TARGET_USER_ID +
      '&sort_by=timestamp&sort_order=desc' +
      '&offset=' + offset + '&limit=' + PAGE_SIZE;
    if (maxId) url += '&max_id=' + maxId;

    const data = await discordAPI(url);

    if (!data || data.code) {
      const detail = data && data.errors ? '  →  ' + JSON.stringify(data.errors) : '';
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error') + detail);
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    for (const ch of (Array.isArray(data.channels) ? data.channels : Object.values(data.channels || {}))) {
      if (ch && ch.id) channelMap[ch.id] = ch;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);
    let pageOldestId = null;

    for (const msg of messages) {
      if (!pageOldestId || BigInt(msg.id) < BigInt(pageOldestId)) pageOldestId = msg.id;

      const senderTag      = formatUserTag(msg.author);
      const rawMentions    = (msg.mentions || []).filter((u) => u.id === constants.TARGET_USER_ID);
      if (!targetResolved && rawMentions.length > 0) {
        const tag = formatUserTag(rawMentions[0]);
        if (tag) { await onTargetResolved(tag); targetResolved = true; }
      }
      const mentionedUsers = rawMentions.map((u) => ({ id: u.id, tag: formatUserTag(u), avatar: u.avatar || null }));

      const channelObj = (msg.channel && msg.channel.name) ? msg.channel : (channelMap[msg.channel_id] || null);
      collected.push({
        messageId:           msg.id,
        channelId:           msg.channel_id,
        channelName:         stripEmoji(channelObj ? channelObj.name : null),
        guildId,
        guildName:           stripEmoji(guildName),
        senderId:            msg.author && msg.author.id ? msg.author.id : null,
        senderTag,
        senderAvatar:        msg.author && msg.author.avatar ? msg.author.avatar : null,
        senderDiscriminator: msg.author ? (msg.author.discriminator || null) : null,
        timestamp:           msg.timestamp,
        content:             msg.content,
        mentionedUsers,
      });
    }

    offset += messages.length;
    page++;
    if (onProgress) onProgress(collected.length);

    if (messages.length === 0) break;

    if (offset >= 9975 && pageOldestId) {
      statusLog('  ↻  10k chunk — anchoring past limit...');
      maxId  = (BigInt(pageOldestId) - 1n).toString();
      offset = 0;
      total  = null;
      continue;
    }

    if (offset >= total) break;

    if (page % 2 === 0) {
      setCatMood('sleepy');
      await sleepWithCounter('napping... [' + collected.length + ' found]');
      setCatMood('hunting');
    }
  }

  return collected;
}

async function searchGuildForFiles(guildId, guildName, filesDir, onFirstAuthor, onProgress) {
  const collected = [];
  const seenIds   = new Set();
  let authorSent  = false;
  const hasParams = HAS_FILTERS.map((f) => 'has=' + f).join('&');
  let offset      = 0;
  let total       = null;
  let page        = 0;
  let maxId       = null;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'dragging files back to the den... [' + collected.length + ' found]'
      : 'nose to the ground, sniffing for files...'
    );

    let url = '/guilds/' + guildId + '/messages/search' +
      '?author_id=' + constants.TARGET_USER_ID +
      '&' + hasParams +
      '&sort_by=timestamp&sort_order=desc' +
      '&offset=' + offset + '&limit=' + PAGE_SIZE;
    if (maxId) url += '&max_id=' + maxId;

    const data = await discordAPI(url);

    if (!data || data.code) {
      const detail = data && data.errors ? '  →  ' + JSON.stringify(data.errors) : '';
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error') + detail);
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);
    let pageOldestId = null;

    for (const msg of messages) {
      if (seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);

      if (!pageOldestId || BigInt(msg.id) < BigInt(pageOldestId)) pageOldestId = msg.id;

      if (!authorSent && msg.author && msg.author.id === constants.TARGET_USER_ID) {
        const name = extractUsernameFromMessage(msg);
        if (name) { await onFirstAuthor(name); authorSent = true; }
      }

      const fileUrls   = extractFileUrls(msg);
      const localFiles = [];

      if (fileUrls.length > 0) {
        setCatMood('eating');
        statusSet('chomping through ' + fileUrls.length + ' file(s)...');
        for (const f of fileUrls) {
          const messageContext = {
            guildId: guildId,
            channelId: msg.channel_id,
            messageId: msg.id
          };
          const localPath = await downloadFile(f.url, filesDir, messageContext);
          if (localPath) {
            localFiles.push({
              localPath,
              type: f.type,
              originalUrl: f.url,
              guildId: guildId,
              channelId: msg.channel_id,
              messageId: msg.id
            });
          }
        }
        setCatMood('hunting');
      }

      collected.push({
        messageId:    msg.id,
        timestamp:    msg.timestamp,
        guildId:      guildId,
        channelId:    msg.channel_id,
        authorId:     msg.author && msg.author.id ? msg.author.id : null,
        authorTag:    extractUsernameFromMessage(msg),
        authorAvatar: msg.author && msg.author.avatar ? msg.author.avatar : null,
        files:        localFiles,
      });
    }

    offset += messages.length;
    page++;
    const totalFiles = collected.reduce((n, m) => n + m.files.length, 0);
    if (onProgress) {
      const allFiles = collected.flatMap((m) => m.files || []);
      const meta     = allFiles.length > 0 ? fileTypeSummaryStr(countFileTypes(allFiles)) : '';
      onProgress(totalFiles, meta);
    }

    if (messages.length === 0) break;

    if (offset >= 9975 && pageOldestId) {
      statusLog('  ↻  10k chunk — anchoring past limit...');
      maxId  = (BigInt(pageOldestId) - 1n).toString();
      offset = 0;
      total  = null;
      continue;
    }

    if (offset >= total) break;

    if (page % 2 === 0) {
      setCatMood('sleepy');
      await sleepWithCounter('tiny nap... [' + collected.length + ' found]');
      setCatMood('hunting');
    }
  }

  return collected;
}

async function searchGuildForUser(guildId, guildName, filesDir, onFirstAuthor, onProgress) {
  const collected = [];
  let offset      = 0;
  let total       = null;
  let authorSent  = false;
  let page        = 0;
  let maxId       = null;

  setCatMood('hunting');

  while (true) {
    statusSet(total !== null
      ? 'sifting through messages... [' + collected.length + ' found]'
      : 'ears perked, picking up the scent...'
    );

    let url = '/guilds/' + guildId + '/messages/search?author_id=' + constants.TARGET_USER_ID +
      '&offset=' + offset + '&limit=' + PAGE_SIZE;
    if (maxId) url += '&max_id=' + maxId;

    const data = await discordAPI(url);

    if (!data || data.code) {
      const detail = data && data.errors ? '  →  ' + JSON.stringify(data.errors) : '';
      statusLog('  ✗  no search access: ' + (data && data.message ? data.message : 'unknown error') + detail);
      break;
    }

    if (total === null) {
      total = data.total_results || 0;
      if (total === 0) break;
    }

    const messages = (data.messages || []).map((g) => g[0]).filter(Boolean);
    let pageOldestId = null;

    for (const msg of messages) {
      if (!pageOldestId || BigInt(msg.id) < BigInt(pageOldestId)) pageOldestId = msg.id;

      if (!authorSent && msg.author && msg.author.id === constants.TARGET_USER_ID) {
        const name = extractUsernameFromMessage(msg);
        if (name) { await onFirstAuthor(name); authorSent = true; }
      }

      const fileUrls   = extractFileUrls(msg);
      const localFiles = [];

      if (constants.DOWNLOAD_FILES && fileUrls.length > 0) {
        setCatMood('eating');
        statusSet('nomming ' + fileUrls.length + ' file(s)...');
        for (const f of fileUrls) {
          const messageContext = {
            guildId: guildId,
            channelId: msg.channel_id,
            messageId: msg.id
          };
          const localPath = await downloadFile(f.url, filesDir, messageContext);
          if (localPath) {
            localFiles.push({
              localPath,
              type: f.type,
              originalUrl: f.url,
              guildId: guildId,
              channelId: msg.channel_id,
              messageId: msg.id
            });
          }
        }
        setCatMood('hunting');
      }

      if (constants.SAVE_MESSAGES) {
        collected.push({
          messageId:    msg.id,
          channelId:    msg.channel_id,
          channelName:  stripEmoji(msg.channel && msg.channel.name ? msg.channel.name : null),
          guildId,
          guildName:    stripEmoji(guildName),
          authorId:     msg.author && msg.author.id ? msg.author.id : null,
          authorTag:    extractUsernameFromMessage(msg),
          authorAvatar: msg.author && msg.author.avatar ? msg.author.avatar : null,
          timestamp:    msg.timestamp,
          content:      msg.content,
          attachments:  (msg.attachments || []).map((a) => a.url),
          embeds:       msg.embeds || [],
          files:        localFiles,
          type:         msg.type,
        });
      } else if (localFiles.length > 0) {
        collected.push({
          messageId:    msg.id,
          timestamp:    msg.timestamp,
          guildId:      guildId,
          channelId:    msg.channel_id,
          authorId:     msg.author && msg.author.id ? msg.author.id : null,
          authorAvatar: msg.author && msg.author.avatar ? msg.author.avatar : null,
          files:        localFiles,
        });
      }
    }

    offset += messages.length;
    page++;
    if (onProgress) {
      const allFiles = collected.flatMap((m) => m.files || []);
      const meta     = allFiles.length > 0 ? fileTypeSummaryStr(countFileTypes(allFiles)) : '';
      onProgress(collected.length, meta);
    }

    if (messages.length === 0) break;

    if (offset >= 9975 && pageOldestId) {
      statusLog('  ↻  10k chunk — anchoring past limit...');
      maxId  = (BigInt(pageOldestId) - 1n).toString();
      offset = 0;
      total  = null;
      continue;
    }

    if (offset >= total) break;

    if (page % 2 === 0) {
      setCatMood('sleepy');
      await sleepWithCounter('curling up briefly... [' + collected.length + ' found]');
      setCatMood('hunting');
    }
  }

  return collected;
}

module.exports = { searchGuildForMentions, searchGuildForFiles, searchGuildForUser };

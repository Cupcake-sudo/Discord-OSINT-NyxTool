
const fetch = require('node-fetch');
const { RATE_LIMIT_WAIT_MS } = require('./constants');
const { statusLog, serverSubSet, serverSubClear, delay } = require('./terminal');

let DISCORD_TOKEN = '';

function setToken(token) {
  DISCORD_TOKEN = token;
}

function getToken() {
  return DISCORD_TOKEN;
}

const PLATFORM_LABELS = {
  steam: 'Steam', github: 'GitHub', twitter: 'Twitter', twitch: 'Twitch',
  youtube: 'YouTube', spotify: 'Spotify', reddit: 'Reddit', xbox: 'Xbox',
  playstation: 'PlayStation', battlenet: 'Battle.net', epicgames: 'Epic Games',
  leagueoflegends: 'League', tiktok: 'TikTok', roblox: 'Roblox',
  domain: 'Domain', ebay: 'eBay', paypal: 'PayPal', instagram: 'Instagram',
};

async function discordAPI(apiPath) {
  const token = DISCORD_TOKEN.replace(/^"|"$/g, '');
  let res;
  try {
    res = await fetch('https://discord.com/api/v9' + apiPath, {
      headers: { Authorization: token },
    });
  } catch (err) {
    statusLog('  ✗  network error on ' + apiPath + ' — ' + err.message);
    return { code: -1, message: err.message };
  }

  if (res.status === 429) {
    const { setCatMood } = require('./terminal');

    const waitMs = RATE_LIMIT_WAIT_MS;
    const total  = waitMs / 1000;
    const start  = Date.now();

    setCatMood('sad');

    const rlIv = setInterval(() => {
      const elapsed   = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, total - elapsed);
      serverSubSet('⟳  rate limited — resuming in ' + remaining + 's');
    }, 500);

    await delay(waitMs);
    clearInterval(rlIv);
    setCatMood('hunting');
    serverSubClear();
    return discordAPI(apiPath);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await res.text();
    statusLog('  ✗  unexpected response (HTTP ' + res.status + ') — skipping this request');
    statusLog('     hint: ' + body.slice(0, 120).replace(/[\r\n]+/g, ' ').trim() + '...');
    return { code: res.status, message: 'non-JSON response (HTTP ' + res.status + ')' };
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    statusLog('  ✗  JSON parse failed for ' + apiPath + ' — skipping');
    return { code: -1, message: 'JSON parse error: ' + err.message };
  }

  return json;
}

async function tryResolveFromAPI(userId) {
  try {
    const user = await discordAPI('/users/' + userId);
    if (user && user.username && !user.code) {
      return user.discriminator && user.discriminator !== '0'
        ? user.username + '#' + user.discriminator
        : user.username;
    }
  } catch {}
  return null;
}

async function silentGet(path) {
  try {
    const token = DISCORD_TOKEN.replace(/^"|"$/g, '');
    const res   = await fetch('https://discord.com/api/v9' + path, {
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveProfile(userId) {
  const data = await silentGet(
    '/users/' + userId + '/profile?with_mutual_guilds=true&with_mutual_friends_count=true&with_mutual_friends=true'
  );

  if (data && data.user) {
    const u  = data.user;
    const up = data.user_profile || {};
    const tag = u.discriminator && u.discriminator !== '0'
      ? u.username + '#' + u.discriminator
      : u.username;
    return {
      id:                 u.id,
      tag,
      displayName:        u.global_name || null,
      username:           u.username,
      avatar:             u.avatar || null,
      banner:             u.banner || null,
      bio:                up.bio || null,
      pronouns:           up.pronouns || null,
      badges:             (data.badges || []).map(b => b.id).filter(Boolean),
      connectedAccounts:  (data.connected_accounts || []).map(a => ({
        type:    a.type,
        label:   PLATFORM_LABELS[a.type] || a.type,
        name:    a.name,
        id:      a.id || null,
        verified: !!a.verified,
      })),
      premiumSince:       data.premium_since || null,
      premiumGuildSince:  data.premium_guild_since || null,
      premiumType:        data.premium_type ?? u.premium_type ?? null,
      mutualFriendsCount: data.mutual_friends_count ?? (data.mutual_friends ? data.mutual_friends.length : null),
      mutualGuilds:       data.mutual_guilds || [],
      legacyUsername:     data.legacy_username || null,
    };
  }

  // fallback: basic user endpoint, also silent
  const u = await silentGet('/users/' + userId);
  if (u && u.username) {
    const tag = u.discriminator && u.discriminator !== '0'
      ? u.username + '#' + u.discriminator
      : u.username;
    return {
      id: u.id, tag,
      displayName: u.global_name || null, username: u.username,
      avatar: u.avatar || null, banner: u.banner || null,
      bio: null, pronouns: null, badges: [], connectedAccounts: [],
      premiumSince: null, premiumGuildSince: null, premiumType: null,
      mutualFriendsCount: null, mutualGuilds: [], legacyUsername: null,
    };
  }

  return null;
}

module.exports = { discordAPI, tryResolveFromAPI, resolveProfile, setToken, getToken };
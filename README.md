# Discord OSINT — Nyx

**By Cupcake**

![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen) ![License](https://img.shields.io/github/license/Cupcake-sudo/Discord-OSINT) ![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

A terminal-based OSINT tool that sweeps your shared Discord servers for messages, files, and mentions tied to a target user ID. Guided by a cat named Nyx.

> ⚠️ **Disclaimer:** Only use this on accounts you own or have explicit permission to investigate. Use responsibly and in accordance with Discord's Terms of Service.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Modes](#modes)
- [Viewer](#viewer)
- [Output](#output)
- [Notes](#notes)

---

## Requirements

- [Node.js](https://nodejs.org) v16 or higher

```bash
node -v
```

---

## Installation

```bash
npm install
```

Optionally create a `.env` file to skip the token prompt on every run:

```
Token=your_discord_token_here
```

---

## Usage

```bash
node index.js
```

Everything is interactive. You will be walked through:

1. **Token** — paste your Discord user token (skipped if `.env` is set)
2. **Target ID** — the user ID to investigate
3. **Server selection** — pick specific servers by number (`1,2,3`) or press Enter to scan all
4. **Mode** — choose what to collect
5. **Heatmap** — optional activity breakdown by hour
6. **Browser viewer** — open results in a local web UI when done

> **Finding a user ID:** Enable Developer Mode in Discord settings → right-click any username → **Copy User ID**.

---

## Modes

| # | Mode | Description |
|---|------|-------------|
| 1 | **Messages** | Every message the target sent across selected servers |
| 2 | **Files** | Only messages with attachments — images, videos, documents |
| 3 | **Mentions** | Every message where the target was pinged, ranked by who sends them most |
| 4 | **All** | Messages + files + mentions in one pass |

### Messages

Good starting point. Text only, fast, easy to read through.

### Files

Files shared on Discord rarely have metadata stripped — what you download is often straight from the device. Output is focused and clean.

### Mentions

Builds a ranked list of who interacts with the target the most. A solid pivot point for mapping connections and deciding who to look into next.

### All

Runs everything in one pass. Mentions are collected alongside messages so you get the full picture without running separate scans. Takes longer depending on activity level.

---

## Heatmap

Available with **Messages** and **All** modes. Shows the top 5 most active 1-hour windows in your local timezone, plus a full 24-hour breakdown saved to `heatmap.txt`. Useful for profiling habits and daily schedule.

Times are displayed in AM/PM format.

---

## Viewer

When a scan completes, you can open results in a local browser. The viewer includes:

- **Filter bar** — filter by All / Messages / Files / Mentions
- **File type filters** — images, videos, audio, other
- **OSINT Intel** — six automatic detection categories that scan message content and highlight matched phrases:
  - `location` — cities, countries, addresses, travel
  - `economics` — salary, job, money, investments
  - `identity` — name, birthday, email, phone, accounts
  - `social` — relationships, family, social media handles
  - `activities` — gym, gaming, school, daily routines
  - `technical` — hardware, OS, IP, hosting, shell

  Each matched message shows colored category badges. Clicking a badge or the filter button highlights the specific terms that triggered it.

- **Ranked Mentioners sidebar** — click any user to filter the mentions feed to only their messages
- **Jump links** — open the original message in Discord

### Re-open saved results

```bash
node index.js --view
```

Picks up any output folder automatically. Pass a folder name to open a specific one:

```bash
node index.js --view Everything_username
```

### Browse a raw file folder

If a scan was interrupted before writing JSON (e.g. a `_tmp_` folder), the viewer falls back to a file browser:

```bash
node index.js --view _tmp_123456789
```

Shows images, videos, and audio in a paginated grid with type filters.

---

## Output

Results are saved to a folder named after the mode and username:

```
Messages_username/
Files_username/
Mentions_username/
Everything_username/
```

| File | Contents |
|------|----------|
| `messages.json` | Full message data |
| `messages.txt` | Human-readable report |
| `mentions.json` | Mention data with ranked senders |
| `mentions.txt` | Human-readable mention report |
| `heatmap.txt` | Hourly activity breakdown |
| `files/` | Downloaded attachments |

---

## Notes

- Rate limits are handled automatically — the tool will wait and resume without losing progress.
- The token prompt hides input. Paste and press Enter.
- Server selection lets you narrow a scan to one or a few servers, which is faster and useful for targeted investigations.
- The OSINT wordlists live in `wordlists.js` and can be edited to add or remove detection terms.

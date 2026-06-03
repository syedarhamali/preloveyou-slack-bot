# preloveyou Standup Bot

A Slack bot that DMs each team member 3 weekly check-in questions every Friday at 4 PM, then posts a digest summary (with blockers highlighted) to a shared channel.

---

## How it works

1. **Friday 4 PM** — bot DMs each team member:
   - What did you work on this week?
   - What are you planning to work on next week?
   - Any blockers or anything you need help with?
2. Members reply to each question in the DM.
3. After 60 minutes, the bot posts a formatted summary to your chosen channel, with a dedicated **Blockers** section if any were reported.
4. You can also trigger a check-in manually at any time with `/standup`.

---

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name it `preloveyou Standup Bot`, pick your workspace.

### 2. Enable Socket Mode

- Go to **Socket Mode** in the sidebar → enable it.
- Generate an **App-Level Token** with scope `connections:write`. Copy it — this is your `SLACK_APP_TOKEN`.

### 3. Add Bot Scopes

Under **OAuth & Permissions → Scopes → Bot Token Scopes**, add:

| Scope | Purpose |
|---|---|
| `chat:write` | Post messages |
| `im:write` | Open DMs |
| `im:read` | Read DM channel IDs |
| `users:read` | Look up user info |
| `channels:read` | List channel members |
| `groups:read` | List private channel members |
| `commands` | Register slash commands |

### 4. Enable Events

- Go to **Event Subscriptions** → enable events.
- Under **Subscribe to bot events**, add: `message.im`

### 5. Register the Slash Command

- Go to **Slash Commands** → **Create New Command**.
- Command: `/standup`
- Description: `Trigger the weekly check-in manually`
- Request URL: leave as-is (Socket Mode handles it)

### 6. Install the App

- Go to **Install App** → **Install to Workspace**.
- Copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN`.
- Copy the **Signing Secret** from **Basic Information** — this is your `SLACK_SIGNING_SECRET`.

### 7. Invite the bot to your summary channel

```
/invite @preloveyou-standup-bot
```

---

## Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...        # From Install App page
SLACK_SIGNING_SECRET=...        # From Basic Information page
SLACK_APP_TOKEN=xapp-...        # From Socket Mode page

SUMMARY_CHANNEL_ID=C0000000000  # Right-click channel → Copy channel ID

# Optional: comma-separated user IDs to DM. If blank, bots all non-bot members of SUMMARY_CHANNEL_ID.
TEAM_MEMBER_IDS=U001,U002,U003

# Optional overrides (defaults shown)
CHECKIN_CRON=0 16 * * 5         # Every Friday at 4pm
COLLECTION_WINDOW_MINUTES=60    # Wait 60 min before posting summary
```

To find a user's ID: click their profile → ⋯ → **Copy member ID**.

---

## Running

```bash
npm install
npm start
```

For development with auto-restart:

```bash
npm run dev
```

---

## Deployment (recommended: Railway / Render / Fly.io)

The bot runs as a persistent process. Set the same env vars in your hosting dashboard and deploy with:

```bash
npm start
```

No public URL is needed — Socket Mode keeps a persistent WebSocket connection to Slack.

---

## Customising questions

Edit the `QUESTIONS` array in `index.js`:

```js
const QUESTIONS = [
  '1️⃣  *What did you work on this week?*',
  '2️⃣  *What are you planning to work on next week?*',
  '3️⃣  *Any blockers or anything you need help with?*',
];
```

Add or remove items freely — the bot handles any number of questions.

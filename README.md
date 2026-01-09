
# Fastfetch Spotify Canvas

Only compatible in Terminals with Kitty graphics protocol.

## Requirements

- KGI supported terminal
- bun/pnpm

## Showcase


https://github.com/user-attachments/assets/dba217df-87bb-4916-8afd-80af3994f876

## Steps

1. Clone the repo

```sh
git clone https://github.com/qeqqe/fastfetch-spotify-canvas.git ~/fastfetch-spotify-canvas
```

2. Install dependencies

```sh
cd ~/fastfetch-spotify-canvas
pnpm install
# or if you prefer bun:
bun install
```

3. Build

```sh
pnpm run build
# or if you prefer bun:
bun run build
```

4. Set up Spotify authentication

- Rename `.env.example` to `.env`
- Follow the [CLI-based authentication guide](#cli-based-authentication) below to get your refresh tokens

5. Add the alias to your shell config

Put this in `~/.bashrc` or `~/.zshrc`:

```sh
alias fetchcanvas="$HOME/fastfetch-spotify-canvas/script.sh"
```

Then reload your shell config:

```sh
source ~/.bashrc
# or
source ~/.zshrc
```

6. Run

```sh
fetchcanvas
```

## CLI-Based Authentication

Complete Spotify OAuth setup entirely from the terminal:

1. **Create a Spotify Developer App**
   - Go to https://developer.spotify.com/dashboard
   - Click "Create app"
   - Set redirect URI to: `http://127.0.0.1:5555/callback`
   - Copy your Client ID and Client Secret

2. **Add credentials to `.env`**

```sh
SP_DC=get-from-spotify-web-cookies

SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

3. **Get authorization code**

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://127.0.0.1:5555/callback&scope=user-read-recently-played%20user-read-currently-playing%20user-read-playback-state
```

After authorizing, you'll be redirected to a URL like:
```
http://127.0.0.1:5555/callback?code=AQB3tYro...
```

Copy the `code` parameter value.

4. **Exchange code for refresh token**

```sh
curl -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_CODE_FROM_STEP_3" \
  -d "redirect_uri=http://127.0.0.1:5555/callback"
```

5. **Save refresh token**

From the response JSON, copy the `refresh_token` value and add it to `.env`:

```sh
SPOTIFY_REFRESH_TOKEN=your_refresh_token_here
```

Done! Your `.env` should now have all three values. The access token will auto-refresh when needed.

---

Special thanks to https://github.com/bartleyg/my-spotify-canvas.git for reverse engineering the Canvas API.

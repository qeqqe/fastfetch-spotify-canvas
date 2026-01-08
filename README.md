only compatible in kitty terminal
Requirements

- kitty terminal
- bun
- pnpm
- SP_DC cookie from the Spotify web

Showcase.

https://github.com/user-attachments/assets/dba217df-87bb-4916-8afd-80af3994f876

Steps

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

4. Create your environment file

- Rename .env.example to .env
- Put your SP_DC cookie value into .env
- Create a spotify developer app to get client id and client secret, and put them into .env, then authenticate once and get the refresh token and put it in the .env

5. Add the alias to your shell config
   Put this in ~/.bashrc or ~/.zshrc:

```sh
alias fetchcanvas="$HOME/fastfetch-spotify-canvas/script.sh"
```

Then reload your shell config:

```sh
source ~/.bashrc
# or
source ~/.zshrc
```

5. Run

```sh
fetchcanvas
```

special thanks to https://github.com/bartleyg/my-spotify-canvas.git for reverse engineering the canvas api.

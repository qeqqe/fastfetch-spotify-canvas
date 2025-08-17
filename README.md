only compatible in kitty terminal
Requirements

- kitty terminal
- bun
- pnpm
- SP_DC cookie from the Spotify web

Demo.

https://github.com/user-attachments/assets/b05cb66d-8fd5-4117-bbca-d271057433b3

Steps

1. Clone the repo

```sh
git clone https://github.com/qeqqe/my-spotify-canvas.git ~/fastfetch-spotify-canvas
```

2. Install dependencies

```sh
cd ~/fastfetch-spotify-canvas
pnpm install
# or if you prefer bun:
bun install
```

3. Create your environment file

- Rename .env.example to .env
- Put your SP_DC cookie value into .env

4. Add the alias to your shell config
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

special thanks to https://github.com/bartleyg/my-spotify-canvas.git

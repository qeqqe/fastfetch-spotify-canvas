only compatible in kitty terminal
**Config Tip:**  
Put in `.bashrc` or `.zshrc`:

```sh
alias fastfetch='fastfetch --logo "/home/qeqqer/images/fastfetch/media/*"'
# for now
alias fetchcanvas='bun ~/codebase/fastfetch-spotify-canvas/src/index.ts  > /dev/null 2>&1'

fetchcanvas

kitten icat -n --place 50x50@0x6 --scale-up --align left ~/images/fastfetch/media/* | fastfetch --logo-width 50 --raw -
```

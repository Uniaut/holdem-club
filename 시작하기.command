#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent default >/dev/null 2>&1
fi
if ! node --version >/dev/null 2>&1; then
  echo "Node.js 20 이상을 먼저 설치해 주세요: https://nodejs.org"
  read -k 1
  exit 1
fi
if curl -fsS http://localhost:5173/ 2>/dev/null | /usr/bin/grep -q 'Holdem Club'; then
  open http://localhost:5173
else
  (sleep 1; open http://localhost:5173) &
  node server.mjs
fi

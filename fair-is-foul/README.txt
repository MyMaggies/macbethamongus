FAIR IS FOUL - multiplayer (Cloudflare Worker + Durable Objects, free plan)

WHAT IS IN HERE
  wrangler.toml      Cloudflare config (name, room object, teacher password)
  src/index.js       the server: one room per table (A, B, C, D), runs the game
  src/rt.js          the game rules (same file the solo game uses)
  public/index.html  the game page the iPads open
  public/teacher.html  teacher view (opens at /teacher)
  public/fonts/      the two pixel fonts, so nothing loads from Google

DEPLOY (GitHub + Cloudflare, no terminal)
  1. Put this whole folder (fair-is-foul) into your GitHub repo.
  2. Cloudflare dashboard > Workers & Pages > Create > Import a repository.
     Pick the repo. Set Root directory to:  fair-is-foul
     Project name must be:  fair-is-foul   (same as "name" in wrangler.toml)
     Leave the deploy command as: npx wrangler deploy
  3. Open the address Cloudflare shows (fair-is-foul.<you>.workers.dev).

BEFORE THE LESSON
  - Change TEACHER_KEY in wrangler.toml (default: duncan), commit, wait for deploy.
  - Open /teacher on your laptop. It lists tables A to D and who has joined.
  - Test with 4 devices at once (iPads or laptop browsers), on the school Wi-Fi.
    Two tabs of the SAME browser share one seat: use a private window or a
    different browser for the extra player.

IN CLASS
  - Students open the address, type a name, tap their table letter, JOIN.
  - 4 to 5 players per table, all real players. No bots. A round needs at
    least 4 (minPlayers in src/index.js). With fewer it is over after one stab.
  - Everyone taps I AM READY and the round starts. Rotation: the player with
    the fewest turns as usurper gets the role next.
  - A dropped or sleeping iPad rejoins its own seat when the page reopens.
    Its character just stands still until it is back, and it is skipped in
    the "ready to vote" and voting waits.
  - Stuck table: /teacher > START NOW or RESET.

TUNING (top of src/index.js, TUNE)
  minPlayers 4, talkSecs 90, voteSecs 25, resultSecs 9, revealSecs 7
  game: killCd 30, firstCd 30, maxTime 480 (seconds), tasksPer 6

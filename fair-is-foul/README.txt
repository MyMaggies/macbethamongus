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
  - Test on 2-3 school iPads at once, on the school Wi-Fi.

IN CLASS
  - Students open the address, type a name, tap their table letter, JOIN.
  - Max 5 per table. Empty seats are played by bots.
  - Everyone taps I AM READY and the round starts. Rotation: the player with
    the fewest turns as usurper gets the role next.
  - A dropped or sleeping iPad rejoins its own seat when the page reopens;
    a bot plays for it meanwhile.
  - Stuck table: /teacher > START NOW or RESET.

TUNING (top of src/index.js, TUNE)
  talkSecs 90, voteSecs 25, resultSecs 9, revealSecs 7
  game: killCd 30, firstCd 30, maxTime 480 (seconds), tasksPer 6

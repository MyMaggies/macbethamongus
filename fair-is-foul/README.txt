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
  - 4 to 10 players per table, all real players. No bots. A round needs at
    least 4 (minPlayers in src/index.js).
  - 4-7 players: 1 usurper. 8-10 players: 2 usurpers who know each other.
  - Bodies are only found by walking up to them and tapping REPORT (any
    player). Blood on a tunic only shows at close range and clears after
    each meeting.
  - Usurper abilities, ONCE per round each: LOCK DOOR (seals a door for 15 s,
    usurpers can still pass) and GHOST (swaps everyone's faces in the room
    for 10 s; needs 2+ others in the room).
  - Everyone taps I AM READY and the round starts. Rotation: the player with
    the fewest turns as usurper gets the role next.
  - A dropped or sleeping iPad rejoins its own seat when the page reopens.
    Its character just stands still until it is back, and it is skipped in
    the "ready to vote" and voting waits.
  - Stuck table: /teacher > START NOW or RESET.

TUNING (top of src/index.js)
  SIZE table: one row per player count. k = number of usurpers, killCd and
  firstCd = stab cooldowns, talkSecs / voteSecs = meeting timers, maxTime =
  round length. Edit a number on GitHub, commit, it redeploys by itself.
  TUNE: minPlayers, resultSecs, revealSecs.
  The numbers were found with computer-played test rounds, so expect to nudge
  them after the first real lesson (7 players is the awkward size).

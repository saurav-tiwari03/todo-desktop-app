# Kodeit Todo

A personal, offline todo app for the Mac desktop — Todoist-style quick add,
projects, priorities, due dates, deadlines, repeating tasks and reminders, with
everything stored in a plain JSON file on your own machine. No account, no
sync, no network calls.

## Run it

```bash
npm install
npm start          # launch the app
npm run dev        # launch with DevTools open
```

## Build a real .app

```bash
npm run dist       # dist/Kodeit Todo-1.0.0-arm64.dmg  + dist/mac-arm64/Kodeit Todo.app
npm run pack       # just the .app, no disk image (faster, for testing)
```

Then open the `.dmg` and drag **Kodeit Todo** into Applications. From there it
behaves like any other Mac app: Spotlight finds it, it keeps its own Dock icon,
and `⌥Space` works whether or not the window is open.

### About code signing

There is no Apple Developer ID here, so electron-builder can't sign the app
properly and says so during the build. macOS on Apple Silicon refuses to launch
a *completely* unsigned app, so `scripts/adhoc-sign.js` (wired in as
electron-builder's `afterPack` hook) gives the bundle an **ad-hoc** signature.
That is enough to run it on this Mac.

It is *not* enough to hand to anyone else — an ad-hoc signature carries no
identity for macOS to check, so another Mac blocks it on first launch. See
[Why recipients see a warning](#why-recipients-see-a-warning-and-what-removes-it).

### Giving it to someone else

```bash
npm run release    # dist/Kodeit Todo 1.0.0/  — the app + INSTALL.txt, and a zip of both
```

Three shapes come out of the build, all the same app:

| What | Where | For |
|---|---|---|
| Disk image | `dist/Kodeit Todo-1.0.0-arm64.dmg` | the familiar mount-and-drag install |
| Folder | `dist/Kodeit Todo 1.0.0/` | copying straight to another Mac you own |
| Zip | `dist/Kodeit Todo-1.0.0-arm64-folder.zip` | sending it to someone |

Send the **zip**, never the bare folder. A `.app` is a directory full of
symlinks and signed frameworks, and cloud drives, chat apps and Finder's own
*Compress* can all rewrite it in transit — which is what produces "the
application is damaged" at the other end. `scripts/release.js` uses `ditto`
instead, which preserves the symlinks and extended attributes the signature is
computed over, then verifies the signature survived and fails the build if it
didn't.

`INSTALL.txt` goes in the folder and the zip as *INSTALL — read me first.txt*;
`INSTALL.md` is the same thing in Markdown, for pasting into a message or a
release page. Both tell the recipient how to get past the Gatekeeper warning.

### Why recipients see a warning (and what removes it)

Apps you download that just install with no fuss are **signed with a Developer
ID and notarised** — Apple has checked them and macOS can name the developer.
Neither is possible without a paid Apple Developer Program membership
(**$99/year**). There is no configuration, flag or packaging format that avoids
Gatekeeper; a `.pkg` installer is blocked exactly the same way.

So right now every recipient gets blocked once, and clears it from
 System Settings → Privacy & Security → **Open Anyway**. On your own Mac you
never see this, because a file you built locally is never flagged as downloaded.

Once you do have a Developer ID, no code changes are needed:

```bash
export CSC_LINK=~/certs/developer-id.p12       # your exported certificate
export CSC_KEY_PASSWORD=...                    # its password
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx   # appleid.apple.com
export APPLE_TEAM_ID=XXXXXXXXXX

npm run dist:signed
```

electron-builder then signs with the real certificate instead of the ad-hoc
one, uploads the build to Apple for notarisation, waits, and staples the ticket
into the disk image. The result installs with no warning on any Mac — the
experience you get from every other app you download.

### Only one copy runs

The app takes a single-instance lock. Both copies would own the same
`tasks.json` and whichever saved last would silently clobber the other, so a
second launch just focuses the window that's already running. That matters most
when the installed app and `npm start` are both around — they share one data
file.

### The icon

The app icon is built from the source logo in the project root:

```bash
python3 scripts/make-icon.py "Charcoal Overlapping Checkmark Logo.png"
```

That trims the artwork, keys out its background, centres it on a rounded tile
with the margin macOS expects, and writes `build/icon.png`, `build/icon.icns`,
the small `src/renderer/assets/logo.png` used in the sidebar, and the
black-on-transparent `trayTemplate.png` pair for the menu bar. Re-run it
whenever the logo changes. (Needs Pillow: `pip3 install pillow`.)

## Quick add

**Add task** in the sidebar (or `⌘N`, or just `q`) opens a floating card over
whatever you're looking at — type the task, press Enter, done. It works from
any view, including Completed, and a toast confirms what was added.

The inline box at the top of each list does the same thing without the overlay.

### From anywhere: ⌥Space

While the app is running it sits in the menu bar. Press **⌥Space** (Option +
Space) in any application and the same card drops down over whatever you are
doing — type, press Enter, and you are back where you were. Esc dismisses it
without saving, and clicking away closes it too.

The menu-bar icon shows how many tasks are due today and offers **Open**,
**Quick Add** and **Quit**; double-clicking it opens the window. Closing the
main window leaves the app in the menu bar rather than quitting.

If another app already owns ⌥Space the shortcut won't register — the app logs
that at startup and the menu-bar **Quick Add** item still works.
Either way the text is parsed, so one line is usually enough:

```
Pay rent tomorrow p1 #Home @bills
```

| You type | You get |
| --- | --- |
| `today`, `tomorrow`, `yesterday` | that due date |
| `monday` … `sunday` | the next one (today if today matches) |
| `next friday`, `next week`, `next month` | the following week's / month's date |
| `in 3 days`, `in 2 weeks`, `in 1 month` | a relative date |
| `dec 1`, `1 dec`, `12/25`, `2026-12-25` | a specific date (next time it comes around) |
| `p1`–`p4` (or `!1`–`!4`) | priority — P1 red, P4 none |
| `#Project` | files it in that project; creates the project if it's new |
| `@label` | adds a label |

Recognised words are stripped from the title, and a live hint under the box
shows exactly how the line will be read before you press Enter.

## Dates, repeats, deadlines and reminders

Click any task to open the detail panel. Below the title and notes it has a row
per field — Project, Date, Deadline, Priority, Labels, Reminders — and each row
opens its own picker. Drag the panel's left edge to resize it (280–640px;
double-click the edge to reset), and the width is remembered between launches.

**Date** opens the full picker: a "type a date" box that understands the same
language as quick add, shortcuts for Today / Tomorrow / Next week / Next
weekend / No date, and a scrolling twelve-month calendar. Its footer adds:

- **Time** — a time of day for the task, with presets.
- **Repeat** — Every day, Every week on <day>, Every weekday (Mon–Fri), Every
  month on the <n>th, Every year on <date>, or **Custom…**

**Custom repeat** covers the rest: whether the next occurrence is counted from
the *scheduled* or the *completed* date, an interval of every N days / weeks /
months / years, and an end condition of never or on a given date.

Completing a repeating task doesn't file it away — it rolls forward to its next
occurrence (carrying its reminders and deadline with it) and a toast tells you
when that is. The task is only truly completed once its rule runs out.

**Deadline** is a separate hard date from the working due date, shown on the
task and turning red once it passes.

**Reminders** are absolute moments, set relative to the due date or picked
outright. The app checks every 30 seconds and raises a native macOS
notification; clicking it jumps to the task. A reminder whose moment passed
while the app was closed fires at the next check rather than being missed.

## Comments and attachments

Open a task and the panel has a **Comments** section under the fields. Write a
comment and send it with the button or `⌘↵`. Comments are timestamped, can be
edited (the list marks them *edited*) and deleted.

Attach files by clicking the paperclip, or by **dropping them onto the
composer** — a comment can be text, files, or both. Images show as thumbnails;
everything else gets a chip with its name and size. Click one to open it in the
app macOS would normally use; right-click for **Show in Finder**. The ✕ on a
chip removes a single attachment, and removing the last one from a comment that
has no text deletes the comment too.

A task carrying comments shows a count in its row — a speech bubble, or a
paperclip when any of the comments has a file.

### Where the files go

An attached file is **copied** into

```
~/Library/Application Support/Kodeit Todo/attachments/
```

rather than linked where it sat, so moving or deleting the original later
doesn't empty the task. The copy is named after its attachment id, so two files
called `scan.pdf` never collide. Deleting an attachment, its comment, its task,
or clearing completed tasks removes the copies too — nothing is left orphaned.

Thumbnails are served over a private `attachment://` scheme that resolves only
inside that folder, so the page's content-security policy never has to be
opened up to `file:`.

## Views

- **Today** — everything due today, with anything overdue called out on top
- **Upcoming** — future tasks grouped by day
- **Inbox** — tasks that aren't in a project
- **All Tasks** / **Completed**
- Any project, from the sidebar

Each list has a search box and a sort toggle (manual → due date → priority →
alphabetical). Completed tasks stay available under "Show completed".

## Layout

The **Layout** button in the header opens everything about how the current
view is shown. A dot on the button means something is off its default. All of
it is remembered between launches, and **Reset all** puts it back.

### The four shapes

- **List** — the default: grouped, with the overdue/today split and date
  headings in Upcoming.
- **Board** — a kanban board of **To do / In progress / Done**. Drag a card
  between columns to move it; dropping into Done completes it, dragging it
  back out reopens it. Each column has its own **Add task**, so a task written
  in "In progress" starts there. Dropping a repeating task into Done rolls it
  forward to its next occurrence rather than filing it away.
- **Calendar** — a month grid with each task on its due date, coloured by
  priority. Move through months with ‹ › or jump back with **Today**. Click a
  task to open it; click empty space in a day to add a task due that day.
  Tasks with no date aren't on the grid, and a note below says how many.
- **Table** — one row per task with Task, Project, Date, Priority, Labels and
  Deadline columns. Click a column heading to sort by it.

Ticking, selecting and deleting work the same way in all four.

### Completed, sort and filter

- **Completed tasks** — a switch for showing finished tasks inline.
- **Grouping** — Default (each view's own grouping), None, Date, Priority or
  Project.
- **Sorting** — Manual, Date, Priority or Name.
- **Filters** — Date (overdue / today / next 7 days / no date), Created
  (today / last 7 / last 30 days), Priority and Label. They stack, and apply
  to whichever shape is on screen.

Board and Calendar deliberately ignore a view's own date window — a month grid
filtered to "due today" would be nearly empty — so in those two, Today and
Upcoming widen out while Inbox and project views still scope to their project.

## Keyboard

| Key | Action |
| --- | --- |
| `q` or `a` | open the floating quick-add card |
| `/` | jump to search |
| `Enter` | add the task |
| `Esc` | close the quick-add card, the detail panel, or a dialog |
| `⌘1`–`⌘5` | Today / Upcoming / Inbox / All / Completed |
| `⌘N` | new task (floating card) |
| `⌥Space` | quick add from any app |
| `⌘⇧N` | new project |
| `⌘F` | search |

Click a task to open the detail panel — notes, due date, priority, project,
labels, reminders and [comments](#comments-and-attachments).

Hover a project in the sidebar for its **⋯** menu: *Edit project* to rename or
recolour, *Delete project* to remove it. Double-click or right-click the row
does the same. Deleting asks first and tells you what happens to the contents —
unfinished tasks move to the Inbox rather than being thrown away.

## Sample data

```bash
npm run seed                     # add sample projects and tasks
node scripts/seed.js --replace   # wipe first, then add them
```

Seeding appends to whatever is already there and copies the old file to
`tasks.before-seed.json` first, so nothing is lost. Quit the app before running
it — a running app holds its own copy in memory and will write it back.

## Your data

Everything lives in one file:

```
~/Library/Application Support/Kodeit Todo/tasks.json
```

Writes go to a temp file and are renamed into place, and the previous version is
kept alongside as `tasks.backup.json`, so an interrupted write can't corrupt your
list. Back it up or sync it however you like — it's readable JSON.

## Look and feel

The list is rendered by a small keyed reconciler rather than by rebuilding the
HTML on every change, so rows keep their identity between renders. That's what
lets the interface move:

- new tasks fade and slide in, staggered down the list
- ticking a task draws the checkmark, pulses a ring, sweeps a line through the
  title, and only then lets the row glide out of the view
- rows that move (re-sorting, a task leaving a group) are tweened with FLIP
  rather than jumping
- the sidebar highlight slides between rows, the detail panel opens as a real
  column, dialogs scale in behind a blurred backdrop, and the Today header
  carries a thin progress meter for the day

Everything honours `prefers-reduced-motion`: with it on, the animations are
skipped and the app updates instantly.

## Project structure

```
src/
  main/
    main.js      Electron main process: window, menus, IPC
    preload.js   the only bridge the UI gets to the main process
    store.js     JSON persistence and all task/project mutations
  main/
    recurrence.js  next-occurrence maths for repeating tasks
    preload-quick.js  bridge for the global quick-add window
  renderer/
    index.html   app shell
    styles.css   design tokens, light + dark themes, motion
    icons.js     inline SVG icon set
    nlp.js       quick-add parser
    pickers.js   popover shell + date / repeat / label / reminder pickers
    quickadd.html / quickadd.js   the ⌥Space capture window
    app.js       UI state, reconciler, animation
    assets/      the sidebar logo
scripts/
  make-icon.py   builds build/icon.icns from the source logo
```

The renderer runs with `contextIsolation` on, `nodeIntegration` off, and a
strict Content-Security-Policy — it reaches the data only through the handful of
methods exposed in `preload.js`.

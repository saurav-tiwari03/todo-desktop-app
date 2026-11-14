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
npm run dist       # produces dist/Kodeit Todo-1.0.0-arm64.dmg
```

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

Click a task to open the detail panel (notes, due date, priority, project,
labels). Double-click or right-click a project in the sidebar to rename,
recolour or delete it — deleting a project moves its tasks to the Inbox rather
than throwing them away.

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

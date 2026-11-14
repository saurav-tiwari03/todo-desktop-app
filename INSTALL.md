# Installing Kodeit Todo

A Mac app for your tasks. Apple Silicon (M1 or newer), macOS 11 or later.

You were given either **Kodeit Todo.dmg** or a folder/zip containing
**Kodeit Todo.app**. Both install the same app.

---

## 1. Put the app in Applications

**From the .dmg** — double-click it, then drag **Kodeit Todo** onto the
**Applications** shortcut next to it. Eject the disk image afterwards (click the
⏏ next to it in the Finder sidebar).

**From the folder or zip** — double-click the zip to unpack it, then drag
**Kodeit Todo.app** into your **Applications** folder.

Either way, run it from Applications, not from the disk image or the Downloads
folder.

## 2. The first launch will be blocked — this is expected

The first time you open it, macOS says something like:

> **"Kodeit Todo" can't be opened because Apple cannot check it for malicious
> software.**

This app isn't signed with a paid Apple Developer certificate, so macOS can't
identify who made it and blocks it by default. Nothing is wrong with the
download. To allow it:

1. Click **Done** on the warning.
2. Open  **System Settings → Privacy & Security**.
3. Scroll to the **Security** section. You'll see
   *"Kodeit Todo" was blocked to protect your Mac.*
4. Click **Open Anyway**, then confirm with your password or Touch ID.
5. Open the app again — it launches, and every launch after this one is normal.

> On macOS 15 (Sequoia) and later, right-clicking the app and choosing **Open**
> no longer works for this. Use System Settings as above.

### The one-line alternative

If you'd rather use the Terminal, this does the same thing without the Settings
trip — it removes the "downloaded from the internet" flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Kodeit Todo.app"
```

Then open the app normally.

## 3. Optional: keep it handy

- **Keep it in the Dock** — right-click its Dock icon → *Options* → *Keep in Dock*.
- **Start it at login** —  System Settings → General → Login Items →
  **+** → choose Kodeit Todo.

---

## Using it

The app lives in two places at once:

- A **window**, like any app. Closing the window doesn't quit it.
- A **menu-bar icon** (the checkmark at the top-right of your screen). It shows
  how many tasks are due today, and its menu has Open, Quick Add and Quit.

**Press ⌥Space (Option+Space) from any app** to get a quick-add box over
whatever you're doing. Type the task, press Enter, and you're back where you
were. Esc cancels.

Type naturally and it understands you:

```
Call the bank tomorrow p1 #Admin @calls
```

That's a task called "Call the bank", due tomorrow, priority 1, in the Admin
project, labelled "calls". `#Project` picks or creates a project, `@label` adds
a label, `p1`–`p4` sets priority, and dates like `today`, `next monday`,
`25 Dec`, `every weekday` all work.

Press `?` in the app for the full list of keyboard shortcuts.

## Your tasks are stored only on your Mac

Everything lives in one file:

```
~/Library/Application Support/Kodeit Todo/tasks.json
```

There is no account, no sync and no server — nothing leaves your machine. Back
up or move your tasks by copying that file. Deleting the app leaves it behind;
delete the folder too if you want it gone.

## If something goes wrong

**"The application is damaged and can't be opened."** The download was
incomplete or the file was altered in transit (some chat apps and cloud drives
do this to `.app` folders). Ask for the `.dmg` or `.zip` again and don't unpack
it until it's fully downloaded.

**⌥Space does nothing.** Another app has already claimed that shortcut —
launchers like Alfred, Raycast and Spotlight alternatives often use it. Quit or
rebind the other app. The menu-bar icon's **Quick Add** does the same job
meanwhile.

**No notifications for reminders.** Allow them in  System Settings →
Notifications → Kodeit Todo.

**It won't open at all, with no warning.** You're probably on an Intel Mac; this
build is Apple Silicon only.

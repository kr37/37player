# Setting up shared libraries on the droplet

`sync.php` is the whole server side. It runs under your existing Apache and PHP, and needs no database and no Composer.

## 1. Put sync.php on the site

Copy `sync.php` next to `37-player.html`, so it's at `https://37player.com/sync.php`. That's the address 37 Player suggests by default.

## 2. Make the data folder (outside the web root)

```
sudo mkdir -p /var/lib/37player
sudo chown www-data:www-data /var/lib/37player
sudo chmod 770 /var/lib/37player
```

If PHP's `open_basedir` is set for that site, add `/var/lib/37player` to it. Check with `php -i | grep open_basedir` and in the vhost.

To keep the data somewhere else, make a `sync-config.php` beside `sync.php`:

```php
<?php define('DATA_DIR', '/srv/37player');
```

Updating `sync.php` later never touches that file.

## 3. Create a library and get its join code

```
sudo -u www-data php /var/www/37player.com/html/sync.php create ikrc "IKRC Library" "Death comes to us all!"
# → Join code for ikrc: ikrc Death comes to us all!
```

- **`ikrc`:** the library's name. It's the folder `/var/lib/37player/ikrc/` and the first word of the join code, so use lowercase letters and digits only.
- **`"IKRC Library"`:** what 37 Player shows ("Joined “IKRC Library” as Gompa iPad").
- **The passphrase:** a sentence nobody would guess. Capitals, spaces and punctuation don't matter when someone types it, so `ikrc death comes to us all` works too. It needs at least 16 letters or digits. Leave it out and one is generated, like `ikrc DX2W-TJ53-WNCG-CBYC`.

Anyone with the join code can read and change that library, so pass it on like a password.

Run it through PHP as `www-data`. Run directly as `./sync.php`, your shell tries to read it as shell commands. Run as yourself, the folders would belong to you and Apache couldn't write to them.

Other commands:

```
php sync.php list                                # libraries and their current version
php sync.php newcode ikrc "A new sentence here"  # new join code; the old one stops working (re-join each device)
php sync.php cleanup                             # prune old versions and unused files (see 5)
```

## 4. Check it

```
curl -i -H "X-Library: ikrc%20Death%20comes%20to%20us%20all" "https://37player.com/sync.php?op=state"
```

You should see `X-Version: 0` and `null`. A wrong code gives a 403.

Then in 37 Player, go to Settings → **Shared library**, enter the code and a device name, and **Join**. The first device to join is the one whose library you want to share. Its playlists and tracks appear in the shared library within moments, and its audio follows in the background, which takes as long as uploading that many gigabytes takes. Other devices can join straight away: they see everything at once, and get each audio file as soon as it's arrived.

## 5. Daily cleanup (cron)

Every saved change is kept as a version, so mistakes can be traced and, later, undone. Cleanup keeps every version from the last 30 days and at least the latest 300. Audio and artwork no longer used by any kept version are deleted once they're 30 days old.

`/etc/cron.d/37player`:

```
15 4 * * * www-data php /var/www/37player.com/html/sync.php cleanup >/dev/null
```

## 6. Backup to the T470

`scripts/pull_droplet_backup.sh` pulls a dated copy of `/var/lib/37player` into `~/backups/37player/YYYY-MM-DD`, hard-linked to the day before (an unchanged file takes no extra space), and keeps the newest 30 days. It never deletes a file because the droplet did (no `--delete`), and if a day's copy comes back less than half the size of the one before (the droplet's data gone, say), it stops pruning and exits with an error, so the good copies stay. Put `~/backups/37player` inside a pCloud-synced folder for a copy off the laptop too.

**Read access on the droplet:** the SSH user needs to read `/var/lib/37player`, which belongs to `www-data`:

```
sudo usermod -aG www-data <ssh user>      # then log out and in
sudo chmod -R g+rX /var/lib/37player
```

**A daily timer on the T470** (systemd rather than cron, so a laptop that was asleep at the time catches up when it wakes). Copy the script to `~/bin/`, then:

`~/.config/systemd/user/37player-backup.service`
```
[Unit]
Description=Pull 37 Player shared libraries from the droplet

[Service]
Type=oneshot
ExecStart=%h/bin/pull_droplet_backup.sh
```

`~/.config/systemd/user/37player-backup.timer`
```
[Unit]
Description=Daily 37 Player droplet backup

[Timer]
OnCalendar=*-*-* 03:30
Persistent=true

[Install]
WantedBy=timers.target
```

```
systemctl --user daemon-reload
systemctl --user enable --now 37player-backup.timer
systemctl --user start 37player-backup.service     # once now, to check
journalctl --user -u 37player-backup               # what it said
```

`SRC=other-host:/var/lib/37player/` overrides where it pulls from (the default is the SSH alias `kr37`).

## Notes

- **Uploads:** audio arrives by HTTP `PUT`, so PHP's `upload_max_filesize` and `post_max_size` don't apply. Apache's `LimitRequestBody` defaults to 1 GB, which is plenty.
- **Long downloads:** these stream with `readfile`-style output. If a very slow connection ever gets cut off, raise `max_execution_time` for that vhost.
- **Browser access:** the script sends its own CORS headers. Copies of 37 Player opened from a file on a computer can sync too.
- **Unused Craft installs:** worth removing, or at least disabling their vhosts, now that the droplet holds other Centers' libraries.

## Big files (over 1 GB)

Apache 2.4.54 and later refuse uploads over 1 GiB unless told otherwise, and
37 Player then shows "Too big for the server's upload limit". To lift the
limit for sync.php only, add this to the site's Apache config (inside its
`<VirtualHost>`), or to an `.htaccess` next to sync.php if overrides are on:

```
<Files "sync.php">
    LimitRequestBody 0
</Files>
```

Then `sudo apachectl configtest && sudo systemctl reload apache2`, and press
"Sync now" on the device that has the file.

## The converter (ffmpeg.wasm)

37 Player converts formats a browser can't play (WMA, Apple Lossless,
compressed AIFF) with ffmpeg.wasm, which devices download from the site the
first time they need it. To put it there, from the site's folder:

```
scripts/get_ffmpeg.sh
```

It writes `ffmpeg/` beside `37-player.html` (about 32 MB, not in git), with an
`.htaccess` that adds the CORS header (so copies opened from a file can fetch
it), the `.wasm` type and compression. If the vhost doesn't allow `.htaccess`
files, put the same lines in it, inside a `<Directory>` for that `ffmpeg/`
folder. Do this on both sites (player and playertest).

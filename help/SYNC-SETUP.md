# Setting up shared libraries on the droplet

`sync.php` is the whole server side. It runs under your existing Apache and PHP, and needs no database and no Composer.

## 1. Put sync.php on the site

Copy `sync.php` next to `37-player.html`, so it's at `https://player.37dakinis.net/sync.php`. That's the address 37 Player suggests by default.

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
sudo -u www-data php /var/www/player.37dakinis.net/sync.php create ikrc "IKRC Library" "Death comes to us all!"
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
curl -i -H "X-Library: ikrc%20Death%20comes%20to%20us%20all" "https://player.37dakinis.net/sync.php?op=state"
```

You should see `X-Version: 0` and `null`. A wrong code gives a 403.

Then in 37 Player, go to Settings → **Shared library**, enter the code and a device name, and **Join**. The first device to join, the one whose library you want to share, chooses **Combine them**. That uploads its whole library, which takes as long as uploading that many gigabytes takes. Every other device then joins and receives it.

## 5. Daily cleanup (cron)

Every saved change is kept as a version, so mistakes can be traced and, later, undone. Cleanup keeps every version from the last 30 days and at least the latest 300. Audio and artwork no longer used by any kept version are deleted once they're 30 days old.

`/etc/cron.d/37player`:

```
15 4 * * * www-data php /var/www/player.37dakinis.net/sync.php cleanup >/dev/null
```

## 6. Backup to the T470

In the T470's crontab:

```
30 3 * * * rsync -a --delete droplet:/var/lib/37player/ ~/backups/37player/
```

This needs read access to `/var/lib/37player` for the SSH user. Add that user to the `www-data` group, or run the rsync with sudo on the droplet side.

## Notes

- **Uploads:** audio arrives by HTTP `PUT`, so PHP's `upload_max_filesize` and `post_max_size` don't apply. Apache's `LimitRequestBody` defaults to 1 GB, which is plenty.
- **Long downloads:** these stream with `readfile`-style output. If a very slow connection ever gets cut off, raise `max_execution_time` for that vhost.
- **Browser access:** the script sends its own CORS headers. Copies of 37 Player opened from a file on a computer can sync too.
- **Unused Craft installs:** worth removing, or at least disabling their vhosts, now that the droplet holds other Centers' libraries.

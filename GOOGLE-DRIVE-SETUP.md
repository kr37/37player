# Setting up Google Drive for shared libraries

A shared library can live in a folder of a Google Drive instead of on the
droplet (Settings → Shared library → **Use Google Drive…**). For that,
37 Player needs to be registered with Google once, and the droplet's
`token.php` needs the registration's secret. About 20 minutes, done once
for everyone: Centers and individuals all sign in through the same
registration.

Google's console changes its layout from time to time; the names below are
as of October 2026.

## 1. A Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in (any Google
   account; the Center's or your own).
2. Create a project, for example **37 Player**.
3. **APIs & Services → Library**: find **Google Drive API** and **Enable** it.

## 2. The consent screen (Google Auth Platform)

1. **Branding:** app name **37 Player**, a support email, and under
   *App domain* the home page `https://37player.com/`. Add
   `37player.com` as an authorized domain. A privacy policy link is asked
   for when publishing; a short page on the site saying that 37 Player
   keeps libraries in the person's own Drive and nothing on the server is
   enough.
2. **Audience:** *External*.
3. **Data access:** add the scope
   `https://www.googleapis.com/auth/drive.file` ("See, edit, create, and
   delete only the specific Google Drive files you use with this app").
   It's a non-sensitive scope, so Google doesn't need to review the app.
4. **Publish the app** (Audience → *Publish app*, "In production"). While
   it's in *Testing*, only listed test users can sign in, and every
   sign-in stops working after 7 days.

## 3. The OAuth client

**Clients → Create client**, type **Web application**, name **37 Player**:

- **Authorized redirect URIs:**
  - `https://37player.com/token.php`
  - `https://test.37player.com/token.php` 

  Exactly these, with no `?` or anything after them.
- *Authorized JavaScript origins* aren't needed (sign-in is a redirect, not
  a popup), but adding `https://37player.com` does no harm.

Create it, and copy the **Client ID** and **Client secret**.

## 4. The secret on the droplet

`token.php` reads its settings from a file outside the web root:

```
sudo mkdir -p /etc/37player
sudo nano /etc/37player/google-config.php
```

```php
<?php
define('GOOGLE_CLIENT_ID', '1234567890-abc...apps.googleusercontent.com');
define('GOOGLE_CLIENT_SECRET', 'GOCSPX-...');
define('ALLOWED_ORIGINS', ['https://37player.com', 'https://test.37player.com',
    // the old addresses, while devices are still moving from them:
    'https://player.37dakinis.net', 'https://playertest.37dakinis.net']);
// Only if token.php can't work out its own address (behind a proxy, say):
// define('TOKEN_URL', 'https://37player.com/token.php');
```

```
sudo chown root:www-data /etc/37player/google-config.php
sudo chmod 640 /etc/37player/google-config.php
```

`token.php` itself comes with the site (it's in the repository, beside
`sync.php`).

## 5. Check it

- <https://37player.com/token.php?op=status> should say
  `{"configured":true}`.
- In 37 Player: Settings → Shared library → **Use Google Drive…** → sign in
  → **Make a new library on Google Drive**. A folder "37 Player – <name>"
  appears in that Google Drive.

## How it works, and what it costs

- **Sign-in** goes 37 Player → `token.php` → Google → `token.php` → back to
  37 Player, with the result in the address (taken out at once). It's a
  redirect rather than a popup because popups are unreliable in an iPad's
  Home Screen app.
- **`token.php` stores nothing and logs nothing.** It adds the client secret
  to two exchanges with Google: a sign-in's one-time code for a lasting
  refresh token, and a refresh token for an hour's access. The refresh
  token is kept on the device that signed in (in that library's settings),
  never on the droplet.
- **The library's data goes straight between each device and Google Drive.**
  The droplet only helps with sign-in, so if it's down, Drive syncing stops
  once the current hour's access runs out.
- **`drive.file`** means 37 Player sees only the folders and files it made
  itself, nothing else in that Drive.
- **Sign-ins stop working** if the person removes 37 Player's access in their
  Google account, or after six months unused. 37 Player then shows
  **Sign in to Google** in the top bar.
- **If the droplet were compromised,** the secret alone opens nobody's Drive
  (that needs a refresh token, which only the devices hold). Make a new
  secret in the console and put it in the config file; existing sign-ins
  keep working.
- **One Google account per library, for now** (the simple setup). Every
  device that shares a Drive library signs in with the same account: for a
  Center, best one made just for this (`sound@…`), not someone's personal
  account. 37 Player remembers which account a library is in (1.4.124):
  signing in again offers that account first, and a sign-in as another
  account is refused with a message saying which one the library needs.
  Sharing one library between several people's own accounts needs Google's
  folder picker; not built yet (see 6).

## 6. Several people's own accounts: the test page

Whether that can work depends on what Google grants when someone picks a
folder in its picker, which isn't clearly documented.
`gdrive-picker-test.html` (beside `token.php`) finds out. It needs two
things from the same Google Cloud project:

1. **APIs & Services → Library:** enable the **Google Picker API**.
2. **APIs & Services → Credentials → Create credentials → API key.** Restrict
   it: *Application restrictions* → **Websites**, adding
   `https://37player.com/*` and `https://test.37player.com/*`; *API
   restrictions* → **Google Picker API** only. An API key isn't a secret
   (it goes into the page), which is why it's restricted.
3. The **project number** (on the project's dashboard, "Project info"): the
   picker's App ID, which ties what's picked to 37 Player's sign-in.

No new review: the page still asks only for `drive.file`.

Then:

1. In Drive, make a folder for the test, ideally in a **shared drive** two of
   your accounts can use, and put any small file into it through Drive's
   website.
2. Open `https://test.37player.com/gdrive-picker-test.html`, enter the key
   and project number, sign in as the first account, **Choose a folder…**,
   and **Run the test**, leaving what it makes.
3. In a private window, the same as the second account.
4. Copy both reports.

The summary at the top of each report answers: is the folder seen after
picking, are files others put there seen and readable, can one account
write into folders another made, does access last past a new access token,
and whose storage new files use (in a shared drive, the shared drive's).


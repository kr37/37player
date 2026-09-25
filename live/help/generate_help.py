#!/usr/bin/env python3
"""
Compiles the markdown files in this "help" folder into help.json, which
37 Player reads at startup to populate its Help tab — and ALSO writes the same
topics into index.html itself (between its HELP_TOPICS:BEGIN/END markers), so
every copy of the app carries current help built in. That matters for a copy
downloaded and opened as a local file: a file:// page can't fetch help.json at
all, so the built-in topics are all it will ever show. Run this after editing
any .md file here (or adding/removing one), then refresh the app to see the
change — over a real http(s) origin, a plain refresh is enough; opening
index.html directly as a file:// URL can't fetch help.json at all (a
Chrome-specific restriction on file:// pages, unrelated to this app), so
during development the app should be served through a local web server,
e.g. from the folder above this one: `python3 -m http.server`.

Each markdown file's name must start with a 3-digit number — its sort
order on the Help tab's left-hand list. Leaving gaps (010, 020, 030 rather
than 001, 002, 003) means a new topic can be inserted later without
renumbering everything else. Example: "010 Setup.md".

Within a file, the first line is the topic's title (shown in the list and
as the page heading) and everything after it is the topic's body, written
as ordinary Markdown — including tables, and fenced ``` code blocks for
anything like a folder-structure example. A code block gets the same
visual styling the app already uses elsewhere, automatically; nothing
extra needs to be written for that.

If a body genuinely needs something Markdown can't express (a precisely
styled table, custom layout), raw HTML can be written directly in the .md
file instead of Markdown syntax — it passes through untouched.

One special case: a line reading exactly `{{setup-locally}}` is left
untouched by this script and is substituted by the app itself, at render
time, with a real interactive button — that one piece needs actual
JavaScript (feature detection, a click handler) that no static content,
Markdown or hand-written HTML, can express on its own.

Requires the `markdown` package: pip install markdown
"""
import json
import os
import re
import sys
from pathlib import Path

try:
    import markdown
except ImportError:
    print("This script needs the 'markdown' package. Install it with:")
    print("    pip install markdown")
    sys.exit(1)

HELP_DIR = Path(__file__).parent
OUTPUT_PATH = HELP_DIR.parent / "help.json"
INDEX_PATH = HELP_DIR.parent / "index.html"
BEGIN_MARKER = "/* HELP_TOPICS:BEGIN */"
END_MARKER = "/* HELP_TOPICS:END */"
FILENAME_PATTERN = re.compile(r"^(\d{3})\s*(.*)\.md$", re.IGNORECASE)

# Applied to every fenced code block Markdown produces, so a plain ``` block
# in any .md file gets the same look the app's own hand-written examples
# already use.
CODE_BLOCK_STYLE = (
    'style="background:var(--bg-panel); padding:12px 14px; border-radius:8px; '
    'overflow-x:auto; font-size:13px; line-height:1.6;"'
)


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "topic"


def style_code_blocks(html):
    # Markdown's own fenced-code output is a bare <pre><code>...</code></pre>;
    # give the <pre> the same inline styling used everywhere else in the
    # app. Only ever matches a bare, attribute-less <pre> tag, so anything
    # already hand-styled (e.g. raw HTML written directly in a .md file) is
    # left alone rather than double-styled.
    return re.sub(r"<pre>", f"<pre {CODE_BLOCK_STYLE}>", html)


def compile_topic(path):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or not lines[0].strip():
        raise ValueError(f"{path.name} needs a title on its first line")
    title = lines[0].strip()
    body_source = "\n".join(lines[1:]).strip()
    body_html = markdown.markdown(body_source, extensions=["extra"])
    body_html = style_code_blocks(body_html)
    # A lone "{{setup-locally}}" line on its own gets wrapped in <p></p> by
    # Markdown like any other paragraph — but what the app substitutes in
    # its place is itself several paragraphs, which would nest <p> tags if
    # left wrapped. Unwrap it back to the bare token before it ever reaches
    # the app.
    body_html = body_html.replace("<p>{{setup-locally}}</p>", "{{setup-locally}}")
    return title, body_html


def embed_into_index(topics):
    """Rewrites the block between the markers in index.html. Returns True on
    success. Leaves index.html untouched (and says why) if it can't safely
    find exactly one pair of markers."""
    if not INDEX_PATH.exists():
        print(f"Note: {INDEX_PATH} not found — built-in help topics not updated.")
        return False
    html = INDEX_PATH.read_text(encoding="utf-8")
    if html.count(BEGIN_MARKER) != 1 or html.count(END_MARKER) != 1:
        print(f"Warning: couldn't find exactly one {BEGIN_MARKER} / {END_MARKER} pair in")
        print(f"{INDEX_PATH} — built-in help topics NOT updated. (Is this an older index.html?)")
        return False
    start = html.index(BEGIN_MARKER) + len(BEGIN_MARKER)
    end = html.index(END_MARKER)
    if end < start:
        print(f"Warning: markers out of order in {INDEX_PATH} — built-in help topics NOT updated.")
        return False
    # The topics land inside index.html's <script> tag, where any "</script>"
    # in a topic's text would end the script early and break the whole app.
    # Writing every "<" as the JavaScript escape \u003c (which reads back as
    # the same character) makes that impossible, whatever the topics contain.
    literal = json.dumps(topics, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    new_html = html[:start] + "\nconst HELP_TOPICS = " + literal + ";\n" + html[end:]
    # Write to a temporary file first, then swap it in, so an interruption
    # can never leave a half-written index.html behind.
    tmp_path = INDEX_PATH.with_name(INDEX_PATH.name + ".tmp")
    tmp_path.write_text(new_html, encoding="utf-8")
    os.replace(tmp_path, INDEX_PATH)
    return True


def main():
    files = sorted(
        (f for f in HELP_DIR.glob("*.md") if FILENAME_PATTERN.match(f.name)),
        key=lambda f: FILENAME_PATTERN.match(f.name).group(1),
    )
    if not files:
        print(f"No numbered .md files found in {HELP_DIR} (expected names like '010 Setup.md')")
        sys.exit(1)

    topics = []
    seen_ids = {}
    for path in files:
        match = FILENAME_PATTERN.match(path.name)
        number, rest = match.group(1), match.group(2)
        topic_id = slugify(rest) if rest else slugify(number)
        if topic_id in seen_ids:
            seen_ids[topic_id] += 1
            topic_id = f"{topic_id}-{seen_ids[topic_id]}"
        else:
            seen_ids[topic_id] = 1

        try:
            title, body_html = compile_topic(path)
        except ValueError as err:
            print(f"Skipping {path.name}: {err}")
            continue

        topics.append({"id": topic_id, "title": title, "bodyHtml": body_html})
        print(f"  {number}  {title}  ->  id: {topic_id}")

    if not topics:
        print("No valid topics compiled — help.json was not written.")
        sys.exit(1)

    OUTPUT_PATH.write_text(
        json.dumps({"topics": topics}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nWrote {len(topics)} topic(s) to {OUTPUT_PATH}")
    if embed_into_index(topics):
        print(f"Updated the built-in help topics in {INDEX_PATH}")


if __name__ == "__main__":
    main()

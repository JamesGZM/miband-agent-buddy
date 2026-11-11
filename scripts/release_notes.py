"""Print the changelog entry for a stable release tag."""
from pathlib import Path
import argparse
import re


def release_notes(changelog, tag):
    if not re.fullmatch(r'v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', tag):
        raise ValueError('Expected a stable vX.Y.Z tag')
    version = re.escape(tag[1:])
    match = re.search(r'^## \[' + version + r'\](?:[^\n]*)\n(.*?)(?=^## |\Z)', changelog, re.M | re.S)
    if not match:
        raise ValueError('Release tag has no changelog entry')
    notes = match.group(1).strip()
    # Changelog links must resolve from the release page, not its relative path.
    notes = re.sub(r'\]\((?!https?://|#)([^)]+)\)',
                   lambda m: '](https://github.com/JamesGZM/miband-agent-buddy/blob/' + tag + '/' + m.group(1) + ')', notes)
    return notes + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag')
    args = parser.parse_args()
    changelog = Path(__file__).resolve().parents[1] / 'CHANGELOG.md'
    try:
        print(release_notes(changelog.read_text(), args.tag), end='')
    except ValueError as error:
        parser.exit(1, str(error) + '\n')

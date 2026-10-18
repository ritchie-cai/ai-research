#!/usr/bin/env python3
"""Sort links alphabetically within each folder, preserving folder structure."""

import re
import html as htmllib
from dataclasses import dataclass, field

SRC = "bookmarks_7_12_2026.html"
DST = "bookmarks_7_12_2026.html"

H3_RE = re.compile(r'<DT>\s*<H3([^>]*)>(.*?)</H3>', re.IGNORECASE)
A_RE  = re.compile(r'<DT>\s*<A([^>]*)>(.*?)</A>', re.IGNORECASE)

@dataclass
class Link:
    raw_line: str
    title: str

@dataclass
class Folder:
    name: str
    raw_header_line: str
    children: list = field(default_factory=list)

def parse(lines):
    n = len(lines)
    def parse_dl(start):
        children = []
        i = start
        while i < n:
            s = lines[i].strip()
            if s.startswith('</DL>'):
                return children, i
            m = H3_RE.match(s)
            if m:
                name = htmllib.unescape(m.group(2))
                j = i + 1
                while j < n and lines[j].strip() == '':
                    j += 1
                if j < n and lines[j].strip().lower().startswith('<dl>'):
                    sub, close = parse_dl(j + 1)
                    children.append(Folder(name=name,
                                           raw_header_line=lines[i].rstrip('\n'),
                                           children=sub))
                    i = close + 1
                    continue
                else:
                    children.append(Folder(name=name,
                                           raw_header_line=lines[i].rstrip('\n'),
                                           children=[]))
                    i += 1
                    continue
            m = A_RE.match(s)
            if m:
                title = htmllib.unescape(m.group(2))
                children.append(Link(raw_line=lines[i].rstrip('\n'), title=title))
                i += 1
                continue
            i += 1
        return children, i

    # find first <DL> after <H1>
    for idx in range(len(lines)):
        if '<H1>' in lines[idx]:
            top_start = idx + 1
            break
    for idx in range(top_start, len(lines)):
        if lines[idx].strip().lower().startswith('<dl>'):
            children, _ = parse_dl(idx + 1)
            return children
    return []

def emit_sorted(node, depth, lines, sort_also_folders=False):
    """Recursively emit with sorted links."""
    if isinstance(node, Folder):
        lines.append('    ' * depth + node.raw_header_line.lstrip())
        lines.append('    ' * depth + '<DL><p>')
        # Separate links and subfolders
        links = [c for c in node.children if isinstance(c, Link)]
        folders = [c for c in node.children if isinstance(c, Folder)]
        # Sort links by title (case-insensitive), grouping by domain
        links.sort(key=lambda l: l.title.lower())
        # Sort folders by name too for consistency
        if sort_also_folders:
            folders.sort(key=lambda f: f.name.lower())
        for c in links + folders:
            emit_sorted(c, depth + 1, lines)
        lines.append('    ' * depth + '</DL><p>')
    elif isinstance(node, Link):
        lines.append('    ' * depth + node.raw_line.lstrip())

def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        text = f.read()
    full_lines = text.split('\n')

    # Find the preamble (before first <DL>) and postamble (after last </DL>)
    children = parse(full_lines)

    # Count original links
    orig_count = text.count('<A HREF')
    print(f"[orig] {orig_count} links")

    # Rebuild
    out = []
    # Preamble
    for line in full_lines:
        out.append(line)
        if line.strip().startswith('<DL>'):
            break

    # Emit sorted tree at depth 0
    for c in children:
        emit_sorted(c, 0, out)

    # Postamble - find the closing </DL></DL><p> pattern
    # Actually the root </DL> is not emitted by our function since it's the root.
    # The root was already emitted by the preamble. We need to close it.
    # The preamble ends right after the first <DL><p>. So we emit children at depth 0.
    # Then we need to close the root DL and the outer DL.
    out.append('</DL><p>')      # close root

    result = '\n'.join(out) + '\n'

    # Verify
    new_count = result.count('<A HREF')
    print(f"[new]  {new_count} links")
    if new_count != orig_count:
        print(f"[WARN] count mismatch!")
    else:
        print("[OK] counts match")

    with open(DST, 'w', encoding='utf-8') as f:
        f.write(result)

if __name__ == '__main__':
    main()

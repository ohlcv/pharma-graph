#!/usr/bin/env python3
"""Fix chapter/section entry node labels: split 第X章/节 onto own line using | block scalar."""

import re, os
from pathlib import Path

BASE = Path("/Users/meow/Desktop/Project/pharma-graph/public/content/药学专业知识二")

# Find all chapter/section entry files via os.walk
entry_files = []
for root, dirs, files in os.walk(BASE):
    for f in files:
        if not f.endswith('.md'):
            continue
        fp = Path(root) / f
        rel = fp.relative_to(BASE)
        depth = len(rel.parts)
        # Chapter entry: depth 0, starts with 第 and contains 章/节
        if depth == 0 and re.match(r'第.+章', f):
            entry_files.append(fp)
        # Section entry: filename starts with 第 and contains 节
        elif depth == 1 and re.match(r'第.+节', f):
            entry_files.append(fp)
        elif depth == 2 and re.match(r'第.+节[^/]*\.md$', f):
            entry_files.append(fp)

print(f"Found {len(entry_files)} entry files")

ordinal_pat = r"第[一二三四五六七八九十百零\d]+[章节]"

fixed = []
for fp in sorted(entry_files):
    raw = fp.read_text(encoding="utf-8")
    new_raw = raw
    changed = False

    # Root-level label: label: 第X章/节 名字
    m = re.search(rf"^(label: )(({ordinal_pat})\s+)(?P<name>.+)$", raw, re.MULTILINE)
    if m:
        name = m.group("name")
        if "|" not in name and not name.startswith("|"):
            ordinal = m.group(2).rstrip()
            new_raw = re.sub(
                rf"^(label: )({ordinal_pat}\s+)({re.escape(name)})$",
                rf"label: |\n  {ordinal}\n  {name}",
                raw, flags=re.MULTILINE)
            changed = True

    # Indented (data:-wrapped) label:   label: 第X章/节 名字
    if not changed:
        m = re.search(rf"^(\s+label: )(({ordinal_pat})\s+)(?P<name>.+)$", raw, re.MULTILINE)
        if m:
            name = m.group("name")
            if "|" not in name and not name.startswith("|"):
                ordinal = m.group(2).rstrip()
                new_raw = re.sub(
                    rf"^(\s+label: )({ordinal_pat}\s+)({re.escape(name)})$",
                    rf"  label: |\n    {ordinal}\n    {name}",
                    raw, flags=re.MULTILINE)
                changed = True

    if changed:
        fp.write_text(new_raw, encoding="utf-8")
        fixed.append(fp.name)

print(f"\nFixed {len(fixed)} files:")
for n in fixed:
    print(f"  {n}")

#!/usr/bin/env python3
"""Robust fix: remove duplicate edges_out from inside data: block,
and remove *alias lines from the top-level edges_out block."""

import re
import sys
from pathlib import Path

BASE_DIR = Path(r"c:\Users\GALAX\Desktop\pharma-graph")

# Files still needing fixes (the "NO CHANGE" ones + any others grep still finds)
# We dynamically find all files with & or * in content/*.md
def find_anchor_files():
    import os
    results = []
    content_dir = BASE_DIR / "content"
    for root, dirs, files in os.walk(content_dir):
        for fname in files:
            if fname.endswith(".md"):
                fpath = Path(root) / fname
                try:
                    # Try GBK first
                    with open(fpath, "r", encoding="gbk", errors="replace") as f:
                        content = f.read()
                except:
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                            content = f.read()
                    except:
                        continue
                if re.search(r'&[a-zA-Z][a-zA-Z0-9]*', content) or \
                   re.search(r'^\s*-\s+\*[a-zA-Z][a-zA-Z0-9]*', content, re.MULTILINE):
                    results.append(str(fpath))
    return results

def fix_file(path: str) -> bool:
    fpath = Path(path)
    if not fpath.exists():
        return False

    # Try encoding
    for enc in ("gbk", "utf-8"):
        try:
            with open(fpath, "r", encoding=enc) as f:
                original = f.read()
            break
        except UnicodeDecodeError:
            continue
    else:
        return False

    # Step 1: Remove the *alias lines from edges_out (inside frontmatter)
    # Pattern: lines like "  - *a1" or "  - *a1  " that are inside edges_out block
    # We need to be careful: only remove standalone alias lines within the frontmatter

    # Step 2: The key issue is finding and removing data.edges_out while keeping top-level edges_out
    # Strategy: find the first "---" (start), then find the FIRST closing "---"
    # Everything between them is the frontmatter.

    lines = original.split("\n")
    fm_start = -1
    fm_end = -1
    for i, line in enumerate(lines):
        if line.strip() == "---":
            if fm_start == -1:
                fm_start = i
            elif fm_end == -1:
                fm_end = i
                break

    if fm_start == -1 or fm_end == -1:
        return False

    fm_lines = lines[fm_start:fm_end + 1]

    # Analyze: find data: block depth, find data.edges_out, find top-level edges_out
    # Data block starts at depth 0, depth indent = 2 spaces
    # We track when we're inside data.edges_out and skip those lines

    in_data = False
    data_depth = -1
    in_data_edges = False
    in_top_edges = False
    new_fm_lines = []
    anchor_pattern = re.compile(r'^(\s*)-\s*(\*[a-zA-Z][a-zA-Z0-9]*)\s*$')

    i = 0
    while i < len(fm_lines):
        line = fm_lines[i]
        stripped = line.strip()

        # Entering data: block
        if stripped == "data:":
            in_data = True
            data_depth = 0
            new_fm_lines.append(line)
            i += 1
            continue

        if in_data:
            current_depth = len(line) - len(line.lstrip()) if line else 0

            # Exiting data block (at same or lower depth than data: which is 0)
            if stripped and current_depth <= data_depth and stripped not in ("data:"):
                in_data = False
                in_data_edges = False

        # Entering data.edges_out
        if in_data and stripped.startswith("edges_out:"):
            in_data_edges = True
            i += 1
            continue

        # Inside data.edges_out: skip until we exit
        if in_data_edges:
            current_depth = len(line) - len(line.lstrip()) if line else 0
            # If we hit a non-list item at data block level (depth <= data_depth+1), exit
            if stripped and current_depth <= data_depth + 1 and not stripped.startswith("-"):
                in_data_edges = False
                new_fm_lines.append(line)
            elif stripped.startswith("-"):
                # Skip this list item
                pass
            else:
                # Non-list content, exit edges_out
                in_data_edges = False
                new_fm_lines.append(line)
            i += 1
            continue

        # Top-level edges_out marker
        if not in_data and stripped.startswith("edges_out:"):
            in_top_edges = True
            new_fm_lines.append(line)
            i += 1
            continue

        # Inside top-level edges_out: skip *alias lines
        if in_top_edges:
            m = anchor_pattern.match(stripped)
            if m:
                # Skip alias line
                i += 1
                continue
            if stripped and not stripped.startswith("-"):
                in_top_edges = False
            new_fm_lines.append(line)
            i += 1
            continue

        new_fm_lines.append(line)
        i += 1

    new_content = "\n".join(lines[:fm_start] + new_fm_lines + lines[fm_end + 1:])

    if new_content == original:
        return False

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(new_content)
    return True

if __name__ == "__main__":
    files = find_anchor_files()
    print(f"Found {len(files)} files with anchor/alias issues")
    fixed = 0
    for f in files:
        rel = f.replace(str(BASE_DIR) + "\\", "").replace(str(BASE_DIR) + "/", "")
        try:
            ok = fix_file(f)
            if ok:
                print(f"  FIXED: {rel}")
                fixed += 1
            else:
                print(f"  NO CHANGE: {rel}")
        except Exception as e:
            print(f"  ERROR: {rel}: {e}")
    print(f"\nDone. Fixed {fixed}/{len(files)} files.")

import os

b2_root = r"c:\Users\GALAX\Desktop\pharma-graph\content\药学专业知识二"

results = []
for root, dirs, files in os.walk(b2_root):
    for fname in sorted(files):
        if not fname.endswith('.md'):
            continue
        fpath = os.path.join(root, fname)
        relpath = os.path.relpath(fpath, b2_root)
        with open(fpath, 'rb') as f:
            content = f.read()

        lines = content.split(b'\n')
        headings_found = []
        for line in lines:
            if line.startswith(b'## '):
                headings_found.append(line.decode('utf-8', errors='replace'))

        # Check if first heading is standard
        if headings_found and not headings_found[0].startswith('## 它是什么？'):
            results.append((relpath, 'Q1', headings_found[0][:80]))

        # Check Q2
        if len(headings_found) > 1 and not headings_found[1].startswith('## 它有什么用，为什么要理解它？'):
            results.append((relpath, 'Q2', headings_found[1][:80]))

        # Check Q3
        if len(headings_found) > 2 and not headings_found[2].startswith('## 它主要和什么有关？'):
            results.append((relpath, 'Q3', headings_found[2][:80]))

        # Check Q4
        if len(headings_found) > 3 and not headings_found[3].startswith('## 它通常在什么阶段出现或被使用？'):
            results.append((relpath, 'Q4', headings_found[3][:80]))

        # Check Q5
        if len(headings_found) > 4 and not headings_found[4].startswith('## 它在整套框架里放在哪里？'):
            results.append((relpath, 'Q5', headings_found[4][:80]))

print(f'Remaining non-standard headings: {len(results)}')
for path, q, heading in results[:30]:
    print(f'  Q{q} in {path}: {heading}')
if len(results) > 30:
    print(f'  ... and {len(results) - 30} more')

# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\GALAX\Desktop\pharma-graph\docs\frontmatter.md', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

replacements = [
    (u'| \u2705 `concave-hexagon` | \u51f9\u516d\u8fb9\u5f62 | \u516d\u8fb9\u5f62\u53f3\u4fa7\u5185\u5f2f\uff0c\u65b9\u5411\u611f | `route` \u2014',
     '| `concave-hexagon` | \u51f9\u516d\u8fb9\u5f62 | \u516d\u8fb9\u5f62\u53f3\u4fa7\u5185\u5f2f\uff0c\u65b9\u5411\u611f | \u2014 |'),
    (u'| \u2705 `tag` | \u6807\u7b7e\u5f62 | \u77e9\u5f62\u5de6\u4fa7\u5e26\u4e09\u89d2\u5f62\u5c16\u89d2 | `module` \u2014',
     '| `tag` | \u6807\u7b7e\u5f62 | \u77e9\u5f62\u5de6\u4fa7\u5e26\u4e09\u89d2\u5f62\u5c16\u89d2 | \u2014 |'),
    (u'| \u2705 `round-tag` | \u5706\u89d2\u6807\u7b7e\u5f62 | tag \u7684\u56db\u89d2\u5706\u6da1\u7248\u672c | `section` \u2014',
     '| `round-tag` | \u5706\u89d2\u6807\u7b7e\u5f62 | tag \u7684\u56db\u89d2\u5706\u6da1\u7248\u672c | \u2014 |'),
]

for old, new in replacements:
    found = False
    for i in range(len(lines)):
        if lines[i] == old:
            lines[i] = new
            print(f'Fixed line {i+1}')
            found = True
            break
    if not found:
        print(f'NOT FOUND')

with open(r'C:\Users\GALAX\Desktop\pharma-graph\docs\frontmatter.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('Done')

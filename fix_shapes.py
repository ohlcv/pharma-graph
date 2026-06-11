# -*- coding: utf-8 -*-
with open(r'C:\Users\GALAX\Desktop\pharma-graph\docs\frontmatter.md', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

changed = 0
for i in range(37, len(lines)):
    if lines[i].startswith('||') and lines[i].strip() != '':
        lines[i] = lines[i][1:]
        changed += 1

replacements = [
    ('| `triangle` | 三角形 | 三角形 | — |', '| ✅ `triangle` | 三角形 | 正三角形，方向汇聚感 | `route` — 信号通路、受体家族 |'),
    ('| ✅ `concave-hexagon` | 凹六边形 | 六边形右侧内凹，方向感 | `route` —', '| `concave-hexagon` | 凹六边形 | 六边形右侧内凹，方向感 | — |'),
    ('| ✅ `tag` | 标签形 | 矩形左侧带三角形尖角 | `module` —', '| `tag` | 标签形 | 矩形左侧带三角形尖角 | — |'),
    ('| ✅ `round-tag` | 圆角标签形 | tag 的四角圆润版本 | `section` —', '| `round-tag` | 圆角标签形 | tag 的四角圆润版本 | — |'),
    ('| `pentagon` | 五边形 | 正五边形 | — |', '| ✅ `pentagon` | 五边形 | 正五边形，稳定结构感 | `module` — 模块、入口、章节 |'),
    ('| `octagon` | 八边形 | 正八边形 | — |', '| ✅ `octagon` | 八边形 | 正八边形，分类聚集感 | `section` — 标签型知识点 |'),
]

for old, new in replacements:
    for i in range(len(lines)):
        if lines[i] == old:
            lines[i] = new
            print(f'Fixed line {i+1}')
            break

with open(r'C:\Users\GALAX\Desktop\pharma-graph\docs\frontmatter.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print(f'Done, removed {changed} double-pipe prefixes')

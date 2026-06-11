# -*- coding: utf-8 -*-
path = r'C:\Users\GALAX\Desktop\pharma-graph\docs\frontmatter.md'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Build new table body - replace everything between the header row and the note row
# Find the table bounds
lines = content.split('\n')
header_idx = None
note_idx = None
for i, line in enumerate(lines):
    if '|形状标识 |形状预览（文字描述）|中文含义|映射本质' in line.replace(' ', ''):
        header_idx = i
    if i > 38 and '当前项目共使用' in line:
        note_idx = i
        break

print(f'header at {header_idx}, note at {note_idx}')

# New table rows
new_rows = [
    '| \u2705 `ellipse` | 椭圆 | 椭圆，最通用的形状 | `notion` \u2014 概念、理论、术语 |',
    '| \u2705 `triangle` | 三角形 | 正三角形，化学基础感 | `substance` \u2014 成分、辅料、指标 |',
    '| `round-triangle` | 圆角三角形 | 三角圆润的三角形 | \u2014 |',
    '| \u2705 `rectangle` | 矩形 | 标准直角矩形，线性汇聚 | `route` \u2014 信号通路、受体家族 |',
    '| \u2705 `round-rectangle` | 圆角矩形 | 四角圆润的矩形 | `medication` \u2014 具体药物或制剂 |',
    '| `bottom-round-rectangle` | 底圆矩形 | 仅底部两角圆润 | \u2014 |',
    '| `cut-rectangle` | 切角矩形 | 右上/左下角被切掉 | \u2014 |',
    '| `barrel` | 桶形 | 横向拉伸的六边形（沙漏状） | \u2014 |',
    '| `rhomboid` | 菱形（横向） | 斜向平行四边形 | \u2014 |',
    '| `right-rhomboid` | 右斜菱形 | 向右倾斜的菱形 | \u2014 |',
    '| `diamond` | 菱形 | 正方形旋转 45\xb0，警示感强 | \u2014 |',
    '| `round-diamond` | 圆角菱形 | 四角圆润的菱形 | \u2014 |',
    '| \u2705 `pentagon` | 五边形 | 正五边形，稳定结构感 | `illness` \u2014 疾病或病理状态 |',
    '| \u2705 `round-pentagon` | 圆角五边形 | 五角圆润的五边形 | `module` \u2014 模块、入口、章节 |',
    '| `hexagon` | 六边形 | 正六边形，化学结构感 | \u2014 |',
    '| `round-hexagon` | 圆角六边形 | 六角圆润的六边形 | \u2014 |',
    '| `concave-hexagon` | 凹六边形 | 六边形右侧内凹，方向感 | \u2014 |',
    '| `heptagon` | 七边形 | 正七边形 | \u2014 |',
    '| `round-heptagon` | 圆角七边形 | 七角圆润的七边形 | \u2014 |',
    '| \u2705 `octagon` | 八边形 | 正八边形，分类聚集感 | `process` \u2014 过程、机制、体内行为 |',
    '| `round-octagon` | 圆角八边形 | 八角圆润的八边形 | \u2014 |',
    '| `star` | 星形 | 五角星 | \u2014 |',
    '| \u2705 `tag` | 标签形 | 矩形左侧带三角形尖角 | `section` \u2014 标签型知识点 |',
    '| `round-tag` | 圆角标签形 | tag 的四角圆润版本 | \u2014 |',
    '| `vee` | V 形 | 向下开口的弧形 | \u2014 |',
    '| `polygon` | 自定义多边形 | 通过 `shape-polygon-points` 自定义 | \u2014 |',
]

# Replace rows between header+1 and note_idx-1
new_content = '\n'.join(lines[:header_idx + 1]) + '\n' + '\n'.join(new_rows) + '\n' + '\n'.join(lines[note_idx:])

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print('done')

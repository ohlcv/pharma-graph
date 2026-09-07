#!/usr/bin/env python3
"""
修复药学专业知识一中 chapter 级别文件的 location 结构。

正确的 chapter 标题应该从 label 字段获取（去掉"第X章"前缀后的内容）。
"""

import os
import re

def get_chapter_title_from_label(label: str) -> str:
    """
    从 label 提取完整的 chapter 标题。
    例如："第七章 口服制剂与临床应用" → "第七章 口服制剂与临床应用"
    """
    return label  # label 就是完整的标题


def fix_chapter_file(filepath: str) -> tuple[bool, str]:
    """
    修复 chapter 级别文件的 location 结构。
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception as e:
        return False, f"读取失败: {e}"

    if not lines or not lines[0].startswith('---'):
        return False, "无 frontmatter"

    # 找到 frontmatter 范围
    fm_end = None
    for i in range(1, len(lines)):
        if lines[i].startswith('---') and lines[i].strip() == '---':
            fm_end = i
            break
    
    if fm_end is None:
        return False, "找不到 frontmatter 结束"

    # 解析字段
    fields = {}
    for i in range(fm_end):
        line = lines[i]
        m = re.match(r'^(\s+)(\w+):\s*(.*?)\s*$', line)
        if m:
            indent = len(m.group(1))
            field = m.group(2)
            value = m.group(3).strip()
            if indent <= 4:
                fields[field] = (i, value, line)
    
    chapter_val = fields.get('chapter', (None, '', ''))[1] if 'chapter' in fields else ''
    label_val = fields.get('label', (None, '', ''))[1] if 'label' in fields else ''
    
    # 检查 chapter 是否包含 part 信息（如"第一章 第一篇 药剂学"）
    has_part = False
    found_part = None
    for part in ["第一篇", "第二篇", "第三篇", "第四篇", "第五篇"]:
        if part in chapter_val:
            has_part = True
            found_part = chapter_val.split(part)[0].strip() + " " + part
            if part == "第一篇":
                found_part = "第一篇 药剂学"
            elif part == "第二篇":
                found_part = "第二篇 药理与毒理学"
            elif part == "第三篇":
                found_part = "第三篇 药物化学"
            elif part == "第四篇":
                found_part = "第四篇 药动学"
            elif part == "第五篇":
                found_part = "第五篇 生命药学"
            break
    
    if not has_part:
        return False, "chapter 不包含 part，无需修复"
    
    # 检查是否已经有 part 字段
    if 'part' in fields:
        return False, "已有 part 字段"
    
    # 正确的 chapter 标题 = label（完整的）
    correct_chapter = label_val
    if not correct_chapter:
        return False, "无 label，无法确定正确的 chapter"
    
    # 执行替换
    new_lines = []
    for i, line in enumerate(lines):
        new_lines.append(line)
        
        # 在 book 行之后插入 part
        if 'book:' in line and 'part:' not in line:
            indent = len(line) - len(line.lstrip())
            new_lines.append(f'{" " * indent}part: {found_part}\n')
        
        # 修复 chapter
        if i == fields['chapter'][0]:
            indent = len(line) - len(line.lstrip())
            new_lines[-1] = f'{" " * indent}chapter: {correct_chapter}\n'
        
        # 删除 section 行
        if 'section:' in line:
            new_lines.pop()
    
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        return False, f"写入失败: {e}"

    return True, f'chapter: "{chapter_val}" → "{correct_chapter}", 添加 part: {found_part}'


def main():
    files_to_fix = [
        # 第一篇 药剂学
        "public/content/药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md",
        "public/content/药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md",
        "public/content/药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md",
        "public/content/药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md",
        # 第二篇 药理与毒理学
        "public/content/药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md",
        "public/content/药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md",
        # 第三篇 药物化学
        "public/content/药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md",
        # 第四篇 药动学
        "public/content/药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md",
        # 第五篇 生命药学
        "public/content/药学专业知识一/第五篇 生命药学/第二章 生命药学.md",
    ]
    
    fixed = 0
    errors = []
    
    for filepath in files_to_fix:
        if not os.path.exists(filepath):
            errors.append(f"{filepath}: 文件不存在")
            continue
            
        changed, msg = fix_chapter_file(filepath)
        if changed:
            fixed += 1
            print(f"[FIXED] {filepath}")
            print(f"        {msg}")
        else:
            errors.append(f"{filepath}: {msg}")
    
    print(f"\n{'='*60}")
    print(f"修复完成！共修复 {fixed} 个文件")
    if errors:
        print(f"跳过/错误 {len(errors)} 个:")
        for e in errors:
            print(f"  - {e}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

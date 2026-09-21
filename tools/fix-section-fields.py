#!/usr/bin/env python3
"""
修复 md 文件中 chapter 和 section 字段，添加"第X章/节"前缀。

问题：chapter/section 字段如"精神与中枢神经系统用药"缺少"第X章/节"前缀，
     导致 extractSectionNumber() 返回 999，排序错误。

修复：将 chapter/section 统一为完整格式（包含"第X章/节"前缀）。
"""

import os
import re

CONTENT_DIR = "public/content"


def extract_number_prefix(text: str) -> str | None:
    """从文本提取"第X章"或"第X节"前缀。"""
    if not text:
        return None
    match = re.match(r'^(第[一二三四五六七八九十百千零\d]+[章节])', text)
    if match:
        return match.group(1)
    return None


def get_parent_name(filepath: str) -> str:
    return os.path.basename(os.path.dirname(filepath))


def get_grandparent_name(filepath: str) -> str:
    return os.path.basename(os.path.dirname(os.path.dirname(filepath)))


def is_section_folder(name: str) -> bool:
    return bool(re.match(r'^(第[一二三四五六七八九十百千零\d]+节)\s+', name))


def is_chapter_folder(name: str) -> bool:
    return bool(re.match(r'^(第[一二三四五六七八九十百千零\d]+章)\s+', name))


def process_file(filepath: str) -> tuple[bool, list[str]]:
    """处理单个文件，修复 chapter 和 section 字段。"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except Exception as e:
        return False, [f"读取失败: {e}"]

    if not lines or not lines[0].startswith('---'):
        return False, ["无 frontmatter"]

    # 找到 frontmatter 范围
    fm_end = None
    for i in range(1, len(lines)):
        if lines[i].startswith('---') and lines[i].strip() == '---':
            fm_end = i
            break
    
    if fm_end is None:
        return False, ["找不到 frontmatter 结束"]

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
    section_val = fields.get('section', (None, '', ''))[1] if 'section' in fields else ''
    label_val = fields.get('label', (None, '', ''))[1] if 'label' in fields else ''
    
    new_chapter = None
    new_section = None
    
    # 计算新的 chapter
    if chapter_val and not extract_number_prefix(chapter_val):
        parent = get_parent_name(filepath)
        if is_section_folder(parent):
            # 父文件夹是 section，chapter 前缀来自祖父文件夹
            grandparent = get_grandparent_name(filepath)
            if is_chapter_folder(grandparent):
                new_chapter = grandparent
        elif is_chapter_folder(parent):
            # 父文件夹是 chapter
            new_chapter = parent
        elif label_val and extract_number_prefix(label_val):
            # 从 label 提取（但要确保不是 section 级别的 label）
            prefix = extract_number_prefix(label_val)
            if prefix.endswith('章'):
                new_chapter = f"{prefix} {chapter_val}"
    
    # 计算新的 section
    if section_val and not extract_number_prefix(section_val):
        parent = get_parent_name(filepath)
        if is_section_folder(parent):
            # 父文件夹是 section
            new_section = parent
        elif is_chapter_folder(parent):
            # 父文件夹是 chapter，section 前缀来自 label
            if label_val and extract_number_prefix(label_val):
                prefix = extract_number_prefix(label_val)
                if prefix.endswith('节'):
                    new_section = f"{prefix} {section_val}"
        elif label_val and extract_number_prefix(label_val):
            prefix = extract_number_prefix(label_val)
            if prefix.endswith('节'):
                new_section = f"{prefix} {section_val}"
    
    if not new_chapter and not new_section:
        return False, ["已是完整格式或无 chapter/section"]
    
    # 执行替换
    modified = []
    
    if new_chapter and 'chapter' in fields:
        line_idx, _, raw_line = fields['chapter']
        indent = len(raw_line) - len(raw_line.lstrip())
        lines[line_idx] = f'{" " * indent}chapter: {new_chapter}\n'
        modified.append(f'chapter: "{chapter_val}" → "{new_chapter}"')
    
    if new_section and 'section' in fields:
        line_idx, _, raw_line = fields['section']
        indent = len(raw_line) - len(raw_line.lstrip())
        lines[line_idx] = f'{" " * indent}section: {new_section}\n'
        modified.append(f'section: "{section_val}" → "{new_section}"')
    
    if not modified:
        return False, ["无需修改"]
    
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(lines)
    except Exception as e:
        return False, [f"写入失败: {e}"]

    return True, modified


def main():
    changed_files = []
    skipped_files = []
    error_files = []

    for root, _, files in os.walk(CONTENT_DIR):
        for filename in files:
            if not filename.endswith(".md"):
                continue

            filepath = os.path.join(root, filename)
            changed, msgs = process_file(filepath)

            if changed:
                changed_files.append((filepath, msgs))
                print(f"[FIXED] {filepath}")
                for msg in msgs:
                    print(f"        {msg}")
            elif msgs[0] == "已是完整格式或无 chapter/section":
                skipped_files.append(filepath)
            else:
                error_files.append((filepath, msgs[0]))

    print(f"\n{'='*60}")
    print(f"修复完成！共修复 {len(changed_files)} 个文件")
    print(f"跳过 {len(skipped_files)} 个（已是完整格式）")
    if error_files:
        print(f"错误 {len(error_files)} 个:")
        for path, reason in error_files[:10]:
            print(f"  - {path}: {reason}")
        if len(error_files) > 10:
            print(f"  ... 还有 {len(error_files) - 10} 个")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

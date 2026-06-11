import re

content = open(r'c:\Users\GALAX\Desktop\pharma-graph\src\ui\styles\components.css', encoding='utf-8').read()
lines = content.split('\n')
depth = 0
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    # Track @layer blocks
    if stripped.startswith('@layer'):
        print(f"Line {i}: @layer open: {stripped[:60]}")
    # Track brace changes
    opens = line.count('{')
    closes = line.count('}')
    if opens or closes:
        depth += opens
        depth -= closes
        if depth < 0:
            print(f"Line {i}: depth negative! ({depth}) {stripped[:80]}")
        if depth > 0:
            print(f"Line {i}: UNCLOSED at depth {depth}: {stripped[:80]}")

print(f"\nFinal depth: {depth}")
print(f"Open: {content.count('{')}, Close: {content.count('}')}")

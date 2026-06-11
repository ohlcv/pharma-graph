content = open(r'c:\Users\GALAX\Desktop\pharma-graph\src\ui\styles\components.css', encoding='utf-8').read()
lines = content.split('\n')
depth = 0
max_depth = 0
max_line = 0
for i, line in enumerate(lines, 1):
    # Count only actual braces, ignoring @layer declarations
    stripped = line
    # Remove @layer declarations from brace counting
    # @layer foo {  → remove the { if on same line as @layer
    clean_line = stripped
    if stripped.strip().startswith('@layer'):
        # Remove the { that closes @layer if on same line
        clean_line = stripped.replace('{', ' ', 1)
    opens = clean_line.count('{')
    closes = clean_line.count('}')
    depth += opens
    max_depth = max(max_depth, depth)
    if depth > max_depth:
        max_line = i
    depth -= closes
    if depth < 0:
        print(f"Line {i}: went negative at: {stripped[:80]}")
        depth = 0

print(f"Final depth: {depth}")
print(f"Max depth: {max_depth} at line {max_line}")
print(f"Total opens (in @layer lines): {content.count('@layer')}")

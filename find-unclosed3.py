content = open(r'c:\Users\GALAX\Desktop\pharma-graph\src\ui\styles\components.css', encoding='utf-8').read()
lines = content.split('\n')

# Count real braces per line (excluding @layer foo { type declarations)
depth = 0
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if stripped.startswith('@layer') and '{' in stripped:
        # @layer foo { ... } - the { is part of the layer, not a selector block
        # After @layer foo { we ARE inside a layer. The closing } of the layer is the one
        # that matches the @layer { opening.
        # So we should count @layer { as +1 depth, and the } that closes it as -1.
        pass  # handled below
    opens = stripped.count('{')
    closes = stripped.count('}')
    if opens or closes:
        print(f"Line {i} (d={depth}->{depth+opens-closes}): {stripped[:70]}")
    depth += opens
    depth -= closes

print(f"\nFinal depth: {depth}")
print(f"Total opens: {content.count('{')}, closes: {content.count('}')}")

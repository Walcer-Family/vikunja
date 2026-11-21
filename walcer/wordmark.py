# Converts a word to SVG path data using Vikunja's bundled Quicksand font,
# so the logo needs no font at runtime. Usage: python3 wordmark.py Tasks 700 [font]
import sys, glob, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
word, wght = sys.argv[1], float(sys.argv[2])
fontfile = sys.argv[3] if len(sys.argv) > 3 else glob.glob('../frontend/src/assets/fonts/Quicksand*.woff2')[0]
f = TTFont(fontfile)
f = instantiateVariableFont(f, {'wght': wght})
gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
upm = f['head'].unitsPerEm
cap = f['OS/2'].sCapHeight
pen = SVGPathPen(gs)
x = 0
for ch in word:
    g = cmap[ord(ch)]
    gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, cap)))  # flip y, baseline at cap height
    x += hmtx[g][0]
print(json.dumps({'d': pen.getCommands(), 'width': x, 'cap': cap, 'upm': upm}))

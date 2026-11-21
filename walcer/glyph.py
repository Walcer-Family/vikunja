import sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
def glyph(path, ch='W', axes=None, box=100, pad=18):
    f = TTFont(path)
    if 'fvar' in f:
        a = {x.axisTag: x.defaultValue for x in f['fvar'].axes}
        a.update(axes or {})
        f = instantiateVariableFont(f, a)
    gs = f.getGlyphSet(); g = f.getBestCmap()[ord(ch)]
    bp = BoundsPen(gs); gs[g].draw(bp); x0,y0,x1,y1 = bp.bounds
    s = (box-2*pad)/max(x1-x0, y1-y0)
    w,h=(x1-x0)*s,(y1-y0)*s
    tx = (box-w)/2 - x0*s; ty = (box+h)/2 + y0*s
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}")
    gs[g].draw(TransformPen(pen,(s,0,0,-s,tx,ty)))
    return pen.getCommands()
if __name__=='__main__':
    # python3 glyph.py fonts/PlayfairDisplay.ttf W 700  -> path in a 100x100 box
    font, ch, w = sys.argv[1], sys.argv[2], float(sys.argv[3])
    print(glyph(font, ch, {'wght': w}))

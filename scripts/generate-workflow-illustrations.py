#!/usr/bin/env python3
"""기존 ToonStudio 아트와 설명 도형을 합성하는 로컬 이미지 생성기."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'apps/web/public/brand/illustrated-20260928'
OUTPUT = ROOT / '.qa/workflow-composition'
SIZE = (960, 600)
INK, LINE, CYAN, VIOLET, PAPER = '#111a31', '#536084', '#7ee5ed', '#bb9cfa', '#f1f2ff'

def background():
    image = Image.new('RGB', SIZE, '#080e1d')
    glow = Image.new('RGB', SIZE, '#080e1d')
    draw = ImageDraw.Draw(glow)
    draw.ellipse((320, -180, 1140, 460), fill='#372361')
    draw.ellipse((-250, 220, 600, 1000), fill='#143a51')
    image = Image.blend(image, glow.filter(ImageFilter.GaussianBlur(110)), .68)
    draw = ImageDraw.Draw(image)
    for x in range(-400, 1300, 100): draw.line((x, 600, x+380, 0), fill='#1a2540', width=1)
    for y in range(60, 601, 90): draw.line((0, y, 960, y), fill='#17243a', width=1)
    return image

def box(image, rect, fill=INK, edge=LINE, radius=18, width=2):
    ImageDraw.Draw(image).rounded_rectangle(rect, radius=radius, fill=fill, outline=edge, width=width)

def art(image, name, rect, radius=10):
    x, y, right, bottom = rect
    with Image.open(SOURCE / f'{name}.webp') as opened:
        thumb = ImageOps.fit(opened.convert('RGB'), (right-x, bottom-y), method=Image.Resampling.LANCZOS)
    mask = Image.new('L', thumb.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, thumb.width-1, thumb.height-1), radius=radius, fill=255)
    image.paste(thumb, (x, y), mask)

def line(image, points, fill=CYAN, width=5):
    ImageDraw.Draw(image).line(points, fill=fill, width=width, joint='curve')

def arrow(image, start, end, fill=CYAN):
    import math
    x, y = end; angle = math.atan2(y-start[1], x-start[0])
    line(image, [start, end], fill, 7)
    for turn in [-.55, .55]:
        line(image, [(x-22*math.cos(angle+turn), y-22*math.sin(angle+turn)), end], fill, 7)

def bars(image, x, y, widths, color=LINE, gap=22):
    for i, width in enumerate(widths): box(image, (x, y+i*gap, x+width, y+i*gap+7), color, color, 3)

def pane(image, x, y, w, h):
    box(image, (x+9, y+16, x+w+9, y+h+16), '#050a16', '#050a16', 22)
    box(image, (x, y, x+w, y+h))
    line(image, [(x+14, y+39), (x+w-14, y+39)], '#364064', 2)
    for i, color in enumerate([VIOLET, CYAN, '#e78abb']): ImageDraw.Draw(image).ellipse((x+18+i*17, y+16, x+25+i*17, y+23), fill=color)

def check(image, x, y, radius=39, color='#70e5bc'):
    ImageDraw.Draw(image).ellipse((x-radius, y-radius, x+radius, y+radius), fill='#103e3c', outline=color, width=3)
    line(image, [(x-radius*.45, y), (x-radius*.1, y+radius*.33), (x+radius*.48, y-radius*.35)], color, 7)

def sheet(image, x, y, w=280, h=370):
    box(image, (x, y, x+w, y+h), '#e6e8f2', '#e6e8f2', 12)
    art(image, 'canvas-noir', (x+14, y+15, x+w-14, y+int(h*.62)), 5)
    art(image, 'storyboard', (x+14, y+int(h*.65), x+w-14, y+h-15), 5)

def planning(image):
    box(image, (80, 66, 444, 525), '#e5e5f1', '#d4b5fb', 18)
    art(image, 'hero', (108, 97, 230, 237)); bars(image, 253, 105, [155, 120, 150, 95, 140], '#5b5a84', 25)
    bars(image, 110, 270, [280, 305, 245, 295, 180, 275, 220], '#747490', 28)
    line(image, [(612, 180), (780, 318), (570, 440), (612, 180)], CYAN, 4)
    for name, x, y in [('hero', 545, 83), ('character-blue', 723, 253), ('character-pink', 501, 386)]:
        box(image, (x-5, y-5, x+139, y+143), INK, VIOLET, 18); art(image, name, (x, y, x+134, y+138));
    arrow(image, (425, 318), (496, 318)); line(image, [(157, 480), (329, 314)], '#17223e', 15)

def storyboard(image):
    pane(image, 62, 103, 217, 351); bars(image, 84, 159, [145, 170, 132, 155, 162, 120, 153, 113], '#9dabc8', 31)
    arrow(image, (296, 285), (363, 285)); pane(image, 385, 47, 510, 495)
    for i, name in enumerate(['background-city', 'canvas-noir', 'hero', 'project-romance']):
        x, y = 408+(i%2)*236, 104+(i//2)*208
        art(image, name, (x, y, x+213, y+179)); box(image, (x+7, y+8, x+43, y+25), PAPER, PAPER, 3)
    line(image, [(516, 295), (754, 295), (754, 311), (516, 311)], CYAN, 4)

def creation(image):
    pane(image, 48, 85, 576, 417); art(image, 'hero', (76, 144, 595, 469))
    gray = ImageOps.grayscale(image.crop((76, 144, 320, 469))).convert('RGB'); image.paste(gray, (76, 144))
    line(image, [(320, 144), (320, 469)], CYAN, 4); line(image, [(310, 438), (505, 224)], '#d1bcff', 17)
    pane(image, 670, 148, 231, 347); d = ImageDraw.Draw(image); d.ellipse((749, 202, 819, 272), outline=CYAN, width=4)
    for points in [[(782, 274), (782, 364), (744, 436)], [(782, 364), (827, 436)], [(715, 329), (782, 286), (850, 329)], [(749, 291), (810, 355), (750, 355), (814, 291)]]: line(image, points, CYAN, 4)
    for x,y in [(782,286),(782,364),(744,436),(827,436),(715,329),(850,329)]: d.ellipse((x-6,y-6,x+6,y+6), fill=VIOLET)
    arrow(image, (687, 117), (603, 117))

def collaboration(image):
    pane(image, 68, 47, 824, 405)
    for col, color in enumerate([VIOLET, CYAN, '#70e5bc']):
        x = 95+col*267; box(image,(x,107,x+235,417),'#0a1223',LINE,12); bars(image,x+17,125,[110],color)
        for row in range(2):
            y=161+row*121; box(image,(x+12,y,x+223,y+100),'#1b2740',LINE,9); art(image,['hero','background-city','canvas-noir'][col],(x+22,y+12,x+81,y+86),6); bars(image,x+96,y+24,[103,80,94],'#a2acc8',19)
    for start,end in [((290,202),(385,202)),((560,323),(658,323))]: arrow(image,start,end)
    for i,name in enumerate(['hero','character-pink','character-blue']):
        x=210+i*230; art(image,name,(x,470,x+94,564),47)
        if i<2: line(image,[(x+108,516),(x+207,516)],CYAN,4)

def review(image):
    sheet(image, 123, 72, 340, 458); d=ImageDraw.Draw(image)
    d.ellipse((293,155,424,242),outline='#fb97ae',width=6); line(image,[(428,189),(533,161)],'#fb97ae',4)
    pane(image, 538, 71, 310, 174); bars(image, 563, 129, [195,240,160],'#d2bde9',23)
    pane(image, 538, 285, 310, 219); art(image,'hero',(560,343,662,474)); check(image,751,402,57)
    arrow(image,(506,287),(506,446)); d.ellipse((70,395,199,524),outline=CYAN,width=8); line(image,[(81,508),(47,552)],CYAN,14)

def publish(image):
    pane(image,64,107,442,331); art(image,'project-romance',(87,163,481,411)); box(image,(235,440,334,488),INK,LINE,8)
    line(image,[(193,490),(380,490)],LINE,10); arrow(image,(514,288),(591,288)); pane(image,619,44,257,504)
    sheet(image,640,101,214,420); box(image,(707,63,788,77),'#080e1d','#080e1d',7); check(image,830,477,39)
    box(image,(71,465,180,552),INK,VIOLET,11); line(image,[(104,503),(126,526),(150,495)],CYAN,7)
    line(image,[(126,479),(126,524)],CYAN,7); bars(image,393,493,[149,112],VIOLET,23)

def assets(image):
    pane(image,55,57,554,463)
    for i,name in enumerate(['materials','character-pink','background-city','blank-canvas','character-blue','background-classroom']):
        x,y=79+(i%3)*173,114+(i//3)*184; art(image,name,(x,y,x+151,y+157)); box(image,(x+112,y+117,x+144,y+150),INK,CYAN,7); line(image,[(x+120,y+134),(x+136,y+134)],CYAN,3); line(image,[(x+128,y+125),(x+128,y+143)],CYAN,3)
    arrow(image,(615,287),(675,287)); sheet(image,691,117,217,363); check(image,854,483,37)

def learning(image):
    box(image,(104,125,827,502),'#e3e1f0','#c5afea',17); line(image,[(466,140),(466,478)],'#79768b',3)
    art(image,'storyboard',(130,160,438,416)); bars(image,135,442,[235,180],'#78758d',20)
    art(image,'hero',(493,160,798,416)); bars(image,496,442,[256,201],'#78758d',20)
    arrow(image,(421,320),(507,320)); line(image,[(722,534),(842,381)],CYAN,15)
    for i in range(3): check(image,228+i*210,76,28)

def ai(image):
    art(image,'luna',(50,127,358,510),28); pane(image,387,68,496,190); bars(image,416,126,[411,308,378,207],'#c3bee7',23)
    for i,name in enumerate(['hero','character-pink','character-blue']):
        x=401+i*166; art(image,name,(x,325,x+142,507));
        if i==1: box(image,(x-6,319,x+148,513),None,CYAN,14,4); check(image,x+124,488,25)
    arrow(image,(636,269),(636,309)); line(image,[(317,271),(382,189)],CYAN,5)

def recovery(image):
    for i,name in enumerate(['storyboard','canvas-noir','hero']):
        x,y=79+i*142,68+i*49; pane(image,x,y,289,329); art(image,name,(x+17,y+57,x+272,y+310))
    d=ImageDraw.Draw(image); d.arc((642,145,897,400),35,329,fill=CYAN,width=13); arrow(image,(884,205),(897,170)); line(image,[(769,189),(769,274),(822,307)],PAPER,9)
    check(image,744,471,55); bars(image,83,512,[333,248],VIOLET,24)

def rights(image):
    sheet(image,102,76,332,438); box(image,(490,122,855,476),INK,VIOLET,22); bars(image,523,156,[270,221,251],'#a7b5cf',26)
    points=[(672,259),(752,281),(746,369),(672,426),(598,369),(592,281),(672,259)]
    ImageDraw.Draw(image).polygon(points,fill='#163842'); line(image,points,CYAN,5); check(image,672,336,44)
    arrow(image,(432,308),(488,308)); line(image,[(179,462),(346,462)],'#77889b',3)

def community(image):
    pane(image,81,63,797,401)
    for i,name in enumerate(['hero','character-pink','character-blue','project-romance']):
        x=105+i*188; art(image,name,(x,123,x+165,415)); bars(image,x+7,428,[135],VIOLET)
    d=ImageDraw.Draw(image)
    for i,x in enumerate([170,400,637]):
        box(image,(x,495,x+149,560),INK,CYAN,19); d.polygon([(x+18,557),(x+29,579),(x+43,557)],fill=INK); bars(image,x+18,513,[109,83],'#b6cce1',18)

SCENES = {
    'plan': planning, 'storyboard': storyboard, 'create': creation, 'collaborate': collaboration,
    'review': review, 'publish': publish, 'assets': assets, 'learn': learning,
    'ai': ai, 'recovery': recovery, 'rights': rights, 'community': community,
}

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest={'schemaVersion':1,'method':'Pillow composition of existing AI artwork and purpose-specific vector shapes','sourceCollection':'illustrated-20260928','externalRequests':0,'newCharges':0,'artIsIllustrative':True,'assets':{}}
    for name,render in SCENES.items():
        image=background(); render(image); variants=[]
        for width in [320,640,960]:
            out=OUTPUT/f'{name}-{width}.webp'; resized=image.resize((width,round(width*600/960)),Image.Resampling.LANCZOS); resized.save(out,'WEBP',quality=88,method=6)
            variants.append({'file':out.name,'width':width,'height':resized.height,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
        manifest['assets'][name]={'variants':variants}
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'); print(f'Created {len(SCENES)} illustrations with 3 responsive sizes each')

if __name__ == '__main__': main()

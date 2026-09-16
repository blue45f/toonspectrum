#!/usr/bin/env python3
"""Generate lightweight, theme-specific ToonStudio scene illustrations."""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/public/brand/theme-scenes"


def document(title: str, description: str, defs: str, body: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-labelledby="title desc">
  <title id="title">{title}</title>
  <desc id="desc">{description}</desc>
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-opacity=".18" /></filter>
    {defs}
  </defs>
  {body}
</svg>
'''


SCENES = {
    "aurora-studio.svg": document(
        "Aurora creative studio", "A luminous floating drawing desk surrounded by spectrum ribbons and story panels.",
        '''<linearGradient id="bg" x1="80" y1="60" x2="1120" y2="760" gradientUnits="userSpaceOnUse"><stop stop-color="#fffaff"/><stop offset=".5" stop-color="#e8fbff"/><stop offset="1" stop-color="#f3ebff"/></linearGradient>
    <linearGradient id="ribbon" x1="50" y1="100" x2="1140" y2="710" gradientUnits="userSpaceOnUse"><stop stop-color="#54e8ed"/><stop offset=".35" stop-color="#6f86ff"/><stop offset=".7" stop-color="#d478ef"/><stop offset="1" stop-color="#ffb56e"/></linearGradient>
    <linearGradient id="screen" x1="310" y1="170" x2="900" y2="610" gradientUnits="userSpaceOnUse"><stop stop-color="#243569"/><stop offset="1" stop-color="#50347c"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/>
  <circle cx="1060" cy="118" r="170" fill="#7de5ed" opacity=".2"/><circle cx="130" cy="690" r="220" fill="#d689f1" opacity=".18"/>
  <path d="M-80 212C160 18 352 206 525 128c186-84 337-21 504 119 93 78 177 66 251 10" fill="none" stroke="url(#ribbon)" stroke-width="54" stroke-linecap="round" opacity=".82"/>
  <path d="M-32 662c198-148 351-15 498-80 178-78 268-267 474-197 117 40 195 170 312 109" fill="none" stroke="url(#ribbon)" stroke-width="32" stroke-linecap="round" opacity=".58"/>
  <g filter="url(#shadow)"><rect x="245" y="122" width="710" height="548" rx="42" fill="#ffffff" fill-opacity=".82" stroke="#8177df" stroke-opacity=".3" stroke-width="3"/><rect x="280" y="160" width="640" height="430" rx="26" fill="url(#screen)"/>
    <path d="M280 468c122-108 196-74 278-176 96-119 220-80 362-8v306H280Z" fill="#76dbe4" opacity=".75"/><path d="M280 510c126-88 224-31 327-112 105-82 204-40 313 12v180H280Z" fill="#9d78ec" opacity=".82"/>
    <circle cx="754" cy="264" r="54" fill="#ffe9b5"/><path d="M662 590c-4-124 35-226 105-226 70 0 103 101 98 226Z" fill="#2d2858"/><path d="M703 388c38 43 91 42 131-2" fill="none" stroke="#ffb9cf" stroke-width="22" stroke-linecap="round"/>
    <rect x="314" y="190" width="150" height="114" rx="14" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-opacity=".55"/><rect x="483" y="190" width="154" height="114" rx="14" fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".45"/>
    <rect x="386" y="616" width="428" height="18" rx="9" fill="#d8d4f6"/><circle cx="600" cy="625" r="7" fill="#8177df"/></g>
  <g filter="url(#shadow)"><rect x="82" y="350" width="188" height="144" rx="28" fill="#fff" fill-opacity=".9" transform="rotate(-8 82 350)"/><path d="M122 450c35-64 71-59 105-9" fill="none" stroke="url(#ribbon)" stroke-width="18" stroke-linecap="round"/><circle cx="162" cy="401" r="18" fill="#6f86ff"/></g>
  <g filter="url(#shadow)"><rect x="930" y="420" width="190" height="154" rx="28" fill="#fff" fill-opacity=".9" transform="rotate(7 930 420)"/><path d="m986 472 42 42 54-70" fill="none" stroke="#d478ef" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g fill="#fff4b8"><path d="m1040 128 9 24 25 9-25 9-9 24-9-24-24-9 24-9Z"/><path d="m128 194 6 17 18 6-18 7-6 17-7-17-17-7 17-6Z"/></g>'''),
    "blossom-studio.svg": document(
        "Blossom story room", "A cheerful peach-toned studio with a cat illustrator, flower petals and rounded comic panels.",
        '''<linearGradient id="bg" x1="120" y1="40" x2="1080" y2="760" gradientUnits="userSpaceOnUse"><stop stop-color="#fffaf2"/><stop offset=".55" stop-color="#ffe6e9"/><stop offset="1" stop-color="#f3e7ff"/></linearGradient>
    <linearGradient id="desk" x1="100" y1="620" x2="1120" y2="780" gradientUnits="userSpaceOnUse"><stop stop-color="#efad83"/><stop offset="1" stop-color="#d88373"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><circle cx="160" cy="130" r="150" fill="#ffd4a7" opacity=".35"/><circle cx="1060" cy="210" r="205" fill="#e0c6ff" opacity=".32"/>
  <path d="M0 625c220-42 319 61 518 17 232-52 376-15 682-1v159H0Z" fill="url(#desk)"/>
  <g filter="url(#shadow)"><rect x="105" y="128" width="570" height="445" rx="38" fill="#fffdf8" stroke="#ef9aac" stroke-width="4"/><rect x="142" y="167" width="230" height="156" rx="26" fill="#ffd5df"/><rect x="394" y="167" width="242" height="156" rx="26" fill="#d9d0ff"/><rect x="142" y="345" width="494" height="188" rx="26" fill="#ffe8bd"/>
    <path d="M182 278c42-68 102-79 151-15" fill="none" stroke="#cf6b8a" stroke-width="14" stroke-linecap="round"/><path d="M438 265c52-66 113-53 158 4" fill="none" stroke="#8a72d3" stroke-width="14" stroke-linecap="round"/>
    <path d="M225 472c76-84 180-90 299-10" fill="none" stroke="#e28d5f" stroke-width="18" stroke-linecap="round"/></g>
  <g transform="translate(690 160)" filter="url(#shadow)"><ellipse cx="205" cy="380" rx="170" ry="118" fill="#fff"/><circle cx="205" cy="210" r="146" fill="#fff"/><path d="M84 116 115 8l86 88M326 116 294 8l-84 88" fill="#fff" stroke="#543b55" stroke-width="8" stroke-linejoin="round"/><path d="m104 78 17-44 37 50m149-6-18-44-36 50" fill="#f48aa3"/>
    <path d="M127 177c23-22 50-23 72 0m13 0c24-22 52-22 74 1" fill="none" stroke="#543b55" stroke-width="10" stroke-linecap="round"/><path d="m191 220 15 10 15-10" fill="none" stroke="#d26b83" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M151 254c33 22 78 22 110 0" fill="none" stroke="#543b55" stroke-width="8" stroke-linecap="round"/><ellipse cx="120" cy="226" rx="22" ry="12" fill="#ffc0c8" opacity=".7"/><ellipse cx="289" cy="226" rx="22" ry="12" fill="#ffc0c8" opacity=".7"/>
    <path d="M78 388c25-80 87-106 127-34 41-76 112-41 132 34" fill="#f7c4d0"/><rect x="189" y="278" width="24" height="225" rx="12" fill="#3d334c" transform="rotate(18 189 278)"/><path d="m259 484 23 37-50 13Z" fill="#ffbc6f"/></g>
  <g fill="#ef7f9c" opacity=".88"><ellipse cx="68" cy="280" rx="24" ry="13" transform="rotate(-24 68 280)"/><ellipse cx="1120" cy="100" rx="25" ry="13" transform="rotate(31 1120 100)"/><ellipse cx="1040" cy="590" rx="21" ry="11" transform="rotate(-38 1040 590)"/><ellipse cx="564" cy="82" rx="19" ry="10" transform="rotate(20 564 82)"/><ellipse cx="732" cy="98" rx="17" ry="9" transform="rotate(-18 732 98)"/></g>'''),
    "starlight-studio.svg": document(
        "Starlight observatory studio", "A quiet night studio with a moon window, constellation lines and a glowing comic canvas.",
        '''<linearGradient id="bg" x1="110" y1="40" x2="1060" y2="780" gradientUnits="userSpaceOnUse"><stop stop-color="#111734"/><stop offset=".58" stop-color="#1c2250"/><stop offset="1" stop-color="#321d51"/></linearGradient>
    <radialGradient id="moon"><stop stop-color="#fff9d5"/><stop offset="1" stop-color="#b8d9ff"/></radialGradient>
    <linearGradient id="screen" x1="300" y1="260" x2="820" y2="600" gradientUnits="userSpaceOnUse"><stop stop-color="#3c60a6"/><stop offset=".5" stop-color="#624fba"/><stop offset="1" stop-color="#c469bb"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><circle cx="970" cy="206" r="176" fill="url(#moon)" opacity=".95"/><circle cx="1019" cy="164" r="34" fill="#a9c9ee" opacity=".35"/><circle cx="911" cy="248" r="24" fill="#a9c9ee" opacity=".3"/>
  <g fill="#dff4ff"><circle cx="105" cy="100" r="4"/><circle cx="220" cy="184" r="3"/><circle cx="358" cy="84" r="5"/><circle cx="478" cy="180" r="3"/><circle cx="614" cy="92" r="4"/><circle cx="738" cy="156" r="3"/><circle cx="1100" cy="370" r="4"/></g>
  <g fill="none" stroke="#7bdcff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="7 9"><path d="m105 100 115 84 138-100 120 96 136-88 124 64"/><path d="m220 184 40 94 218-98 72 121 188-145"/></g>
  <path d="M0 640c188-70 363-32 517 4 237 55 442-35 683-11v167H0Z" fill="#0b1028"/>
  <g filter="url(#shadow)"><rect x="190" y="235" width="640" height="390" rx="30" fill="#222a58" stroke="#7a82df" stroke-width="3"/><rect x="224" y="270" width="572" height="303" rx="18" fill="url(#screen)"/><path d="M224 500c111-96 191-57 284-135 90-76 183-57 288 16v192H224Z" fill="#14213f" opacity=".72"/><circle cx="623" cy="354" r="55" fill="#ffe9c9" opacity=".86"/><path d="M520 573c18-116 62-180 129-180 67 0 105 67 112 180Z" fill="#171631"/>
    <rect x="396" y="607" width="226" height="18" rx="9" fill="#4c568f"/></g>
  <g filter="url(#shadow)"><path d="M858 626h188l-24 42H884Z" fill="#29325c"/><rect x="908" y="436" width="72" height="190" rx="32" fill="#2a3158"/><path d="M944 443V326" stroke="#7f8ef3" stroke-width="18" stroke-linecap="round"/><path d="M944 335c-68 0-116 45-116 103h232c0-58-48-103-116-103Z" fill="#7f8ef3"/><ellipse cx="944" cy="440" rx="116" ry="34" fill="#8bdcff" opacity=".18"/></g>
  <path d="M85 630c68-92 143-110 219-28" fill="none" stroke="#ca88ef" stroke-width="18" stroke-linecap="round" opacity=".55"/><path d="m1070 462 8 21 22 8-22 8-8 21-8-21-21-8 21-8Z" fill="#f4d6ff"/>'''),
    "ink-studio.svg": document(
        "Ink panel studio", "An expressive dark drawing surface with bold brush marks, speech panels and a pen nib.",
        '''<linearGradient id="bg" x1="100" y1="40" x2="1100" y2="760" gradientUnits="userSpaceOnUse"><stop stop-color="#130f0d"/><stop offset="1" stop-color="#241813"/></linearGradient>
    <linearGradient id="ink" x1="20" y1="180" x2="1120" y2="660" gradientUnits="userSpaceOnUse"><stop stop-color="#ffb26d"/><stop offset=".45" stop-color="#f27143"/><stop offset="1" stop-color="#c34638"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><path d="M-70 240c226-190 403-12 522 56 122 69 227 38 316-54 104-108 230-91 502 61" fill="none" stroke="url(#ink)" stroke-width="88" stroke-linecap="round" opacity=".86"/><path d="M-20 655c180-109 360-48 515 2 202 65 352-73 682-22" fill="none" stroke="#f5e7d5" stroke-width="28" stroke-linecap="round" opacity=".28"/>
  <g filter="url(#shadow)"><rect x="138" y="152" width="680" height="506" rx="18" fill="#f5efe6"/><rect x="174" y="190" width="282" height="190" rx="8" fill="#261b17"/><rect x="480" y="190" width="302" height="190" rx="8" fill="#e6794b"/><rect x="174" y="404" width="608" height="214" rx="8" fill="#31211a"/>
    <path d="M208 322c77-103 153-105 214-15" fill="none" stroke="#f6e4cf" stroke-width="16" stroke-linecap="round"/><path d="M529 325c52-72 142-88 206-24" fill="none" stroke="#2b1a15" stroke-width="17" stroke-linecap="round"/><path d="M220 558c133-122 322-125 514-18" fill="none" stroke="#f6e4cf" stroke-width="19" stroke-linecap="round"/>
    <ellipse cx="266" cy="230" rx="63" ry="32" fill="#fff"/><path d="m302 244 23 32-45-22Z" fill="#fff"/><ellipse cx="687" cy="242" rx="58" ry="30" fill="#fff4df"/><path d="m650 257-23 28 43-19Z" fill="#fff4df"/></g>
  <g transform="translate(820 348) rotate(12)" filter="url(#shadow)"><path d="m73 0 174 173-171 171-137-52 34-153Z" fill="#fff3df"/><path d="M-20 269 116 126" stroke="#1a1210" stroke-width="22" stroke-linecap="round"/><circle cx="118" cy="126" r="24" fill="#1a1210"/><path d="m76 344-94 33 43-86Z" fill="#f27143"/></g>
  <g fill="#fff0c6"><path d="m1050 122 10 27 28 10-28 10-10 27-10-27-27-10 27-10Z"/><circle cx="92" cy="90" r="8"/><circle cx="1100" cy="670" r="7"/></g>'''),
    "paper-studio.svg": document(
        "Paper storyboard desk", "A bright overhead desk with taped storyboard sheets, pencils, rulers and daylight shadows.",
        '''<linearGradient id="bg" x1="70" y1="30" x2="1130" y2="770" gradientUnits="userSpaceOnUse"><stop stop-color="#fbfaf5"/><stop offset="1" stop-color="#ece8df"/></linearGradient>
    <linearGradient id="paper" x1="300" y1="120" x2="830" y2="680" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#f5f2e9"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><path d="M0 104h1200M0 690h1200" stroke="#d8d3c7" stroke-width="3"/><path d="M116 0v800M1078 0v800" stroke="#ded9cf" stroke-width="2"/>
  <g filter="url(#shadow)"><rect x="222" y="92" width="672" height="616" rx="14" fill="url(#paper)" transform="rotate(-2 222 92)"/><rect x="268" y="144" width="254" height="196" rx="5" fill="#e4eef5" stroke="#403d38" stroke-width="4"/><rect x="548" y="144" width="294" height="196" rx="5" fill="#f4dfd4" stroke="#403d38" stroke-width="4"/><rect x="268" y="369" width="574" height="281" rx="5" fill="#ece7dc" stroke="#403d38" stroke-width="4"/>
    <path d="M305 296c54-83 129-95 181-20" fill="none" stroke="#526778" stroke-width="10" stroke-linecap="round"/><path d="M594 291c64-75 145-84 207-12" fill="none" stroke="#a4553d" stroke-width="10" stroke-linecap="round"/><path d="M326 588c122-127 279-136 457-24" fill="none" stroke="#55514b" stroke-width="12" stroke-linecap="round"/>
    <path d="M250 118h80v22h-80Zm544 545h80v22h-80Z" fill="#f0c778" opacity=".75"/></g>
  <g transform="translate(82 486) rotate(-18)" filter="url(#shadow)"><rect width="410" height="42" rx="10" fill="#e8ba54"/><path d="M42 0v42m44-42v42m44-42v42m44-42v42m44-42v42m44-42v42m44-42v42m44-42v42" stroke="#80611f" stroke-width="3" opacity=".7"/></g>
  <g transform="translate(895 174) rotate(12)" filter="url(#shadow)"><rect width="34" height="406" rx="17" fill="#e7614c"/><path d="M0 344h34l-17 62Z" fill="#d8b485"/><path d="m10 382 7 24 7-24Z" fill="#2e2a27"/><rect y="25" width="34" height="30" fill="#f3cf6d"/></g>
  <circle cx="1012" cy="632" r="83" fill="#fff" stroke="#d4cec2" stroke-width="8" filter="url(#shadow)"/><circle cx="1012" cy="632" r="54" fill="#8b5a3e"/><path d="M1080 602c58 0 68 83 3 92" fill="none" stroke="#d4cec2" stroke-width="18"/>
  <path d="M36 188c111-73 195-86 294-53" fill="none" stroke="#7899a8" stroke-width="18" stroke-linecap="round" opacity=".35"/>'''),
    "graphite-studio.svg": document(
        "Graphite drafting board", "A monochrome drafting table with perspective grids, charcoal marks and storyboard thumbnails.",
        '''<linearGradient id="bg" x1="70" y1="30" x2="1130" y2="770" gradientUnits="userSpaceOnUse"><stop stop-color="#181818"/><stop offset=".5" stop-color="#303030"/><stop offset="1" stop-color="#1f1f1f"/></linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0v40" fill="none" stroke="#777" stroke-opacity=".22"/></pattern>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><rect x="60" y="50" width="1080" height="700" rx="34" fill="url(#grid)" stroke="#6c6c6c" stroke-width="3"/>
  <g opacity=".34" stroke="#c9c9c9" stroke-width="2"><path d="M600 72 103 718M600 72l496 646M600 72 370 718M600 72l229 646M600 72v646"/><path d="M120 640h960M166 548h868M230 458h740M300 368h600M390 278h420"/></g>
  <g filter="url(#shadow)"><rect x="216" y="126" width="690" height="530" rx="8" fill="#dadada" transform="rotate(-1 216 126)"/><rect x="258" y="172" width="274" height="196" fill="#707070" stroke="#222" stroke-width="6"/><rect x="558" y="172" width="306" height="196" fill="#ababab" stroke="#222" stroke-width="6"/><rect x="258" y="396" width="606" height="214" fill="#8b8b8b" stroke="#222" stroke-width="6"/>
    <path d="M290 326c63-112 156-116 216-12M596 322c64-96 154-101 236-11M306 570c154-142 322-143 514-20" fill="none" stroke="#222" stroke-width="11" stroke-linecap="round"/>
    <g fill="none" stroke="#525252" stroke-width="3" stroke-dasharray="8 7"><path d="M258 270h274M695 172v196M561 503h303"/></g></g>
  <g transform="translate(860 510) rotate(-11)" filter="url(#shadow)"><rect width="250" height="34" rx="7" fill="#d4b25a"/><path d="M25 0v34m25-34v34m25-34v34m25-34v34m25-34v34m25-34v34m25-34v34m25-34v34" stroke="#5e4a17" stroke-width="3"/></g>
  <g fill="#101010" filter="url(#shadow)"><rect x="90" y="270" width="42" height="260" rx="12" transform="rotate(16 90 270)"/><rect x="1030" y="210" width="36" height="250" rx="10" transform="rotate(-17 1030 210)"/><ellipse cx="993" cy="650" rx="96" ry="32" opacity=".7"/></g>
  <path d="M80 112c150 37 222 3 335-46M890 92c91 47 155 39 234 12" fill="none" stroke="#f0d070" stroke-width="8" stroke-linecap="round" opacity=".75"/>'''),
    "midnight-studio.svg": document(
        "Midnight city studio", "A blue night workspace with a rainy city window, desk lamp and glowing drawing display.",
        '''<linearGradient id="bg" x1="80" y1="30" x2="1100" y2="770" gradientUnits="userSpaceOnUse"><stop stop-color="#0c1427"/><stop offset=".52" stop-color="#12233c"/><stop offset="1" stop-color="#172947"/></linearGradient>
    <linearGradient id="window" x1="780" y1="80" x2="1100" y2="560" gradientUnits="userSpaceOnUse"><stop stop-color="#163963"/><stop offset="1" stop-color="#0c1d35"/></linearGradient>
    <linearGradient id="screen" x1="250" y1="240" x2="690" y2="590" gradientUnits="userSpaceOnUse"><stop stop-color="#4380c6"/><stop offset="1" stop-color="#6c73d8"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><rect x="755" y="70" width="370" height="500" rx="20" fill="url(#window)" stroke="#3c668b" stroke-width="4"/><path d="M940 70v500M755 318h370" stroke="#426989" stroke-width="4"/>
  <g fill="#76c9ff"><rect x="787" y="392" width="42" height="178" opacity=".5"/><rect x="846" y="352" width="48" height="218" opacity=".35"/><rect x="916" y="420" width="52" height="150" opacity=".55"/><rect x="995" y="333" width="60" height="237" opacity=".28"/><rect x="1072" y="386" width="31" height="184" opacity=".46"/></g>
  <g fill="#ffd979"><rect x="796" y="430" width="8" height="12"/><rect x="870" y="396" width="8" height="12"/><rect x="935" y="458" width="8" height="12"/><rect x="1024" y="372" width="8" height="12"/><rect x="1084" y="428" width="8" height="12"/></g>
  <g stroke="#82cfff" stroke-width="4" stroke-linecap="round" opacity=".55"><path d="m790 100-34 94M850 86l-45 143M918 92l-41 120M1000 88l-55 177M1080 98l-43 134"/></g>
  <path d="M0 620c235-48 409 10 598 13 213 4 374-58 602-12v179H0Z" fill="#091120"/>
  <g filter="url(#shadow)"><rect x="150" y="210" width="570" height="390" rx="24" fill="#1c2b49" stroke="#4973a0" stroke-width="3"/><rect x="184" y="244" width="502" height="286" rx="14" fill="url(#screen)"/><path d="M184 468c92-75 164-47 238-105 91-71 171-60 264-2v169H184Z" fill="#173051" opacity=".8"/><circle cx="531" cy="322" r="44" fill="#c5e6ff"/><path d="M434 530c18-99 54-157 112-157 58 0 94 57 106 157Z" fill="#0e1830"/><rect x="315" y="580" width="240" height="18" rx="9" fill="#314c72"/></g>
  <g filter="url(#shadow)"><path d="M585 620h150l-18 46H603Z" fill="#253858"/><path d="M666 621V390" stroke="#375375" stroke-width="18" stroke-linecap="round"/><path d="M666 402c-64 0-108 42-108 96h216c0-54-44-96-108-96Z" fill="#7fb9e4"/><ellipse cx="666" cy="498" rx="108" ry="34" fill="#8bd5ff" opacity=".2"/></g>
  <circle cx="1070" cy="150" r="42" fill="#d6efff" opacity=".7"/>'''),
    "sepia-studio.svg": document(
        "Sepia archive desk", "A warm vintage scrapbook with a film strip, dried leaves, ink bottle and illustrated memories.",
        '''<linearGradient id="bg" x1="70" y1="40" x2="1130" y2="760" gradientUnits="userSpaceOnUse"><stop stop-color="#efe3ce"/><stop offset=".55" stop-color="#d7bea0"/><stop offset="1" stop-color="#b98d68"/></linearGradient>
    <linearGradient id="paper" x1="250" y1="110" x2="850" y2="680" gradientUnits="userSpaceOnUse"><stop stop-color="#f8efd9"/><stop offset="1" stop-color="#ddc5a4"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="url(#bg)"/><path d="M0 98h1200M0 705h1200" stroke="#8c674c" stroke-opacity=".25" stroke-width="4"/>
  <g filter="url(#shadow)"><rect x="220" y="88" width="680" height="618" rx="18" fill="url(#paper)" transform="rotate(-2 220 88)"/><rect x="268" y="142" width="248" height="216" rx="6" fill="#8f6f58" stroke="#583f31" stroke-width="5"/><rect x="548" y="142" width="300" height="216" rx="6" fill="#b58b68" stroke="#583f31" stroke-width="5"/><rect x="268" y="390" width="580" height="258" rx="6" fill="#ccb08c" stroke="#583f31" stroke-width="5"/>
    <path d="M302 315c56-94 132-104 181-26M586 307c72-86 153-80 224-13M312 602c131-130 294-136 491-26" fill="none" stroke="#513b2e" stroke-width="10" stroke-linecap="round"/>
    <path d="M254 122h100v26H254Zm515 534h100v26H769Z" fill="#9b7350" opacity=".5"/></g>
  <g transform="translate(60 182) rotate(-8)" filter="url(#shadow)"><rect width="170" height="420" rx="12" fill="#4e392e"/><g fill="#e2c49d"><rect x="18" y="28" width="134" height="82"/><rect x="18" y="129" width="134" height="82"/><rect x="18" y="230" width="134" height="82"/><rect x="18" y="331" width="134" height="62"/></g><g fill="#c49b71"><circle cx="8" cy="24" r="4"/><circle cx="8" cy="56" r="4"/><circle cx="8" cy="88" r="4"/><circle cx="8" cy="120" r="4"/><circle cx="8" cy="152" r="4"/><circle cx="162" cy="24" r="4"/><circle cx="162" cy="56" r="4"/><circle cx="162" cy="88" r="4"/><circle cx="162" cy="120" r="4"/><circle cx="162" cy="152" r="4"/></g></g>
  <g transform="translate(902 478)" filter="url(#shadow)"><ellipse cx="91" cy="178" rx="99" ry="28" fill="#76513a" opacity=".35"/><rect x="22" y="54" width="136" height="126" rx="22" fill="#3f2d25"/><path d="M46 54c6-60 82-60 88 0" fill="#2c211c"/><rect x="53" y="79" width="74" height="52" rx="8" fill="#a98562"/><path d="M91 54V8" stroke="#3f2d25" stroke-width="24" stroke-linecap="round"/></g>
  <g fill="none" stroke="#6e5039" stroke-width="9" stroke-linecap="round"><path d="M969 392c64-115 83-220 53-322"/><path d="M1010 252c-50-17-75-50-83-96M1028 185c49-15 78-45 90-90M986 323c-51 0-88-24-111-63"/></g>
  <g fill="#9b6b4b"><ellipse cx="929" cy="154" rx="42" ry="16" transform="rotate(31 929 154)"/><ellipse cx="1112" cy="94" rx="46" ry="17" transform="rotate(-32 1112 94)"/><ellipse cx="876" cy="258" rx="44" ry="16" transform="rotate(28 876 258)"/></g>'''),
    "contrast-studio.svg": document(
        "High contrast focus board", "A bold black, white and yellow interface with clear comic panels and focus guides.",
        '''<linearGradient id="yellow" x1="80" y1="80" x2="1120" y2="720" gradientUnits="userSpaceOnUse"><stop stop-color="#fff46a"/><stop offset="1" stop-color="#ffd800"/></linearGradient>''',
        '''<rect width="1200" height="800" rx="54" fill="#050505"/><path d="M0 0h350L0 350Zm1200 800H850l350-350Z" fill="url(#yellow)"/>
  <g filter="url(#shadow)"><rect x="170" y="105" width="860" height="590" rx="18" fill="#fff" stroke="#fff" stroke-width="4"/><rect x="216" y="151" width="346" height="220" fill="#050505"/><rect x="592" y="151" width="392" height="220" fill="url(#yellow)"/><rect x="216" y="405" width="768" height="244" fill="#050505"/>
    <path d="M264 320c82-128 185-136 258-22" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/><path d="M642 318c88-123 204-132 292-16" fill="none" stroke="#050505" stroke-width="22" stroke-linecap="round"/><path d="M278 589c166-157 386-163 650-31" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round"/>
    <circle cx="388" cy="260" r="62" fill="#fff"/><path d="M351 260h74M388 223v74" stroke="#050505" stroke-width="12"/><circle cx="788" cy="258" r="62" fill="#050505"/><path d="M751 258h74M788 221v74" stroke="#fff" stroke-width="12"/></g>
  <g fill="none" stroke="url(#yellow)" stroke-width="9"><path d="M76 400h104M128 348v104M1020 400h104M1072 348v104"/><rect x="94" y="80" width="104" height="104"/><rect x="1002" y="616" width="104" height="104"/></g>
  <path d="m104 640 48-83 48 83Z" fill="#fff"/><circle cx="1070" cy="128" r="45" fill="#fff"/><path d="M1070 98v60M1040 128h60" stroke="#050505" stroke-width="10"/>'''),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, content in SCENES.items():
        target = OUTPUT / name
        encoded = content.encode("utf-8")
        if args.check:
            assert target.read_bytes() == encoded, name
        else:
            target.write_bytes(encoded)
        print(f"{'OK' if args.check else 'WROTE'} {target.relative_to(ROOT)}: {len(encoded)} bytes")


if __name__ == "__main__":
    main()

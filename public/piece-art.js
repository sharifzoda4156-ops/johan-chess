// Original local vector artwork. No remote images or fonts.
const NS='http://www.w3.org/2000/svg';
const shapes={
 p:['M20 42 C20 34 25 31 25 25 A9 9 0 1 1 39 25 C39 31 44 34 44 42 L49 48 H15 Z','M12 49 H52 L55 56 H9 Z'],
 r:['M13 10 H23 V18 H28 V10 H36 V18 H41 V10 H51 V27 L44 33 L46 45 H18 L20 33 L13 27 Z','M16 45 H48 L51 49 H13 Z','M11 50 H53 L56 56 H8 Z','M20 27 H44'],
 n:['M16 45 C15 35 19 25 29 20 L27 12 L36 16 L44 10 L45 22 C52 30 50 39 47 45 Z','M27 19 C22 21 14 28 12 35 L20 39 L30 32 L35 35 L27 45','M14 46 H50 L54 56 H10 Z','M36 24 L38 24'],
 b:['M32 7 L34 10 C48 18 48 27 39 34 L43 45 H21 L25 34 C16 27 16 18 30 10 Z','M35 14 L27 26','M18 45 H46 L50 49 H14 Z','M12 50 H52 L55 56 H9 Z'],
 q:['M10 15 L23 29 L23 14 L32 27 L41 14 L41 29 L54 15 L46 44 H18 Z','M18 44 H46 L50 49 H14 Z','M12 50 H52 L55 56 H9 Z','M10 12 A3 3 0 1 0 10 18 A3 3 0 1 0 10 12','M23 10 A3 3 0 1 0 23 16 A3 3 0 1 0 23 10','M32 4 A3 3 0 1 0 32 10 A3 3 0 1 0 32 4','M41 10 A3 3 0 1 0 41 16 A3 3 0 1 0 41 10','M54 12 A3 3 0 1 0 54 18 A3 3 0 1 0 54 12'],
 k:['M29 5 H35 V11 H42 V17 H35 V23 H29 V17 H22 V11 H29 Z','M32 23 C18 13 9 25 16 34 L23 44 H41 L48 34 C55 25 46 13 32 23 Z','M32 23 V38','M19 44 H45 L50 49 H14 Z','M12 50 H52 L55 56 H9 Z']
};
export function pieceGraphic(piece){
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','piece '+(piece.color==='w'?'white':'black'));
 const paths=shapes[piece.type]||[];
 paths.forEach(d=>{const path=document.createElementNS(NS,'path');path.setAttribute('d',d);path.setAttribute('stroke-linejoin','round');path.setAttribute('stroke-linecap','round');svg.append(path);});
 return svg;
}

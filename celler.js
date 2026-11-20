// ändra siffrorna och testa
const LOOKS_SETTINGS = {
  // för drifters
  bubbleCount: 26,          // antal bubblor i kanten
  drifterLight: 0.7,        // ljusstyrka (1 = som andra, 0.5 = dovare)

  // för parasites 
  tailLength: 2.8,          // piskans längd (x cellens storlek)
  teardrop: 0.22,           // droppform (0 = rund)

  // för watchers
  hairCount: 44,            // antal hår
  hairLength: 0.2,          // hårens längd (x storlek)
  oval: 0.2,                // hur oval (0 = rund)

  // för hunters
  whipCount: 3,             // antal piskpar (3 par = 6 piskor)
  whipLength: 2.8,          // piskornas längd (x storlek)
  tailPoint: 0.8,           // spetsig bakdel (0 = rund)
  turnSpeed: 0.08,          // hur snabbt den vänder sig

  // för connectors
  minArms: 3,               // min antal armar
  maxArms: 5,               // max antal armar
  armLength: 1.8            // armarnas längd (x storlek)
};

// cellens utseende
// skapas första gången, sparas i organism.looks
function getLooks(organism) {
  if (organism.looks === undefined) {
    organism.looks = skapaUtseende(organism.personality);
  }
  return organism.looks;
}

// slumpar utseende per sort
function skapaUtseende(personality) {
  const looks = { kind: personality };

  if (personality === "drifter") {
    // bubblor i kanten: plats och storlek
    looks.bubbles = [];
    for (let i = 0; i < LOOKS_SETTINGS.bubbleCount; i++) {
      looks.bubbles.push({
        angle: (i / LOOKS_SETTINGS.bubbleCount) * Math.PI * 2 + slumpMellan(-0.08, 0.08),
        inset: slumpMellan(0.72, 0.9),      // hur långt in (1 = på kanten)
        size: slumpMellan(0.035, 0.08)      // storlek
      });
    }
  }

  if (personality === "hunter") {
    // piskor i par, en per sida. place: 0 = bak, 1 = fram
    looks.whips = [];
    for (let i = 0; i < LOOKS_SETTINGS.whipCount; i++) {
      const place = 0.3 + (i / LOOKS_SETTINGS.whipCount) * 0.6;
      for (let side = -1; side <= 1; side += 2) {
        looks.whips.push({
          place: place,
          side: side,                              // -1 = vänster, 1 = höger
          length: slumpMellan(0.7, 1.2),
          phase: Math.random() * Math.PI * 2       // slår lite olika
        });
      }
    }

    // ovala korn. along = fram/bak, across = sida (-1 till 1)
    looks.grains = [];
    for (let i = 0; i < 12; i++) {
      looks.grains.push({
        along: slumpMellan(-0.9, 0.0),
        across: slumpMellan(-0.6, 0.6),
        size: slumpMellan(0.06, 0.09),
        tilt: slumpMellan(-0.5, 0.5)
      });
    }
  }

  if (personality === "connector") {
    // armar: riktning, längd, grenar
    looks.arms = [];
    const count = slumpHeltal(LOOKS_SETTINGS.minArms, LOOKS_SETTINGS.maxArms);
    for (let i = 0; i < count; i++) {
      const branches = [];
      const branchCount = slumpHeltal(2, 3);
      for (let b = 0; b < branchCount; b++) {
        branches.push({
          spread: slumpMellan(-0.7, 0.7),    // grenens sväng åt sidan
          length: slumpMellan(0.5, 1.1)
        });
      }
      looks.arms.push({
        angle: (i / count) * Math.PI * 2 + slumpMellan(-0.4, 0.4),
        length: slumpMellan(0.75, 1.25),
        phase: Math.random() * Math.PI * 2,
        branches: branches
      });
    }

    // mörka prickar runt kärnan
    looks.granules = [];
    for (let i = 0; i < 26; i++) {
      looks.granules.push({
        angle: Math.random() * Math.PI * 2,
        distance: slumpMellan(0.32, 0.75),
        tilt: Math.random() * Math.PI
      });
    }
  }

  return looks;
}

// vart framsidan pekar
// vänder mjukt mot simriktningen
// parasit som sitter fast: framsidan mot värden
function getHeading(organism) {
  const looks = getLooks(organism);

  // vart vill den vända?
  let target = organism.moveAngle;
  if (organism.personality === "parasite" && organism.host !== null) {
    target = organism.attachAngle + Math.PI;
  }

  // första gången -> direkt
  if (looks.heading === undefined) {
    looks.heading = target;
  }

  // bara en gång per bildruta
  if (looks.headingFrame !== lastFrameTime) {
    looks.headingFrame = lastFrameTime;
    // vinkelskillnad, -π till π (kortaste vägen)
    const difference = Math.atan2(Math.sin(target - looks.heading), Math.cos(target - looks.heading));
    looks.heading += difference * LOOKS_SETTINGS.turnSpeed;
  }
  return looks.heading;
}

// punkt på kanten åt ett håll
// närmaste punkt i organism.outline
function getEdgePoint(organism, angle) {
  const count = organism.outline.length;
  const turn = Math.PI * 2;
  const wrapped = ((angle % turn) + turn) % turn;   // vinkel mellan 0 och ett varv
  const index = Math.round((wrapped / turn) * count) % count;
  return organism.outline[index];
}

// form per sort
// anropas från radieVidVinkel (script.js), för varje punkt
// returnerar tillägg till radien (0 = ingen ändring)
function getLooksShape(organism, angle, time) {
  const kind = organism.personality;

  if (kind === "parasite") {
    // droppe: spetsig bak, rund fram
    // a = vinkel mot framsidan (0 = rakt fram)
    const a = angle - getHeading(organism);
    return LOOKS_SETTINGS.teardrop * (Math.cos(2 * a) * 0.9 - Math.cos(a) * 0.7);
  }

  if (kind === "hunter") {
    // päron: runt fram, spets bak
    // fromBack = vinkel från rakt bakåt
    // tip: 1 bak -> 0 åt sidan
    const a = angle - getHeading(organism);
    const fromBack = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
    const tip = Math.max(0, 1 - fromBack / 1.1);
    return LOOKS_SETTINGS.tailPoint * Math.pow(tip, 1.6) + 0.06 * Math.cos(a);
  }

  if (kind === "watcher") {
    // oval: längre fram/bak
    const a = angle - getHeading(organism);
    return LOOKS_SETTINGS.oval * Math.cos(2 * a);
  }

  if (kind === "connector") {
    // utbuktning vid armarna (nervcell)
    const looks = getLooks(organism);
    const reach = 1 - 0.6 * organism.alarm;     // rädd = armar in
    let bump = 0;
    for (let i = 0; i < looks.arms.length; i++) {
      const facing = Math.max(0, Math.cos(angle - getArmAngle(looks.arms[i], time)));
      bump += 0.4 * reach * Math.pow(facing, 10);  // stort tal = smal spets
    }
    return bump;
  }

  return 0;
}

// armens riktning just nu
// svajar, eller pekar dit uppdateraArmar räknat (arm.angleNow)
function getArmAngle(arm, time) {
  if (arm.angleNow !== undefined) {
    return arm.angleNow;
  }
  return arm.angle + Math.sin(time * 0.4 + arm.phase) * 0.25;
}

// anropas från ritaCell (script.js) före cellen
// -> ser ut att växa ut under kanten
function ritaUtseendeBakom(organism, time, size) {
  const kind = organism.personality;
  if (kind === "hunter") {
    ritaPiskor(organism, time, size);
  } else if (kind === "watcher") {
    ritaCilier(organism, time, size);
  } else if (kind === "parasite") {
    ritaSvans(organism, time, size);
  } else if (kind === "connector") {
    ritaArmar(organism, time, size);
  }
}

// hunter: långa piskor bakåt
// våg bakåt längs piskorna
function ritaPiskor(organism, time, size) {
  const looks = getLooks(organism);
  const palette = organism.palette;
  const heading = getHeading(organism);
  const backAngle = heading + Math.PI;

  // snabbare vid jakt/oro
  let beat = 5 + organism.agitation * 4;
  if (organism.prey !== null) {
    beat = beat + 4;
  }

  const whips = new Path2D();   // alla piskor i en form = snabbare
  const segments = 14;

  for (let i = 0; i < looks.whips.length; i++) {
    const whip = looks.whips[i];

    // place: 0 = bak, 1 = fram
    const startAngle = backAngle + whip.side * whip.place * Math.PI * 0.85;
    const start = getEdgePoint(organism, startAngle);

    // bakåt, lite ut åt sidan
    const whipAngle = backAngle + whip.side * (0.1 + whip.place * 0.3);
    const dirX = Math.cos(whipAngle);
    const dirY = Math.sin(whipAngle);
    const sideX = -dirY;
    const sideY = dirX;

    const length = size * LOOKS_SETTINGS.whipLength * whip.length;
    whips.moveTo(start.x, start.y);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;                                            // 0 vid cellen, 1 längst ut
      const wave = Math.sin(t * 5 - time * beat + whip.phase) * size * 0.35 * t * t;
      whips.lineTo(start.x + dirX * length * t + sideX * wave,
        start.y + dirY * length * t + sideY * wave);
    }
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.15);   // brett svagt ljus
  ctx.stroke(whips);
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeStyle = hexTillRgba(palette.core, 0.6);   // tunn ljus linje
  ctx.stroke(whips);
}

// watcher: hår (cilier)
// vinkar i en våg runt cellen
function ritaCilier(organism, time, size) {
  const palette = organism.palette;
  const count = LOOKS_SETTINGS.hairCount;
  const length = Math.max(3, size * LOOKS_SETTINGS.hairLength);

  // snabbare när rädd
  const beatSpeed = 5 + organism.alarm * 10;

  const hairs = new Path2D();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const edge = getEdgePoint(organism, angle);

    // lutar fram/tillbaka, grannhår lite efter = våg
    const bend = Math.sin(time * beatSpeed - i * 0.45) * 0.6;
    const hairAngle = angle + bend;
    hairs.moveTo(edge.x, edge.y);
    hairs.lineTo(edge.x + Math.cos(hairAngle) * length, edge.y + Math.sin(hairAngle) * length);
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.5);
  ctx.stroke(hairs);
}

// parasit: piska (flagell) bakom
// vågig linje, våg bakåt
function ritaSvans(organism, time, size) {
  const palette = organism.palette;
  const backAngle = getHeading(organism) + Math.PI;   // rakt bakåt
  const start = getEdgePoint(organism, backAngle);

  // bakåt + åt sidan (för vågen)
  const backX = Math.cos(backAngle);
  const backY = Math.sin(backAngle);
  const sideX = -backY;
  const sideY = backX;

  // snabbare när den simmar fort
  const swimSpeed = Math.sqrt(organism.vx * organism.vx + organism.vy * organism.vy);
  const whip = time * (8 + swimSpeed * 6) + organism.seed;

  const length = size * LOOKS_SETTINGS.tailLength;
  const tail = new Path2D();
  tail.moveTo(start.x, start.y);
  const segments = 16;
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;                                  // 0 vid cellen, 1 längst ut
    const wave = Math.sin(t * 9 - whip) * size * 0.4 * t;    // större våg längre ut
    tail.lineTo(start.x + backX * length * t + sideX * wave,
      start.y + backY * length * t + sideY * wave);
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 3;
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.2);   // brett svagt ljus
  ctx.stroke(tail);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = hexTillRgba(palette.core, 0.75);  // tunn ljus linje
  ctx.stroke(tail);
}

// connector: armar (nervcell)
// tjock vid cellen, grenar längre ut
function ritaArmar(organism, time, size) {
  const looks = getLooks(organism);
  const palette = organism.palette;
  const reach = 1 - 0.6 * organism.alarm;      // rädd = armar in

  const thick = new Path2D();   // tjocka armar
  const thin = new Path2D();    // tunna grenar
  const tips = [];              // lysande spetsar (ihopkopplade)

  for (let i = 0; i < looks.arms.length; i++) {
    const arm = looks.arms[i];
    const angle = getArmAngle(arm, time);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const sideX = -dirY;
    const sideY = dirX;

    // börjar inne i cellen, böjer lite
    // arm.lengthNow från uppdateraArmar. kopplad = mindre böj
    let length = size * LOOKS_SETTINGS.armLength * arm.length;
    let glow = 0;
    if (arm.lengthNow !== undefined) {
      length = arm.lengthNow;
      glow = arm.glow;
    }
    length = length * reach;
    const curl = Math.sin(time * 0.7 + arm.phase) * size * 0.3 * (1 - glow);
    const startX = organism.x + dirX * size * 0.6;
    const startY = organism.y + dirY * size * 0.6;
    const endX = organism.x + dirX * (size + length) + sideX * curl;
    const endY = organism.y + dirY * (size + length) + sideY * curl;
    const bendX = organism.x + dirX * (size + length * 0.5) - sideX * curl * 0.5;
    const bendY = organism.y + dirY * (size + length * 0.5) - sideY * curl * 0.5;

    thick.moveTo(startX, startY);
    thick.quadraticCurveTo(bendX, bendY, endX, endY);
    if (glow > 0.02) {
      tips.push({ x: endX, y: endY, glow: glow });
    }

    // grenar i spetsen, två kvistar var
    for (let b = 0; b < arm.branches.length; b++) {
      const branch = arm.branches[b];
      const branchAngle = angle + branch.spread + Math.sin(time * 0.9 + arm.phase + b) * 0.15;
      const branchLength = size * branch.length * reach;
      const tipX = endX + Math.cos(branchAngle) * branchLength;
      const tipY = endY + Math.sin(branchAngle) * branchLength;
      thin.moveTo(endX, endY);
      thin.lineTo(tipX, tipY);

      for (let k = -1; k <= 1; k += 2) {
        const twigAngle = branchAngle + k * 0.5;
        thin.moveTo(tipX, tipY);
        thin.lineTo(tipX + Math.cos(twigAngle) * branchLength * 0.45,
          tipY + Math.sin(twigAngle) * branchLength * 0.45);
      }
    }
  }

  // cellens färg -> sitter ihop med kroppen
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.strokeStyle = hexTillRgba(palette.edge, 0.95);
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.stroke(thick);

  // tunt ljus längs armar + grenar
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.45);
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.stroke(thick);
  ctx.lineWidth = 1;
  ctx.stroke(thin);
  ctx.lineCap = "butt";

  // kopplade spetsar lyser/pulserar
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    const pulse = 0.8 + 0.2 * Math.sin(time * 6 + organism.seed);
    ctx.fillStyle = hexTillRgba(palette.glow, 0.35 * tip.glow);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, Math.max(8, size * 0.5) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, " + 0.9 * tip.glow + ")";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, Math.max(2.5, size * 0.13) * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

// anropas från ritaCell (script.js), insidan
function ritaUtseendeInuti(organism, time, size) {
  const kind = organism.personality;
  if (kind === "drifter") {
    ritaSkum(organism, time, size);
  } else if (kind === "hunter") {
    drawHunterInside(organism, time, size);
  } else if (kind === "parasite") {
    drawEyespot(organism, size);
  } else if (kind === "watcher") {
    ritaVakuoler(organism, time, size);
  } else if (kind === "connector") {
    ritaKorn(organism, time, size);
    drawNucleus(organism.x, organism.y, size * 0.26, organism.palette);
  }
}

// amöba: bubblor innanför kanten
function ritaSkum(organism, time, size) {
  const looks = getLooks(organism);
  const foam = new Path2D();
  for (let i = 0; i < looks.bubbles.length; i++) {
    const bubble = looks.bubbles[i];
    const angle = bubble.angle + time * 0.03;          // glider runt
    const edge = getEdgePoint(organism, angle);

    // en bit in från kanten
    const x = organism.x + (edge.x - organism.x) * bubble.inset;
    const y = organism.y + (edge.y - organism.y) * bubble.inset;
    const radius = size * bubble.size;
    foam.moveTo(x + radius, y);
    foam.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexTillRgba(organism.palette.core, 0.08);
  ctx.fill(foam);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.stroke(foam);
}

// cellkärna: ljus ring + prick
function drawNucleus(x, y, radius, palette) {
  if (radius < 4) {
    return;   // för liten
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(5, 0, 15, 0.22)";       // mörkare inuti
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = hexTillRgba(palette.core, 0.5);
  ctx.stroke();

  // prick i mitten (nukleol)
  ctx.fillStyle = hexTillRgba(palette.core, 0.85);
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

// hunter insida:
// streck, ovala korn, två kärnor fram
function drawHunterInside(organism, time, size) {
  const looks = getLooks(organism);
  const palette = organism.palette;
  const heading = getHeading(organism);

  // riktningar: fram + sida
  const frontX = Math.cos(heading);
  const frontY = Math.sin(heading);
  const sideX = -frontY;
  const sideY = frontX;

  // böjda linjer bak -> fram (tusch-skuggor)
  const strokes = new Path2D();
  for (let i = -4; i <= 4; i++) {
    const across = i / 4;     // -1 till 1
    const backX = organism.x - frontX * size * 1.5 + sideX * across * size * 0.1;
    const backY = organism.y - frontY * size * 1.5 + sideY * across * size * 0.1;
    const bendX = organism.x - frontX * size * 0.3 + sideX * across * size * 0.75;
    const bendY = organism.y - frontY * size * 0.3 + sideY * across * size * 0.75;
    const endX = organism.x + frontX * size * 0.2 + sideX * across * size * 0.6;
    const endY = organism.y + frontY * size * 0.2 + sideY * across * size * 0.6;
    strokes.moveTo(backX, backY);
    strokes.quadraticCurveTo(bendX, bendY, endX, endY);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(5, 0, 15, 0.45)";
  ctx.stroke(strokes);

  if (size < 14) {
    return;   // för liten
  }

  const grains = new Path2D();
  for (let i = 0; i < looks.grains.length; i++) {
    const grain = looks.grains[i];
    const x = organism.x + frontX * grain.along * size + sideX * grain.across * size;
    const y = organism.y + frontY * grain.along * size + sideY * grain.across * size;
    const radius = grain.size * size;
    grains.moveTo(x + Math.cos(heading + grain.tilt) * radius * 1.6, y + Math.sin(heading + grain.tilt) * radius * 1.6);
    // oval, 1.6x längre än bred
    grains.ellipse(x, y, radius * 1.6, radius, heading + grain.tilt, 0, Math.PI * 2);
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = hexTillRgba(palette.core, 0.45);
  ctx.fill(grains);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 60, 40, 0.6)";   // röd kant
  ctx.stroke(grains);

  // TVÅ KÄRNOR FRAM (SOM ÖGON)
  for (let side = -1; side <= 1; side += 2) {
    const x = organism.x + frontX * size * 0.3 + sideX * side * size * 0.36;
    const y = organism.y + frontY * size * 0.3 + sideY * side * size * 0.36;
    const radius = size * 0.3;

    // ljus cirkel
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = hexTillRgba(palette.core, 0.25);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // ringar i ringar (årsringar)
    const rings = new Path2D();
    for (let r = 1; r <= 3; r++) {
      const ringRadius = radius * (1 - (r - 1) * 0.28);
      rings.moveTo(x + ringRadius, y);
      rings.arc(x, y, ringRadius, 0, Math.PI * 2);
    }
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = hexTillRgba(palette.glow, 0.7);
    ctx.stroke(rings);

    // ljus prick i mitten
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

// parasit: röd ögonfläck fram
// (känner av ljus)
function drawEyespot(organism, size) {
  const heading = getHeading(organism);
  const x = organism.x + Math.cos(heading) * size * 0.45;
  const y = organism.y + Math.sin(heading) * size * 0.45;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255, 50, 40, 0.9)";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.5, size * 0.16), 0, Math.PI * 2);
  ctx.fill();
}

// watcher: två pumpar (vakuoler)
// stjärnformade, växer/krymper i tur
function ritaVakuoler(organism, time, size) {
  const heading = getHeading(organism);
  const shapes = new Path2D();

  for (let side = -1; side <= 1; side += 2) {
    // en fram, en bak
    const x = organism.x + Math.cos(heading) * size * 0.55 * side;
    const y = organism.y + Math.sin(heading) * size * 0.55 * side;

    // en stor när den andra är liten
    const pump = 0.5 + 0.5 * Math.sin(time * 2 + organism.seed + side * 1.5);
    const radius = size * 0.08 * (0.6 + 0.6 * pump);
    shapes.moveTo(x + radius, y);
    shapes.arc(x, y, radius, 0, Math.PI * 2);

    // strålar ut från vakuolen
    for (let r = 0; r < 6; r++) {
      const rayAngle = (r / 6) * Math.PI * 2 + organism.seed;
      shapes.moveTo(x + Math.cos(rayAngle) * radius, y + Math.sin(rayAngle) * radius);
      shapes.lineTo(x + Math.cos(rayAngle) * size * 0.22, y + Math.sin(rayAngle) * size * 0.22);
    }
  }

  // böjd linje fram -> mitten (mun)
  const sideAngle = heading + Math.PI / 2;
  shapes.moveTo(organism.x + Math.cos(heading) * size * 0.9, organism.y + Math.sin(heading) * size * 0.9);
  shapes.quadraticCurveTo(
    organism.x + Math.cos(sideAngle) * size * 0.4, organism.y + Math.sin(sideAngle) * size * 0.4,
    organism.x - Math.cos(heading) * size * 0.1, organism.y - Math.sin(heading) * size * 0.1
  );

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexTillRgba(organism.palette.core, 0.4);
  ctx.stroke(shapes);
}

// connector: mörka streck runt kärnan
// (som nervcell i mikroskop)
function ritaKorn(organism, time, size) {
  const looks = getLooks(organism);
  const dashes = new Path2D();
  const dashLength = size * 0.08;
  for (let i = 0; i < looks.granules.length; i++) {
    const granule = looks.granules[i];
    const angle = granule.angle + time * 0.04;
    const x = organism.x + Math.cos(angle) * granule.distance * size;
    const y = organism.y + Math.sin(angle) * granule.distance * size;
    dashes.moveTo(x - Math.cos(granule.tilt) * dashLength, y - Math.sin(granule.tilt) * dashLength);
    dashes.lineTo(x + Math.cos(granule.tilt) * dashLength, y + Math.sin(granule.tilt) * dashLength);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.strokeStyle = "rgba(5, 0, 15, 0.45)";
  ctx.stroke(dashes);
  ctx.lineCap = "butt";
}

const SPECIES_SETTINGS = {
  // parasiter
  parasiteSearchRange: 450,     // sökavstånd (px)
  parasiteMinimumStay: 8,       // sekunder fast (min-max)
  parasiteMaximumStay: 20,
  parasiteRestTime: 6,          // vila innan ny sökning (s)

  // jägare
  hunterRange: 420,             // sökavstånd
  hunterChaseStrength: 0.045,   // jaktfart
  hunterLungeStrength: 2.4,     // hoppets kraft
  hunterBoredAfter: 9,          // ger upp efter (s)
  preyPanicDistance: 2.2,       // bytet blir rädd inom
  safeEdge: 140,                // nära kanten (px) = ifred
  // jägaren väljer dem inte, och slutar jaga om bytet simmar dit
  hunterRestTime: 4,            // vila efter jakt (s)

  // väktare
  watcherViewingDistance: 380,  // avstånd till handen

  // kopplare
  connectorRange: 280,          // kopplingsavstånd
  connectorBreakDistance: 430,  // bryts längre bort än
  connectorMaxTendrils: 2,      // max kopplingar per kopplare
  connectorHoldTime: 4,         // kopplingens längd (s)
  connectorRestTime: 4,         // vila innan ny koppling (s)
  armFeelRange: 220,            // armar sträcks mot celler inom
  connectorReach: 320           // tråd mot hand inom
};

let connectorLinks = [];        // kopplingar mellan armar

// varje bildruta, från script.js

function uppdateraCellarter(time, dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    // upptagen (delas/smälter/dör) -> inget eget
    if (organism.division !== null || organism.fusing || organism.dying) {
      organism.host = null;
      continue;
    }

    if (organism.personality === "parasite") {
      uppdateraParasit(organism, time, dt);
    } else if (organism.personality === "hunter") {
      updateHunter(organism, time, dt);
    } else if (organism.personality === "watcher") {
      updateWatcher(organism, dt);
    } else if (organism.personality === "connector") {
      updateConnectorReach(organism, dt);
    }
  }

  updateConnectorLinks(time, dt);

  // armar mot celler / kopplad kopplare
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].personality === "connector") {
      uppdateraArmar(organisms[i], time, dt);
    }
  }
}

// finns kvar och inte upptagen?
function isAvailable(organism) {
  return organisms.indexOf(organism) !== -1 && !organism.dying && organism.division === null && !organism.fusing;
}

// parasit

function uppdateraParasit(parasite, time, dt) {
  if (parasite.host !== null) {
    uppdateraFastParasit(parasite, time, dt);
    return;
  }

  // vilar eller för rädd
  if (time < parasite.restUntil || parasite.alarm > 0.4) {
    return;
  }

  // letar ibland (inte varje bildruta)
  if (parasite.target === null || (interactionFrame + parasite.seed) % 30 < 1) {
    parasite.target = findHost(parasite);
  }
  const host = parasite.target;
  if (host === null || !isAvailable(host)) {
    parasite.target = null;
    return;
  }

  // simmar mot värden
  const distance = distanceBetween(parasite.x, parasite.y, host.x, host.y);
  if (distance > 1) {
    const strength = 0.04;
    knuffaCell(parasite, (host.x - parasite.x) / distance * strength, (host.y - parasite.y) / distance * strength, dt);
  }

  // nära nog -> fastnar
  if (distance < host.size + parasite.size * 0.5) {
    parasite.host = host;
    parasite.target = null;
    parasite.attachAngle = Math.atan2(parasite.y - host.y, parasite.x - host.x);
    parasite.crawlDirection = slumpaUrLista([-1, 1]);
    parasite.detachTime = time + slumpMellan(SPECIES_SETTINGS.parasiteMinimumStay, SPECIES_SETTINGS.parasiteMaximumStay);
  }
}

// letar stor cell att fastna på
function findHost(parasite) {
  let best = null;
  let bestDistance = SPECIES_SETTINGS.parasiteSearchRange * sizeScale;
  for (let i = 0; i < organisms.length; i++) {
    const other = organisms[i];
    // mycket större, inte parasit
    if (other === parasite || other.personality === "parasite" || other.size < parasite.size * 2.5) {
      continue;
    }
    if (!isAvailable(other)) {
      continue;
    }
    const distance = distanceBetween(parasite.x, parasite.y, other.x, other.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  return best;
}

// parasit som sitter fast
function uppdateraFastParasit(parasite, time, dt) {
  const host = parasite.host;

  // släpper: värd borta / rädd / tiden slut
  const hostGone = !isAvailable(host);
  if (hostGone || parasite.alarm > 0.5 || time > parasite.detachTime) {
    lossaParasit(parasite, time);
    return;
  }

  // kryper runt
  parasite.attachAngle += 0.003 * parasite.crawlDirection * dt;

  // på kanten, lite inne (0.92)
  // kanten rör sig -> räknas varje bildruta
  const edge = radieVidVinkel(host, parasite.attachAngle, time) * 0.92;
  parasite.x = host.x + Math.cos(parasite.attachAngle) * edge;
  parasite.y = host.y + Math.sin(parasite.attachAngle) * edge;
  parasite.vx = host.vx;
  parasite.vy = host.vy;

  // tar lite av värdens färg
  parasite.tintColour = host.palette.glow;
  parasite.tintAmount = Math.max(parasite.tintAmount, 0.35);
}

// parasiten släpper
function lossaParasit(parasite, time) {
  const host = parasite.host;
  parasite.host = null;
  parasite.restUntil = time + SPECIES_SETTINGS.parasiteRestTime;

  // knuffar ifrån
  parasite.vx += Math.cos(parasite.attachAngle) * 1.5;
  parasite.vy += Math.sin(parasite.attachAngle) * 1.5;
  parasite.direction = parasite.attachAngle;

  // värden skakar till
  if (host !== null && organisms.indexOf(host) !== -1) {
    host.agitation = Math.max(host.agitation, 0.4);
  }
}

// jägare

function updateHunter(hunter, time, dt) {
  // om jägaren blir rädd slutar den jaga
  if (hunter.alarm > 0.5) {
    hunter.prey = null;
    return;
  }

  // vilar efter jakt
  if (time < hunter.huntRestUntil) {
    return;
  }

  // väljer byte ibland
  if (hunter.prey === null && (interactionFrame + hunter.seed) % 40 < 1) {
    hunter.prey = hittaByte(hunter);
    hunter.chaseUntil = time + SPECIES_SETTINGS.hunterBoredAfter;
    hunter.nextLunge = time + slumpMellan(1, 3);
  }

  const prey = hunter.prey;
  if (prey === null) {
    return;
  }

  const distance = distanceBetween(hunter.x, hunter.y, prey.x, prey.y);
  const tooFar = distance > SPECIES_SETTINGS.hunterRange * sizeScale * 1.4;
  const preyAtEdge = distanceToEdge(prey) < SPECIES_SETTINGS.safeEdge * sizeScale;
  if (!isAvailable(prey) || tooFar || preyAtEdge || time > hunter.chaseUntil) {
    // byte borta / vid kanten / tröttnat
    // vila + simma mot mitten
    hunter.prey = null;
    hunter.huntRestUntil = time + SPECIES_SETTINGS.hunterRestTime;
    hunter.direction = Math.atan2(height / 2 - hunter.y, width / 2 - hunter.x);
    return;
  }

  // jaga
  if (distance > 1) {
    const towardsX = (prey.x - hunter.x) / distance;
    const towardsY = (prey.y - hunter.y) / distance;
    knuffaCell(hunter, towardsX * SPECIES_SETTINGS.hunterChaseStrength, towardsY * SPECIES_SETTINGS.hunterChaseStrength, dt);
    hunter.agitation = Math.max(hunter.agitation, 0.3);   // rör sig vilt

    // efter några sekunder: hopp
    if (time > hunter.nextLunge) {
      hunter.vx += towardsX * SPECIES_SETTINGS.hunterLungeStrength;
      hunter.vy += towardsY * SPECIES_SETTINGS.hunterLungeStrength;
      hunter.nextLunge = time + slumpMellan(2, 4);
    }

    // bytet blir rädd när jägaren är nära
    const panicDistance = hunter.size + prey.size * SPECIES_SETTINGS.preyPanicDistance;
    if (distance < panicDistance) {
      prey.alarm = Math.max(prey.alarm, 0.6);

      // bytet flyr, men svänger in mot mitten nära kanten
      // (fastnar inte i kanten)
      // edgeAmount: 0 långt från kanten, 1 vid kanten
      const edgeAmount = Math.max(0, 1 - distanceToEdge(prey) / (SPECIES_SETTINGS.safeEdge * sizeScale * 2));
      const toCentreAngle = Math.atan2(height / 2 - prey.y, width / 2 - prey.x);
      const fleeX = towardsX * (1 - edgeAmount) + Math.cos(toCentreAngle) * edgeAmount;
      const fleeY = towardsY * (1 - edgeAmount) + Math.sin(toCentreAngle) * edgeAmount;
      knuffaCell(prey, fleeX * 0.15, fleeY * 0.15, dt);
    }
  }
}

// avstånd till närmaste kant (px)
function distanceToEdge(organism) {
  return Math.min(organism.x, width - organism.x, organism.y, height - organism.y);
}

// letar mindre cell att jaga
function hittaByte(hunter) {
  let best = null;
  let bestDistance = SPECIES_SETTINGS.hunterRange * sizeScale;
  for (let i = 0; i < organisms.length; i++) {
    const other = organisms[i];
    // mycket mindre, inte jägare
    if (other === hunter || other.personality === "hunter" || other.size > hunter.size * 0.75) {
      continue;
    }
    if (!isAvailable(other)) {
      continue;
    }
    // nära kanten = ifred
    if (distanceToEdge(other) < SPECIES_SETTINGS.safeEdge * sizeScale) {
      continue;
    }
    const distance = distanceBetween(hunter.x, hunter.y, other.x, other.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  return best;
}

// väktare
// nyfiken, närmar sig närmaste handen (inte för nära)
function updateWatcher(watcher, dt) {
  if (watcher.alarm > 0.3) {
    return;
  }

  // närmaste synliga hand
  const hands = [tracking.leftHand, tracking.rightHand];
  let target = null;
  let distance = Infinity;
  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    if (hand.visible) {
      const handDistance = distanceBetween(watcher.x, watcher.y, hand.x, hand.y);
      if (handDistance < distance) {
        distance = handDistance;
        target = hand;
      }
    }
  }
  if (target === null || distance < 1) {
    return;
  }

  const comfortable = SPECIES_SETTINGS.watcherViewingDistance * sizeScale;
  const towardsX = (target.x - watcher.x) / distance;
  const towardsY = (target.y - watcher.y) / distance;

  if (distance > comfortable) {
    knuffaCell(watcher, towardsX * 0.02, towardsY * 0.02, dt);      // närmare
  } else if (distance < comfortable * 0.7) {
    knuffaCell(watcher, -towardsX * 0.02, -towardsY * 0.02, dt);    // för nära: backa
  }
}

// kopplare: tråd mot närmaste hand
// rädd = drar in
function updateConnectorReach(connector, dt) {
  const hands = [tracking.leftHand, tracking.rightHand];
  let target = null;
  let bestDistance = SPECIES_SETTINGS.connectorReach * sizeScale;

  for (let i = 0; i < hands.length; i++) {
    if (hands[i].visible) {
      const distance = distanceBetween(connector.x, connector.y, hands[i].x, hands[i].y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = hands[i];
      }
    }
  }

  let wanted = 0;
  if (target !== null) {
    wanted = 1 - connector.alarm;   // rädd = drar in
    connector.reachX = target.x;
    connector.reachY = target.y;
  }
  connector.reachAmount += (wanted - connector.reachAmount) * 0.05 * dt;
}

// antal trådar
function countConnectorLinks(organism) {
  let count = 0;
  for (let i = 0; i < connectorLinks.length; i++) {
    if (connectorLinks[i].a === organism || connectorLinks[i].b === organism) {
      count += 1;
    }
  }
  return count;
}

// tråd redan mellan dem?
function connectorLinkExists(a, b) {
  for (let i = 0; i < connectorLinks.length; i++) {
    const link = connectorLinks[i];
    if ((link.a === a && link.b === b) || (link.a === b && link.b === a)) {
      return true;
    }
  }
  return false;
}

// nya trådar + uppdatera gamla
function updateConnectorLinks(time, dt) {
  // 1. lugna kopplare kopplar ihop (var 20:e bildruta)
  if (interactionFrame % 20 === 0) {
    for (let i = 0; i < organisms.length; i++) {
      const connector = organisms[i];
      if (connector.personality !== "connector" || !isAvailable(connector) || connector.alarm > 0.3) {
        continue;
      }
      if (time < connector.linkRestUntil) {
        continue;   // vilar efter koppling
      }
      if (countConnectorLinks(connector) >= SPECIES_SETTINGS.connectorMaxTendrils) {
        continue;
      }
      const neighbour = hittaGranneAttKoppla(connector, time);
      if (neighbour !== null) {
        connectorLinks.push({
          a: connector,
          b: neighbour,
          armA: valjArm(connector, neighbour),   // a:s arm närmast b
          armB: valjArm(neighbour, connector),   // b:s arm närmast a
          restLength: distanceBetween(connector.x, connector.y, neighbour.x, neighbour.y),
          life: 0,                                // 0 = inte framme, 1 = kopplade
          endTime: time + SPECIES_SETTINGS.connectorHoldTime * slumpMellan(0.7, 1.3)   // när de släpper
        });
      }
    }
  }

  // 2. trådar växer, sträcks, vissnar, går sönder
  const kept = [];
  const breakLength = SPECIES_SETTINGS.connectorBreakDistance * sizeScale;

  for (let i = 0; i < connectorLinks.length; i++) {
    const link = connectorLinks[i];
    if (!isAvailable(link.a) || !isAvailable(link.b)) {
      slappKoppling(link, time);
      continue;
    }

    const length = distanceBetween(link.a.x, link.a.y, link.b.x, link.b.y);
    if (length > breakLength) {
      snapLink(link, length);   // i interaktioner.js: gnistor + knäpp
      slappKoppling(link, time);
      continue;
    }

    // armar mot varandra, släpper när tiden är slut / rädd
    if (link.a.alarm > 0.4 || link.b.alarm > 0.4 || time > link.endTime) {
      link.life -= 0.03 * dt;
    } else {
      link.life = Math.min(1, link.life + 0.02 * dt);
    }
    if (link.life <= 0) {
      slappKoppling(link, time);
      continue;
    }

    // gummiband, följs åt
    const stretch = length - link.restLength;
    if (stretch > 0 && length > 1) {
      const strength = Math.min(stretch * 0.0004, 0.04) * link.life;
      const dirX = (link.b.x - link.a.x) / length;
      const dirY = (link.b.y - link.a.y) / length;
      knuffaCell(link.a, dirX * strength, dirY * strength, dt);
      knuffaCell(link.b, -dirX * strength, -dirY * strength, dt);
    }

    kept.push(link);
  }
  connectorLinks = kept;
}

// letar kopplare att koppla med
function hittaGranneAttKoppla(connector, time) {
  let best = null;
  let bestDistance = SPECIES_SETTINGS.connectorRange * sizeScale;
  for (let i = 0; i < organisms.length; i++) {
    const other = organisms[i];
    if (other === connector || other.personality !== "connector" || !isAvailable(other)) {
      continue;
    }
    if (connectorLinkExists(connector, other) || time < other.linkRestUntil || other.alarm > 0.3) {
      continue;
    }
    if (countConnectorLinks(other) >= SPECIES_SETTINGS.connectorMaxTendrils) {
      continue;
    }
    const distance = distanceBetween(connector.x, connector.y, other.x, other.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  return best;
}

// arm närmast en annan cell
function valjArm(connector, other) {
  const arms = getLooks(connector).arms;
  const towards = Math.atan2(other.y - connector.y, other.x - connector.x);
  let best = arms[0];
  let bestDifference = 10;
  for (let i = 0; i < arms.length; i++) {
    if (arms[i].link) {
      continue;   // armen redan kopplad
    }
    // vinkelskillnad, 0 till π
    const difference = Math.abs(Math.atan2(Math.sin(arms[i].angle - towards), Math.cos(arms[i].angle - towards)));
    if (difference < bestDifference) {
      bestDifference = difference;
      best = arms[i];
    }
  }
  best.link = true;
  return best;
}

// släpp koppling: armar lediga, vila
function slappKoppling(link, time) {
  link.armA.link = false;
  link.armB.link = false;
  link.a.linkRestUntil = time + SPECIES_SETTINGS.connectorRestTime;
  link.b.linkRestUntil = time + SPECIES_SETTINGS.connectorRestTime;
}

// armarnas riktning + längd:
// - kopplad: mot mitten mellan kopplarna, spets lyser
// - ledig: lite mot närmaste cell
// - annars: svaj
function uppdateraArmar(connector, time, dt) {
  const looks = getLooks(connector);
  const size = connector.size;
  const normalLength = size * LOOKS_SETTINGS.armLength;   // x arm.length

  for (let i = 0; i < looks.arms.length; i++) {
    const arm = looks.arms[i];
    let angle = arm.angle + Math.sin(time * 0.4 + arm.phase) * 0.25;   // svaj
    let length = normalLength * arm.length;
    let glow = 0;

    // 1. kopplad?
    let link = null;
    for (let k = 0; k < connectorLinks.length; k++) {
      const l = connectorLinks[k];
      if ((l.a === connector && l.armA === arm) || (l.b === connector && l.armB === arm)) {
        link = l;
      }
    }

    if (link !== null) {
      const other = link.a === connector ? link.b : link.a;
      const distance = distanceBetween(connector.x, connector.y, other.x, other.y);
      const towards = Math.atan2(other.y - connector.y, other.x - connector.x);
      const meetLength = Math.max(normalLength * 0.5, distance / 2 - size);   // spetsen når mitten
      // längre liv = närmare mitten
      angle = angle + Math.atan2(Math.sin(towards - angle), Math.cos(towards - angle)) * link.life;
      length = length + (meetLength - length) * link.life;
      glow = link.life;
    } else {
      // 2. annars: lite mot närmaste cell i armens riktning
      let nearest = null;
      let nearestDistance = SPECIES_SETTINGS.armFeelRange * sizeScale;
      for (let k = 0; k < organisms.length; k++) {
        const other = organisms[k];
        if (other === connector) {
          continue;
        }
        const distance = distanceBetween(connector.x, connector.y, other.x, other.y);
        const towards = Math.atan2(other.y - connector.y, other.x - connector.x);
        const difference = Math.abs(Math.atan2(Math.sin(towards - angle), Math.cos(towards - angle)));
        if (distance < nearestDistance && difference < 0.9) {
          nearestDistance = distance;
          nearest = other;
        }
      }
      if (nearest !== null) {
        const towards = Math.atan2(nearest.y - connector.y, nearest.x - connector.x);
        angle = angle + Math.atan2(Math.sin(towards - angle), Math.cos(towards - angle)) * 0.5;
        // längre, men inte ända fram
        length = Math.min(length * 1.4, Math.max(length, nearestDistance - size - nearest.size * 0.6));
      }
    }

    // mjuk ändring
    if (arm.angleNow === undefined) {
      arm.angleNow = angle;
      arm.lengthNow = length;
      arm.glow = 0;
    }
    arm.angleNow += Math.atan2(Math.sin(angle - arm.angleNow), Math.cos(angle - arm.angleNow)) * 0.08 * dt;
    arm.lengthNow += (length - arm.lengthNow) * 0.06 * dt;
    arm.glow += (glow - arm.glow) * 0.1 * dt;
  }
}

// ritar trådarna. (script.js innan cellerna ritas)

function drawSpeciesTendrils(time) {
  ctx.globalCompositeOperation = "lighter";

  // trådar mot händer
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.personality === "connector" && organism.reachAmount > 0.02) {
      drawReachingTendril(organism, time);
    }
  }

  ctx.globalCompositeOperation = "source-over";
}

// slingrig tråd cell -> hand
function drawReachingTendril(organism, time) {
  const dx = organism.reachX - organism.x;
  const dy = organism.reachY - organism.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1) {
    return;
  }
  const dirX = dx / distance;
  const dirY = dy / distance;
  const sideX = -dirY;   // åt sidan från tråden
  const sideY = dirX;

  // längd, når aldrig ända fram
  const length = Math.max(0, distance - 30) * 0.85 * organism.reachAmount;

  // små bitar, slingrar mer längst ut
  const segments = 14;
  let previousX = organism.x;
  let previousY = organism.y;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;   // 0 vid cellen, 1 längst ut
    const wriggle = Math.sin(t * 8 - time * 6 + organism.seed) * 14 * t * sizeScale;
    const x = organism.x + dirX * length * t + sideX * wriggle;
    const y = organism.y + dirY * length * t + sideY * wriggle;

    ctx.strokeStyle = hexTillRgba(organism.palette.glow, 0.8 * organism.reachAmount);
    ctx.lineWidth = Math.max(0.6, (1 - t) * 5 * sizeScale);   // tjock -> tunn
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(previousX, previousY);
    ctx.lineTo(x, y);
    ctx.stroke();

    previousX = x;
    previousY = y;
  }

  // lysande prick i änden
  ctx.fillStyle = "rgba(255, 255, 255, " + (0.7 * organism.reachAmount) + ")";
  ctx.beginPath();
  ctx.arc(previousX, previousY, 2.5 * sizeScale, 0, Math.PI * 2);
  ctx.fill();
}

// text till debug-panelen
function beskrivCellarter() {
  let attached = 0;
  let hunting = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].host !== null) {
      attached += 1;
    }
    if (organisms[i].prey !== null) {
      hunting += 1;
    }
  }
  return "parasites attached: " + attached + "   hunters chasing: " + hunting +
    "   connector links: " + connectorLinks.length + "\n";
}

const EYE_SETTINGS = {
  openSpeed: 0.02,         // öppningsfart
  snapOpenChance: 0.3,     // chans att öppnas direkt
  maxWakeDelay: 3,         // öppnas 0-3 s efter att någon kommit
  blinkMinimum: 2.5,       // tid mellan blinkningar (min-max s)
  blinkMaximum: 7,
  blinkDuration: 0.18,     // blinkningens längd (s)
  followSpeed: 0.12,       // hur snabbt de följer handen
  startleSpeed: 1.5,       // snabbare hand -> rädda ögon
  sleepingOpenness: 0.06   // öppenhet när ingen är där (0 = stängda)
};

let eyesStartled = 0;      // rädsla just nu (0-1)

// ger en watcher-cell sina ögon (1, 2 eller 3 st)
function createEyes(organism) {
  organism.eyes = [];
  const count = slumpHeltal(1, 3);
  const startAngle = Math.random() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    let distance = 0.4;
    let size = 0.26;
    if (count === 1) {
      // ett öga = stort, nästan i mitten
      distance = slumpMellan(0, 0.15);
      size = slumpMellan(0.4, 0.48);
    } else {
      distance = slumpMellan(0.32, 0.48);
      size = slumpMellan(0.2, 0.3);
    }

    // sprids ut runt cellen
    const angle = startAngle + (i / count) * Math.PI * 2 + slumpMellan(-0.3, 0.3);
    organism.eyes.push(createEye(angle, distance, size, 1));
  }
}

// skapar ett öga
// growth 0 -> 1 om det växer fram (mutation)
function createEye(angle, distance, size, growth) {
  return {
    angle: angle,              // plats (vinkel, radianer)
    distance: distance,        // avstånd från mitten
    size: size,                // storlek
    tilt: slumpMellan(-0.35, 0.35),   // lutar lite
    growth: growth,

    openness: EYE_SETTINGS.sleepingOpenness,
    awakeTime: 0,              // hur länge någon varit här
    wakeDelay: Math.random() * EYE_SETTINGS.maxWakeDelay,
    snapsOpen: Math.random() < EYE_SETTINGS.snapOpenChance,
    hasSnapped: false,

    nextBlink: 0,
    blinkProgress: -1,         // -1 = blinkar inte, annars 0 -> 1

    lookX: 0,                  // titta sida: -1 vänster, 1 höger
    lookY: 0                   // titta upp/ner: -1 upp, 1 ner
  };
}

// nytt öga som växer fram (mutation)
function addEye(organism) {
  organism.hasEyes = true;
  if (organism.eyes.length === 0 && organism.personality === "watcher") {
    createEyes(organism);
    return;
  }
  const angle = Math.random() * Math.PI * 2;
  organism.eyes.push(createEye(angle, slumpMellan(0.15, 0.45), slumpMellan(0.22, 0.34), 0));
}

// varje bildruta, alla ögon

function updateEyes(time, dt) {
  const seconds = dt / 60;

  // syns en hand?
  const left = tracking.leftHand;
  const right = tracking.rightHand;
  const someoneIsThere = left.visible || right.visible;

  // snabb hand -> alla ögon rädda
  const fastestHand = Math.max(left.visible ? left.speed : 0, right.visible ? right.speed : 0);
  if (fastestHand / width > EYE_SETTINGS.startleSpeed) {
    eyesStartled = 1;
  }
  eyesStartled = Math.max(0, eyesStartled - 0.025 * dt);

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (!organism.hasEyes) {
      continue;
    }
    if (organism.eyes.length === 0) {
      createEyes(organism);
    }

    for (let j = 0; j < organism.eyes.length; j++) {
      updateEye(organism, organism.eyes[j], someoneIsThere, time, seconds, dt);
    }
  }
}

// ett öga: öppna, blinka, titta
function updateEye(organism, eye, someoneIsThere, time, seconds, dt) {
  // växer lite varje bildruta
  if (eye.growth < 1) {
    eye.growth = Math.min(1, eye.growth + 0.006 * dt);
  }

  // VAKNA
  if (someoneIsThere) {
    eye.awakeTime += seconds;
  } else {
    eye.awakeTime = 0;
    eye.hasSnapped = false;
  }
  const awake = eye.awakeTime > eye.wakeDelay;

  let targetOpenness = EYE_SETTINGS.sleepingOpenness;
  if (awake) {
    targetOpenness = 1;
    // rädd = extra öppna
    targetOpenness += organism.alarm * 0.15 + eyesStartled * 0.25;
  }

  let speed = EYE_SETTINGS.openSpeed;
  if (awake && eye.snapsOpen && !eye.hasSnapped) {
    // öppnas direkt
    speed = 0.4;
    eye.hasSnapped = true;
    spelaLjud("blink", organism.x, organism.size);
  }
  eye.openness += (targetOpenness - eye.openness) * Math.min(speed * dt, 1);

  // BLINKA
  if (eye.blinkProgress >= 0) {
    eye.blinkProgress += seconds / EYE_SETTINGS.blinkDuration;
    if (eye.blinkProgress >= 1) {
      eye.blinkProgress = -1;   // klar
    }
  } else if (awake && time > eye.nextBlink) {
    eye.blinkProgress = 0;
    eye.nextBlink = time + slumpMellan(EYE_SETTINGS.blinkMinimum, EYE_SETTINGS.blinkMaximum);
  }

  // TITTA
  const target = findLookTarget(organism, time);
  const eyeX = organism.x + Math.cos(eye.angle) * eye.distance * organism.size;
  const eyeY = organism.y + Math.sin(eye.angle) * eye.distance * organism.size;
  const dx = target.x - eyeX;
  const dy = target.y - eyeY;
  const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);

  // pupillen mot målet (max 1)
  const reach = Math.min(distance / 200, 1);
  const wantX = (dx / distance) * reach;
  const wantY = (dy / distance) * reach;
  eye.lookX += (wantX - eye.lookX) * EYE_SETTINGS.followSpeed * dt;
  eye.lookY += (wantY - eye.lookY) * EYE_SETTINGS.followSpeed * dt;
}

// vad ska cellen titta på?
// närmaste handen, annars framåt
function findLookTarget(organism, time) {
  const hands = [tracking.leftHand, tracking.rightHand];
  let best = null;
  let bestDistance = Infinity;

  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    if (hand.visible) {
      const distance = distanceBetween(organism.x, organism.y, hand.x, hand.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: hand.x, y: hand.y };
      }
    }
  }
  if (best !== null) {
    return best;
  }

  // ingen här: titta dit cellen simmar
  return {
    x: organism.x + Math.cos(organism.direction + Math.sin(time * 0.7 + organism.seed)) * 300,
    y: organism.y + Math.sin(organism.direction + Math.sin(time * 0.7 + organism.seed)) * 300
  };
}

// RITA ÖGON
// alla ögon på en cell, från ritaCell (script.js)

function drawEyes(organism, time) {
  for (let i = 0; i < organism.eyes.length; i++) {
    drawEye(organism, organism.eyes[i], time);
  }
}

// ett öga
function drawEye(organism, eye, time) {
  const bodySize = organism.size * organism.breath;
  const radius = eye.size * bodySize * eye.growth;
  if (radius < 1) {
    return;
  }

  // blinkning: stängs och öppnas
  let openness = eye.openness;
  if (eye.blinkProgress >= 0) {
    openness = openness * (1 - Math.sin(eye.blinkProgress * Math.PI));
  }

  const eyeX = organism.x + Math.cos(eye.angle) * eye.distance * bodySize;
  const eyeY = organism.y + Math.sin(eye.angle) * eye.distance * bodySize;
  const palette = organism.palette;

  // flytta/vrid ritytan, ögats mitt på (0, 0)
  ctx.save();
  ctx.translate(eyeX, eyeY);
  ctx.rotate(eye.tilt);

  // mörk skugga runt ögat
  ctx.globalCompositeOperation = "source-over";
  const socket = ctx.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius * 1.6);
  socket.addColorStop(0, "rgba(5, 0, 15, 0.7)");
  socket.addColorStop(1, "rgba(5, 0, 15, 0)");
  ctx.fillStyle = socket;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // mandelform, två bågar
  // högre bågar = mer öppet
  const lidHeight = radius * Math.max(openness, 0.04) * 1.25;
  const opening = new Path2D();
  opening.moveTo(-radius, 0);
  opening.quadraticCurveTo(0, -lidHeight, radius, 0);
  opening.quadraticCurveTo(0, lidHeight, -radius, 0);
  opening.closePath();

  if (openness > 0.05) {
    ctx.save();
    ctx.clip(opening);
    drawEyeball(radius, eye, palette, openness, organism);
    ctx.restore();
  }

  // tunn lysande kant på ögonlocket
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.7);
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.stroke(opening);

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

// insidan: hinna, iris, pupill
function drawEyeball(radius, eye, palette, openness, organism) {
  // inte vitt, svagt ljus i cellens färger
  const membrane = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  membrane.addColorStop(0, hexTillRgba(palette.core, 0.55));
  membrane.addColorStop(1, "rgba(10, 0, 25, 0.95)");
  ctx.fillStyle = membrane;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // irisen flyttar dit ögat tittar
  const irisX = eye.lookX * radius * 0.42;
  const irisY = eye.lookY * radius * 0.28;
  const irisRadius = radius * 0.62;

  const iris = ctx.createRadialGradient(irisX, irisY, 0, irisX, irisY, irisRadius);
  iris.addColorStop(0, palette.glow);
  iris.addColorStop(0.55, palette.middle);
  iris.addColorStop(0.9, palette.edge);
  iris.addColorStop(1, "rgba(5, 0, 15, 1)");
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(irisX, irisY, irisRadius, 0, Math.PI * 2);
  ctx.fill();

  // linjer ut från mitten = levande iris
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = Math.max(0.5, radius * 0.025);
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(irisX + Math.cos(angle) * irisRadius * 0.3, irisY + Math.sin(angle) * irisRadius * 0.3);
    ctx.lineTo(irisX + Math.cos(angle) * irisRadius * 0.95, irisY + Math.sin(angle) * irisRadius * 0.95);
    ctx.stroke();
  }

  // smal pupill (katt)
  // smalare när rädd
  let slitWidth = radius * (0.05 + 0.1 * (1 - eyesStartled));

  // rädd = liten pupill, förvånad = stor och rund (CELLREAKTIONER)
  slitWidth = getMoodPupilWidth(organism, slitWidth, irisRadius);
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(irisX, irisY, slitWidth, irisRadius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // liten glansprick
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.arc(irisX - irisRadius * 0.35, irisY - irisRadius * 0.35, Math.max(1, radius * 0.08), 0, Math.PI * 2);
  ctx.fill();

  // skugga under ögonlocket
  const lidShadow = ctx.createLinearGradient(0, -radius * openness, 0, 0);
  lidShadow.addColorStop(0, "rgba(5, 0, 15, 0.8)");
  lidShadow.addColorStop(1, "rgba(5, 0, 15, 0)");
  ctx.fillStyle = lidShadow;
  ctx.fillRect(-radius, -radius, radius * 2, radius);
}

// text till debug-panelen
function describeEyes() {
  let eyes = 0;
  let open = 0;
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    for (let j = 0; j < organism.eyes.length; j++) {
      eyes += 1;
      if (organism.eyes[j].openness > 0.5) {
        open += 1;
      }
    }
  }
  return "eyes: " + eyes + "  (open: " + open + ")\n";
}

const ATMOSPHERE_SETTINGS = {
  // fotspår
  footprintSpacing: 22,      // avstånd innan nytt fotspår (px)
  footprintSize: 70,         // storlek (px)
  footprintLife: 3,          // livstid (s)
  footprintBrightness: 0.07, // ljusstyrka
  maxFootprints: 120,        // max antal (fler = långsamt)
  planktonReach: 110,        // prickar flyttar sig inom (px)

  // sömn
  sleepAfter: 60,            // sekunder utan händer -> somnar
  fallAsleepSpeed: 0.0025,   // insomningsfart
  wakeWaveSpeed: 700,        // hur snabbt uppvaknande-vågen sprider sig (px/sekund)
  sleepDimming: 0.6,         // hur mycket mörkare cellerna blir när de sover (60 % mörkare)
  sleepSlowdown: 0.7,        // hur mycket långsammare cellerna simmar när de sover (70 % långsammare)
  sleepMusicVolume: 0.35     // hur hög musiken är när allt sover (35 % av vanlig volym)
};

// VARIABLER SOM KOMMER IHÅG LÄGET

let footprints = [];   // fotspår som lyser nu

// senaste fotspår per hand
const lastFootprint = {
  left: { x: -1000, y: -1000 },
  right: { x: -1000, y: -1000 }
};

const sleep = {
  state: "awake",       // läget just nu: "awake", "falling asleep", "asleep"  eller "waking" 
  lastVisitorTime: 0,   // när någon syntes senast (sek)
  waveX: 0,             // vågens start
  waveY: 0,
  waveRadius: 0         // hur stor vågen har hunnit bli (px)
};

// UPPDATERING
// varje bildruta, från script.js

function updateAtmosphere(time, dt) {
  updateFootprints(tracking.leftHand, "left", "#00E5FF", dt);
  updateFootprints(tracking.rightHand, "right", "#FF28B9", dt);
  fadeFootprints(dt);

  updateSleep(time, dt);
}

// LYSANDE FOTSPÅR
// fotspår efter händerna (handspår :D)

function updateFootprints(hand, name, colour, dt) {
  if (!hand.visible) {
    return;
  }

  // bara ett nytt fotspår när handen har flyttat sig en bit.
  // inte när stilla
  const last = lastFootprint[name];
  const moved = distanceBetween(last.x, last.y, hand.x, hand.y);
  if (moved > ATMOSPHERE_SETTINGS.footprintSpacing * sizeScale) {
    addFootprint(hand.x, hand.y, colour, hand.speed);
    last.x = hand.x;
    last.y = hand.y;
  }

  // bakgrundsprickar nära handen flyttar sig + lyser
  const reach = ATMOSPHERE_SETTINGS.planktonReach * sizeScale;
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];
    const distance = distanceBetween(hand.x, hand.y, particle.x, particle.y);
    if (distance < reach && distance > 1) {
      const closeness = 1 - distance / reach;   // 1 vid handen, 0 långt bort
      particle.x += (particle.x - hand.x) / distance * closeness * 1.5 * dt;
      particle.y += (particle.y - hand.y) / distance * closeness * 1.5 * dt;
      particle.glow = Math.max(particle.glow, closeness);
    }
  }
}

// lägger till nytt fotspår
function addFootprint(x, y, colour, speed) {
  if (footprints.length >= ATMOSPHERE_SETTINGS.maxFootprints) {
    footprints.shift();   // för många fotspår -> tar bort det äldsta
  }

  // snabb hand = större fotspår
  const speedBonus = Math.min(speed / width, 1) * 0.5;

  // små prickar i varje fotspår, som ser ut som plankton
  const specks = [];
  for (let i = 0; i < 4; i++) {
    specks.push({
      offsetX: slumpMellan(-1, 1),
      offsetY: slumpMellan(-1, 1),
      size: slumpMellan(0.8, 2)
    });
  }

  footprints.push({
    x: x,
    y: y,
    life: 1,   // life går från 1 ner till 0. 0 försvinner fotspåret
    size: ATMOSPHERE_SETTINGS.footprintSize * sizeScale * (1 + speedBonus),
    colour: colour,
    specks: specks
  });
}

// fotspår bleknar, tas bort
function fadeFootprints(dt) {
  // (dt / 60) = sekunder sedan förra bildrutan
  const fade = (dt / 60) / ATMOSPHERE_SETTINGS.footprintLife;
  const kept = [];
  for (let i = 0; i < footprints.length; i++) {
    footprints[i].life -= fade;
    if (footprints[i].life > 0) {
      kept.push(footprints[i]);
    }
  }
  footprints = kept;

  // prickarna slutar lysa
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].glow > 0) {
      particles[i].glow = Math.max(0, particles[i].glow - 0.02 * dt);
    }
  }
}

// SÖMN OCH UPPVAKNANDE
// vaken / somnar / vaknar

function updateSleep(time, dt) {
  const left = tracking.leftHand;
  const right = tracking.rightHand;
  const someoneIsThere = left.visible || right.visible;

  if (someoneIsThere) {
    sleep.lastVisitorTime = time;

    // någon kom medan allt sov -> våg från handen
    if (sleep.state === "asleep" || sleep.state === "falling asleep") {
      startaUppvaknande(left, right);
    }
  } else if (sleep.state === "awake" && time - sleep.lastVisitorTime > ATMOSPHERE_SETTINGS.sleepAfter) {
    // ingen har varit här på länge -> somna
    sleep.state = "falling asleep";
  }

  if (sleep.state === "falling asleep") {
    somnaLangsamt(dt);
  } else if (sleep.state === "waking") {
    spreadWakeWave(dt);
  }

  // genomsnittlig sömnighet
  // (script.js gör bakgrunden mörkare)
  let total = 0;
  for (let i = 0; i < organisms.length; i++) {
    total += organisms[i].sleepiness;
  }
  if (organisms.length > 0) {
    ecosystemSleep = total / organisms.length;
  }

  updateSleepMusic();
}

// alla somnar, olika snabbt
function somnaLangsamt(dt) {
  let everyoneAsleep = true;
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    // seed = slumptal per cell -> olika fart
    const speed = ATMOSPHERE_SETTINGS.fallAsleepSpeed * (0.6 + (organism.seed % 1) * 0.8);
    organism.sleepiness = Math.min(1, organism.sleepiness + speed * dt);
    if (organism.sleepiness < 1) {
      everyoneAsleep = false;
    }
  }
  if (everyoneAsleep) {
    sleep.state = "asleep";
  }
}

// starta uppvaknandet
function startaUppvaknande(left, right) {
  sleep.state = "waking";
  sleep.waveRadius = 0;

  // vågen från handen, annars mitten
  if (left.visible) {
    sleep.waveX = left.x;
    sleep.waveY = left.y;
  } else if (right.visible) {
    sleep.waveX = right.x;
    sleep.waveY = right.y;
  } else {
    sleep.waveX = width / 2;
    sleep.waveY = height / 2;
  }
}

// vågen växer, når den en cell -> vaknar
function spreadWakeWave(dt) {
  sleep.waveRadius += ATMOSPHERE_SETTINGS.wakeWaveSpeed * (dt / 60);

  let everyoneAwake = true;
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    const distance = distanceBetween(sleep.waveX, sleep.waveY, organism.x, organism.y);

    if (distance < sleep.waveRadius) {
      // cellen rycker till
      if (organism.sleepiness > 0.5) {
        organism.agitation = Math.max(organism.agitation, 0.6);
      }
      organism.sleepiness = Math.max(0, organism.sleepiness - 0.06 * dt);
    }
    if (organism.sleepiness > 0) {
      everyoneAwake = false;
    }
  }

  if (everyoneAwake) {
    sleep.state = "awake";
  }
}

// tystare musik när allt sover
// (om ljudet är igång)
function updateSleepMusic() {
  if (audio === null) {
    return;
  }
  const volume = 1 - (1 - ATMOSPHERE_SETTINGS.sleepMusicVolume) * ecosystemSleep;
  mixer.music.gain.setTargetAtTime(SOUND_SETTINGS.musicVolume * volume, audio.currentTime, 0.3);
}

// z: somna direkt (test)
function somnaDirekt() {
  sleep.state = "falling asleep";
  sleep.lastVisitorTime = -1000;
}

// ritar fotspåren, från script.js
// före prickar och celler = längst bak
function drawFootprints() {
  if (footprints.length === 0) {
    return;
  }
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < footprints.length; i++) {
    const footprint = footprints[i];
    const brightness = ATMOSPHERE_SETTINGS.footprintBrightness * footprint.life;

    // mjukt runt ljus
    const glow = ctx.createRadialGradient(footprint.x, footprint.y, 0, footprint.x, footprint.y, footprint.size);
    glow.addColorStop(0, hexTillRgba(footprint.colour, brightness));
    glow.addColorStop(1, hexTillRgba(footprint.colour, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(footprint.x, footprint.y, footprint.size, 0, Math.PI * 2);
    ctx.fill();

    // små lysande prickar
    ctx.fillStyle = hexTillRgba(footprint.colour, footprint.life * 0.6);
    for (let j = 0; j < footprint.specks.length; j++) {
      const speck = footprint.specks[j];
      ctx.beginPath();
      ctx.arc(
        footprint.x + speck.offsetX * footprint.size * 0.6,
        footprint.y + speck.offsetY * footprint.size * 0.6,
        speck.size, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";
}

// text till debug-panelen
function describeAtmosphere() {
  let text = "ecosystem: " + sleep.state + "  (sleep " + Math.round(ecosystemSleep * 100) + "%)";
  if (sleep.state === "awake") {
    const secondsLeft = Math.max(0, ATMOSPHERE_SETTINGS.sleepAfter - (performance.now() / 1000 - sleep.lastVisitorTime));
    text += "  sleeps in " + Math.round(secondsLeft) + " s";
  }
  return text + "\nfootprints: " + footprints.length + "\n";
}

const SOUND_SETTINGS = {
  masterVolume: 0.8,        // total volym (0-1)
  musicVolume: 0.55,        // takt + bas
  effectsVolume: 0.8,       // interaktionsljud
  quietFilter: 260,         // dov musik när ingen är där
  openFilter: 7000,         // klar musik
  playHats: true,           // hi-hat på/av
  bassNotes: [55, 43.65, 65.41, 49],  // bastoner (hz): a, f, c, g. byter var 16:e slag

  // eget ljud vid nyp och håll (samma mapp som index.html)
  // loopar medan man håller, tonas ut efter sammansmältning
  fusionSoundFile: "mergesound2.mp3",
  fusionSoundVolume: 0.9,   // volym (0-1)
  fusionFadeIn: 0.15,       // intoning (s)
  fusionFadeOut: 0.6,       // uttoning (s)

  // eget ljud när cellerna blir en (plask)
  mergeSoundFile: "mergesound1.mp3",
  mergeSoundVolume: 1       // volym (0-1)
};

// STARTA LJUDET

let audio = null;              // webbläsarens mixerbord
let soundMuted = false;

// alla ljuddelar
const mixer = {
  master: null,                // master-volym
  music: null,                 // takt + bas
  musicFilter: null,           // filter, klarare när händer syns
  effects: null,               // interaktionsljud
  noiseBuffer: null,           // 2 s brus
  fusionSample: null,          // nyp-ljudfil (null = inte laddad)
  fusionSampleStatus: "not loaded",
  mergeSample: null,           // plask-ljudfil (null = inte laddad)
  mergeSampleStatus: "not loaded",
  bassOscillators: [],
  bassFilter: null,
  bassVolume: null,
  handVoices: {},              // ljud per hand
  tendrilHum: null,
  tendrilHumVolume: null
};

// taktens klocka
let audioTimeOffset = 0;       // skillnad bild-/ljudklocka
let nextStep = 0;              // nästa steg att planera
let handPresence = 0;          // 0 = inga händer, 1 = händer (mjukt)

// startar allt ljud (körs när man klickar på enter)
function startaLjud() {
  if (audio !== null) {
    return;   // redan igång
  }

  // gamla safari-webbläsare använder ett annat namn tydligen
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) {
    console.warn("web audio is not supported in this browser");
    return;
  }
  audio = new AudioContextType();

  // MIXERBORDET
  // kompressor, inga söndriga ljud
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  compressor.connect(audio.destination);

  mixer.master = audio.createGain();
  mixer.master.gain.value = SOUND_SETTINGS.masterVolume;
  mixer.master.connect(compressor);

  // musiken går filter → volym → den sista volymknappen
  mixer.musicFilter = audio.createBiquadFilter();
  mixer.musicFilter.type = "lowpass";
  mixer.musicFilter.frequency.value = SOUND_SETTINGS.quietFilter;
  mixer.musicFilter.Q.value = 1.5;   // lite sjungande filter

  mixer.music = audio.createGain();
  mixer.music.gain.value = SOUND_SETTINGS.musicVolume;
  mixer.musicFilter.connect(mixer.music);
  mixer.music.connect(mixer.master);

  mixer.effects = audio.createGain();
  mixer.effects.gain.value = SOUND_SETTINGS.effectsVolume;
  mixer.effects.connect(mixer.master);

  // VITT BRUS (SLUMPTAL -1 TILL 1)
  const length = audio.sampleRate * 2;
  mixer.noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
  const samples = mixer.noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }

  // försöker ladda egen ljudfil (i bakgrunden)
  laddaLjudfil("fusion", SOUND_SETTINGS.fusionSoundFile);
  laddaLjudfil("merge", SOUND_SETTINGS.mergeSoundFile);

  skapaBas();
  skapaHandljud("left");
  skapaHandljud("right");
  createTendrilHum();

  // LJUD OCH BILD I SAMMA TAKT
  audioTimeOffset = performance.now() / 1000 - audio.currentTime;
  const secondsPerStep = 60 / SETTINGS.bpm / 2;   // två steg per taktslag
  nextStep = Math.ceil((audio.currentTime + audioTimeOffset) / secondsPerStep);

  // var 25:e millisekund planeras tonerna som ska spelas snart = jämn takt oavsett
  
  setInterval(planeraTakt, 25);
}

// stänger av och sätter på ljudet
function toggleMute() {
  if (audio === null) {
    return;
  }
  soundMuted = !soundMuted;
  let target = SOUND_SETTINGS.masterVolume;
  if (soundMuted) {
    target = 0;
  }
  // mjuk ändring, inga klick
  mixer.master.gain.setTargetAtTime(target, audio.currentTime, 0.1);
}

// ljud från rätt håll
// -1 = vänster, 1 = höger, efter skärmplats
function skapaPannerVidX(x) {
  const panner = audio.createStereoPanner();
  let pan = (x / width) * 2 - 1;
  pan = Math.max(-1, Math.min(pan, 1));
  panner.pan.value = pan * 0.8;
  panner.connect(mixer.effects);
  return panner;
}

// TAKTEN
// planerar takten i förväg

function planeraTakt() {
  const secondsPerStep = 60 / SETTINGS.bpm / 2;
  const lookAhead = 0.12;

  // alla steg inom en liten stund
  while (true) {
    // när, på ljudets klocka
    const stepTime = nextStep * secondsPerStep - audioTimeOffset;
    if (stepTime > audio.currentTime + lookAhead) {
      break;
    }
    if (stepTime >= audio.currentTime) {
      spelaSteg(nextStep, stepTime);
    }
    nextStep += 1;
  }
}

// spelar ett steg i takten (trumma, high-hat)
function spelaSteg(step, time) {
  const beatNumber = Math.floor(step / 2);
  const isOnBeat = step % 2 === 0;

  if (isOnBeat) {
    spelaKick(time, beatNumber % 16 === 0);
    duckBass(time);
    // byter bastonen 16:e slag
    if (beatNumber % 16 === 0) {
      const noteIndex = Math.floor(beatNumber / 16) % SOUND_SETTINGS.bassNotes.length;
      bytBaston(SOUND_SETTINGS.bassNotes[noteIndex], time);
    }
  } else if (SOUND_SETTINGS.playHats) {
    spelaHihat(time);
  }
}

// spelar trumman (kick)
function spelaKick(time, isStrong) {
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(150, time);
  oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.12);

  let loudness = 0.9;
  if (isStrong) {
    loudness = 1.2;   // var 16:e slag: extra stark
  }
  volume.gain.setValueAtTime(loudness, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

  oscillator.connect(volume);
  volume.connect(mixer.musicFilter);
  oscillator.start(time);
  oscillator.stop(time + 0.5);
}

// hi-hat: kort ljust brus
function spelaHihat(time) {
  const noise = audio.createBufferSource();
  noise.buffer = mixer.noiseBuffer;
  const highpass = audio.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 7000;
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.12, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  noise.connect(highpass);
  highpass.connect(volume);
  volume.connect(mixer.musicFilter);
  // startar slumpat i bruset, varje high-hat låter olika
  noise.start(time, Math.random() * 1.5, 0.06);
}

// skapar basen
function skapaBas() {
  mixer.bassFilter = audio.createBiquadFilter();
  mixer.bassFilter.type = "lowpass";
  mixer.bassFilter.frequency.value = 180;

  mixer.bassVolume = audio.createGain();
  mixer.bassVolume.gain.value = 0.35;

  mixer.bassFilter.connect(mixer.bassVolume);
  mixer.bassVolume.connect(mixer.musicFilter);

  const detune = [-8, 8];   // hur mycket tonerna skiljer
  for (let i = 0; i < 2; i++) {
    const oscillator = audio.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = SOUND_SETTINGS.bassNotes[0];
    oscillator.detune.value = detune[i];
    oscillator.connect(mixer.bassFilter);
    oscillator.start();
    mixer.bassOscillators.push(oscillator);
  }
}

// byt baston
function bytBaston(frequency, time) {
  for (let i = 0; i < mixer.bassOscillators.length; i++) {
    mixer.bassOscillators[i].frequency.setTargetAtTime(frequency, time, 0.05);
  }
}

// basen tystnar vid varje trumslag (sidechain)
// -> pumpande rave-ljud
function duckBass(time) {
  mixer.bassVolume.gain.cancelScheduledValues(time);
  mixer.bassVolume.gain.setValueAtTime(0.06, time);
  mixer.bassVolume.gain.linearRampToValueAtTime(0.35, time + 0.3);
}

// LJUD SOM ÄNDRAS HELA TIDEN (FRÅN script.js)

// ljud per hand:
// sus för öppen hand, slem för nyp
function skapaHandljud(name) {
  const voice = {};

  // senaste nyp-håll (för uppdateraHandljud)
  voice.lastHolding = -10;

  // merge ljudfilen
  voice.sampleSource = null;
  voice.sampleVolume = null;

  // filter på brusljud
  voice.whoosh = audio.createBufferSource();
  voice.whoosh.buffer = mixer.noiseBuffer;
  voice.whoosh.loop = true;
  voice.whooshFilter = audio.createBiquadFilter();
  voice.whooshFilter.type = "bandpass";
  voice.whooshFilter.frequency.value = 800;
  voice.whooshFilter.Q.value = 0.8;
  voice.whooshVolume = audio.createGain();
  voice.whooshVolume.gain.value = 0;

  voice.panner = audio.createStereoPanner();
  voice.panner.connect(mixer.effects);

  voice.whoosh.connect(voice.whooshFilter);
  voice.whooshFilter.connect(voice.whooshVolume);
  voice.whooshVolume.connect(voice.panner);

  voice.whoosh.start();
  mixer.handVoices[name] = voice;
}

// surr när det finns trådar
// ljusare när de sträcks
function createTendrilHum() {
  mixer.tendrilHum = audio.createOscillator();
  mixer.tendrilHum.type = "sawtooth";
  mixer.tendrilHum.frequency.value = 220;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  mixer.tendrilHumVolume = audio.createGain();
  mixer.tendrilHumVolume.gain.value = 0;

  mixer.tendrilHum.connect(filter);
  filter.connect(mixer.tendrilHumVolume);
  mixer.tendrilHumVolume.connect(mixer.effects);
  mixer.tendrilHum.start();
}

// varje bildruta, från script.js
function uppdateraLjud() {
  if (audio === null) {
    return;
  }
  const now = audio.currentTime;

  // 1. klarare musik när händer syns (som att gå in på en klubb)
  // handPresence ändras mjukt
  const handsVisible = tracking.leftHand.visible || tracking.rightHand.visible;
  handPresence += ((handsVisible ? 1 : 0) - handPresence) * 0.03;
  const intensity = 0.25 * handPresence;
  // gånger i stället för plus = naturligare filter
  const cutoff = SOUND_SETTINGS.quietFilter * Math.pow(SOUND_SETTINGS.openFilter / SOUND_SETTINGS.quietFilter, intensity);
  mixer.musicFilter.frequency.setTargetAtTime(cutoff, now, 0.15);

  // 2. handljud
  uppdateraHandljud(mixer.handVoices.left, tracking.leftHand, handEffects.left, fusionStates.left, now);
  uppdateraHandljud(mixer.handVoices.right, tracking.rightHand, handEffects.right, fusionStates.right, now);

  // 3. trådsurr: fler = starkare, sträckta = ljusare
  const links = symbiosis.links;
  let humVolume = 0;
  let averageStretch = 1;
  if (links.length > 0) {
    let totalStretch = 0;
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      totalStretch += distanceBetween(link.a.x, link.a.y, link.b.x, link.b.y) / link.restLength;
    }
    averageStretch = totalStretch / links.length;
    humVolume = Math.min(links.length / 12, 1) * 0.05;
  }
  mixer.tendrilHum.frequency.setTargetAtTime(110 * averageStretch, now, 0.1);
  mixer.tendrilHumVolume.gain.setTargetAtTime(humVolume, now, 0.2);
}

// handljud varje bildruta
function uppdateraHandljud(voice, hand, effect, fusionState, now) {
  // ljud från handens plats
  let pan = (hand.x / width) * 2 - 1;
  pan = Math.max(-1, Math.min(pan, 1));
  voice.panner.pan.setTargetAtTime(pan * 0.8, now, 0.05);

  // ljudfilen bara när nypet håller celler
  // (väntar lite innan stopp, inget hack)
  if (fusionState.captured.length > 0) {
    voice.lastHolding = now;
  }
  const holdingSomething = now - voice.lastHolding < 0.4;

  if (mixer.fusionSample !== null) {
    // ljudfil medan man håller + sammansmältning
    const fusionActive = holdingSomething || fusionState.melting !== null;
    if (fusionActive && voice.sampleSource === null) {
      startaFusionsljud(voice, now);
    } else if (!fusionActive && voice.sampleSource !== null) {
      stoppaFusionsljud(voice, now);
    }
  }

  // öppen hand: sus, starkare/ljusare vid fart
  let speedFactor = 0;
  if (hand.visible) {
    speedFactor = Math.min(hand.speed / width, 1.5);
  }
  const whooshVolume = effect.palmPower * (0.03 + speedFactor * 0.12);
  voice.whooshFilter.frequency.setTargetAtTime(500 + speedFactor * 1500, now, 0.05);
  voice.whooshVolume.gain.setTargetAtTime(whooshVolume, now, 0.08);
}

// LJUD SOM SPELAS EN GÅNG
//
// anropas med spelaLjud("namn", x, size)
// x = skärmplats (vänster/höger), size = cellens storlek

function spelaLjud(name, x, size) {
  if (audio === null || soundMuted) {
    return;
  }

  // stor cell = mörkare ljud
  let pitch = 50 / Math.max(size, 10);
  pitch = Math.max(0.35, Math.min(pitch, 2.5));

  if (name === "slice") {
    spelaSnitt(x, pitch);
  } else if (name === "division") {
    spelaDelning(x, pitch);
  } else if (name === "flinch") {
    spelaRyck(x, pitch);
  } else if (name === "fusion") {
    // plask en gång (nyp-ljudet tonas ut, se uppdateraHandljud)
    if (mixer.mergeSample !== null) {
      spelaPlaskljud(x);
    }
  } else if (name === "snap") {
    playSnap(x);
  } else if (name === "mutation") {
    spelaMutation(x, pitch);
  } else if (name === "blink") {
    spelaBlink(x);
  } else if (name === "surprise") {
    playSurprise(x, pitch);
  } else if (name === "eat") {
    spelaMums(x, pitch);
  }
}

// snittljud: blött shhk
function spelaSnitt(x, pitch) {
  const time = audio.currentTime;
  const noise = audio.createBufferSource();
  noise.buffer = mixer.noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(5000 * pitch, time);
  filter.frequency.exponentialRampToValueAtTime(400 * pitch, time + 0.18);
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.6, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

  noise.connect(filter);
  filter.connect(volume);
  volume.connect(skapaPannerVidX(x));
  noise.start(time, Math.random() * 1.5, 0.25);
}

// delning: två pip
function spelaDelning(x, pitch) {
  const time = audio.currentTime;
  const baseNote = 330 * pitch;
  const notes = [baseNote, baseNote * 1.5];   // andra tonen 1.5x ljusare
  for (let i = 0; i < notes.length; i++) {
    const start = time + i * 0.07;
    const oscillator = audio.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(notes[i] * 0.7, start);
    oscillator.frequency.exponentialRampToValueAtTime(notes[i], start + 0.06);
    const volume = audio.createGain();
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    oscillator.connect(volume);
    volume.connect(skapaPannerVidX(x + (i - 0.5) * 120));   // ett pip vänster, ett höger
    oscillator.start(start);
    oscillator.stop(start + 0.35);
  }
}

// låg duns, kunde inte delas
function spelaRyck(x, pitch) {
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(180 * pitch, time);
  oscillator.frequency.exponentialRampToValueAtTime(60 * pitch, time + 0.15);
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.3, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  oscillator.connect(volume);
  volume.connect(skapaPannerVidX(x));
  oscillator.start(time);
  oscillator.stop(time + 0.25);
}

// EGEN LJUDFIL

// laddar mp3 till mixer
// name: "fusion" (nyp) eller "merge" (plask)
// async = fryser inte allt annat
async function laddaLjudfil(name, file) {
  if (file === null) {
    mixer[name + "SampleStatus"] = "none (no file set)";
    return;
  }
  try {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error("file not found (" + response.status + ")");
    }
    const bytes = await response.arrayBuffer();
    // mp3 -> spelbart ljud
    const sample = await audio.decodeAudioData(bytes);
    mixer[name + "Sample"] = sample;
    mixer[name + "SampleStatus"] = "your file (" + file + ", " + sample.duration.toFixed(1) + " s)";
  } catch (error) {
    mixer[name + "SampleStatus"] = "none (" + file + ": " + error.message + ")";
    console.warn("could not load " + file + ":", error);
  }
}

// plask en gång, där cellerna smälte ihop
function spelaPlaskljud(x) {
  const source = audio.createBufferSource();
  source.buffer = mixer.mergeSample;   // ingen loop

  const volume = audio.createGain();
  volume.gain.value = SOUND_SETTINGS.mergeSoundVolume;

  source.connect(volume);
  volume.connect(skapaPannerVidX(x));
  source.start(audio.currentTime);
}

// startar ljudfilen för en hand, loop, mjuk start
function startaFusionsljud(voice, now) {
  const source = audio.createBufferSource();
  source.buffer = mixer.fusionSample;
  source.loop = true;   // loop medan man håller

  // egen volym per ljud -> gammalt tystnar,
  // nytt börjar
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(SOUND_SETTINGS.fusionSoundVolume, now + SOUND_SETTINGS.fusionFadeIn);

  source.connect(volume);
  volume.connect(voice.panner);   // följer handen vänster/höger
  source.start(now);

  voice.sampleSource = source;
  voice.sampleVolume = volume;
}

// tona ut + stäng av ljudfilen
function stoppaFusionsljud(voice, now) {
  const fade = SOUND_SETTINGS.fusionFadeOut;
  voice.sampleVolume.gain.cancelScheduledValues(now);
  voice.sampleVolume.gain.setValueAtTime(voice.sampleVolume.gain.value, now);
  // mjukt ner till 0
  voice.sampleVolume.gain.setTargetAtTime(0, now, fade / 4);
  voice.sampleSource.stop(now + fade + 0.1);

  voice.sampleSource = null;
  voice.sampleVolume = null;
}

// tråd går sönder: knäpp
function playSnap(x) {
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = "triangle";
  const startPitch = slumpMellan(900, 1400);
  oscillator.frequency.setValueAtTime(startPitch, time);
  oscillator.frequency.exponentialRampToValueAtTime(startPitch * 0.4, time + 0.12);
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.25, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  oscillator.connect(volume);
  volume.connect(skapaPannerVidX(x));
  oscillator.start(time);
  oscillator.stop(time + 0.2);
}

// mutation: darrande ton
function spelaMutation(x, pitch) {
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = 160 * pitch;

  // lfo = långsam ton som gungar den andra
  const lfo = audio.createOscillator();
  lfo.frequency.value = 9;
  const lfoDepth = audio.createGain();
  lfoDepth.gain.value = 40 * pitch;
  lfo.connect(lfoDepth);
  lfoDepth.connect(oscillator.frequency);

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(300, time);
  filter.frequency.exponentialRampToValueAtTime(2500, time + 0.6);
  filter.frequency.exponentialRampToValueAtTime(300, time + 1.2);

  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(0.12, time + 0.2);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 1.3);

  oscillator.connect(filter);
  filter.connect(volume);
  volume.connect(skapaPannerVidX(x));
  oscillator.start(time);
  lfo.start(time);
  oscillator.stop(time + 1.4);
  lfo.stop(time + 1.4);
}

// blött klick, öga blinkar/öppnas
function spelaBlink(x) {
  const time = audio.currentTime;
  const noise = audio.createBufferSource();
  noise.buffer = mixer.noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2500;
  filter.Q.value = 8;
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.15, time);
  volume.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  noise.connect(filter);
  filter.connect(volume);
  volume.connect(skapaPannerVidX(x));
  noise.start(time, Math.random() * 1.5, 0.04);
}

// förvånad: bloop (CELLREAKTIONER)
// ton snabbt uppåt, "oj!"
function playSurprise(x, pitch) {
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(260 * pitch, time);
  oscillator.frequency.exponentialRampToValueAtTime(620 * pitch, time + 0.09);

  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(0.18, time + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

  oscillator.connect(volume);
  volume.connect(skapaPannerVidX(x));
  oscillator.start(time);
  oscillator.stop(time + 0.22);
}

// äter: mums, mjuk ton nedåt
function spelaMums(x, pitch) {
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(420 * pitch, time);
  oscillator.frequency.exponentialRampToValueAtTime(170 * pitch, time + 0.12);

  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(0.16, time + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

  oscillator.connect(volume);
  volume.connect(skapaPannerVidX(x));
  oscillator.start(time);
  oscillator.stop(time + 0.18);
}

// text till debug-panelen
function beskrivLjud() {
  if (audio === null) {
    return "sound: off (starts when entering)\n";
  }
  let state = audio.state;
  if (soundMuted) {
    state = "muted";
  }
  return "sound: " + state + "   filter: " + Math.round(mixer.musicFilter.frequency.value) + " Hz\n" +
    "fusion sound: " + mixer.fusionSampleStatus + "\n" +
    "merge sound: " + mixer.mergeSampleStatus + "\n";
}

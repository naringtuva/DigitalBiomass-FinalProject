const INTERACTION_SETTINGS = {
  // rädsla
  contraction: 0.25,         // hur mycket mindre rädda celler blir (25 % mindre)
  calmDownSpeed: 0.006,      // lugnar sig långsamt

  // händer
  pushStrength: 0.32,        // öppen hand: knuffkraft
  pullStrength: 0.11,        // nyp: dragkraft
  pinchRangeMultiplier: 1.5, // nypet når längre än handen
  gestureFadeSpeed: 0.08,    // gestens in/uttoning

  //två händer
  handsTogetherDistance: 0.2,  // händer närmare än 20 % av bredden = "ihop"
  gatherRadius: 460,           // celler inom detta blir med i nätverket
  linkDistance: 280,           // max avstånd för tråd
  breakDistance: 640,          // tråden går sönder längre än
  maxLinks: 24,                // max antal trådar

  maxEffectParticles: 220      // max antal gnistor/prickar (fler = långsamt)
};

// VARIABLER

// extra info per hand
const handEffects = {
  left: { palmPower: 0, pinchPower: 0, wasPinching: false, pinchX: 0, pinchY: 0 },
  right: { palmPower: 0, pinchPower: 0, wasPinching: false, pinchX: 0, pinchY: 0 }
};

// nätverk med två händer
const symbiosis = {
  gathering: false,   // händerna nära varandra
  stretching: false,  // händerna dras isär, nätverket kvar
  power: 0,           // styrka 0-1
  centreX: 0,
  centreY: 0,
  links: []           // alla trådar
};

let effectParticles = [];      // små lysande effektprickar
let interactionFrame = 0;      // räknar bildrutor används det för att göra vissa saker bara ibland

// UPPDATERING
// uppdateraInteraktioner körs hela tiden (varje bildruta) från script.js

function uppdateraInteraktioner(time, dt) {
  interactionFrame += 1;

  // nollställ knuffar varje bildruta
  for (let i = 0; i < organisms.length; i++) {
    organisms[i].forceX = 0;
    organisms[i].forceY = 0;
    organisms[i].isInteracting = false;
    organisms[i].pushedByPalm = false;   // öppen hand knuffar (CELLREAKTIONER)
    organisms[i].pulledByPinch = false;  // nyp drar (CELLREAKTIONER)
  }

  lugnaCeller(dt);
  // nätverk först, då knuffar inte handen
  uppdateraSymbios(time, dt);
  hanteraHandInteraktion(tracking.leftHand, handEffects.left, dt);
  hanteraHandInteraktion(tracking.rightHand, handEffects.right, dt);

  // gör så att cellerna sträcks ut åt det håll dom knuffas
  for (let i = 0; i < organisms.length; i++) {
    uppdateraDrag(organisms[i]);
  }

  uppdateraEffektpartiklar(dt);
}

// räknar ut hur lätt en cell är. små celler är lätta stora celler är tunga
function getLightness(organism) {
  const lightness = (45 * sizeScale) / organism.size;
  return Math.max(0.35, Math.min(lightness, 2));
}

// knuffar cellen. knuffen ändrar cellens fart, och vi sparar den så att cellen kan sträckas åt det hållet (uppdateraDrag)
function knuffaCell(organism, forceX, forceY, dt) {
  const lightness = getLightness(organism);
  organism.vx += forceX * lightness * dt;
  organism.vy += forceY * lightness * dt;
  organism.forceX += forceX;
  organism.forceY += forceY;
}

// cellen sträcks ut åt det håll den knuffas MEST typ
function uppdateraDrag(organism) {
  const forceSize = Math.sqrt(organism.forceX * organism.forceX + organism.forceY * organism.forceY);
  const targetTug = Math.min(forceSize * 1.6, 0.5);

  // mjuk ändring
  organism.tugAmount += (targetTug - organism.tugAmount) * 0.12;
  if (forceSize > 0.001) {
    organism.tugAngle = Math.atan2(organism.forceY, organism.forceX);
  }
}

// Räknar ut avståndet mellan två punkter (med pythagoras)
function distanceBetween(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// rädda celler lugnar sig
function lugnaCeller(dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    organism.alarm = Math.max(0, organism.alarm - INTERACTION_SETTINGS.calmDownSpeed * dt);

    // rädd = mer nervös
    organism.agitation = Math.max(organism.agitation, organism.alarm * 0.5);
  }
}

// vad gör handen och påverka cellerna

function hanteraHandInteraktion(hand, effect, dt) {
  // mjuk start/stopp
  const fade = INTERACTION_SETTINGS.gestureFadeSpeed * dt;
  // handen knuffar inte under nätverk
  // (händerna öppnas ofta då)
  const networkActive = symbiosis.gathering || symbiosis.stretching;
  const palmTarget = hand.visible && hand.isOpenPalm && !networkActive ? 1 : 0;
  const pinchTarget = hand.visible && hand.isPinching ? 1 : 0;
  effect.palmPower += (palmTarget - effect.palmPower) * fade;
  effect.pinchPower += (pinchTarget - effect.pinchPower) * fade;

  if (hand.visible) {
    effect.pinchX = hand.pinchX;
    effect.pinchY = hand.pinchY;
  }

  // släpper nyp -> cellerna flyter iväg
  if (effect.wasPinching && !hand.isPinching) {
    avslutaNyp(effect, dt);
  }
  effect.wasPinching = hand.visible && hand.isPinching;

  if (effect.palmPower > 0.01) {
    knuffaMedHandflata(hand, effect, dt);
  }
  if (effect.pinchPower > 0.01) {
    draMotNyp(effect, dt);
    if (hand.visible && hand.isPinching) {
      skapaNypPartiklar(effect);
    }
  }
}

// knuffa bort celler från öppen hand
function knuffaMedHandflata(hand, effect, dt) {
  const radius = SETTINGS.handInfluenceRadius * sizeScale;

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    const distance = distanceBetween(hand.x, hand.y, organism.x, organism.y);
    // "inne" om någon del är i området
    const reach = radius + organism.size;

    if (distance < reach && distance > 1) {
      // knuffen är 1 vid handen och 0 vid kanten. starkare knuff nära handen

      let falloff = 1 - distance / reach;
      falloff = falloff * falloff;
      const strength = INTERACTION_SETTINGS.pushStrength * falloff * effect.palmPower;
      const awayX = (organism.x - hand.x) / distance;
      const awayY = (organism.y - hand.y) / distance;
      knuffaCell(organism, awayX * strength, awayY * strength, dt);

      // rädd, mer nära handen. fearfulness per sort
      organism.alarm = Math.max(organism.alarm, Math.min(1, falloff * effect.palmPower * organism.fearfulness));

      // när cellen knuffas rör den sig "vilt" en stund
      organism.agitation = Math.min(1, organism.agitation + falloff * 0.15 * dt);
      organism.isInteracting = true;
      organism.pushedByPalm = true;
    }
  }
}

// dra celler mot nyp
function draMotNyp(effect, dt) {
  const radius = SETTINGS.handInfluenceRadius * sizeScale * INTERACTION_SETTINGS.pinchRangeMultiplier;

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    const distance = distanceBetween(organism.x, organism.y, effect.pinchX, effect.pinchY);
    const reach = radius + organism.size;

    if (distance < reach && distance > 1) {
      const falloff = 1 - distance / reach;
      let strength = INTERACTION_SETTINGS.pullStrength * (0.3 + falloff) * effect.pinchPower;

      // nära fingrarna drar nypet svagare. cellerna samlas runt fingrarna i stället för att flyga igenom
      if (distance < organism.size * 1.2) {
        strength = strength * (distance / (organism.size * 1.2));
      }

      const towardsX = (effect.pinchX - organism.x) / distance;
      const towardsY = (effect.pinchY - organism.y) / distance;
      knuffaCell(organism, towardsX * strength, towardsY * strength, dt);

      // cellerna saktar in när de hålls (annars snurrar de runt)
      const hold = 1 - 0.04 * effect.pinchPower * falloff;
      organism.vx *= hold;
      organism.vy *= hold;

      organism.wasPinched = true;
      organism.isInteracting = true;

      // bara när nypet håller (inte när det håller på att släppa)
      if (effect.pinchPower > 0.3) {
        organism.pulledByPinch = true;
      }
    }
  }
}

// knuffa cellerna utåt när man släpper nypet
function avslutaNyp(effect, dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (!organism.wasPinched) {
      continue;
    }
    organism.wasPinched = false;
    const distance = distanceBetween(effect.pinchX, effect.pinchY, organism.x, organism.y);
    if (distance > 1) {
      const kick = 0.9;
      organism.vx += (organism.x - effect.pinchX) / distance * kick;
      organism.vy += (organism.y - effect.pinchY) / distance * kick;
    }
  }
}

function uppdateraSymbios(time, dt) {
  const left = tracking.leftHand;
  const right = tracking.rightHand;
  const bothHands = left.visible && right.visible;

  let handsDistance = Infinity;
  if (bothHands) {
    handsDistance = distanceBetween(left.x, left.y, right.x, right.y);
    symbiosis.centreX = (left.x + right.x) / 2;
    symbiosis.centreY = (left.y + right.y) / 2;
  }

  symbiosis.gathering = bothHands && handsDistance < width * INTERACTION_SETTINGS.handsTogetherDistance;
  symbiosis.stretching = bothHands && !symbiosis.gathering && symbiosis.links.length > 0;

  let powerTarget = 0;
  if (symbiosis.gathering) {
    powerTarget = 1;
  }
  symbiosis.power += (powerTarget - symbiosis.power) * 0.04 * dt;

  if (symbiosis.gathering) {
    samlaCeller(dt);
    // nya trådar görs bara var 8:e bildruta (mndra belastning)
    if (interactionFrame % 8 === 0) {
      createLinks();
    }
  }

  if (symbiosis.stretching) {
    followHands(left, right, dt);
  }

  updateLinks(bothHands, dt);
}

// samla cellerna runt händerna när de är ihop
function samlaCeller(dt) {
  const radius = INTERACTION_SETTINGS.gatherRadius * sizeScale;

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    const distance = distanceBetween(organism.x, organism.y, symbiosis.centreX, symbiosis.centreY);

    if (distance < radius) {
      organism.inNetworkZone = true;

      // kommer ihåg vilken hand cellen hör till (sidan av skärmen den är på)
      if (organism.x < symbiosis.centreX) {
        organism.side = "left";
      } else {
        organism.side = "right";
      }

      // dras mjukt mot händerna, svagare nära
      if (distance > organism.size * 2) {
        const strength = 0.09 * symbiosis.power * (1 - distance / radius);
        knuffaCell(organism,
          (symbiosis.centreX - organism.x) / distance * strength,
          (symbiosis.centreY - organism.y) / distance * strength, dt);
      }
      organism.isInteracting = true;
    } else {
      organism.inNetworkZone = false;
    }
  }
}

// har cellerna en tråd mellan sig?
function linkExists(a, b) {
  for (let i = 0; i < symbiosis.links.length; i++) {
    const link = symbiosis.links[i];
    if ((link.a === a && link.b === b) || (link.a === b && link.b === a)) {
      return true;
    }
  }
  return false;
}

// gör tråd mellan celler nära avarandra
function createLinks() {
  const maxDistance = INTERACTION_SETTINGS.linkDistance * sizeScale;

  for (let i = 0; i < organisms.length; i++) {
    for (let j = i + 1; j < organisms.length; j++) {
      if (symbiosis.links.length >= INTERACTION_SETTINGS.maxLinks) {
        return;
      }
      const a = organisms[i];
      const b = organisms[j];
      if (!a.inNetworkZone || !b.inNetworkZone || linkExists(a, b)) {
        continue;
      }
      const distance = distanceBetween(a.x, a.y, b.x, b.y);
      if (distance < maxDistance) {
        symbiosis.links.push({
          a: a,
          b: b,
          restLength: Math.max(distance, (a.size + b.size) * 1.1),
          life: 0,                     // tråden växer fram 0 -> 1
          seed: Math.random() * 100
        });
      }
    }
  }
}

// cellerna följer handen på sin sida
function followHands(left, right, dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (!isLinked(organism)) {
      continue;
    }
    let hand = right;
    if (organism.side === "left") {
      hand = left;
    }
    const distance = distanceBetween(organism.x, organism.y, hand.x, hand.y);
    if (distance > organism.size * 2) {
      const strength = 0.07;
      knuffaCell(organism, (hand.x - organism.x) / distance * strength, (hand.y - organism.y) / distance * strength, dt);
    }
    organism.isInteracting = true;
  }
}

// har den här cellen en tråd?
function isLinked(organism) {
  for (let i = 0; i < symbiosis.links.length; i++) {
    if (symbiosis.links[i].a === organism || symbiosis.links[i].b === organism) {
      return true;
    }
  }
  return false;
}

// ändrar alla trådar - växer, stretch, vissnar eller går sönder
function updateLinks(bothHands, dt) {
  const breakLength = INTERACTION_SETTINGS.breakDistance * sizeScale;
  const keptLinks = [];

  for (let i = 0; i < symbiosis.links.length; i++) {
    const link = symbiosis.links[i];
    const a = link.a;
    const b = link.b;

    // en cell kan försvunnit (till exempel om den har delats)
    if (organisms.indexOf(a) === -1 || organisms.indexOf(b) === -1) {
      continue;
    }

    const length = distanceBetween(a.x, a.y, b.x, b.y);

    // tråf går sönder om den blir för lång
    if (length > breakLength) {
      snapLink(link, length);
      continue;
    }

    // växer när ihop, tröttnar när sträckt,
    // vissnar utan händer
    if (symbiosis.gathering) {
      link.life = Math.min(1, link.life + 0.03 * dt);
    } else if (bothHands) {
      link.life -= 0.0025 * dt;   // orkar ca 6 s sträckning
      if (link.life <= 0) {
        snapLink(link, Math.max(length, 1));
        continue;
      }
    } else {
      link.life -= 0.012 * dt;
      if (link.life <= 0) {
        continue;   // tråden är vissen - ta bort den
      }
    }

    // tråden är som ett gummiband när den sträcks drar den ihop cellerna lite
    const stretch = length - link.restLength;
    if (stretch > 0 && length > 1) {
      const strength = Math.min(stretch * 0.0006, 0.08) * link.life;
      const dirX = (b.x - a.x) / length;
      const dirY = (b.y - a.y) / length;
      knuffaCell(a, dirX * strength, dirY * strength, dt);
      knuffaCell(b, -dirX * strength, -dirY * strength, dt);
    }

    // tar lite av varandras färg
    a.tintColour = b.palette.glow;
    b.tintColour = a.palette.glow;
    a.tintAmount = Math.max(a.tintAmount, 0.45 * link.life);
    b.tintAmount = Math.max(b.tintAmount, 0.45 * link.life);

    keptLinks.push(link);
  }

  symbiosis.links = keptLinks;
}

// tråd  går sönder, med gnistor och ljud
function snapLink(link, length) {
  const a = link.a;
  const b = link.b;

  // studsar isär
  const dirX = (b.x - a.x) / length;
  const dirY = (b.y - a.y) / length;
  a.vx -= dirX * 1.2;
  a.vy -= dirY * 1.2;
  b.vx += dirX * 1.2;
  b.vy += dirY * 1.2;
  a.agitation = 1;
  b.agitation = 1;

  // gnistor vid brottet
  const middleX = (a.x + b.x) / 2;
  const middleY = (a.y + b.y) / 2;

  spelaLjud("snap", middleX, 30);
  for (let i = 0; i < 14; i++) {
    let colour = a.palette.glow;
    if (i % 2 === 0) {
      colour = b.palette.glow;
    }
    nyEffektpartikel(middleX, middleY, slumpMellan(-3, 3), slumpMellan(-3, 3), colour, slumpMellan(0.015, 0.035), "spark");
  }
}

// liten lysande prick

function nyEffektpartikel(x, y, vx, vy, colour, fadeSpeed, kind) {
  if (effectParticles.length >= INTERACTION_SETTINGS.maxEffectParticles) {
    return;   // skippa om för många prickar redan
  }
  effectParticles.push({
    x: x,
    y: y,
    vx: vx,
    vy: vy,
    life: 1,                // life 1 -> 0, sedan borta
    fadeSpeed: fadeSpeed,
    colour: colour,
    size: slumpMellan(1, 2.5),
    kind: kind,             // "pinch" = mot fingrarna, "spark" = gnista
    hand: null
  });
}

// nyp effekt med snurrande prickar
function skapaNypPartiklar(effect) {
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = slumpMellan(40, 90) * sizeScale;
    const x = effect.pinchX + Math.cos(angle) * distance;
    const y = effect.pinchY + Math.sin(angle) * distance;
    nyEffektpartikel(x, y, 0, 0, slumpaUrLista(PARTICLE_COLOURS), slumpMellan(0.012, 0.025), "pinch");
    if (effectParticles.length > 0) {
      effectParticles[effectParticles.length - 1].hand = effect;
    }
  }
}

// flytta alla små prickar och ta bort de som dött
function uppdateraEffektpartiklar(dt) {
  const alive = [];

  for (let i = 0; i < effectParticles.length; i++) {
    const particle = effectParticles[i];

    if (particle.kind === "pinch" && particle.hand !== null && particle.hand.pinchPower > 0.1) {
      // spiral in mot fingrarna
      const dx = particle.hand.pinchX - particle.x;
      const dy = particle.hand.pinchY - particle.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      particle.vx += (dx / distance * 0.25 - dy / distance * 0.18) * dt;
      particle.vy += (dy / distance * 0.25 + dx / distance * 0.18) * dt;
    }

    particle.vx *= 0.94;
    particle.vy *= 0.94;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= particle.fadeSpeed * dt;

    if (particle.life > 0) {
      alive.push(particle);
    }
  }

  effectParticles = alive;
}

// RITA

// rita trådar innan cellerna, så att det ser ut som att de växer ut ur cellerna
function drawTendrils(time) {
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < symbiosis.links.length; i++) {
    drawTendril(symbiosis.links[i], time);
  }

  ctx.globalCompositeOperation = "source-over";
}

// rita tråd mellan två celler
function drawTendril(link, time) {
  const a = link.a;
  const b = link.b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) {
    return;
  }

  // mer sträckt = smalare
  const stretch = length / link.restLength;
  const thickness = Math.max(0.8, 5 / stretch) * link.life;

  // böjer och svajar
  // (-dy, dx) = åt sidan
  const sideX = -dy / length;
  const sideY = dx / length;
  const sway = Math.sin(time * 1.7 + link.seed) * length * 0.15;
  const controlX = (a.x + b.x) / 2 + sideX * sway;
  const controlY = (a.y + b.y) / 2 + sideY * sway;

  // färg från cell a till cell b
  const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  gradient.addColorStop(0, hexTillRgba(a.palette.glow, 0.85 * link.life));
  gradient.addColorStop(1, hexTillRgba(b.palette.glow, 0.85 * link.life));

  // brett glow + smal tråd
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";

  ctx.globalAlpha = 0.2;
  ctx.lineWidth = thickness * 5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(controlX, controlY, b.x, b.y);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(controlX, controlY, b.x, b.y);
  ctx.stroke();

  // ljusprick längs tråden
  // t 0 -> 1 = plats på kurvan
  const t = (time * 0.5 + link.seed) % 1;
  const inverse = 1 - t;
  const dropX = inverse * inverse * a.x + 2 * inverse * t * controlX + t * t * b.x;
  const dropY = inverse * inverse * a.y + 2 * inverse * t * controlY + t * t * b.y;
  ctx.fillStyle = "rgba(255, 255, 255, " + (0.6 * link.life) + ")";
  ctx.beginPath();
  ctx.arc(dropX, dropY, thickness * 1.2 + 1, 0, Math.PI * 2);
  ctx.fill();
}

// ringar, prickar, gnistor från händerna
// (efter cellerna)
function ritaHandeffekter(time) {
  ctx.globalCompositeOperation = "lighter";

  drawForceField(tracking.leftHand, handEffects.left, "#00E5FF", time);
  drawForceField(tracking.rightHand, handEffects.right, "#FF28B9", time);

  for (let i = 0; i < effectParticles.length; i++) {
    const particle = effectParticles[i];
    ctx.fillStyle = hexTillRgba(particle.colour, particle.life);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

// svag lysande ring runt öppen hand
function drawForceField(hand, effect, colour, time) {
  if (effect.palmPower < 0.02) {
    return;
  }

  const radius = SETTINGS.handInfluenceRadius * sizeScale * 0.55;
  const power = effect.palmPower;

  // mjukt ljus i ringen
  const glow = ctx.createRadialGradient(hand.x, hand.y, radius * 0.2, hand.x, hand.y, radius * 1.2);
  glow.addColorStop(0, hexTillRgba(colour, 0));
  glow.addColorStop(0.75, hexTillRgba(colour, 0.06 * power));
  glow.addColorStop(1, hexTillRgba(colour, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, radius * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // vågig kant som cellerna
  const points = [];
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const ripple = 1 + 0.05 * Math.sin(angle * 5 + time * 3) + 0.03 * Math.sin(angle * 9 - time * 5);
    points.push({
      x: hand.x + Math.cos(angle) * radius * ripple,
      y: hand.y + Math.sin(angle) * radius * ripple
    });
  }
  ctx.strokeStyle = hexTillRgba(colour, 0.35 * power);
  ctx.lineWidth = 1.5;
  ctx.stroke(skapaMjukForm(points));
}

// extra linjer i debug-läget för att se hand (körs från script.js)
function ritaInteraktionsdebug() {
  const left = tracking.leftHand;
  const right = tracking.rightHand;

  // en linje mellan händerna.blir vit när händerna räknas som "ihop"
  if (left.visible && right.visible) {
    debugCtx.strokeStyle = symbiosis.gathering ? "#FFFFFF" : "rgba(255, 255, 255, 0.25)";
    debugCtx.lineWidth = 1;
    debugCtx.setLineDash([3, 5]);
    debugCtx.beginPath();
    debugCtx.moveTo(left.x, left.y);
    debugCtx.lineTo(right.x, right.y);
    debugCtx.stroke();

    if (symbiosis.gathering) {
      debugCtx.beginPath();
      debugCtx.arc(symbiosis.centreX, symbiosis.centreY, INTERACTION_SETTINGS.gatherRadius * sizeScale, 0, Math.PI * 2);
      debugCtx.stroke();
    }
    debugCtx.setLineDash([]);
  }

  // röd stapel ovanför varje rädd cell visar hur rädd den är (i debug)
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.alarm > 0.02) {
      debugCtx.fillStyle = "rgba(255, 0, 60, 0.8)";
      debugCtx.fillRect(organism.x - 15, organism.y - organism.size - 12, 30 * organism.alarm, 3);
    }
  }
}

// skriver text till debug-panelen
function beskrivInteraktioner() {
  let alarmed = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].alarm > 0.1) {
      alarmed += 1;
    }
  }

  let symbiosisText = "—";
  if (symbiosis.gathering) {
    symbiosisText = "GATHERING";
  } else if (symbiosis.stretching) {
    symbiosisText = "STRETCHING";
  } else if (symbiosis.links.length > 0) {
    symbiosisText = "withering";
  }

  return "frightened organisms: " + alarmed + "\n" +
    "symbiosis: " + symbiosisText + "  (tendrils: " + symbiosis.links.length + ")\n" +
    "effect particles: " + effectParticles.length + "\n";
}

const DIVISION_SETTINGS = {
  bladeSpeed: 1.3,           // svepets minsta fart (skärmbredder/s). högre = färre misstag
  minimumSize: 13,           // minsta storlek för delning (px)
  childSizeRatio: 0.72,      // ny cell = 72 % av gamla
  divisionDuration: 0.35,    // delningens längd (s)
  cooldown: 1.2,             // väntetid innan ny delning (s)
  separationSpeed: 3,        // isärfart
  sparksPerSplit: 26,        // antal gnistor

  balanceInterval: 30,       // 30e sekund kolla antalet celler:
  //för många -> försvinner den minsta.
  //för få -> en ny liten cell. (0 = stäng av)
  trailLife: 0.45            // knivstreckets livstid (s)
};

// VARIABLER

let sliceTrails = [];      // knivstreck
let flashes = [];          // blixtar
let totalSplits = 0;       // räknar alla delningar, visar siffran i debug-läget
let lastBalanceTime = 0;

// kommer ihåg vilken handposition vi redan har kollat, inte kolla samma två gånger
const lastBladeSample = { left: 0, right: 0 };

// mus för test i debug
const mouse = { trail: [] };

window.addEventListener("mousemove", function (event) {
  mouse.trail.push({ x: event.clientX, y: event.clientY, time: performance.now() });
  // bara 6 senaste
  if (mouse.trail.length > 6) {
    mouse.trail.shift();
  }
});

// UPPDATERING
// varje bildruta, från script.js

function uppdateraDelning(time, dt) {
  // 1. snabba händer = knivar
  kollaHandkniv(tracking.leftHand, "left", "#00E5FF", time);
  kollaHandkniv(tracking.rightHand, "right", "#FF28B9", time);
  if (debugVisible) {
    kollaMuskniv(time);
  }

  // 2. pågående delningar
  uppdateraDelandeCeller(time, dt);

  // 3. tillbaka till normalt antal
  uppdateraBalans(time, dt);

  // 4. streck och blixtar bleknar
  uppdateraSnitteffekter(dt);
}

// KNIV
// snabb hand = kniv?

let lastBladeReason = "—";   // vad som hände med det senaste snabba svepet (debug-läget)

function kollaHandkniv(hand, name, colour, time) {
  if (!hand.visible || hand.trail.length < 2) {
    return;
  }

  // bara ny kameraposition
  if (hand.lastSeen === lastBladeSample[name]) {
    return;
  }
  lastBladeSample[name] = hand.lastSeen;

  // kniv: från några bilder sedan till nu
  // längre kniv = lättare träff
  const newest = hand.trail[hand.trail.length - 1];
  const older = hand.trail[Math.max(0, hand.trail.length - 3)];

  // skär bara vid svep (fart)
  if (hand.speed / width < DIVISION_SETTINGS.bladeSpeed) {
    return;
  }
  lastBladeReason = "swipe (" + (hand.speed / width).toFixed(1) + " screens/s)";
  cutAlongBlade(older.x, older.y, newest.x, newest.y, colour, time);
}

// mus = kniv i debug
function kollaMuskniv(time) {
  const trail = mouse.trail;
  if (trail.length < 2) {
    return;
  }
  const newest = trail[trail.length - 1];
  const older = trail[0];
  const now = performance.now();

  // skippa gamla/använda musrörelser
  if (now - newest.time > 50 || newest.used) {
    return;
  }
  newest.used = true;

  const seconds = (newest.time - older.time) / 1000;
  if (seconds <= 0) {
    return;
  }
  const speed = distanceBetween(older.x, older.y, newest.x, newest.y) / seconds;
  if (speed / width > DIVISION_SETTINGS.bladeSpeed) {
    cutAlongBlade(older.x, older.y, newest.x, newest.y, "#F5FF45", time);
  }
}

// SKÄRA
// vilka celler kniven går igenom

function cutAlongBlade(x1, y1, x2, y2, colour, time) {
  let cutSomething = false;

  // knivens vinkel
  const cutAngle = Math.atan2(y2 - y1, x2 - x1);

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    // skippa upptagna/nya celler
    if (organism.division !== null || organism.dying || organism.fusing || time < organism.cutCooldownUntil) {
      continue;
    }

    // genom cellen? (85 %, nudda räknas inte)
    const distance = distanceFromPointToLine(organism.x, organism.y, x1, y1, x2, y2);
    const bodyRadius = organism.size * organism.breath * 0.85;
    if (distance > bodyRadius) {
      continue;
    }

    cutSomething = true;
    organism.cutCooldownUntil = time + DIVISION_SETTINGS.cooldown;

    const bigEnough = organism.size >= DIVISION_SETTINGS.minimumSize * sizeScale;
    // full skärm -> minsta cellen löses upp
    // (annars inga snitt)
    let roomForMore = levandeCeller() < SETTINGS.maxOrganisms;
    if (bigEnough && !roomForMore) {
      roomForMore = gorPlats(organism);
    }

    if (bigEnough && roomForMore) {
      startaDelning(organism, cutAngle);
    } else {
      // kan inte delas -> rycker till
      ryckTill(organism, cutAngle);
    }
  }

  // lysande streck (starkare vid träff)
  sliceTrails.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: 1, cut: cutSomething, colour: colour });
  if (sliceTrails.length > 40) {
    sliceTrails.shift();
  }
}

// avstånd punkt -> linje
// närmaste punkt på linjen
function distanceFromPointToLine(px, py, x1, y1, x2, y2) {
  const segmentX = x2 - x1;
  const segmentY = y2 - y1;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (lengthSquared === 0) {
    return distanceBetween(px, py, x1, y1);   // linjen är en punkt
  }

  // t: 0 = början, 1 = slut
  let t = ((px - x1) * segmentX + (py - y1) * segmentY) / lengthSquared;
  t = Math.max(0, Math.min(t, 1));   // t mellan 0 och 1

  const closestX = x1 + t * segmentX;
  const closestY = y1 + t * segmentY;
  return distanceBetween(px, py, closestX, closestY);
}

// DELA
// starta delning

function startaDelning(organism, cutAngle) {
  // progress 0 -> 1, cellen smalnar vid snittet
  // (radieVidVinkel). 1 = delas
  organism.division = { progress: 0, cutAngle: cutAngle };
  organism.agitation = 1;
  organism.isInteracting = true;

  nyBlixt(organism.x, organism.y, organism.size * 2.2, organism.palette.glow);
  sprutaGnistor(organism, Math.round(DIVISION_SETTINGS.sparksPerSplit * 0.4));

  spelaLjud("slice", organism.x, organism.size);
}

// rycker till (kan inte delas)
function ryckTill(organism, cutAngle) {
  organism.agitation = 1;
  organism.alarm = Math.min(1, organism.alarm + 0.4);
  // knuff åt sidan
  organism.vx += Math.cos(cutAngle + Math.PI / 2) * 2;
  organism.vy += Math.sin(cutAngle + Math.PI / 2) * 2;
  nyBlixt(organism.x, organism.y, organism.size * 1.4, organism.palette.glow);
  sprutaGnistor(organism, 6);

  spelaLjud("flinch", organism.x, organism.size);
}

// pågående delningar
function uppdateraDelandeCeller(time, dt) {
  const newOrganisms = [];
  const survivors = [];

  // räkna celler, varje delning +1
  // maxkoll precis innan delning
  // (flera snitt samtidigt)
  let population = levandeCeller();

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    if (organism.division === null) {
      survivors.push(organism);
      continue;
    }

    // framåt (dt / 60 = sekunder)
    organism.division.progress += (dt / 60) / DIVISION_SETTINGS.divisionDuration;

    // darrar under delning
    organism.x += (Math.random() - 0.5) * 2 * organism.division.progress;
    organism.y += (Math.random() - 0.5) * 2 * organism.division.progress;

    if (organism.division.progress < 1) {
      survivors.push(organism);
    } else if (population >= SETTINGS.maxOrganisms && !gorPlats(organism)) {
      // ingen plats, inget löstes upp
      // -> stopp, rycker till
      organism.division = null;
      ryckTill(organism, Math.random() * Math.PI * 2);
      survivors.push(organism);
    } else {
      // delas: gammal -> två nya
      population += 1;
      newOrganisms.push(skapaDottercell(organism, 1, time));
      newOrganisms.push(skapaDottercell(organism, -1, time));
      nyBlixt(organism.x, organism.y, organism.size * 3, "#FFFFFF");
      sprutaGnistor(organism, DIVISION_SETTINGS.sparksPerSplit);
      totalSplits += 1;
      spelaLjud("division", organism.x, organism.size);
    }
  }

  if (newOrganisms.length > 0) {
    organisms = survivors.concat(newOrganisms);
    // stora bakom, små fram
    organisms.sort(function (a, b) {
      return b.size - a.size;
    });
  }
}

// en av de nya cellerna
// side 1 / -1 = sida av snittet
function skapaDottercell(parent, side, time) {
  // isärriktning
  const apartAngle = parent.division.cutAngle + Math.PI / 2;
  const apartX = Math.cos(apartAngle) * side;
  const apartY = Math.sin(apartAngle) * side;

  const x = parent.x + apartX * parent.size * 0.45;
  const y = parent.y + apartY * parent.size * 0.45;

  // ny cell av samma sort...
  const child = skapaCell(parent.personality, x, y);

  // ...mindre och lite annorlunda
  // ingen exakt kopia
  child.size = parent.size * DIVISION_SETTINGS.childSizeRatio * slumpMellan(0.9, 1.1);
  child.palette = muteraPalett(parent.palette);
  child.lobeCount = Math.max(1, parent.lobeCount + slumpHeltal(-1, 1));
  child.deformation = parent.deformation * slumpMellan(0.85, 1.35);
  child.shapeWaves = createShapeWaves(child.lobeCount, child.deformation);
  child.speed = parent.speed * slumpMellan(0.85, 1.3);
  child.attraction = parent.attraction + slumpMellan(-0.2, 0.2);
  child.fearfulness = parent.fearfulness * slumpMellan(0.9, 1.1);
  child.timesDisturbed = parent.timesDisturbed;
  child.mutationLevel = parent.mutationLevel;   // behåller mutationer

  // flyger isär, oroliga
  child.vx = parent.vx + apartX * DIVISION_SETTINGS.separationSpeed;
  child.vy = parent.vy + apartY * DIVISION_SETTINGS.separationSpeed;
  child.direction = Math.atan2(apartY, apartX);
  child.agitation = 1;
  child.alarm = parent.alarm;

  // kan inte skäras direkt igen
  child.cutCooldownUntil = time + DIVISION_SETTINGS.cooldown;

  // börjar hopklämda (uppdateraKropp)
  child.birth = 0;

  return child;
}

// kopia av palett, 1-2 färger byts
function muteraPalett(palette) {
  const newPalette = {
    core: palette.core,
    middle: palette.middle,
    edge: palette.edge,
    glow: palette.glow
  };

  const keys = ["core", "middle", "edge", "glow"];
  const changes = slumpHeltal(1, 2);
  for (let i = 0; i < changes; i++) {
    const key = slumpaUrLista(keys);
    const donor = slumpaUrLista(PALETTES);
    newPalette[key] = donor[key];
  }

  return newPalette;
}

// BALANS
//
// annars bara fler och fler
// (eller några få jättestora)
// var 30:e sekund:
// fler än i början  → minsta försvinner
// 3+ färre än i början → ny liten cell vid kanten

function uppdateraBalans(time, dt) {
  // försvinner: genomskinlig + mindre
  const survivors = [];
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.dying) {
      organism.opacity -= 0.008 * dt;
      organism.size *= 1 - 0.004 * dt;
      if (Math.random() < 0.2) {
        sprutaGnistor(organism, 1);
      }
      if (organism.opacity <= 0) {
        continue;   // borta
      }
    } else if (organism.opacity < 1) {
      // tonas in
      organism.opacity = Math.min(1, organism.opacity + 0.006 * dt);
    }
    survivors.push(organism);
  }
  organisms = survivors;

  if (DIVISION_SETTINGS.balanceInterval <= 0) {
    return;
  }
  if (time - lastBalanceTime < DIVISION_SETTINGS.balanceInterval) {
    return;
  }
  lastBalanceTime = time;

  if (organisms.length <= startingPopulation - 3) {
    skapaNyCell();
    return;
  }

  if (organisms.length <= startingPopulation) {
    return;
  }

  // minsta lediga cellen
  let smallest = null;
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.dying || organism.division !== null || organism.fusing || organism.isInteracting) {
      continue;
    }
    if (smallest === null || organism.size < smallest.size) {
      smallest = organism;
    }
  }
  if (smallest !== null) {
    smallest.dying = true;
  }
}

// levande celler (inte de som löses upp)
function levandeCeller() {
  let count = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (!organisms[i].dying) {
      count += 1;
    }
  }
  return count;
}

// gör plats: minsta cellen (inte "except") löses upp
// true om det gick
function gorPlats(except) {
  let smallest = null;
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism === except || organism.dying || organism.division !== null || organism.fusing || organism.isInteracting) {
      continue;
    }
    if (smallest === null || organism.size < smallest.size) {
      smallest = organism;
    }
  }
  if (smallest === null) {
    return false;
  }
  smallest.dying = true;
  return true;
}

// ny liten cell vid slumpad kant
function skapaNyCell() {
  const personality = slumpaUrLista(["parasite", "connector", "watcher"]);
  let x = slumpMellan(width * 0.1, width * 0.9);
  let y = slumpMellan(height * 0.1, height * 0.9);
  const edge = slumpHeltal(0, 3);
  if (edge === 0) {
    x = width * 0.05;
  } else if (edge === 1) {
    x = width * 0.95;
  } else if (edge === 2) {
    y = height * 0.05;
  } else {
    y = height * 0.95;
  }

  const newborn = skapaCell(personality, x, y);
  newborn.opacity = 0;
  newborn.birth = 0;
  organisms.push(newborn);
  organisms.sort(function (a, b) {
    return b.size - a.size;
  });
}

// EFFEKTER OCH RITA
// ny blixt

function nyBlixt(x, y, radius, colour) {
  flashes.push({ x: x, y: y, radius: radius, life: 1, colour: colour });
}

// gnistor från en cell (INTERAKTIONER)
function sprutaGnistor(organism, amount) {
  const colours = [organism.palette.core, organism.palette.middle, organism.palette.glow];
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = slumpMellan(1, 5);
    nyEffektpartikel(
      organism.x + Math.cos(angle) * organism.size * 0.5,
      organism.y + Math.sin(angle) * organism.size * 0.5,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      slumpaUrLista(colours),
      slumpMellan(0.015, 0.035),
      "spark"
    );
  }
}

// streck och blixtar bleknar
function uppdateraSnitteffekter(dt) {
  // life 1 -> 0. (dt / 60) = sekunder
  const trailFade = (dt / 60) / DIVISION_SETTINGS.trailLife;
  const keptTrails = [];
  for (let i = 0; i < sliceTrails.length; i++) {
    sliceTrails[i].life -= trailFade;
    if (sliceTrails[i].life > 0) {
      keptTrails.push(sliceTrails[i]);
    }
  }
  sliceTrails = keptTrails;

  const keptFlashes = [];
  for (let i = 0; i < flashes.length; i++) {
    flashes[i].life -= 0.07 * dt;   // ca en kvarts sekund
    if (flashes[i].life > 0) {
      keptFlashes.push(flashes[i]);
    }
  }
  flashes = keptFlashes;
}

// knivstreck + blixtar överst (från script.js)
function ritaSnitteffekter() {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  // knivstreck: brett ljus + tunn vit linje
  for (let i = 0; i < sliceTrails.length; i++) {
    const trail = sliceTrails[i];
    let strength = trail.life * 0.5;
    if (trail.cut) {
      strength = trail.life;
    }

    ctx.strokeStyle = hexTillRgba(trail.colour, 0.35 * strength);
    ctx.lineWidth = 16 * strength;
    ctx.beginPath();
    ctx.moveTo(trail.x1, trail.y1);
    ctx.lineTo(trail.x2, trail.y2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, " + (0.9 * strength) + ")";
    ctx.lineWidth = 2.5 * strength;
    ctx.beginPath();
    ctx.moveTo(trail.x1, trail.y1);
    ctx.lineTo(trail.x2, trail.y2);
    ctx.stroke();
  }

  // blixt: växande, bleknande cirkel
  for (let i = 0; i < flashes.length; i++) {
    const flash = flashes[i];
    const radius = flash.radius * (1.4 - flash.life * 0.4);   // större när den bleknar
    const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
    glow.addColorStop(0, "rgba(255, 255, 255, " + (0.7 * flash.life) + ")");
    glow.addColorStop(0.3, hexTillRgba(flash.colour, 0.5 * flash.life));
    glow.addColorStop(1, hexTillRgba(flash.colour, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

// text till debug-panelen
function beskrivDelning() {
  let dividing = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].division !== null) {
      dividing += 1;
    }
  }
  return "divisions so far: " + totalSplits + "   dividing now: " + dividing + "\n" +
    "last blade: " + lastBladeReason + "\n" +
    "(debug: fast mouse movements also slice)\n";
}

const FUSION_SETTINGS = {
  holdTime: 2.5,          // hålltid innan sammansmältning (s)
  captureDistance: 70,    // fångstavstånd (px)
  maxMembers: 5,          // max celler per sammansmältning
  meltDuration: 1.2,      // smältningens längd (s)
  maxSize: 190,           // max storlek (px)
  cooldown: 2,            // väntetid innan ny smältning (s)
  letGoSpeed: 2           // hålltiden sjunker när man släpper
};

// VARIABLER

// en per hand (två nyp samtidigt)
const fusionStates = {
  left: { captured: [], charge: 0, melting: null },
  right: { captured: [], charge: 0, melting: null }
};

let totalFusions = 0;   // antal sammansmältningar (debug)

// UPPDATERING
// varje bildruta, från script.js

function uppdateraFusion(time, dt) {
  // nollställ fångade, kolla igen
  for (let i = 0; i < organisms.length; i++) {
    organisms[i].isCaptured = false;
  }

  uppdateraFusionPerHand(tracking.leftHand, handEffects.left, fusionStates.left, time, dt);
  uppdateraFusionPerHand(tracking.rightHand, handEffects.right, fusionStates.right, time, dt);

  // släppta celler glömmer hålltiden
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (!organism.isCaptured && organism.pinchHold > 0) {
      organism.pinchHold = Math.max(0, organism.pinchHold - (dt / 60) * FUSION_SETTINGS.letGoSpeed);
    }
  }
}

// fånga, hålla, smälta per hand
function uppdateraFusionPerHand(hand, effect, state, time, dt) {
  // påbörjad smältning blir klar ändå
  if (state.melting !== null) {
    updateMelting(state, effect, hand, time, dt);
    state.captured = [];
    state.charge = 0;
    return;
  }

  const pinching = hand.visible && hand.isPinching;
  if (!pinching) {
    state.captured = [];
    state.charge = 0;
    return;
  }

  captureOrganisms(effect, state, time, dt);

  // vilka har hållits länge nog?
  const ready = [];
  for (let i = 0; i < state.captured.length; i++) {
    if (state.captured[i].pinchHold >= FUSION_SETTINGS.holdTime) {
      ready.push(state.captured[i]);
    }
  }

  // två klara -> alla med halva tiden följer med
  if (ready.length >= 2) {
    const members = [];
    for (let i = 0; i < state.captured.length; i++) {
      if (state.captured[i].pinchHold >= FUSION_SETTINGS.holdTime * 0.5) {
        members.push(state.captured[i]);
      }
    }
    startMelting(state, members, effect);
  }
}

// FÅNGA OCH HÅLLA
// fånga celler nära nypet

function captureOrganisms(effect, state, time, dt) {
  state.captured = [];

  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    // upptagna kan inte fångas
    if (organism.division !== null || organism.dying || organism.fusing) {
      continue;
    }
    // nyss smält -> vänta
    if (time < organism.fusionCooldownUntil) {
      continue;
    }

    const distance = distanceBetween(organism.x, organism.y, effect.pinchX, effect.pinchY);
    if (distance < organism.size + FUSION_SETTINGS.captureDistance * sizeScale) {
      state.captured.push(organism);
    }
  }

  // bara de närmaste (max maxMembers)
  state.captured.sort(function (a, b) {
    const distanceA = distanceBetween(a.x, a.y, effect.pinchX, effect.pinchY);
    const distanceB = distanceBetween(b.x, b.y, effect.pinchX, effect.pinchY);
    return distanceA - distanceB;
  });
  if (state.captured.length > FUSION_SETTINGS.maxMembers) {
    state.captured.length = FUSION_SETTINGS.maxMembers;   // korta listan
  }

  // hålltid per cell, darrar mer och mer
  let highestHold = 0;
  let secondHighestHold = 0;
  for (let i = 0; i < state.captured.length; i++) {
    const organism = state.captured[i];
    organism.isCaptured = true;
    organism.pinchHold += dt / 60;   // dt / 60 = sekunder

    const progress = Math.min(organism.pinchHold / FUSION_SETTINGS.holdTime, 1);
    organism.x += (Math.random() - 0.5) * 2.5 * progress;
    organism.y += (Math.random() - 0.5) * 2.5 * progress;
    organism.agitation = Math.max(organism.agitation, progress * 0.6);

    // två längsta hålltiderna
    if (organism.pinchHold > highestHold) {
      secondHighestHold = highestHold;
      highestHold = organism.pinchHold;
    } else if (organism.pinchHold > secondHighestHold) {
      secondHighestHold = organism.pinchHold;
    }
  }

  // laddning 0 -> 1, kräver två celler
  // -> näst längsta hålltiden
  if (state.captured.length >= 2) {
    state.charge = Math.min(secondHighestHold / FUSION_SETTINGS.holdTime, 1);
  } else {
    state.charge = 0;
  }
}

// SMÄLTA
// starta sammansmältning

function startMelting(state, members, effect) {
  // ny cell i mitten av gruppen
  let totalX = 0;
  let totalY = 0;
  let areaSum = 0;
  for (let i = 0; i < members.length; i++) {
    totalX += members[i].x;
    totalY += members[i].y;
    // summera ytan -> lika stor som alla
    areaSum += members[i].size * members[i].size;
    members[i].fusing = true;
  }

  state.melting = {
    members: members,
    progress: 0,
    centreX: totalX / members.length,
    centreY: totalY / members.length,
    // storlek (kvadratrot)
    finalSize: Math.min(Math.sqrt(areaSum), FUSION_SETTINGS.maxSize * sizeScale)
  };

  nyBlixt(state.melting.centreX, state.melting.centreY, state.melting.finalSize * 1.5, members[0].palette.glow);
}

// celler mot mitten
function updateMelting(state, effect, hand, time, dt) {
  const melting = state.melting;

  // ta bort försvunna
  const stillHere = [];
  for (let i = 0; i < melting.members.length; i++) {
    if (organisms.indexOf(melting.members[i]) !== -1) {
      stillHere.push(melting.members[i]);
    }
  }
  melting.members = stillHere;
  if (melting.members.length < 2) {
    // färre än två kvar -> avbryt
    for (let i = 0; i < melting.members.length; i++) {
      melting.members[i].fusing = false;
    }
    state.melting = null;
    return;
  }

  melting.progress += (dt / 60) / FUSION_SETTINGS.meltDuration;

  // följer fingrarna om man nyper
  if (hand.visible && hand.isPinching) {
    melting.centreX += (effect.pinchX - melting.centreX) * 0.05 * dt;
    melting.centreY += (effect.pinchY - melting.centreY) * 0.05 * dt;
  }

  // flyter mot mitten, allt snabbare,
  // sträcks ut (sugs in)
  for (let i = 0; i < melting.members.length; i++) {
    const organism = melting.members[i];
    const pull = 0.02 + 0.1 * melting.progress;
    organism.x += (melting.centreX - organism.x) * pull * dt;
    organism.y += (melting.centreY - organism.y) * pull * dt;
    organism.vx *= 0.8;
    organism.vy *= 0.8;
    organism.tugAngle = Math.atan2(melting.centreY - organism.y, melting.centreX - organism.x);
    organism.tugAmount = 0.5 * melting.progress;
    organism.agitation = 1;
  }

  if (melting.progress >= 1) {
    avslutaFusion(state, time);
  }
}

// klar: gamla bort, ny in
function avslutaFusion(state, time) {
  const melting = state.melting;
  const fused = skapaFusionscell(melting.members, melting.centreX, melting.centreY, melting.finalSize, time);

  // ta bort gamla, lägg till ny
  const survivors = [];
  for (let i = 0; i < organisms.length; i++) {
    if (melting.members.indexOf(organisms[i]) === -1) {
      survivors.push(organisms[i]);
    }
  }
  survivors.push(fused);
  organisms = survivors;

  // stora bakom
  organisms.sort(function (a, b) {
    return b.size - a.size;
  });

  nyBlixt(fused.x, fused.y, fused.size * 2.5, "#FFFFFF");
  sprutaGnistor(fused, 30);
  totalFusions += 1;

  spelaLjud("fusion", fused.x, fused.size);
  state.melting = null;
}

// SKAPA DEN NYA STORA CELLEN
// ny cell av alla som smälte

function skapaFusionscell(members, x, y, size, time) {
  // största cellen bestämmer sorten
  let largest = members[0];
  for (let i = 1; i < members.length; i++) {
    if (members[i].size > largest.size) {
      largest = members[i];
    }
  }

  const fused = skapaCell(largest.personality, x, y);
  fused.size = size;

  // färger från de gamla cellerna
  fused.palette = {
    core: members[0].palette.core,
    middle: members[1 % members.length].palette.middle,
    edge: members[2 % members.length].palette.edge,
    glow: largest.palette.glow
  };

  // knöligare form (+1 knöl per extra cell)
  let maxDeformation = 0;
  for (let i = 0; i < members.length; i++) {
    maxDeformation = Math.max(maxDeformation, members[i].deformation);
  }
  fused.lobeCount = Math.min(largest.lobeCount + members.length - 1, 9);
  fused.deformation = Math.min(maxDeformation * 1.2 + 0.03, 0.35);
  fused.shapeWaves = createShapeWaves(fused.lobeCount, fused.deformation);

  // alla kärnor (max 8)
  fused.organelles = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members[i].organelles.length; j++) {
      if (fused.organelles.length < 8) {
        const organelle = members[i].organelles[j];
        fused.organelles.push({
          distance: slumpMellan(0.1, 0.55),
          angle: Math.random() * Math.PI * 2,
          orbitSpeed: organelle.orbitSpeed,
          size: organelle.size * 0.8,
          useGlowColour: organelle.useGlowColour
        });
      }
    }
  }

  // tyngre, lite långsammare
  // medelfart
  let totalSpeed = 0;
  let totalVx = 0;
  let totalVy = 0;
  let disturbed = 0;
  let highestMutation = 0;
  for (let i = 0; i < members.length; i++) {
    totalSpeed += members[i].speed;
    totalVx += members[i].vx;
    totalVy += members[i].vy;
    disturbed += members[i].timesDisturbed;
    highestMutation = Math.max(highestMutation, members[i].mutationLevel);
  }
  fused.speed = (totalSpeed / members.length) * 0.85;
  fused.vx = totalVx / members.length;
  fused.vy = totalVy / members.length;
  fused.timesDisturbed = disturbed;
  // högsta mutationsnivån
  // (kan mutera snart igen)
  fused.mutationLevel = highestMutation;

  // orolig, hopklämd, osårbar en stund
  fused.agitation = 1;
  fused.birth = 0;
  fused.fusionCooldownUntil = time + FUSION_SETTINGS.cooldown;
  fused.cutCooldownUntil = time + 1.5;

  return fused;
}

// RITA

// slemtrådar + ny cell i mitten
// (före cellerna)
function ritaFusionsbroar(time) {
  drawMeltingGroup(fusionStates.left.melting, time);
  drawMeltingGroup(fusionStates.right.melting, time);
}

// grupp som smälter
function drawMeltingGroup(melting, time) {
  if (melting === null) {
    return;
  }
  const progress = Math.min(melting.progress, 1);

  ctx.lineCap = "round";

  // tjock lysande tråd cell -> mitten
  // (flyter in i varandra)
  for (let i = 0; i < melting.members.length; i++) {
    const organism = melting.members[i];
    const gradient = ctx.createLinearGradient(organism.x, organism.y, melting.centreX, melting.centreY);
    gradient.addColorStop(0, hexTillRgba(organism.palette.middle, 0.9));
    gradient.addColorStop(1, hexTillRgba(organism.palette.core, 0.9));

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = gradient;
    ctx.lineWidth = organism.size * (0.3 + 0.9 * progress);
    ctx.beginPath();
    ctx.moveTo(organism.x, organism.y);
    ctx.lineTo(melting.centreX, melting.centreY);
    ctx.stroke();
  }

  // ny cell växer i mitten
  const radius = melting.finalSize * (0.2 + 0.6 * progress);
  const core = ctx.createRadialGradient(melting.centreX, melting.centreY, 0, melting.centreX, melting.centreY, radius);
  core.addColorStop(0, "rgba(255, 255, 255, " + (0.8 * progress) + ")");
  core.addColorStop(0.4, hexTillRgba(melting.members[0].palette.middle, 0.8));
  core.addColorStop(1, hexTillRgba(melting.members[0].palette.edge, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(melting.centreX, melting.centreY, radius, 0, Math.PI * 2);
  ctx.fill();
}

// ljusring runt fingrarna vid håll
// (efter cellerna)
function ritaFusionsladdning(time) {
  ritaLaddningsring(fusionStates.left, handEffects.left, time);
  ritaLaddningsring(fusionStates.right, handEffects.right, time);
}

// ljusring per hand
function ritaLaddningsring(state, effect, time) {
  if (state.charge <= 0.02) {
    return;
  }

  ctx.globalCompositeOperation = "lighter";

  // stor -> mindre ju längre man håller
  const radius = (130 - 90 * state.charge) * sizeScale;
  const dotCount = 24;
  for (let i = 0; i < dotCount; i++) {
    // prickar snurrar, snabbare med tiden
    const angle = (i / dotCount) * Math.PI * 2 + time * (0.5 + state.charge * 3);
    const x = effect.pinchX + Math.cos(angle) * radius;
    const y = effect.pinchY + Math.sin(angle) * radius;
    // bara laddad del lyser
    let brightness = 0.15;
    if (i / dotCount < state.charge) {
      brightness = 0.85;
    }
    ctx.fillStyle = "rgba(245, 255, 69, " + brightness * state.charge + ")";
    ctx.beginPath();
    ctx.arc(x, y, 2 + state.charge * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ljusbåge som klocka, hel cirkel = smälter
  const startAngle = time * (0.5 + state.charge * 3);
  ctx.strokeStyle = "rgba(245, 255, 69, " + (0.6 * state.charge) + ")";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(effect.pinchX, effect.pinchY, radius, startAngle, startAngle + state.charge * Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";
}

// text till debug-panelen
function beskrivFusion() {
  let text = "fusions so far: " + totalFusions;
  const names = ["left", "right"];
  for (let i = 0; i < names.length; i++) {
    const state = fusionStates[names[i]];
    if (state.melting !== null) {
      text += "   " + names[i] + ": MELTING " + state.melting.members.length;
    } else if (state.captured.length > 0) {
      text += "   " + names[i] + ": holding " + state.captured.length + " (" + Math.round(state.charge * 100) + "%)";
    }
  }
  return text + "\n";
}

const MOOD_SETTINGS = {
  riseSpeed: 0.15,         // känslan kommer (större = snabbare)
  calmSpeed: 0.012,        // känslan går över (mindre = stannar längre)
  fleeingScares: 0.25,     // flyr mer än så = rädd

  shiver: 0.05,            // darrning när rädd
  coldColour: "#BFE6FF",   // blek kall färg (rädd)
  coldStrength: 0.45,      // hur mycket kall färg (0-1)
  sweatChance: 0.04,       // chans för svettdroppe (per bildruta)

  puff: 0.15,              // förvånad = större (0.15 = 15 %)
  roundness: 0.6,          // förvånad = rundare (1 = helt rund)
  surpriseGlow: 0.55,      // ljus mitt när förvånad
  surpriseSoundGap: 0.12   // min tid mellan bloop (s)
  // (inte för mycket ljud)
};

let lastSurpriseSound = -10;   // senaste bloop (s)

function updateMoods(time, dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    // VAD KÄNNER CELLEN?

    // förvånad = dras mot nyp / hålls / smälter
    const surprised = organism.pulledByPinch || organism.isCaptured || organism.fusing;

    // rädd = knuffad av öppen hand, eller kvar efter knuff/jägare
    // förvånad går före rädd
    const fleeing = organism.alarm > MOOD_SETTINGS.fleeingScares;
    const scared = !surprised && (organism.pushedByPalm || fleeing);

    // KOMMER SNABBT, GÅR ÖVER LÅNGSAMT
    organism.surprisedAmount = moveMood(organism.surprisedAmount, surprised, dt);
    organism.scaredAmount = moveMood(organism.scaredAmount, scared, dt);

    // FÖRVÅNAD: LJUSRING + BLOOP
    // (bara i början)
    if (surprised && !organism.wasSurprised) {
      nyBlixt(organism.x, organism.y, organism.size * 1.6, "#FFFFFF");   // finns i DELA CELLER
      if (time - lastSurpriseSound > MOOD_SETTINGS.surpriseSoundGap) {
        spelaLjud("surprise", organism.x, organism.size);
        lastSurpriseSound = time;
      }
    }
    organism.wasSurprised = surprised;

    // RÄDD: SVETTDROPPE SOM FALLER
    if (organism.scaredAmount > 0.5 && Math.random() < MOOD_SETTINGS.sweatChance * organism.scaredAmount * dt) {
      const side = slumpMellan(-0.6, 0.6);
      nyEffektpartikel(                                                   // finns under INTERAKTIONER
        organism.x + side * organism.size,
        organism.y + organism.size * 0.3,
        side * 0.3,
        slumpMellan(0.6, 1.2),   // faller nedåt
        MOOD_SETTINGS.coldColour,
        0.02,
        "spark"
      );
    }
  }
}

// känsla mot 1 (känner) eller
// mot 0 (känner inte)
function moveMood(amount, feeling, dt) {
  if (feeling) {
    return amount + (1 - amount) * Math.min(MOOD_SETTINGS.riseSpeed * dt, 1);
  }
  return Math.max(0, amount - MOOD_SETTINGS.calmSpeed * dt);
}

// HJÄLPFUNKTIONER FÖR KÄNSLAN

// form efter känsla
// (radieVidVinkel, script.js)
// tillägg till radien
function getMoodShape(organism, angle, time) {
  let shape = 0;

  // rädd: små snabba vågor = darrar
  if (organism.scaredAmount > 0.01) {
    shape += organism.scaredAmount * MOOD_SETTINGS.shiver * Math.sin(angle * 13 + time * 45);
  }
  return shape;
}

// förvånad = rundare
// (radieVidVinkel, script.js)
// 1 = vanlig, 0 = helt rund
function getMoodWobbleFactor(organism) {
  return 1 - organism.surprisedAmount * MOOD_SETTINGS.roundness;
}

// förvånad = större
// (uppdateraKropp, script.js)
function getMoodSize(organism) {
  return 1 + organism.surprisedAmount * MOOD_SETTINGS.puff;
}

// känslans färger inuti
// (ritaCell, script.js)
function drawMoodColours(organism, size) {
  const body = organism.bodyPath;

  // rädd: blek kall färg från kanten
  if (organism.scaredAmount > 0.01) {
    ctx.globalCompositeOperation = "source-over";
    const cold = ctx.createRadialGradient(organism.x, organism.y, size * 0.1, organism.x, organism.y, size * 1.2);
    cold.addColorStop(0, hexTillRgba(MOOD_SETTINGS.coldColour, 0.15 * organism.scaredAmount));
    cold.addColorStop(1, hexTillRgba(MOOD_SETTINGS.coldColour, MOOD_SETTINGS.coldStrength * organism.scaredAmount));
    ctx.fillStyle = cold;
    ctx.fill(body);
  }

  // förvånad: vit mitt
  if (organism.surprisedAmount > 0.01) {
    ctx.globalCompositeOperation = "lighter";
    const hot = ctx.createRadialGradient(organism.x, organism.y, 0, organism.x, organism.y, size * 0.8);
    hot.addColorStop(0, "rgba(255, 255, 255, " + (MOOD_SETTINGS.surpriseGlow * organism.surprisedAmount) + ")");
    hot.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = hot;
    ctx.fill(body);
  }

  ctx.globalCompositeOperation = "source-over";
}

// pupillens bredd
// (ÖGON, celler.js)
// vanlig = springa, rädd = liten, förvånad = rund
function getMoodPupilWidth(organism, normalWidth, irisRadius) {
  let pupilWidth = normalWidth;
  // rädd: mindre
  pupilWidth = pupilWidth * (1 - 0.6 * organism.scaredAmount);
  // förvånad: större, nästan rund
  pupilWidth = pupilWidth + (irisRadius * 0.6 - pupilWidth) * organism.surprisedAmount;
  return pupilWidth;
}

// DEBUG

// känslan som text vid cellerna
function drawMoodDebug() {
  debugCtx.font = "10px Courier New, monospace";
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.surprisedAmount > 0.2) {
      debugCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
      debugCtx.fillText("surprised", organism.x - organism.size * 0.5, organism.y + organism.size + 12);
    } else if (organism.scaredAmount > 0.2) {
      debugCtx.fillStyle = "rgba(191, 230, 255, 0.9)";
      debugCtx.fillText("scared", organism.x - organism.size * 0.5, organism.y + organism.size + 12);
    }
  }
}

// text till debug-panelen
function describeMoods() {
  let scared = 0;
  let surprised = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].surprisedAmount > 0.2) {
      surprised += 1;
    } else if (organisms[i].scaredAmount > 0.2) {
      scared += 1;
    }
  }
  return "moods: scared " + scared + "   surprised " + surprised + "\n";
}

const MUTATION_SETTINGS = {
  disturbancesPerMutation: 3,  // störningar per mutation
  maxMutations: 6,             // max mutationer per cell
  disturbanceGap: 0.8,         // min tid mellan störningar (s)
  contactPerDisturbance: 2,    // konstant beröring = en störning per så här många s
  changeSpeed: 0.012,          // växtfart (större = snabbare)
  maxSize: 200                 // max storlek vid tillväxt (px)
};

let totalMutations = 0;   // antal mutationer (debug)

// UPPDATERING
// varje bildruta, från script.js

function uppdateraMutation(time, dt) {
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    countDisturbances(organism, time, dt);

    // mutera nu? störningar / 3
    // t.ex. 7 / 3 = 2 mutationer
    const mutationsDue = Math.floor(organism.timesDisturbed / MUTATION_SETTINGS.disturbancesPerMutation);
    const busy = organism.division !== null || organism.fusing || organism.dying;
    const canMutateMore = organism.mutationLevel < MUTATION_SETTINGS.maxMutations;

    if (mutationsDue > organism.mutationLevel && canMutateMore && !busy) {
      startaMutation(organism, time);
    }

    animeraMutation(organism, dt);
  }
}

// RÄKNA STÖRNINGAR
// hur störd cellen är

function countDisturbances(organism, time, dt) {
  // ny beröring = rörd nu, inte nyss
  const newTouch = organism.isInteracting && !organism.wasInteracting;
  if (newTouch && time - organism.lastDisturbedTime > MUTATION_SETTINGS.disturbanceGap) {
    organism.timesDisturbed += 1;
    organism.lastDisturbedTime = time;
  }

  // långt håll = fler störningar
  if (organism.isInteracting) {
    organism.contactTime += dt / 60;
    if (organism.contactTime > MUTATION_SETTINGS.contactPerDisturbance) {
      organism.timesDisturbed += 1;
      organism.contactTime = 0;
    }
  } else {
    organism.contactTime = 0;
  }

  organism.wasInteracting = organism.isInteracting;
}

// VÄLJA OCH STARTA MUTATION
// välj + starta mutation

function startaMutation(organism, time) {
  organism.mutationLevel += 1;
  totalMutations += 1;

  // möjliga mutationer
  const options = ["colour", "spikes", "speed", "silhouette"];
  if (organism.size < MUTATION_SETTINGS.maxSize * sizeScale) {
    options.push("growth");
  }
  // bara watchers: fler ögon (max 3)
  if (organism.personality === "watcher" && organism.eyes.length < 3) {
    options.push("eye");
    options.push("eye");   // "eye" två gånger = dubbelt så vanligt
  }

  // slumpa, inte samma som förra
  let choice = slumpaUrLista(options);
  while (choice === organism.lastMutation && options.length > 1) {
    choice = slumpaUrLista(options);
  }
  organism.lastMutation = choice;

  if (choice === "colour") {
    // ny palett, tonas in (animeraMutation)
    let newPalette = muteraPalett(organism.palette);   // finns i DELA CELLER
    newPalette = muteraPalett(newPalette);             // två gånger = tydlig färgskillnad
    organism.colourShift = { palette: newPalette, progress: 0 };
  } else if (choice === "spikes") {
    // ny formvåg med små taggar
    // börjar på 0, växer
    organism.shapeWaves.push({
      count: slumpHeltal(7, 12),
      amount: 0,
      targetAmount: slumpMellan(0.07, 0.13),
      speed: slumpMellan(-0.8, 0.8),
      offset: Math.random() * Math.PI * 2
    });
  } else if (choice === "eye") {
    addEye(organism);   // finns i ÖGON (celler.js), ögat växer fram
  } else if (choice === "speed") {
    // snabb eller långsam
    if (Math.random() < 0.6) {
      organism.targetSpeed = organism.speed * slumpMellan(1.6, 2.2);
      organism.restlessness = organism.restlessness * 1.8;
    } else {
      organism.targetSpeed = organism.speed * slumpMellan(0.35, 0.5);
    }
  } else if (choice === "growth") {
    organism.targetSize = Math.min(organism.size * 1.3, MUTATION_SETTINGS.maxSize * sizeScale);
  } else if (choice === "silhouette") {
    // knöligare + ny bula
    const mainWave = organism.shapeWaves[0];
    mainWave.targetAmount = Math.min(mainWave.amount * 1.6 + 0.05, 0.4);
    organism.shapeWaves.push({
      count: 2,
      amount: 0,
      targetAmount: slumpMellan(0.08, 0.14),
      speed: slumpMellan(0.1, 0.3),
      offset: Math.random() * Math.PI * 2
    });
  }

  // mutation: skakar, lyser, ljud
  organism.mutationPulse = 1;
  organism.agitation = 1;
  nyBlixt(organism.x, organism.y, organism.size * 1.8, organism.palette.glow);   // finns i DELA CELLER
  sprutaGnistor(organism, 12);
  spelaLjud("mutation", organism.x, organism.size);
}

// MUTATIONEN LITE I TAGET
// ändras varje bildruta tills klar

function animeraMutation(organism, dt) {
  const change = MUTATION_SETTINGS.changeSpeed * dt;

  // ljuset bleknar, skakar medan det lyser
  if (organism.mutationPulse > 0) {
    organism.mutationPulse = Math.max(0, organism.mutationPulse - 0.012 * dt);
    organism.x += (Math.random() - 0.5) * 3 * organism.mutationPulse;
    organism.y += (Math.random() - 0.5) * 3 * organism.mutationPulse;
  }

  // formvågor växer mot ny storlek
  for (let i = 0; i < organism.shapeWaves.length; i++) {
    const wave = organism.shapeWaves[i];
    if (wave.targetAmount !== undefined) {
      wave.amount += (wave.targetAmount - wave.amount) * change;
    }
  }

  // storlek och fart ändras gradvis
  if (organism.targetSize !== null) {
    organism.size += (organism.targetSize - organism.size) * change;
  }
  if (organism.targetSpeed !== null) {
    organism.speed += (organism.targetSpeed - organism.speed) * change;
  }

  // ny färg flödar in från kanten
  // byts halvvägs, flödet bleknar
  if (organism.colourShift !== null) {
    const shift = organism.colourShift;
    shift.progress += change * 0.8;
    organism.tintColour = shift.palette.glow;
    // sin = båge: 0 -> 1 -> 0
    organism.tintAmount = Math.sin(Math.min(shift.progress, 1) * Math.PI) * 0.9;
    if (shift.progress >= 0.5 && organism.palette !== shift.palette) {
      organism.palette = shift.palette;
    }
    if (shift.progress >= 1) {
      organism.colourShift = null;
    }
  }
}

// text till debug-panelen
function beskrivMutation() {
  let mutated = 0;
  let highest = 0;
  for (let i = 0; i < organisms.length; i++) {
    if (organisms[i].mutationLevel > 0) {
      mutated += 1;
    }
    highest = Math.max(highest, organisms[i].mutationLevel);
  }
  return "mutations so far: " + totalMutations + "   mutated organisms: " + mutated +
    "   highest level: " + highest + "\n";
}

// debug: antal störningar per cell
function ritaMutationsdebug() {
  debugCtx.font = "10px Courier New, monospace";
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];
    if (organism.timesDisturbed > 0) {
      debugCtx.fillStyle = "rgba(183, 255, 0, 0.8)";
      debugCtx.fillText(organism.timesDisturbed + " / M" + organism.mutationLevel, organism.x + organism.size * 0.7, organism.y - organism.size * 0.7);
    }
  }
}

const FEEDING_SETTINGS = {
  grainsPerDrop: 8,         // korn per släpp
  maxGrains: 60,            // max antal korn
  grainLife: 15,            // kornets livstid (s)
  closeTime: 0.8,           // tid från öppen till knuten hand (s)
  smellRange: 380,          // luktavstånd (px)
  swimStrength: 0.05,       // simfart mot maten
  parasiteBoost: 2,         // parasiter x snabbare
  growth: 0.8,              // tillväxt per korn (px)
  maxGrowth: 1.3,           // max 1.3x sortens maxstorlek
  fullTime: 3               // mätt i (s)
};

let foodGrains = [];        // alla matkorn
let totalEaten = 0;         // antal ätna (debug)

// per hand: senast öppen + knuten nu
const feedingHands = {
  left: { lastOpen: -10, closed: false },
  right: { lastOpen: -10, closed: false }
};

// musens plats (f-tangenten, test)
const feedingMouse = { x: 0, y: 0 };
window.addEventListener("mousemove", function (event) {
  feedingMouse.x = event.clientX;
  feedingMouse.y = event.clientY;
});

// UPPDATERING
// varje bildruta, från script.js
function uppdateraMatning(time, dt) {
  kollaMatgest(tracking.leftHand, feedingHands.left, time);
  kollaMatgest(tracking.rightHand, feedingHands.right, time);
  flyttaMat(dt);
  letaMat(time, dt);
}

// SLÄPPA MAT
// öppen -> knuten = mat
function kollaMatgest(hand, state, time) {
  if (!hand.visible) {
    state.closed = false;
    return;
  }
  if (hand.isOpenPalm) {
    state.lastOpen = time;
  }

  // knuten = inga raka fingrar
  const isClosed = hand.extendedFingers === 0;

  // knöts nyss, var öppen innan
  if (isClosed && !state.closed && time - state.lastOpen < FEEDING_SETTINGS.closeTime) {
    slappMat(hand.x, hand.y);
    state.lastOpen = -10;   // öppna igen för mer mat
  }
  state.closed = isClosed;
}

// några korn, sprids ut
function slappMat(x, y) {
  for (let i = 0; i < FEEDING_SETTINGS.grainsPerDrop; i++) {
    if (foodGrains.length >= FEEDING_SETTINGS.maxGrains) {
      foodGrains.shift();   // för många -> äldsta bort
    }
    foodGrains.push({
      x: x + slumpMellan(-15, 15),
      y: y + slumpMellan(-15, 15),
      vx: slumpMellan(-1.5, 1.5),
      vy: slumpMellan(-1.5, 0.5),
      life: 1,                              // 1 -> 0, sedan borta
      seed: Math.random() * 100             // olika gung
    });
  }
  spelaLjud("blink", x, 20);
}

// sjunker och gungar (snöflingor i vatten)
function flyttaMat(dt) {
  const fade = (dt / 60) / FEEDING_SETTINGS.grainLife;   // (dt / 60) = sekunder
  const kept = [];
  for (let i = 0; i < foodGrains.length; i++) {
    const grain = foodGrains[i];
    grain.vy += 0.015 * dt;                                   // sjunker
    grain.vx += Math.sin(lastFrameTime / 600 + grain.seed) * 0.01 * dt;   // gungar
    grain.vx *= Math.pow(0.97, dt);                           // vattnet bromsar
    grain.vy *= Math.pow(0.97, dt);
    grain.x += grain.vx * dt;
    grain.y = Math.min(grain.y + grain.vy * dt, height - 5);  // stannar vid nederkanten
    grain.life -= fade;
    if (grain.life > 0) {
      kept.push(grain);
    }
  }
  foodGrains = kept;
}

// CELLERNA LETAR MAT OCH ÄTER
// hungriga celler simmar mot närmaste korn
function letaMat(time, dt) {
  if (foodGrains.length === 0) {
    return;
  }
  for (let i = 0; i < organisms.length; i++) {
    const organism = organisms[i];

    // mätt / rädd / upptagen / fast = äter inte
    const busy = organism.division !== null || organism.fusing || organism.dying || organism.host !== null;
    if (busy || organism.alarm > 0.5 || time < organism.fullUntil) {
      continue;
    }

    // närmaste kornet
    let nearest = null;
    let nearestDistance = FEEDING_SETTINGS.smellRange * sizeScale;
    for (let k = 0; k < foodGrains.length; k++) {
      const distance = distanceBetween(organism.x, organism.y, foodGrains[k].x, foodGrains[k].y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = foodGrains[k];
      }
    }
    if (nearest === null) {
      continue;
    }

    // nära nog: ät
    if (nearestDistance < organism.size * 0.9) {
      atMat(organism, nearest, time);
      continue;
    }

    // annars simma dit (parasiter snabbast)
    let strength = FEEDING_SETTINGS.swimStrength;
    if (organism.personality === "parasite") {
      strength = strength * FEEDING_SETTINGS.parasiteBoost;
    }
    const towardsX = (nearest.x - organism.x) / nearestDistance;
    const towardsY = (nearest.y - organism.y) / nearestDistance;
    knuffaCell(organism, towardsX * strength, towardsY * strength, dt);
  }
}

// äter: kornet bort, cellen växer
function atMat(organism, grain, time) {
  foodGrains.splice(foodGrains.indexOf(grain), 1);

  const biggest = PERSONALITIES[organism.personality].maxSize * sizeScale * FEEDING_SETTINGS.maxGrowth;
  organism.size = Math.min(organism.size + FEEDING_SETTINGS.growth * sizeScale, Math.max(organism.size, biggest));
  organism.fullUntil = time + FEEDING_SETTINGS.fullTime;
  totalEaten += 1;

  nyBlixt(grain.x, grain.y, organism.size * 0.6, "#F5FF45");   // finns i DELA CELLER
  spelaLjud("eat", grain.x, organism.size);
}

// RITA MATEN
// ritar matkornen: ett mjukt ljus och en ljus prick i mitten. (körs från script.js innan cellerna ritas)
function ritaMat() {
  if (foodGrains.length === 0) {
    return;
  }
  const glow = new Path2D();   // alla korn i en form = snabbare
  const dots = new Path2D();
  for (let i = 0; i < foodGrains.length; i++) {
    const grain = foodGrains[i];
    const glowRadius = 9 * sizeScale;
    const dotRadius = 3.5 * sizeScale * Math.min(1, grain.life * 4);   // krymper innan det försvinner
    glow.moveTo(grain.x + glowRadius, grain.y);
    glow.arc(grain.x, grain.y, glowRadius, 0, Math.PI * 2);
    dots.moveTo(grain.x + dotRadius, grain.y);
    dots.arc(grain.x, grain.y, dotRadius, 0, Math.PI * 2);
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(245, 255, 69, 0.18)";
  ctx.fill(glow);
  ctx.fillStyle = "rgba(255, 255, 220, 0.9)";
  ctx.fill(dots);
  ctx.globalCompositeOperation = "source-over";
}

// text till debug-panelen
function beskrivMatning() {
  return "food grains: " + foodGrains.length + "   eaten so far: " + totalEaten + "\n";
}

// versionen syns i debug-läget
const VERSION = "stage 6.24 (bättre snitt)";

const SETTINGS = {
  maxOrganisms: 30,     // som mest så här många celler
  backgroundParticleCount: 140,
  bpm: 128,     // musikens tempo (slag per minut). cellerna pulserar i samma takt
  trailFade: 0.22,    // hur snabbt gamla bilder bleknar bort
  haloStrength: 0.09,     // hur starkt det stora mjuka ljuset runt varje cell är
  outlinePoints: 48,     // hur många punkter cellens kant består av (fler = mjukare men långsammare)
  interactionRange: 320,       // hur långt bort cellerna kan känna av varandra (i pixlar)
  maxPixelRatio: 1,      // 1 = snabbt. 1.5 eller 2 = skarpare på vissa skärmar, men mycket långsammare
  renderScale: 0.75,   // hur skarp bilden är. 0.75 = 75 % av full skärpa.
  autoQuality: true,    // true = om datorn är för långsam gör programmet bilden lite suddigare
  minRenderScale: 0.5,    // så här suddig får bilden bli
  autoQualityFps: 40,
  lightMode: false,    // lätt läge för långsamma datorer: mindre sken, färre prickar, enklare former.
  handInfluenceRadius: 220     // pixlar runt varje hand
};

// core   = det starka ljuset i mitten
// middle = cellens huvudfärg
// edge   = färgen ytterst i cellen
// glow   = ljuset som lyser runt cellen
const PALETTES = [
  { core: "#F5FF45", middle: "#FF28B9", edge: "#7B00FF", glow: "#FF28B9" },
  { core: "#B7FF00", middle: "#00E5FF", edge: "#4510FF", glow: "#00E5FF" },
  { core: "#FF6A32", middle: "#FF28B9", edge: "#4510FF", glow: "#7B00FF" },
  { core: "#E8FFFF", middle: "#00E5FF", edge: "#7B00FF", glow: "#00E5FF" },
  { core: "#F5FF45", middle: "#B7FF00", edge: "#008F7A", glow: "#B7FF00" },
  { core: "#FFE0F4", middle: "#FF6A32", edge: "#B0005E", glow: "#FF6A32" },
  { core: "#00E5FF", middle: "#4510FF", edge: "#1A0050", glow: "#7B00FF" },
  { core: "#FFFFFF", middle: "#FF28B9", edge: "#2A0060", glow: "#FF28B9" }
];

// färger för de små prickarna som svävar i bakgrunden
const PARTICLE_COLOURS = ["#00E5FF", "#FF28B9", "#B7FF00", "#7B00FF", "#F5FF45"];

// här står hur varje sorts cell är: storlek, fart, form och hur rädd den blir.
const PERSONALITIES = {
  drifter: {
    startCount: 4,
    minSize: 75, maxSize: 125,       // stor
    minSpeed: 0.15, maxSpeed: 0.3,   // långsam
    minLobes: 2, maxLobes: 4,
    minDeformation: 0.05, maxDeformation: 0.1,   // mjuk form
    attraction: 0.3,   // gillar att vara nära andra celler
    restlessness: 0.01,    // hur mycket den svänger åt olika håll av sig själv
    fearfulness: 0.75     // hur rädd den blir för en öppen hand (0 = inte alls, 1 = väldigt)
  },
  parasite: {
    startCount: 5,
    minSize: 12, maxSize: 22,   // liten
    minSpeed: 0.9, maxSpeed: 1.4,    // snabb
    minLobes: 3, maxLobes: 6,
    minDeformation: 0.03, maxDeformation: 0.07,  // nästan slät, så att droppformen syns 
    attraction: 0.6,
    restlessness: 0.08,
    fearfulness: 1   // väldigt lättskrämd
  },
  watcher: {
    startCount: 3,
    minSize: 38, maxSize: 58,
    minSpeed: 0.3, maxSpeed: 0.5,
    minLobes: 2, maxLobes: 3,
    minDeformation: 0.04, maxDeformation: 0.08,  // lugn, nästan rund
    attraction: -0.5,     // vill inte vara nära andra
    restlessness: 0.02,
    fearfulness: 0.35       // nyfiken: kommer fram och tittar på händerna
  },
  hunter: {
    startCount: 2,
    minSize: 30, maxSize: 46,
    minSpeed: 0.6, maxSpeed: 1.0,
    minLobes: 5, maxLobes: 8,
    minDeformation: 0.03, maxDeformation: 0.06,  // nästan slät, så att päronformen syns 
    attraction: -0.2,
    restlessness: 0.06,
    fearfulness: 0.45     // modig
  },
  connector: {
    startCount: 3,
    minSize: 26, maxSize: 42,
    minSpeed: 0.35, maxSpeed: 0.6,
    minLobes: 3, maxLobes: 5,
    minDeformation: 0.1, maxDeformation: 0.18,
    attraction: 0.8,     // vill gärna vara nära andra
    restlessness: 0.03,
    fearfulness: 0.85
  }
};

const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

// en genomskinlig rityta ovanpå, som bara används i debug-läget
const debugCanvas = document.getElementById("debug-canvas");
const debugCtx = debugCanvas.getContext("2d");

let width = 0;     // hur bred ritytan är
let height = 0;        // hur hög ritytan är
let sizeScale = 1;    // gör cellerna större på stora skärmar och mindre på små skärmar

let organisms = [];     // en lista med alla celler
let startingPopulation = 0;
let particles = [];

let lastFrameTime = 0;  // när förra bildrutan ritades
let fps = 60;
let ecosystemSleep = 0; // hur mycket allt sover: 0 = vaket, 1 = sover 
let debugVisible = false;

//  ger ett slumptal mellan min och max 
function slumpMellan(min, max) {
  return min + Math.random() * (max - min);
}

// ger ett slumpat HELTAL mellan min och max
function slumpHeltal(min, max) {
  return Math.floor(slumpMellan(min, max + 1));
}

//  väljer en slumpad sak ur en lista
function slumpaUrLista(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const rgbCache = {};

// alpha är hur genomskinlig färgen ska vara (0 = osynlig, 1 = helt synlig)
function hexTillRgba(hex, alpha) {
  if (rgbCache[hex] === undefined) {
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);
    rgbCache[hex] = "rgba(" + red + ", " + green + ", " + blue + ", ";
  }
  return rgbCache[hex] + alpha + ")";
}

// gör ritytan lika stor som fönstret
function anpassaCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, SETTINGS.maxPixelRatio) * SETTINGS.renderScale;

  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  // debug-ritytan får samma storlek
  debugCanvas.width = canvas.width;
  debugCanvas.height = canvas.height;
  debugCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  // 900 pixlar är en "vanlig" skärm. större skärm = större celler
  sizeScale = Math.min(width, height) / 900;
  sizeScale = Math.max(0.6, Math.min(sizeScale, 1.6));

  // målar allt svart, så att den gamla bilden inte syns utsträckt
  ctx.fillStyle = "#020008";
  ctx.fillRect(0, 0, width, height);
}

let qualityCheckTime = 0;   // när vi senast kollade hur snabbt datorn är (i ms)

// kollar om datorn är för långsam, och gör i så fall bilden lite suddigare
function uppdateraAutokvalitet(now) {
  if (!SETTINGS.autoQuality) {
    return;
  }
  if (now - qualityCheckTime < 3000 || now < 5000) {
    return;
  }
  qualityCheckTime = now;

  if (fps < SETTINGS.autoQualityFps && SETTINGS.renderScale <= SETTINGS.minRenderScale && !SETTINGS.lightMode) {
    slaPaLattLage(true);
    return;
  }

  if (fps < SETTINGS.autoQualityFps && SETTINGS.renderScale > SETTINGS.minRenderScale) {
    SETTINGS.renderScale = Math.max(SETTINGS.minRenderScale, SETTINGS.renderScale - 0.1);

    // sparar bilden som syns nu, så att spåren inte försvinner när ritytan ändrar storlek
    const oldImage = document.createElement("canvas");
    oldImage.width = canvas.width;
    oldImage.height = canvas.height;
    oldImage.getContext("2d").drawImage(canvas, 0, 0);

    anpassaCanvas();
    ctx.drawImage(oldImage, 0, 0, width, height);
  }
}

//  slår på (eller av) lätt läge. allt finns kvar, men det ritas enklare:
function slaPaLattLage(on) {
  SETTINGS.lightMode = on;
  SETTINGS.outlinePoints = on ? 32 : 48;
  if (on) {
    particles.length = Math.floor(SETTINGS.backgroundParticleCount / 2);
  } else {
    skapaPartiklar();
  }
}

// bestämmer cellens form.
function createShapeWaves(lobeCount, deformation) {
  const waves = [];

  // de stora bulorna som gör cellen ojämn och rör sig långsamt
  waves.push({
    count: lobeCount,
    amount: deformation,
    speed: slumpMellan(0.3, 0.7),
    offset: Math.random() * Math.PI * 2
  });

  // mindre vågor ovanpå, som rör sig åt andra hållet så att formen hela tiden ändras
  waves.push({
    count: lobeCount + slumpHeltal(2, 4),
    amount: deformation * 0.35,
    speed: -slumpMellan(0.5, 1.2),
    offset: Math.random() * Math.PI * 2
  });

  // en stor långsam bula som gör cellen lite sne
  waves.push({
    count: 1,
    amount: slumpMellan(0.04, 0.12),
    speed: slumpMellan(0.1, 0.3),
    offset: Math.random() * Math.PI * 2
  });

  return waves;
}

// skapar små lysande "kärnor" som flyter runt inuti cellen
function skapaOrganeller() {
  const organelles = [];
  const amount = slumpHeltal(2, 4);

  for (let i = 0; i < amount; i++) {
    organelles.push({
      distance: slumpMellan(0.1, 0.45),     // hur långt från mitten kärnan är
      angle: Math.random() * Math.PI * 2,
      orbitSpeed: slumpMellan(-0.4, 0.4),   // hur snabbt kärnan åker runt
      size: slumpMellan(0.18, 0.35),        // hur stor kärnan är
      useGlowColour: Math.random() < 0.5
    });
  }

  return organelles;
}

// skapar en ny cell av en viss sort, på ett visst ställe
function skapaCell(personalityName, x, y) {
  const type = PERSONALITIES[personalityName];
  const lobeCount = slumpHeltal(type.minLobes, type.maxLobes);
  const deformation = slumpMellan(type.minDeformation, type.maxDeformation);

  const organism = {
    x: x,
    y: y,
    vx: 0,    // fart åt sidan (pixlar per bildruta)
    vy: 0,      // fart upp och ner
    speed: slumpMellan(type.minSpeed, type.maxSpeed),
    direction: Math.random() * Math.PI * 2,      // åt vilket håll cellen vill simma (en vinkel)
    turnSpeed: slumpMellan(0.2, 0.8),
    restlessness: type.restlessness,
    edgeBias: slumpMellan(-0.6, 0.6),     // gör att cellerna svänger lite olika vid kanten av skärmen

    // cellens kropp och utseende
    size: slumpMellan(type.minSize, type.maxSize) * sizeScale,
    palette: slumpaUrLista(PALETTES),
    lobeCount: lobeCount,
    deformation: deformation,
    shapeWaves: createShapeWaves(lobeCount, deformation),
    organelles: skapaOrganeller(),
    flowSpeed: slumpMellan(0.2, 0.6),          // hur snabbt ljuset inuti cellen rör sig
    sparkleSpeed: slumpMellan(0.3, 0.9),       // hur ofta cellen glänser till

    // andning: varje cell andas i sin egen takt
    breathSpeed: slumpMellan(0.6, 1.6),
    breathDepth: slumpMellan(0.03, 0.07),
    breathOffset: Math.random() * Math.PI * 2,
    breathPhase: 0,                              // var i andetaget cellen är just nu
    pulseSensitivity: slumpMellan(0.02, 0.08), // hur mycket cellen pulserar med musiken

    // sorten och läget
    personality: personalityName,
    attraction: type.attraction + slumpMellan(-0.3, 0.3),
    hasEyes: personalityName === "watcher",      // watcher-celler har ögon 
    isInteracting: false,
    sleepiness: 0,

    // känslor 
    scaredAmount: 0,    // hur rädd cellen är (0 till 1)
    surprisedAmount: 0,      // hur förvånad cellen är (0 till 1)
    wasSurprised: false,     // var cellen förvånad förra bildrutan? (så att vi ser när det börjar)
    pushedByPalm: false,   // true om en öppen hand knuffar cellen just nu
    pulledByPinch: false,          // true om ett nyp drar i cellen just nu

    // hur cellen reagerar på händerna
    fearfulness: type.fearfulness * slumpMellan(0.7, 1.2),
    alarm: 0,      // 0 = lugn, 1 = jätterädd
    agitation: 0,   // 0 = vanlig, 1 = rör sig vilt
    forceX: 0,   // knuffar på cellen just nu
    forceY: 0,
    tugAmount: 0, // hur mycket cellen sträcks ut åt det håll den knuffas
    tugAngle: 0,
    wasPinched: false,
    side: "left",    // vilken hand cellen följer när man gör ett nätverk med två händer
    inNetworkZone: false,
    tintColour: "#FFFFFF",  // färg som cellen har fått från en annan cell
    tintAmount: 0,

    // delning
    division: null,
    cutCooldownUntil: 0,
    birth: 1,
    timesDisturbed: 0,
    dying: false,
    opacity: 1,

    // sammansmältning 
    pinchHold: 0,
    isCaptured: false,
    fusing: false,
    fusionCooldownUntil: 0,

    // vad varje sort gör 
    host: null,                                  // parasiter: cellen den sitter fast på
    target: null,                                // parasiter: cellen den simmar mot
    attachAngle: 0,                              // parasiter: var på den andra cellen den sitter
    crawlDirection: 1,
    detachTime: 0,
    restUntil: 0,
    prey: null,                                  // jägare: cellen den jagar
    fullUntil: 0,                                // mat: cellen är mätt till den här tiden (i s)
    huntRestUntil: 0,                            // jägare: vilar till den här tiden (i s)
    linkRestUntil: 0,                            // kopplare: kopplar inte ihop sig igen förrän den här tiden (i s)
    chaseUntil: 0,
    nextLunge: 0,
    reachAmount: 0,                              // kopplare: hur långt en tråd når mot en hand (0 till 1)
    reachX: 0,
    reachY: 0,

    // ögon 
    eyes: [],

    // mutationer 
    mutationLevel: 0,
    lastMutation: "",
    lastDisturbedTime: -10,
    contactTime: 0,
    wasInteracting: false,
    mutationPulse: 0,
    colourShift: null,
    targetSize: null,
    targetSpeed: null,

    // de här räknas ut på nytt varje bildruta
    breath: 1,
    stretch: 0,
    moveAngle: 0,
    outline: [],
    bodyPath: null,
    seed: Math.random() * 1000
  };

  return organism;
}

// skapar alla celler i början
function skapaEkosystem() {
  organisms = [];

  const personalityNames = Object.keys(PERSONALITIES);

  for (let i = 0; i < personalityNames.length; i++) {
    const name = personalityNames[i];
    const count = PERSONALITIES[name].startCount;

    for (let n = 0; n < count; n++) {
      const x = slumpMellan(width * 0.1, width * 0.9);
      const y = slumpMellan(height * 0.1, height * 0.9);
      organisms.push(skapaCell(name, x, y));
    }
  }

  // sorterar så att stora celler ritas först och små hamnar framför
  organisms.sort(function (a, b) {
    return b.size - a.size;
  });

  startingPopulation = organisms.length;
}

// skapar en prick i bakgrunden
function skapaPartikel(startAnywhere) {
  return {
    x: Math.random() * width,
    // nya prickar kommer längst ner
    y: startAnywhere ? Math.random() * height : height + 10,
    size: slumpMellan(0.5, 2.2),
    riseSpeed: slumpMellan(0.05, 0.35),
    swaySpeed: slumpMellan(0.3, 1.2),
    brightness: slumpMellan(0.15, 0.6),
    colour: slumpaUrLista(PARTICLE_COLOURS),
    seed: Math.random() * 1000,
    glow: 0     // prickarna lyser upp när en hand rör sig nära 
  };
}

// alla prickar i bakgrunden
function skapaPartiklar() {
  particles = [];
  for (let i = 0; i < SETTINGS.backgroundParticleCount; i++) {
    particles.push(skapaPartikel(true));
  }
}

// musikens puls
function getBeatPulse(time) {
  const secondsPerBeat = 60 / SETTINGS.bpm;
  const beatNumber = Math.floor(time / secondsPerBeat);
  const progressThroughBeat = (time % secondsPerBeat) / secondsPerBeat;

  let strength = 0.35;
  if (beatNumber % 16 === 0) {
    strength = 1;
  }

  // Math.exp gör att pulsen börjar på 1 och snabbt går ner mot 0
  return strength * Math.exp(-progressThroughBeat * 6);
}

//  får cellen att simma. den byter håll lite i taget.
function flyttaCell(organism, time, dt) {
  // cellen svänger mjukt fram och tillbaka, och lite slumpmässigt
  let turn = Math.sin(time * organism.turnSpeed + organism.seed) * 0.015;
  // en orolig cell (som har blivit knuffad eller rädd) svänger mycket mer
  const restlessness = organism.restlessness + organism.agitation * 0.35;
  turn += (Math.random() - 0.5) * restlessness;
  organism.direction += turn * dt;

  // rädda celler simmar snabbare
  let swimPower = organism.speed * (1 + organism.alarm * 1.5);

  // celler som sover simmar långsammare 
  if (organism.sleepiness > 0) {
    swimPower = swimPower * (1 - ATMOSPHERE_SETTINGS.sleepSlowdown * organism.sleepiness);
  }

  // knuffar cellen lite åt det håll den vill simma
  organism.vx += Math.cos(organism.direction) * swimPower * 0.03 * dt;
  organism.vy += Math.sin(organism.direction) * swimPower * 0.03 * dt;

  // oron går över långsamt
  organism.agitation = Math.max(0, organism.agitation - 0.008 * dt);
  // färg från andra celler bleknar också långsamt
  organism.tintAmount = Math.max(0, organism.tintAmount - 0.004 * dt);

  // cellen tappar lite fart varje bildruta, som om den simmade i vatten
  const friction = Math.pow(0.97, dt);
  organism.vx *= friction;
  organism.vy *= friction;

  organism.x += organism.vx * dt;
  organism.y += organism.vy * dt;

  keepInsideScreen(organism);
}

//  cellen stannar på skärmen.
function keepInsideScreen(organism) {
  const margin = organism.size * 0.6;

  const tooFarLeft = organism.x < margin;
  const tooFarRight = organism.x > width - margin;
  const tooFarUp = organism.y < margin;
  const tooFarDown = organism.y > height - margin;

  if (tooFarLeft || tooFarRight || tooFarUp || tooFarDown) {
    // räknar ut åt vilket håll mitten av skärmen är
    const angleToCentre = Math.atan2(height / 2 - organism.y, width / 2 - organism.x);
    organism.direction = angleToCentre + organism.edgeBias;
  }

  // ju längre ut mot kanten cellen är, desto hårdare knuffas den tillbaka.
  if (tooFarLeft) {
    organism.vx += (margin - organism.x) * 0.004;
  }
  if (tooFarRight) {
    organism.vx -= (organism.x - (width - margin)) * 0.004;
  }
  if (tooFarUp) {
    organism.vy += (margin - organism.y) * 0.004;
  }
  if (tooFarDown) {
    organism.vy -= (organism.y - (height - margin)) * 0.004;
  }

  // cellens mitt får aldrig åka utanför skärmen.
  if (organism.x < 0) {
    organism.x = 0;
    organism.vx = Math.max(organism.vx, 0);
  }
  if (organism.x > width) {
    organism.x = width;
    organism.vx = Math.min(organism.vx, 0);
  }
  if (organism.y < 0) {
    organism.y = 0;
    organism.vy = Math.max(organism.vy, 0);
  }
  if (organism.y > height) {
    organism.y = height;
    organism.vy = Math.min(organism.vy, 0);
  }
}

// får cellerna att dra i eller knuffa på varandra.
function uppdateraCellkrafter(dt) {
  const range = SETTINGS.interactionRange * sizeScale;

  for (let i = 0; i < organisms.length; i++) {
    for (let j = i + 1; j < organisms.length; j++) {
      const a = organisms[i];
      const b = organisms[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0 || distance > range) {
        continue;
      }

      // en parasit som sitter på en cell ska inte knuffa bort den
      if (a.host === b || b.host === a) {
        continue;
      }

      // riktningen från cell a till cell b
      const directionX = dx / distance;
      const directionY = dy / distance;

      // tunga celler knuffas mindre än lätta
      const totalSize = a.size + b.size;
      const aShare = b.size / totalSize;
      const bShare = a.size / totalSize;

      let force = 0;
      const touchingDistance = totalSize * 0.85;

      if (distance < touchingDistance) {
        // cellerna ligger på varandra: knuffa isär dem
        force = -(touchingDistance - distance) * 0.004;
      } else {
        // beroende på sort vill cellerna vara nära eller långt ifrån varandra. ju längre bort, desto svagare
        const mood = (a.attraction + b.attraction) / 2;
        force = mood * 0.012 * (1 - distance / range);
      }

      a.vx += directionX * force * aShare * dt;
      a.vy += directionY * force * aShare * dt;
      b.vx -= directionX * force * bShare * dt;
      b.vy -= directionY * force * bShare * dt;
    }
  }
}

// ändrar cellens kropp: andning, storlek och form
function uppdateraKropp(organism, time, pulse, dt) {
  // andning: cellen blir lite större och mindre hela tiden, och pulserar med musiken.
  if (organism.breathPhase === 0) {
    organism.breathPhase = time * organism.breathSpeed + organism.breathOffset;
  }
  let breathRate = 1;
  if (organism.sleepiness > 0) {
    breathRate = 1 - 0.6 * organism.sleepiness;
  }
  organism.breathPhase += organism.breathSpeed * (dt / 60) * breathRate;
  const breathing = Math.sin(organism.breathPhase) * organism.breathDepth;
  organism.breath = 1 + breathing + pulse * organism.pulseSensitivity;

  // rädda celler krymper lite
  if (organism.alarm > 0) {
    organism.breath = organism.breath * (1 - organism.alarm * INTERACTION_SETTINGS.contraction);
  }

  // förvånade celler blir lite större
  organism.breath = organism.breath * getMoodSize(organism);

  // nya celler (efter en delning) börjar små och växer
  if (organism.birth < 1) {
    organism.birth = Math.min(1, organism.birth + 0.03 * dt);
    organism.breath = organism.breath * (0.75 + 0.25 * organism.birth);
  }

  // snabba celler blir lite längre åt det håll de simmar
  const currentSpeed = Math.sqrt(organism.vx * organism.vx + organism.vy * organism.vy);
  const targetStretch = Math.min(currentSpeed * 0.12, 0.25);
  organism.stretch += (targetStretch - organism.stretch) * 0.1;   // ändras lite i taget, så att det inte hoppar
  if (currentSpeed > 0.01) {
    organism.moveAngle = Math.atan2(organism.vy, organism.vx);
  }

  byggKontur(organism, time);
}

// räknar ut hur långt det är från cellens mitt till kanten åt ett visst håll. här bestäms alltså cellens form
function radieVidVinkel(organism, angle, time) {
  let wobble = 0;
  for (let i = 0; i < organism.shapeWaves.length; i++) {
    const wave = organism.shapeWaves[i];
    wobble += wave.amount * Math.sin(wave.count * angle + wave.offset + time * wave.speed);
  }

  // varje sort har sin egen form, till exempel droppe eller oval 
  wobble += getLooksShape(organism, angle, time);

  // känslor: rädd, förvånad, knuffad, dragen eller delad. cellen blir ojämn och bubblig när den är orolig
  wobble = wobble * getMoodWobbleFactor(organism) + getMoodShape(organism, angle, time);

  const stretchAmount = organism.stretch * Math.cos(2 * (angle - organism.moveAngle));

  const facing = Math.max(0, Math.cos(angle - organism.tugAngle));
  const tugAmount = organism.tugAmount * (facing * facing * facing - 0.15);

  // delning: cellen blir smal där den skärs och tjock på båda sidorna,
  let divisionShape = 0;
  if (organism.division !== null) {
    const progress = organism.division.progress;
    const along = Math.cos(angle - organism.division.cutAngle);
    const across = Math.sin(angle - organism.division.cutAngle);
    divisionShape = -0.75 * progress * Math.pow(Math.abs(along), 4) + 0.35 * progress * Math.abs(across);
  }

  return organism.size * organism.breath * (1 + wobble + stretchAmount + tugAmount + divisionShape);
}

// räknar ut punkter runt hela cellen och sätter ihop dem till en form
function byggKontur(organism, time) {
  const points = [];
  const pointCount = SETTINGS.outlinePoints;

  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const radius = radieVidVinkel(organism, angle, time);
    points.push({
      x: organism.x + Math.cos(angle) * radius,
      y: organism.y + Math.sin(angle) * radius
    });
  }

  organism.outline = points;
  organism.bodyPath = skapaMjukForm(points);
}

//  gör en rund, mjuk form av punkterna (inga vassa hörn).
function skapaMjukForm(points) {
  const path = new Path2D();
  const count = points.length;

  const last = points[count - 1];
  const first = points[0];
  path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

  for (let i = 0; i < count; i++) {
    const current = points[i];
    const next = points[(i + 1) % count];
    const middleX = (current.x + next.x) / 2;
    const middleY = (current.y + next.y) / 2;
    path.quadraticCurveTo(current.x, current.y, middleX, middleY);
  }

  path.closePath();
  return path;
}

//  uppdaterar alla celler och prickar (körs varje bildruta)
function uppdateraEkosystem(time, dt, pulse) {
  uppdateraCellkrafter(dt);

  for (let i = 0; i < organisms.length; i++) {
    flyttaCell(organisms[i], time, dt);
    uppdateraKropp(organisms[i], time, pulse, dt);
  }
}

// flyttar prickarna i bakgrunden
function uppdateraPartiklar(time, dt) {
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];

    // prickarna stiger långsamt uppåt och vajar åt sidorna
    particle.y -= particle.riseSpeed * dt;
    particle.x += Math.sin(time * particle.swaySpeed + particle.seed) * 0.15 * dt;

    // när pricken åker ut i överkanten börjar den om längst ner
    if (particle.y < -10) {
      particles[i] = skapaPartikel(false);
    }
  }
}

// ritar bakgrunden

function ritaBakgrund(pulse) {
  // målar en mörk genomskinlig färg över hela ritytan, så att spåren från förra bildrutan långsamt försvinner
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(2, 0, 8, " + SETTINGS.trailFade + ")";
  ctx.fillRect(0, 0, width, height);

  // när musiken slår till blir bakgrunden lite ljusare, som ett blått sken
  const bloomStrength = 0.03 * pulse * (1 - 0.7 * ecosystemSleep);
  if (bloomStrength < 0.006) {
    return;
  }
  ctx.globalCompositeOperation = "lighter";
  const centreX = width / 2;
  const centreY = height / 2;
  const bloom = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, Math.max(width, height) * 0.7);
  bloom.addColorStop(0, "rgba(69, 16, 255, " + bloomStrength + ")");
  bloom.addColorStop(1, "rgba(69, 16, 255, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);
}

// ritar alla prickar i bakgrunden. de är små, rörliga och lysande.
function ritaPartiklar(time, pulse) {
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];

    // prickarna blinkar lite, och lite mer på slaget i musiken
    const twinkle = 0.5 + 0.5 * Math.sin(time * 2 + particle.seed);
    let alpha = particle.brightness * twinkle * (0.7 + 0.5 * pulse);

    // prickarna lyser mer när en hand har varit nära, och mindre när allt sover
    alpha = alpha * (1 + particle.glow * 2.5) * (1 - 0.6 * ecosystemSleep);

    ctx.fillStyle = hexTillRgba(particle.colour, alpha);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ritar en cell på skärmen. den består av tre lager: ett stort mjukt ljus, själva cellen och saker inuti cellen.
function ritaCell(organism, time) {
  const body = organism.bodyPath;
  const palette = organism.palette;
  const size = organism.size * organism.breath;

  // celler som försvinner blir genomskinliga
  ctx.globalAlpha = organism.opacity;

  // celler som sover blir mörkare
  if (organism.sleepiness > 0) {
    ctx.globalAlpha = organism.opacity * (1 - ATMOSPHERE_SETTINGS.sleepDimming * organism.sleepiness);
  }

  // rädda, oroliga och muterande celler lyser starkare
  let glowBoost = 1 + organism.alarm * 1.6 + organism.agitation * 0.6 + organism.mutationPulse * 1.5;

  // drifters lyser svagare än de andra 
  let light = 1;
  if (organism.personality === "drifter") {
    light = LOOKS_SETTINGS.drifterLight;
    glowBoost = glowBoost * light;
  }

  ctx.globalCompositeOperation = "lighter";
  const haloRadius = size * (SETTINGS.lightMode ? 1.6 : 2.4);
  const halo = ctx.createRadialGradient(organism.x, organism.y, size * 0.4, organism.x, organism.y, haloRadius);
  halo.addColorStop(0, hexTillRgba(palette.glow, Math.min(SETTINGS.haloStrength * glowBoost, 0.5)));
  halo.addColorStop(1, hexTillRgba(palette.glow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(organism.x, organism.y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // taggar, hår, piskor och armar ritas innan cellen, så att de växer ut under kanten 
  ritaUtseendeBakom(organism, time, size);

  ctx.globalCompositeOperation = "source-over";
  const flowAngle = time * organism.flowSpeed + organism.seed;
  const lightX = organism.x + Math.cos(flowAngle) * size * 0.35;
  const lightY = organism.y + Math.sin(flowAngle * 1.3) * size * 0.35;

  const bodyGradient = ctx.createRadialGradient(lightX, lightY, 0, organism.x, organism.y, size * 1.3);
  bodyGradient.addColorStop(0, palette.core);
  bodyGradient.addColorStop(0.3, palette.middle);
  bodyGradient.addColorStop(0.75, palette.edge);
  bodyGradient.addColorStop(1, palette.edge);

  // ljus runt kanten: två breda, mjuka linjer
  ctx.globalCompositeOperation = "lighter";
  if (!SETTINGS.lightMode) {
    ctx.strokeStyle = hexTillRgba(palette.glow, Math.min(0.08 * glowBoost, 0.3));
    ctx.lineWidth = 16 * sizeScale;
    ctx.stroke(body);
  }
  ctx.strokeStyle = hexTillRgba(palette.glow, Math.min(0.12 * glowBoost, 0.4));
  ctx.lineWidth = 7 * sizeScale;
  ctx.stroke(body);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bodyGradient;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);

  // lysande kärnor som åker runt inuti cellen. de är små, rörliga och lysande.
  ctx.globalCompositeOperation = "lighter";
  let organelleCount = organism.organelles.length;
  if (size < 18) {
    organelleCount = 0;
  }
  for (let i = 0; i < organelleCount; i++) {
    const organelle = organism.organelles[i];
    const angle = organelle.angle + time * organelle.orbitSpeed;
    const ox = organism.x + Math.cos(angle) * organelle.distance * size;
    const oy = organism.y + Math.sin(angle) * organelle.distance * size;
    const radius = organelle.size * size;

    let colour = palette.core;
    if (organelle.useGlowColour) {
      colour = palette.glow;
    }

    const nucleus = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
    nucleus.addColorStop(0, hexTillRgba(colour, 0.55));
    nucleus.addColorStop(1, hexTillRgba(colour, 0));
    ctx.fillStyle = nucleus;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // bubblor, kärnor, hål och prickar inuti cellen
  ritaUtseendeInuti(organism, time, size);

  // färg från en annan cell (när de har en tråd mellan sig), som kommer in från kanten
  if (organism.tintAmount > 0.01) {
    const tint = ctx.createRadialGradient(organism.x, organism.y, size * 0.2, organism.x, organism.y, size * 1.3);
    tint.addColorStop(0, hexTillRgba(organism.tintColour, 0));
    tint.addColorStop(1, hexTillRgba(organism.tintColour, organism.tintAmount));
    ctx.fillStyle = tint;
    ctx.fill(body);
  }

  // känslornas färger: blek när cellen är rädd, vit i mitten när den är förvånad 
  drawMoodColours(organism, size);

  // celler som lyser svagare (drifters) får ett tunt mörkt lager över sig
  if (light < 1) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 0, 15, " + (1 - light) * 0.8 + ")";
    ctx.fill(body);
  }

  // en mörk skugga innanför kanten gör att cellen ser rund ut, som en klump
  ctx.globalCompositeOperation = "source-over";
  const shade = ctx.createRadialGradient(organism.x, organism.y, size * 0.55, organism.x, organism.y, size * 1.35);
  shade.addColorStop(0, "rgba(5, 0, 15, 0)");
  shade.addColorStop(1, "rgba(5, 0, 15, 0.65)");
  ctx.fillStyle = shade;
  ctx.fill(body);

  ctx.restore();   // sluta rita bara inuti formen

  //  en tunn lysande linje runt kanten
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hexTillRgba(palette.glow, 0.55);
  ctx.stroke(body);

  // en glans som ibland blixtrar till.
  const flash = Math.pow(Math.max(0, Math.sin(time * organism.sparkleSpeed + organism.seed)), 12);
  const highlightAlpha = 0.12 + 0.5 * flash;
  const hx = organism.x - size * 0.3;
  const hy = organism.y - size * 0.35;
  const highlightRadius = size * 0.28;
  const highlight = ctx.createRadialGradient(hx, hy, 0, hx, hy, highlightRadius);
  highlight.addColorStop(0, "rgba(255, 255, 255, " + highlightAlpha + ")");
  highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(hx, hy, highlightRadius, 0, Math.PI * 2);
  ctx.fill();

  // ögonen ritas ovanpå cellen 
  if (organism.hasEyes) {
    drawEyes(organism, time);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

// ritar allt, i rätt ordning (det som ritas sist hamnar längst fram)
function ritaEkosystem(time, pulse) {
  ritaBakgrund(pulse);
  drawFootprints();               // lysande fotspår i bakgrunden 
  ritaPartiklar(time, pulse);
  ritaMat();                      // matkornen, bakom cellerna
  drawTendrils(time);             // trådarna, bakom cellerna 
  ritaFusionsbroar(time);        // slemtrådarna när celler smälter ihop, bakom cellerna 
  drawSpeciesTendrils(time);      // kopplarnas trådar, bakom cellerna 

  for (let i = 0; i < organisms.length; i++) {
    ritaCell(organisms[i], time);
  }

  ritaHandeffekter(time);          // ringarna och prickarna från händerna, framför cellerna
  ritaSnitteffekter();             // knivstreck och blixtar
  ritaFusionsladdning(time);         // ringen som blir mindre medan du nyper och håller 
}

window.addEventListener("keydown", function (event) {
  // d: visa eller dölj debug-läget
  if (event.key === "d" || event.key === "D") {
    debugVisible = !debugVisible;
    debugPanel.classList.toggle("visible", debugVisible);
    webcamVideo.classList.toggle("preview", cameraPreviewVisible && debugVisible);
  }

  // v: visa vad kameran ser (bara i debug-läget)
  if (event.key === "v" || event.key === "V") {
    toggleCameraPreview();
  }

  // g: byt handspårningen mellan grafikkortet (GPU) och processorn (CPU)
  if (event.key === "g" || event.key === "G") {
    bytTrackingDelegate();
  }

  // l: lätt läge av eller på (för långsamma datorer)
  if (event.key === "l" || event.key === "L") {
    slaPaLattLage(!SETTINGS.lightMode);
  }

  // f: släpp mat där musen är (bra för att testa utan kamera)
  if (event.key === "f" || event.key === "F") {
    slappMat(feedingMouse.x, feedingMouse.y);
  }

  // m: ljud av eller på
  if (event.key === "m" || event.key === "M") {
    toggleMute();
  }

  // z: allt somnar direkt (så att man kan testa uppvaknandet utan att vänta en minut)
  if (event.key === "z" || event.key === "Z") {
    somnaDirekt();
  }
});

function uppdateraIntrotext() {
  if (tracking.status !== "loading") {
    return;
  }
  const enterButton = document.getElementById("enter-button");
  const text = "[ " + tracking.step.toUpperCase() + " ]";
  if (enterButton.textContent !== text) {
    enterButton.textContent = text;
  }
}

function setupIntro() {
  const intro = document.getElementById("intro");
  const enterButton = document.getElementById("enter-button");

  // när man klickar på knappen. "async" betyder att vi kan vänta på kameran innan startskärmen försvinner
  enterButton.addEventListener("click", async function () {
    enterButton.disabled = true;
    enterButton.textContent = "[ THE ECOSYSTEM IS WAKING ]";
    document.body.classList.add("entered");

    // startar ljudet 
    startaLjud();

    // gör sidan till helskärm 
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {
        // om helskärm inte går fungerar det ändå i ett vanligt fönster
      });
    }

    // startar kameran och mediapipe och väntar tills det är klart.
    await startaTracking();

    intro.classList.add("hidden");
  });
}

// rita en ny bild ish 60 gånger per sekund
function animera(now) {
  requestAnimationFrame(animera);

  // hur lång tid det har gått sedan förra bildrutan (1 = normalt, 2 = datorn är långsam)
  let dt = (now - lastFrameTime) / (1000 / 60);
  if (dt > 3) {
    dt = 3;   // om man har varit på en annan flik blir det ett långt uppehåll. då skulle cellerna hoppa jättelångt
  }

  // gör fps-siffran mjukare, så att den inte hoppar hela tiden
  if (now > lastFrameTime) {
    fps = fps * 0.95 + (1000 / (now - lastFrameTime)) * 0.05;
  }
  if (now - lastFrameTime > 200) {
    qualityCheckTime = now;
  }
  lastFrameTime = now;
  uppdateraAutokvalitet(now);

  const time = now / 1000;    // hur många sekunder sedan sidan öppnades
  const pulse = getBeatPulse(time);

  // kollar den senaste bilden från kameran
  uppdateraTracking(now);

  // reagera: cellerna reagerar på händerna (interaktioner.js)
  uppdateraInteraktioner(time, dt);
  updateAtmosphere(time, dt);     // fotspår, sömn och uppvaknande 
  uppdateraDelning(time, dt);     // skära och dela celler 
  uppdateraFusion(time, dt);      // nypa och hålla så att celler smälter ihop 
  uppdateraMatning(time, dt);     // mata cellerna 
  updateMoods(time, dt);          // rädd och förvånad 
  uppdateraLjud();                // musik och ljud 

  // leva: cellerna rör sig, andas och ändrar form
  uppdateraEkosystem(time, dt, pulse);

  // sorterna, ögonen och mutationerna
  uppdateraCellarter(time, dt);   // vad varje sort gör 
  uppdateraMutation(time, dt);    // mutationer 
  updateEyes(time, dt);    // ögon 
  uppdateraPartiklar(time, dt);

  // rita allt
  ritaEkosystem(time, pulse);
  // debug-läget och pricken i hörnet 
  ritaTrackingdebug();
  uppdateraDebugpanel();
  uppdateraTrackingindikator();
  uppdateraIntrotext();
}

// startar allt när sidan har laddats
function start() {
  anpassaCanvas();
  skapaEkosystem();
  skapaPartiklar();
  if (SETTINGS.lightMode) {
    slaPaLattLage(true);
  }
  setupIntro();

  window.addEventListener("resize", anpassaCanvas);

  requestAnimationFrame(function (now) {
    lastFrameTime = now;
    requestAnimationFrame(animera);
  });
}

start();

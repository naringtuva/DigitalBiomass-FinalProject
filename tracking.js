
const TRACKING_SETTINGS = {
  mediapipeVersion: "0.10.14",   // vilken version av mediapipe vi laddar ner
  cameraWidth: 640,     // en liten kamerabild går snabbare och räcker bra
  cameraHeight: 480,

  edgePadding: 0.12,     // kanterna av kamerabilden (12 %) hamnar utanför skärmen.

  handSmoothing: 0.45,   // hur mjukt handen följs: 1 = darrigt, 0.1 = väldigt mjukt men lite efter
  pinchStart: 0.33,   // hur nära tummen och pekfingret måste vara för att det ska bli ett nyp
  pinchEnd: 0.5,    // hur långt isär tummen och pekfingret måste vara för att nypet ska sluta
  swipeSpeed: 1.3,   // hur snabbt handen måste röra sig för att det ska räknas som ett svep
  swipeHoldTime: 180,  // hur länge ett svep räknas, efter att vi har sett det (i ms)

  lostHandAfter: 300,    // om vi inte har sett en hand på så här länge så glöms den (i ms)
  reconnectTime: 500,    // om en hand syns igen inom så här lång tid räknas den som samma hand (i ms).
  useGpu: true,
  loadTimeout: 30000,    // om mediapipe inte har laddats efter 30 sekunder ger den upp (i ms)
  swapHandedness: true
};

// länken till filen som vet hur händer ser ut
const MODEL_URLS = {
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
};

// mediapipe ger 21 punkter på varje hand
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_KNUCKLE = 9;
const PALM_POINTS = [0, 5, 9, 13, 17];

// för varje finger: toppen och leden under
const FINGERS = [
  { name: "index", tip: 8, joint: 6 },
  { name: "middle", tip: 12, joint: 10 },
  { name: "ring", tip: 16, joint: 14 },
  { name: "pinky", tip: 20, joint: 18 }
];

// skapar en tom hand

function skapaTomHand(name) {
  return {
    name: name,      // "left" (vänster) eller "right" (höger)
    visible: false,
    lastSeen: 0,

    x: 0, y: 0,   // var handen är på skärmen 
    rawX: 0, rawY: 0,
    velocityX: 0, velocityY: 0,   // hur snabbt handen rör sig åt sidan och upp/ner 
    speed: 0,   // hur snabbt handen rör sig total

    handSize: 1,     // hur stor handen ser ut i kameran
    points: [],    // alla 21 punkter på handen

    isPinching: false,
    pinchDistance: 1,    // hur långt det är mellan tummen och pekfingret
    pinchX: 0, pinchY: 0,    // stället mellan tummen och pekfingret

    isOpenPalm: false,
    extendedFingers: 0,

    isSwiping: false,
    swipeUntil: 0,   // svepet räknas fram till den här tiden

    trail: []
  };
}

const tracking = {
  status: "off",     // läget: "off" , "loading" , "running" , "denied"  eller "error" 
  step: "",          // vad som händer just nu (visas medan det laddar och i debug-läget)
  delegate: "",              // "GPU" (grafikkortet) eller "CPU" (processorn): vilken del av datorn som gör jobbet
  framesAnalysed: 0,
  handsInLastFrame: 0,
  lastError: "",
  leftHand: skapaTomHand("left"),
  rightHand: skapaTomHand("right")
};

const video = document.getElementById("webcam");
let handLandmarker = null;
let lastVideoTime = -1;
let errorsInARow = 0;          // hur många fel i rad det har blivit (om det blir för många byter vi till processorn)
let visionLibrary = null;      // mediapipe sparas här när det har laddats, så att vi kan använda det igen senare
let visionFiles = null;
let isSwitchingToCpu = false;

// "async" betyder att funktionen kan vänta på saker som tar tid (till exempel nedladdningar)
// med "await", utan att allt annat fryser
async function startaTracking() {
  if (tracking.status !== "off") {
    return;   // det är redan igång
  }

  // kameran fungerar bara på http://localhost eller https://, inte om man bara öppnar filen
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    visaTrackingproblem("error", "the camera only works through a local server (http://localhost)");
    return;
  }

  tracking.status = "loading";

  tracking.step = "asking for the camera";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: TRACKING_SETTINGS.cameraWidth },
        height: { ideal: TRACKING_SETTINGS.cameraHeight },
        facingMode: "user"
      },
      audio: false
    });
  } catch (error) {
    hanteraKamerafel(error);
    return;
  }

  tracking.step = "starting the video";
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    visaTrackingproblem("error", "the video could not be played (" + error.name + ")");
    return;
  }

  // waitWithTimeout gör att vi inte väntar för evigt om internet är långsamt
  try {
    await waitWithTimeout(laddaMediaPipe(), TRACKING_SETTINGS.loadTimeout);
  } catch (error) {
    console.error("mediapipe failed to load:", error);
    visaTrackingproblem("error", String(error));
    return;
  }

  tracking.status = "running";
  tracking.step = "running";
  console.log("tracking is running on the " + tracking.delegate);
}

// ger ett fel om något tar för lång tid
function waitWithTimeout(promise, milliseconds) {
  const timeout = new Promise(function (resolve, reject) {
    setTimeout(function () {
      reject(new Error("took longer than " + (milliseconds / 1000) + " seconds"));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]);
}

// byter mellan grafikkortet (GPU) och processorn (CPU) för handspårningen
function bytTrackingDelegate() {
  if (tracking.status !== "running") {
    return;
  }
  const next = tracking.delegate === "GPU" ? "CPU" : "GPU";
  isSwitchingToCpu = true;
  skapaLandmarkers(next).then(function () {
    isSwitchingToCpu = false;
  }).catch(function (error) {
    tracking.lastError = String(error);
    isSwitchingToCpu = false;
  });
}

// laddar ner mediapipe från internet
async function laddaMediaPipe() {
  const cdnFolder = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + TRACKING_SETTINGS.mediapipeVersion;

  // import() laddar ner javascript-kod från internet medan sidan är igång
  tracking.step = "downloading mediapipe";
  visionLibrary = await import(cdnFolder + "/vision_bundle.mjs");

  // "wasm" är den snabba delen av mediapipe
  tracking.step = "loading mediapipe wasm";
  visionFiles = await visionLibrary.FilesetResolver.forVisionTasks(cdnFolder + "/wasm");

  let delegate = "CPU";
  if (TRACKING_SETTINGS.useGpu) {
    delegate = "GPU";
  }
  await skapaLandmarkers(delegate);
}

// delegate är "GPU" (grafikkortet) eller "CPU" (processorn).
async function skapaLandmarkers(delegate) {
  try {
    tracking.step = "loading hand model (" + delegate + ")";
    handLandmarker = await visionLibrary.HandLandmarker.createFromOptions(visionFiles, {
      baseOptions: { modelAssetPath: MODEL_URLS.hand, delegate: delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35   // lite lägre än standard (0.5), så att handen inte tappas lika lätt i snabba rörelser
    });

    tracking.delegate = delegate;
  } catch (error) {
    if (delegate === "GPU") {
      console.warn("gpu tracking failed, trying cpu instead", error);
      await skapaLandmarkers("CPU");
    } else {
      throw error;
    }
  }
}

// byter från grafikkortet till processorn, om grafikkortet krånglar
async function bytTillCpu() {
  isSwitchingToCpu = true;
  console.warn("tracking keeps failing on the gpu, switching to cpu");
  try {
    await skapaLandmarkers("CPU");
    errorsInARow = 0;
  } catch (error) {
    tracking.lastError = String(error);
  }
  isSwitchingToCpu = false;
}

function hanteraKamerafel(error) {
  console.warn("camera error:", error.name, error.message);
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    visaTrackingproblem("denied", "camera permission was denied");
  } else {
    visaTrackingproblem("error", "the camera could not be started (" + error.name + ")");
  }
}

// inget visas på skärmen, men pricken i hörnet blir röd och debug-läget (d) visar felet.
function visaTrackingproblem(status, text) {
  tracking.status = status;
  tracking.lastError = text;
}

// körs hela tiden (varje bildruta) från script.js.
function uppdateraTracking(now) {
  if (tracking.status !== "running" || isSwitchingToCpu) {
    return;
  }

  // så vi letar bara efter händer när det finns en ny bild från kameran
  const hasNewFrame = video.readyState >= 2 && video.currentTime !== lastVideoTime;

  if (hasNewFrame) {
    lastVideoTime = video.currentTime;

    // try/catch: om något går fel med en bild hoppar vi över den i stället för att allt stannar
    try {
      const handResult = handLandmarker.detectForVideo(video, now);
      tracking.framesAnalysed += 1;
      tracking.handsInLastFrame = handResult.landmarks.length;
      processHands(handResult, now);
      errorsInARow = 0;
    } catch (error) {
      errorsInARow += 1;
      tracking.lastError = String(error);
      if (errorsInARow === 1) {
        console.error("tracking error (the ecosystem keeps running):", error);
      }
      if (errorsInARow >= 10 && tracking.delegate === "GPU") {
        bytTillCpu();
      }
    }
  }

  kollaTappadTracking(now);
}

// mediapipe ger tal från 0 till 1
function toScreenX(normalisedX) {
  const mirrored = 1 - normalisedX;
  const padding = TRACKING_SETTINGS.edgePadding;
  return ((mirrored - padding) / (1 - 2 * padding)) * width;
}

//  gör om en plats i kamerabilden till en plats på skärmen (upp och ner)
function toScreenY(normalisedY) {
  const padding = TRACKING_SETTINGS.edgePadding;
  return ((normalisedY - padding) / (1 - 2 * padding)) * height;
}

// räknar ut avståndet mellan två punkter i kamerabilden
function cameraDistance(pointA, pointB) {
  const dx = (pointA.x - pointB.x) * video.videoWidth;
  const dy = (pointA.y - pointB.y) * video.videoHeight;
  return Math.sqrt(dx * dx + dy * dy);
}

// tar emot händerna som mediapipe hittade
function processHands(result, now) {
  const handsFound = [];

  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i];

    // mediapipe gissar om det är en vänster eller höger hand
    let label = "right";
    const handednessList = result.handedness || result.handednesses;
    if (handednessList && handednessList[i] && handednessList[i][0]) {
      label = handednessList[i][0].categoryName.toLowerCase();
    }
    if (TRACKING_SETTINGS.swapHandedness) {
      if (label === "left") {
        label = "right";
      } else {
        label = "left";
      }
    }

    handsFound.push({
      landmarks: landmarks,
      label: label,
      screenX: toScreenX(landmarks[WRIST].x)
    });
  }

  // om det finns två händer är den som är till vänster på skärmen vänsterhanden.
  if (handsFound.length === 2) {
    if (handsFound[0].screenX < handsFound[1].screenX) {
      handsFound[0].label = "left";
      handsFound[1].label = "right";
    } else {
      handsFound[0].label = "right";
      handsFound[1].label = "left";
    }
  }

  // om det bara finns en hand: håll fast vid den hand vi redan följer
  if (handsFound.length === 1) {
    const leftRecent = now - tracking.leftHand.lastSeen < TRACKING_SETTINGS.reconnectTime;
    const rightRecent = now - tracking.rightHand.lastSeen < TRACKING_SETTINGS.reconnectTime;
    if (leftRecent && !rightRecent) {
      handsFound[0].label = "left";
    } else if (rightRecent && !leftRecent) {
      handsFound[0].label = "right";
    } else if (leftRecent && rightRecent) {
      // båda har synts nyss: välj den som var närmast
      const x = handsFound[0].screenX;
      const leftDistance = Math.abs(x - tracking.leftHand.rawX);
      const rightDistance = Math.abs(x - tracking.rightHand.rawX);
      handsFound[0].label = leftDistance < rightDistance ? "left" : "right";
    }
  }

  for (let i = 0; i < handsFound.length; i++) {
    const found = handsFound[i];
    if (found.label === "left") {
      uppdateraHand(tracking.leftHand, found.landmarks, now);
    } else {
      uppdateraHand(tracking.rightHand, found.landmarks, now);
    }
  }}

// uppdaterar en hand: var den är, hur snabbt den rör sig och vad den gör
function uppdateraHand(hand, landmarks, now) {
  // om handen bara försvann en kort stund (suddig bild mitt i ett snabbt svep) räknar vi den som samma hand som förut. då räknas farten från där den var, och snittet blir av
  const wasVisible = hand.visible || (hand.lastSeen > 0 && now - hand.lastSeen < TRACKING_SETTINGS.reconnectTime);

  // alla 21 punkter på skärmen (bara för att rita i debug-läget)
  hand.points = [];
  for (let i = 0; i < landmarks.length; i++) {
    hand.points.push({ x: toScreenX(landmarks[i].x), y: toScreenY(landmarks[i].y) });
  }

  // handflatans mitt = mitten mellan handleden och de fyra knogarna
  let totalX = 0;
  let totalY = 0;
  for (let i = 0; i < PALM_POINTS.length; i++) {
    totalX += hand.points[PALM_POINTS[i]].x;
    totalY += hand.points[PALM_POINTS[i]].y;
  }
  const palmX = totalX / PALM_POINTS.length;
  const palmY = totalY / PALM_POINTS.length;

  if (wasVisible) {
    // fart = hur långt handen har rört sig ÷ hur lång tid det tog
    const secondsPassed = (now - hand.lastSeen) / 1000;
    if (secondsPassed > 0) {
      hand.velocityX = (palmX - hand.rawX) / secondsPassed;
      hand.velocityY = (palmY - hand.rawY) / secondsPassed;
      hand.speed = Math.sqrt(hand.velocityX * hand.velocityX + hand.velocityY * hand.velocityY);
    }
  } else {
    // handen kom precis fram: vi börjar här. vi räknar inte hoppet
    hand.x = palmX;
    hand.y = palmY;
    hand.velocityX = 0;
    hand.velocityY = 0;
    hand.speed = 0;
    hand.trail = [];
  }

  hand.rawX = palmX;
  hand.rawY = palmY;

  // handen flyttar sig bara en del av vägen varje bildruta.
  hand.x += (palmX - hand.x) * TRACKING_SETTINGS.handSmoothing;
  hand.y += (palmY - hand.y) * TRACKING_SETTINGS.handSmoothing;

  // sparar de senaste ställena där handen har varit 
  hand.trail.push({ x: palmX, y: palmY, time: now });
  while (hand.trail.length > 0 && now - hand.trail[0].time > 500) {
    hand.trail.shift();
  }

  // hur stor handen ser ut i kameran. då fungerar gesterna både nära och långt bort
  hand.handSize = Math.max(cameraDistance(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]), 1);

  hittaNyp(hand, landmarks);
  detectOpenPalm(hand, landmarks);
  hittaSvep(hand, now);

  hand.visible = true;
  hand.lastSeen = now;
}

//  om handen nyper (tummen och pekfingret nuddar varandra)
function hittaNyp(hand, landmarks) {
  // vi delar med handens storlek, så att det fungerar både nära och långt från kameran
  hand.pinchDistance = cameraDistance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / hand.handSize;

  // nypet börjar när fingrarna är väldigt nära, men slutar först när de är långt isär
  if (!hand.isPinching && hand.pinchDistance < TRACKING_SETTINGS.pinchStart) {
    hand.isPinching = true;
  } else if (hand.isPinching && hand.pinchDistance > TRACKING_SETTINGS.pinchEnd) {
    hand.isPinching = false;
  }

  // stället mellan tummen och pekfingret
  hand.pinchX = (hand.points[THUMB_TIP].x + hand.points[INDEX_TIP].x) / 2;
  hand.pinchY = (hand.points[THUMB_TIP].y + hand.points[INDEX_TIP].y) / 2;
}

//  om handen är öppen (alla fyra fingrarna är raka)
function detectOpenPalm(hand, landmarks) {
  let extended = 0;

  for (let i = 0; i < FINGERS.length; i++) {
    const finger = FINGERS[i];
    const tipDistance = cameraDistance(landmarks[WRIST], landmarks[finger.tip]);
    const jointDistance = cameraDistance(landmarks[WRIST], landmarks[finger.joint]);
    if (tipDistance > jointDistance * 1.1) {
      extended += 1;
    }
  }

  hand.extendedFingers = extended;
  hand.isOpenPalm = extended === 4 && !hand.isPinching;
}

// kollar om handen sveper (rör sig väldigt snabbt)
function hittaSvep(hand, now) {
  // farten i "skärmbredder per sekund", så att det fungerar på alla skärmar
  const speedInScreens = hand.speed / width;

  if (speedInScreens > TRACKING_SETTINGS.swipeSpeed) {
    hand.isSwiping = true;
    hand.swipeUntil = now + TRACKING_SETTINGS.swipeHoldTime;
  } else if (now > hand.swipeUntil) {
    hand.isSwiping = false;
  }
}

// kollar om vi har tappat bort en hand. om vi inte har sett den på ett tag räknas den som borta och cellerna lever vidare som vanligt
function kollaTappadTracking(now) {
  const hands = [tracking.leftHand, tracking.rightHand];

  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    if (hand.visible && now - hand.lastSeen > TRACKING_SETTINGS.lostHandAfter) {
      hand.visible = false;
      hand.isPinching = false;
      hand.isOpenPalm = false;
      hand.isSwiping = false;
      hand.speed = 0;
    }
  }
}

//  allt som syns när man trycker på d: texten i hörnet, skelett för händerna,
//  den lilla pricken i hörnet som visar om kameran fungerar, och bilden från kameran (v).

const debugPanel = document.getElementById("debug-panel");
const trackingIndicator = document.getElementById("tracking-indicator");

// linjer mellan handens 21 punkter, så att det ser ut som ett skelett (par av punktnummer)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // tummen
  [0, 5], [5, 6], [6, 7], [7, 8],           // pekfingret
  [5, 9], [9, 10], [10, 11], [11, 12],      // långfingret
  [9, 13], [13, 14], [14, 15], [15, 16],    // ringfingret
  [13, 17], [17, 18], [18, 19], [19, 20],   // lillfingret
  [0, 17]    // nederkanten av handflatan
];

// gör om handens gest till ett kort ord för debug-läget
function beskrivGest(hand) {
  if (!hand.visible) {
    return "—";
  }
  if (hand.isSwiping) {
    return "SWIPE";
  }
  if (hand.isPinching) {
    return "PINCH";
  }
  if (hand.isOpenPalm) {
    return "OPEN PALM";
  }
  return "hand (" + hand.extendedFingers + " fingers)";
}

// gör en kort text om en hand för debug-panelen
function beskrivHand(hand) {
  if (!hand.visible) {
    return "not visible";
  }
  return beskrivGest(hand) +
    "  speed " + Math.round(hand.speed) + " px/s" +
    "  pinch " + hand.pinchDistance.toFixed(2);
}

// all text i debug-panelen
function uppdateraDebugpanel() {
  if (!debugVisible) {
    return;
  }

  // räknar hur många celler det finns av varje sort
  const counts = {};
  for (let i = 0; i < organisms.length; i++) {
    const name = organisms[i].personality;
    if (counts[name] === undefined) {
      counts[name] = 0;
    }
    counts[name] += 1;
  }

  // skriver ut debug-texten
  let text = "DIGITAL BIOMASS — DEBUG\n";
  text += "fps: " + Math.round(fps) + "\n";
  text += "upplösning: " + Math.round(SETTINGS.renderScale * 100) + " %   lätt läge: " + (SETTINGS.lightMode ? "på" : "av") + "\n";
  text += "organisms: " + organisms.length + " / " + SETTINGS.maxOrganisms + "\n";
  const names = Object.keys(counts);
  for (let i = 0; i < names.length; i++) {
    text += "  " + names[i] + ": " + counts[names[i]] + "\n";
  }
  text += "bpm: " + SETTINGS.bpm + "\n";
  text += "\n";

  text += "version: " + VERSION + "\n";
  text += "\n";

  text += "tracking: " + tracking.status + "  (" + tracking.step + ")\n";
  if (tracking.status === "running") {
    text += "  calculating on: " + tracking.delegate + "\n";
    text += "  camera: " + webcamVideo.videoWidth + " × " + webcamVideo.videoHeight + "\n";
    text += "  images analysed: " + tracking.framesAnalysed + "\n";
    text += "  hands in latest image: " + tracking.handsInLastFrame + "\n";
  }
  if (tracking.lastError !== "") {
    text += "  last error: " + tracking.lastError.slice(0, 80) + "\n";
  }
  text += "left hand:  " + beskrivHand(tracking.leftHand) + "\n";
  text += "right hand: " + beskrivHand(tracking.rightHand) + "\n";
  text += "\n";
  text += beskrivInteraktioner();
  text += beskrivDelning();
  text += beskrivFusion();
  text += beskrivLjud();
  text += beskrivCellarter();
  text += describeEyes();
  text += beskrivMutation();
  text += describeAtmosphere();
  text += describeMoods();
  text += beskrivMatning();
  text += "\n";
  text += "[D] debug   [V] camera   [M] mute   [Z] sleep   [F] food   [L] light mode   [G] GPU/CPU";

  debugPanel.textContent = text;
}

// kommer ihåg om vi har ritat något på debug-ritytan
let debugCanvasHasDrawing = false;

// ritar det som kameran ser (händerna) i debug-läget
function ritaTrackingdebug() {
  if (debugCanvasHasDrawing) {
    debugCtx.clearRect(0, 0, width, height);
    debugCanvasHasDrawing = false;
  }

  if (!debugVisible) {
    return;
  }
  debugCanvasHasDrawing = true;

  ritaInteraktionsdebug();
  ritaMutationsdebug();
  drawMoodDebug();
  ritaHanddebug(tracking.leftHand, "#00E5FF");
  ritaHanddebug(tracking.rightHand, "#FF28B9");
}

// ritar en hand i debug-läget
function ritaHanddebug(hand, colour) {
  if (!hand.visible || hand.points.length === 0) {
    return;
  }

  // handens skelett
  debugCtx.strokeStyle = hexTillRgba(colour, 0.6);
  debugCtx.lineWidth = 1.5;
  for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
    const from = hand.points[HAND_CONNECTIONS[i][0]];
    const to = hand.points[HAND_CONNECTIONS[i][1]];
    debugCtx.beginPath();
    debugCtx.moveTo(from.x, from.y);
    debugCtx.lineTo(to.x, to.y);
    debugCtx.stroke();
  }

  // de 21 punkterna på handen
  debugCtx.fillStyle = colour;
  for (let i = 0; i < hand.points.length; i++) {
    debugCtx.beginPath();
    debugCtx.arc(hand.points[i].x, hand.points[i].y, 3, 0, Math.PI * 2);
    debugCtx.fill();
  }

  // en linje som visar hur handen har rört sig (gul när handen sveper)
  if (hand.trail.length > 1) {
    debugCtx.strokeStyle = hand.isSwiping ? "#F5FF45" : hexTillRgba(colour, 0.4);
    debugCtx.lineWidth = hand.isSwiping ? 4 : 2;
    debugCtx.beginPath();
    debugCtx.moveTo(hand.trail[0].x, hand.trail[0].y);
    for (let i = 1; i < hand.trail.length; i++) {
      debugCtx.lineTo(hand.trail[i].x, hand.trail[i].y);
    }
    debugCtx.stroke();
  }

  // området runt handen där cellerna påverkas (fyllt när handen gör en gest)
  const zoneRadius = SETTINGS.handInfluenceRadius * sizeScale;
  debugCtx.setLineDash([4, 6]);
  debugCtx.strokeStyle = hexTillRgba(colour, 0.5);
  debugCtx.lineWidth = 1;
  debugCtx.beginPath();
  debugCtx.arc(hand.x, hand.y, zoneRadius, 0, Math.PI * 2);
  debugCtx.stroke();
  debugCtx.setLineDash([]);

  if (hand.isOpenPalm || hand.isPinching) {
    debugCtx.fillStyle = hexTillRgba(colour, 0.08);
    debugCtx.fill();
  }

  // handens mitt
  debugCtx.strokeStyle = colour;
  debugCtx.lineWidth = 2;
  debugCtx.beginPath();
  debugCtx.arc(hand.x, hand.y, 10, 0, Math.PI * 2);
  debugCtx.stroke();

  // stället där man nyper
  if (hand.isPinching) {
    debugCtx.fillStyle = "#FFFFFF";
    debugCtx.beginPath();
    debugCtx.arc(hand.pinchX, hand.pinchY, 7, 0, Math.PI * 2);
    debugCtx.fill();
  }

  // gestens namn
  debugCtx.fillStyle = colour;
  debugCtx.font = "12px Courier New, monospace";
  debugCtx.fillText(hand.name.toUpperCase() + " · " + beskrivGest(hand), hand.x + 16, hand.y - 16);
}

// den lilla pricken i nedre högra hörnet. den visar om kameran fungerar
let lastIndicatorState = "";

// ändrar färgen på pricken i hörnet
function uppdateraTrackingindikator() {
  let state = "";

  if (tracking.status === "loading") {
    state = "loading";
  } else if (tracking.status === "running") {
    const seesSomething = tracking.leftHand.visible || tracking.rightHand.visible;
    if (seesSomething) {
      state = "seeing";
    } else {
      state = "running";
    }
  } else if (tracking.status === "denied" || tracking.status === "error") {
    state = "problem";
  }

  // vi ändrar bara pricken när läget faktiskt ändras
  if (state !== lastIndicatorState) {
    trackingIndicator.className = state;
    lastIndicatorState = state;
  }
}

// v i debug-läget: en liten bild från kameran i hörnet, så att man kan se vad kameran ser
// (ljus, vinkel). den syns aldrig i själva konstverket
const webcamVideo = document.getElementById("webcam");
let cameraPreviewVisible = false;

// visar eller döljer bilden från kameran (v-tangenten)
function toggleCameraPreview() {
  cameraPreviewVisible = !cameraPreviewVisible;
  webcamVideo.classList.toggle("preview", cameraPreviewVisible && debugVisible);
}
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- 1. SETUP MAGIC NEON SCENE ---
const canvas = document.getElementById('webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87CEEB'); // Natural sky blue
scene.fog = new THREE.Fog('#87CEEB', 400, 4000);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 6000);

let mapMode = false;
document.getElementById('map-toggle').addEventListener('click', (e) => {
    mapMode = !mapMode;
    const btn = document.getElementById('map-toggle');
    const uic = document.getElementById('map-ui-container');
    if (mapMode) {
        btn.classList.add('active');
        uic.classList.remove('hidden');
    } else {
        btn.classList.remove('active');
        uic.classList.add('hidden');
    }
});

// Sections Panel Toggle
let sectionsOpen = false;
document.getElementById('sections-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    sectionsOpen = !sectionsOpen;
    const btn = document.getElementById('sections-btn');
    const panel = document.getElementById('sections-panel');
    if (sectionsOpen) {
        btn.classList.add('active');
        panel.classList.remove('hidden');
    } else {
        btn.classList.remove('active');
        panel.classList.add('hidden');
    }
});



let gameStarted = false;
const bgm = document.getElementById('bgm');

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    if (gameStarted) return;

    // Normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(carGroup.children, true);

    if (intersects.length > 0) {
        gameStarted = true;
        document.getElementById('start-screen').style.opacity = '0';
        setTimeout(() => { document.getElementById('start-screen').style.display = 'none'; }, 500);
        // Play music dynamically when user interacts
        bgm.volume = 0.5;
        bgm.play().catch(e => console.log('Audio playback prevented by browser'));
    }
});

document.getElementById('mute-btn').addEventListener('click', (e) => {
    e.stopPropagation(); // prevent bubbling 
    const btn = e.target.closest('button');

    if (!bgm.paused) {
        bgm.pause();
        btn.innerHTML = '<span>Muted</span>';
        btn.style.background = 'rgba(255, 50, 100, 0.5)';
    } else {
        bgm.play();
        btn.innerHTML = '<span>Sound</span>';
        btn.style.background = 'rgba(30, 30, 40, 0.8)';
    }
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Warm Sunset Lighting
const ambientLight = new THREE.AmbientLight('#ffeedd', 0.7);
scene.add(ambientLight);

// Hemisphere: sky blue to grass green ground
const hemiLight = new THREE.HemisphereLight('#87CEEB', '#3D7A1A', 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight('#FFE4B5', 1.8); // Golden sun
dirLight.position.set(200, 300, 100);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 400;
dirLight.shadow.camera.bottom = -400;
dirLight.shadow.camera.left = -400;
dirLight.shadow.camera.right = 400;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 1000;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// Warm accent
const pointLight = new THREE.PointLight('#ff8844', 1, 50);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// --- 2. SETUP CANNON-ES PHYSICS ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.2;

const physicsMaterial = new CANNON.Material('physics');
const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, { friction: 0.1, restitution: 0.1 });
world.addContactMaterial(physics_physics);
const bouncyMaterial = new CANNON.Material('bouncy');
world.addContactMaterial(new CANNON.ContactMaterial(physicsMaterial, bouncyMaterial, { friction: 0.4, restitution: 0.8 }));

const physicalObjects = []; // To sync visual and physics meshes

// Visual Floor — Realistic Grass Texture
const grassTexLoader = new THREE.TextureLoader();
const grassTex = grassTexLoader.load('grass_texture.png');
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(150, 150); // Tile across the huge floor
const floorGeo = new THREE.PlaneGeometry(4000, 4000);
const floorMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// Physics Floor
const floorBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
floorBody.addShape(new CANNON.Plane());
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(floorBody);

// Invisible Arena Boundaries
function addInvisibleWall(x, z, w, d) {
    const wall = new CANNON.Body({ mass: 0, material: physicsMaterial });
    wall.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 50, d / 2)));
    wall.position.set(x, 25, z);
    world.addBody(wall);
}

// 800 units perfectly surrounds every generated prop and track curve safely
const boundary = 1200;
const wallThickness = 20;
addInvisibleWall(0, -boundary, boundary * 2 + wallThickness * 2, wallThickness); // North
addInvisibleWall(0, boundary, boundary * 2 + wallThickness * 2, wallThickness); // South
addInvisibleWall(-boundary, 0, wallThickness, boundary * 2); // West
addInvisibleWall(boundary, 0, wallThickness, boundary * 2); // East


// --- 3. GENERATE PROCEDURAL RACETRACK ---
// Draw a custom canvas texture for the road
const ctxWidth = 512, ctxHeight = 512;
const cvs = document.createElement('canvas');
cvs.width = ctxWidth; cvs.height = ctxHeight;
const ctx = cvs.getContext('2d');

// Generate base Indian highway asphalt (slight greyish-blue tar from the photo)
ctx.fillStyle = '#2f3136';
ctx.fillRect(0, 0, ctxWidth, ctxHeight);

// Texture U axis maps to Road Length. Texture V axis maps to Road Circumference.
// A TubeGeometry with radialSegments=8 flattened on Y means:
// V=0 is Right edge, V=0.25 is Top Center, V=0.5 is Left edge, V=0.75 is Bottom Center.
const yTopCenter = ctxHeight * 0.25;
const yTopRight = ctxHeight * 0.08;
const yTopLeft = ctxHeight * 0.42;

const yBotCenter = ctxHeight * 0.75;
const yBotRight = ctxHeight * 0.92;
const yBotLeft = ctxHeight * 0.58;

const lineWidth = 8;
const dashLength = ctxWidth * 0.35; // Dashes span 35% of the repeating U length

ctx.fillStyle = '#ffffff';

// TOP FACE MARKINGS
// Solid margin lines running the entire un-interrupted length
ctx.fillRect(0, yTopRight, ctxWidth, lineWidth);
ctx.fillRect(0, yTopLeft, ctxWidth, lineWidth);
// Dashed centerline centered perfectly
ctx.fillRect((ctxWidth / 2) - (dashLength / 2), yTopCenter - (lineWidth / 2), dashLength, lineWidth);

// BOTTOM FACE MARKINGS (Provides safety if road twists upside down)
ctx.fillRect(0, yBotRight, ctxWidth, lineWidth);
ctx.fillRect(0, yBotLeft, ctxWidth, lineWidth);
ctx.fillRect((ctxWidth / 2) - (dashLength / 2), yBotCenter - (lineWidth / 2), dashLength, lineWidth);

const roadTex = new THREE.CanvasTexture(cvs);
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;

// 3.1 Central Roundabout (Start Hub)
const ringGeo = new THREE.RingGeometry(10, 16, 64);
const ringTex = roadTex.clone();
ringTex.repeat.set(20, 1);
const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.8 }));
ringMesh.rotation.x = -Math.PI / 2;
ringMesh.position.y = 0.05;
ringMesh.receiveShadow = true;
scene.add(ringMesh);

// --- RECTANGULAR GRID ROAD BUILDER ---
function buildRectRoad(points, texRepeats) {
    const curvePath = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) {
        curvePath.add(new THREE.LineCurve3(points[i], points[i + 1]));
    }
    const geo = new THREE.TubeGeometry(curvePath, points.length * 60, 6, 8, false);
    geo.scale(1, 0.01, 1);
    const tex = roadTex.clone(); tex.repeat.set(texRepeats, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
    return curvePath;
}

const Y = 0.05; // Road height

// 3.2 Left Path: Hub -> ABOUT -> GITHUB -> CONTACT (rectangular grid)
const leftCurve = buildRectRoad([
    new THREE.Vector3(-14, Y, 0),      // Exit roundabout
    new THREE.Vector3(-200, Y, 0),     // Straight West
    new THREE.Vector3(-200, Y, -200),  // Turn South -> ABOUT corner
    new THREE.Vector3(-450, Y, -200),  // Straight West
    new THREE.Vector3(-450, Y, -450),  // Turn South -> GITHUB corner
    new THREE.Vector3(-700, Y, -450),  // Straight West
    new THREE.Vector3(-700, Y, -650),  // Turn South -> CONTACT endpoint
], 200);

// 3.3 Right Path: Hub -> PROJECTS -> RESUME -> SKILLS (rectangular grid)
const rightCurve = buildRectRoad([
    new THREE.Vector3(14, Y, 0),       // Exit roundabout
    new THREE.Vector3(200, Y, 0),      // Straight East
    new THREE.Vector3(200, Y, 200),    // Turn North -> PROJECTS corner
    new THREE.Vector3(450, Y, 200),    // Straight East
    new THREE.Vector3(450, Y, 450),    // Turn North -> RESUME corner
    new THREE.Vector3(700, Y, 450),    // Straight East
    new THREE.Vector3(700, Y, 650),    // Turn North -> SKILLS endpoint
], 200);

// 3.4 Loop Road: SKILLS corner -> loop back -> PROJECTS (rectangular outer ring)
const loopCurve = buildRectRoad([
    new THREE.Vector3(700, Y, 650),    // SKILLS
    new THREE.Vector3(700, Y, 0),      // Drop straight south
    new THREE.Vector3(400, Y, 0),      // Cut west
    new THREE.Vector3(400, Y, 200),    // Rise north
    new THREE.Vector3(200, Y, 200),    // Meet back at PROJECTS
], 160);

// 3.5 Cross-Map Bridge: PROJECTS -> straight across -> GITHUB (rectangular diagonal grid)
const bridgeCurve = buildRectRoad([
    new THREE.Vector3(200, Y, 200),    // PROJECTS
    new THREE.Vector3(200, Y, -200),   // Drop south
    new THREE.Vector3(0, Y, -200),     // Cut west through center
    new THREE.Vector3(0, Y, -450),     // Drop south
    new THREE.Vector3(-450, Y, -450),  // Cut west -> GITHUB
], 180);


// --- 4. THE JEEP (ADVANCED PROPS) ---
const chassisShape = new CANNON.Box(new CANNON.Vec3(1.1, 0.6, 2.2)); // Robust hit box
const chassisBody = new CANNON.Body({ mass: 300, material: physicsMaterial });
chassisBody.addShape(chassisShape);
chassisBody.position.set(0, 4, 0);

const carGroup = new THREE.Group();

// --- JOHN DEERE TRACTOR BUILD ---
const jdGreen = new THREE.MeshStandardMaterial({ color: '#367C2B', roughness: 0.5 }); // John Deere Green
const jdYellow = new THREE.MeshStandardMaterial({ color: '#FFDE00', roughness: 0.4 }); // John Deere Yellow
const blackMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#a8d8ea', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6 });

// Engine Hood (front lower green block)
const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 2.5), jdGreen);
hood.position.set(0, 0.1, 1.2);
hood.castShadow = true;
carGroup.add(hood);

// Hood top slope
const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 2.4), jdGreen);
hoodTop.position.set(0, 0.7, 1.2);
carGroup.add(hoodTop);

// Yellow stripe on hood
const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.08, 0.3), jdYellow);
stripe.position.set(0, 0.35, 1.5);
carGroup.add(stripe);

// Radiator grille (black front face)
const grille = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.1), blackMat);
grille.position.set(0, 0.15, 2.45);
carGroup.add(grille);

// Headlights
const headLightMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffddaa', emissiveIntensity: 2 });
const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.12), headLightMat);
hl1.position.set(0.55, 0.5, 2.5); carGroup.add(hl1);
const hl2 = hl1.clone(); hl2.position.set(-0.55, 0.5, 2.5); carGroup.add(hl2);
const spot1 = new THREE.PointLight('#ffddaa', 1.5, 30); spot1.position.set(0, 0.5, 3); carGroup.add(spot1);

// Cabin body (rear section, taller)
const cabinBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2.0), jdGreen);
cabinBase.position.set(0, 0.1, -0.8);
cabinBase.castShadow = true;
carGroup.add(cabinBase);

// Cabin frame (dark pillars)
const pillarMat = blackMat;
const pillarGeo = new THREE.BoxGeometry(0.12, 1.8, 0.12);
// Four corner pillars
const p1 = new THREE.Mesh(pillarGeo, pillarMat); p1.position.set(0.85, 1.3, 0.1); carGroup.add(p1);
const p2 = new THREE.Mesh(pillarGeo, pillarMat); p2.position.set(-0.85, 1.3, 0.1); carGroup.add(p2);
const p3 = new THREE.Mesh(pillarGeo, pillarMat); p3.position.set(0.85, 1.3, -1.7); carGroup.add(p3);
const p4 = new THREE.Mesh(pillarGeo, pillarMat); p4.position.set(-0.85, 1.3, -1.7); carGroup.add(p4);

// Cabin roof (green)
const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 2.2), jdGreen);
roof.position.set(0, 2.25, -0.8);
roof.castShadow = true;
carGroup.add(roof);

// Glass windows (front, back, sides)
const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.06), glassMat);
frontGlass.position.set(0, 1.3, 0.12); carGroup.add(frontGlass);
const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.06), glassMat);
rearGlass.position.set(0, 1.3, -1.72); carGroup.add(rearGlass);
const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 1.7), glassMat);
sideGlassL.position.set(0.87, 1.3, -0.8); carGroup.add(sideGlassL);
const sideGlassR = sideGlassL.clone(); sideGlassR.position.x = -0.87; carGroup.add(sideGlassR);

// Exhaust pipe (right side)
const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8), blackMat);
exhaust.position.set(0.95, 1.8, 0.5);
carGroup.add(exhaust);
const exhaustCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), blackMat);
exhaustCap.position.set(0.95, 3.05, 0.5);
carGroup.add(exhaustCap);

// Fenders over rear wheels
const fenderGeo = new THREE.BoxGeometry(0.3, 0.4, 1.6);
const fL = new THREE.Mesh(fenderGeo, jdGreen); fL.position.set(1.15, 0.5, -1.0); carGroup.add(fL);
const fR = new THREE.Mesh(fenderGeo, jdGreen); fR.position.set(-1.15, 0.5, -1.0); carGroup.add(fR);

// Taillights
const tailMat = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 3 });
const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
tl1.position.set(0.7, 0.3, -1.8); carGroup.add(tl1);
const tl2 = tl1.clone(); tl2.position.set(-0.7, 0.3, -1.8); carGroup.add(tl2);

scene.add(carGroup);

const vehicle = new CANNON.RaycastVehicle({
    chassisBody: chassisBody,
    indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2
});

const wheelOptions = {
    radius: 0.65,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 20,           // Softer springs prevent pogoing
    suspensionRestLength: 0.4,
    frictionSlip: 4,
    dampingRelaxation: 5,              // Heavy shock absorption on extension
    dampingCompression: 8,             // Heavy shock absorption on compression
    maxSuspensionForce: 100000,
    rollInfluence: 0.02,              // Reduced to prevent rollovers
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
    maxSuspensionTravel: 0.2,          // Tighter travel range
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true
};

wheelOptions.chassisConnectionPointLocal.set(1.2, -0.2, 1.4); vehicle.addWheel(wheelOptions);
wheelOptions.chassisConnectionPointLocal.set(-1.2, -0.2, 1.4); vehicle.addWheel(wheelOptions);
wheelOptions.chassisConnectionPointLocal.set(1.2, -0.2, -1.5); vehicle.addWheel(wheelOptions);
wheelOptions.chassisConnectionPointLocal.set(-1.2, -0.2, -1.5); vehicle.addWheel(wheelOptions);

vehicle.addToWorld(world);

// Visual Wheels (Thick off-road tires)
const wheelBodies = [];
const wheelVisuals = [];
const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.6, 24);
wheelGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });

vehicle.wheelInfos.forEach((wheel) => {
    const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, wheel.radius / 2, 20);
    const wheelBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
    const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    wheelBody.addShape(cylinderShape, new CANNON.Vec3(), q);
    wheelBodies.push(wheelBody);

    const group = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true; group.add(tire);
    // Yellow Rims (John Deere style)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: '#FFDE00' }));
    rim.castShadow = true; group.add(rim);

    wheelVisuals.push(group);
    scene.add(group);
});

world.addEventListener('postStep', function () {
    for (var i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        var t = vehicle.wheelInfos[i].worldTransform;
        wheelBodies[i].position.copy(t.position);
        wheelBodies[i].quaternion.copy(t.quaternion);
        wheelVisuals[i].position.copy(t.position);
        wheelVisuals[i].quaternion.copy(t.quaternion);
    }
});


// --- 5. VEHICLE CONTROLS ---
const keys = { w: false, a: false, s: false, d: false, space: false };
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
    if (e.code === 'Space') keys.space = true;
    if (e.key === 'ArrowUp') keys.w = true;
    if (e.key === 'ArrowDown') keys.s = true;
    if (e.key === 'ArrowLeft') keys.a = true;
    if (e.key === 'ArrowRight') keys.d = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    if (e.code === 'Space') keys.space = false;
    if (e.key === 'ArrowUp') keys.w = false;
    if (e.key === 'ArrowDown') keys.s = false;
    if (e.key === 'ArrowLeft') keys.a = false;
    if (e.key === 'ArrowRight') keys.d = false;
});

function handleVehicleControls() {
    if (!gameStarted) return; // Prevent driving before start

    const maxSteerVal = 0.55;
    const maxForce = 1400; // Balanced power for huge map without wheelie jumping
    const brakeForce = 40;

    // Fixed Engine Force Inversion
    if (keys.w) {
        vehicle.applyEngineForce(-maxForce, 2); vehicle.applyEngineForce(-maxForce, 3);
    } else if (keys.s) {
        vehicle.applyEngineForce(maxForce, 2); vehicle.applyEngineForce(maxForce, 3);
    } else {
        vehicle.applyEngineForce(0, 2); vehicle.applyEngineForce(0, 3);
    }

    // Speed-dependent steering: reduce turn angle at high speed to prevent wild spinning
    const speed = chassisBody.velocity.length();
    const steerFactor = Math.max(0.2, 1 - speed / 40); // At max speed, steering drops to 20%
    const currentSteer = maxSteerVal * steerFactor;

    if (keys.a) {
        vehicle.setSteeringValue(currentSteer, 0); vehicle.setSteeringValue(currentSteer, 1);
    } else if (keys.d) {
        vehicle.setSteeringValue(-currentSteer, 0); vehicle.setSteeringValue(-currentSteer, 1);
    } else {
        vehicle.setSteeringValue(0, 0); vehicle.setSteeringValue(0, 1);
    }

    // Braking & Coasting Logic
    if (keys.space) {
        // Hard e-brake
        vehicle.setBrake(brakeForce, 0); vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 2); vehicle.setBrake(brakeForce, 3);
    } else if (!keys.w && !keys.s) {
        // Arcade-style engine braking when releasing the gas
        vehicle.setBrake(15, 0); vehicle.setBrake(15, 1);
        vehicle.setBrake(15, 2); vehicle.setBrake(15, 3);
    } else {
        // Gas is pressed, remove all brakes
        vehicle.setBrake(0, 0); vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 2); vehicle.setBrake(0, 3);
    }
}


// --- 6. ORGANIC ENVIRONMENT & OBSTACLES ---

// Build a master array of all road coordinates to explicitly forbid spawning obstacles on the highway
const forbiddenPoints = [];
[leftCurve, rightCurve, loopCurve, bridgeCurve].forEach(curve => {
    forbiddenPoints.push(...curve.getPoints(300)); // Dense sampling for long rectangular roads
});

function isNearRoad(x, z, paddingRadius) {
    // Roundabout exclusion zone
    if (Math.sqrt(x * x + z * z) < 35) return true;

    // Highway exclusion zone
    for (let pt of forbiddenPoints) {
        const dx = pt.x - x;
        const dz = pt.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < paddingRadius) return true;
    }
    return false; // Safe!
}

// 6.1 Stylized Teal Water Bodies
const activePonds = [];
const waterMat = new THREE.MeshStandardMaterial({
    color: '#2EC4B6',
    roughness: 0.3,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85
});
const waterEdgeMat = new THREE.MeshStandardMaterial({
    color: '#CBF3F0',
    roughness: 0.5,
    transparent: true,
    opacity: 0.6
});

function spawnPond(x, z, radius) {
    // Main water body
    const geom = new THREE.CircleGeometry(radius, 32);
    const pond = new THREE.Mesh(geom, waterMat);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(x, 0.15, z);
    scene.add(pond);
    activePonds.push(pond);

    // Foam/shore ring around the water
    const ringGeo = new THREE.RingGeometry(radius, radius + 3, 32);
    const ring = new THREE.Mesh(ringGeo, waterEdgeMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.12, z);
    scene.add(ring);
}

// Spawn water bodies
for (let i = 0; i < 10; i++) {
    let px, pz, pr;
    do {
        px = (Math.random() - 0.5) * 1200;
        pz = (Math.random() - 0.5) * 1200;
        pr = 20 + Math.random() * 40;
    } while (isNearRoad(px, pz, pr + 20));
    spawnPond(px, pz, pr);
}

// 6.2 Stylized Stone Obstacles (light pastel lavender like reference)
const rockGeo = new THREE.DodecahedronGeometry(1, 0); // Lower detail = more stylized/low-poly
rockGeo.scale(1, 0.7, 1);
const rockMat = new THREE.MeshStandardMaterial({ color: '#C8BFE7', roughness: 0.7, flatShading: true }); // Pastel lavender

function spawnRockCluster(count, spread) {
    let px, pz;
    do {
        px = (Math.random() - 0.5) * 1200;
        pz = (Math.random() - 0.5) * 1200;
    } while (isNearRoad(px, pz, spread + 15));

    for (let i = 0; i < count; i++) {
        const x = px + (Math.random() - 0.5) * spread;
        const z = pz + (Math.random() - 0.5) * spread;

        if (!isNearRoad(x, z, 12)) {
            const scale = 1 + Math.random() * 2;

            const rockBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
            rockBody.addShape(new CANNON.Sphere(scale * 0.8));
            rockBody.position.set(x, scale * 0.35, z);

            const rockMesh = new THREE.Mesh(rockGeo, rockMat);
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;

            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
            rockMesh.quaternion.copy(q);
            rockBody.quaternion.copy(new CANNON.Quaternion(q.x, q.y, q.z, q.w));

            rockMesh.scale.set(scale, scale, scale);
            rockMesh.position.copy(rockBody.position);

            world.addBody(rockBody);
            scene.add(rockMesh);
        }
    }
}

for (let i = 0; i < 12; i++) {
    spawnRockCluster(Math.floor(5 + Math.random() * 10), 40);
}

// 6.3 Green Trees — Small, Medium, and Big sizes
const treeGreenColors = ['#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#4CAF50', '#256D29', '#1A472A'];
const trunkMat = new THREE.MeshStandardMaterial({ color: '#5D4037', roughness: 0.9 });

function spawnTree(x, z, sizeType, addCollider = true) {
    // sizeType: 0=small bush, 1=medium, 2=big
    let trunkH, trunkR, canopySize;
    if (sizeType === 0) {
        trunkH = 1 + Math.random() * 1.5;
        trunkR = 0.12;
        canopySize = 1.2 + Math.random() * 1.5;
    } else if (sizeType === 1) {
        trunkH = 3 + Math.random() * 2;
        trunkR = 0.25;
        canopySize = 2.5 + Math.random() * 2;
    } else {
        trunkH = 5 + Math.random() * 4;
        trunkR = 0.35;
        canopySize = 4 + Math.random() * 3;
    }

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 6),
        trunkMat
    );
    trunk.position.set(x, trunkH / 2, z); trunk.castShadow = true; scene.add(trunk);

    // Green canopy
    const canopyColor = treeGreenColors[Math.floor(Math.random() * treeGreenColors.length)];
    const cMat = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.8, flatShading: true });
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(canopySize, 1), cMat);
    canopy.position.set(x, trunkH + canopySize * 0.5, z);
    canopy.castShadow = true;
    scene.add(canopy);

    // Second canopy blob for medium and big trees
    if (sizeType >= 1 && Math.random() > 0.3) {
        const c2Size = canopySize * (0.5 + Math.random() * 0.3);
        const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(c2Size, 1), cMat);
        c2.position.set(
            x + (Math.random() - 0.5) * canopySize * 0.6,
            trunkH + canopySize * 0.9 + c2Size * 0.3,
            z + (Math.random() - 0.5) * canopySize * 0.6
        );
        c2.castShadow = true;
        scene.add(c2);
    }

    // Third canopy for big trees only
    if (sizeType === 2 && Math.random() > 0.4) {
        const c3Size = canopySize * 0.4;
        const c3Col = treeGreenColors[Math.floor(Math.random() * treeGreenColors.length)];
        const c3 = new THREE.Mesh(
            new THREE.IcosahedronGeometry(c3Size, 1),
            new THREE.MeshStandardMaterial({ color: c3Col, roughness: 0.8, flatShading: true })
        );
        c3.position.set(
            x + (Math.random() - 0.5) * canopySize * 0.8,
            trunkH + canopySize * 0.4,
            z + (Math.random() - 0.5) * canopySize * 0.8
        );
        c3.castShadow = true;
        scene.add(c3);
    }

    // Physics collider for trunk (only medium and big)
    if (sizeType >= 1 && addCollider) {
        const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
        body.addShape(new CANNON.Cylinder(0.5, 0.5, trunkH, 8));
        const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        body.quaternion.copy(q);
        body.position.set(x, trunkH / 2, z);
        world.addBody(body);
    }
}

// Spawn 300 trees: ~120 small, ~120 medium, ~60 big
let treeCount = 0;
while (treeCount < 300) {
    const tx = (Math.random() - 0.5) * 1400;
    const tz = (Math.random() - 0.5) * 1400;
    if (!isNearRoad(tx, tz, 14)) {
        const r = Math.random();
        const sizeType = r < 0.4 ? 0 : r < 0.8 ? 1 : 2; // 40% small, 40% medium, 20% big
        spawnTree(tx, tz, sizeType);
        treeCount++;
    }
}

// Spawn dense forest outside the boundary
let outsideTreeCount = 0;
while (outsideTreeCount < 1000) {
    const tx = (Math.random() - 0.5) * 3800; // range -1900 to 1900
    const tz = (Math.random() - 0.5) * 3800;

    // Only spawn if outside the 1200 boundary
    if (Math.abs(tx) > 1200 || Math.abs(tz) > 1200) {
        const r = Math.random();
        const sizeType = r < 0.4 ? 0 : r < 0.8 ? 1 : 2; // small, medium, or big
        spawnTree(tx, tz, sizeType, false); // false for no collider
        outsideTreeCount++;
    }
}

// 6.4 Dense Grass with White Wildflowers
const grassBladeGeo = new THREE.ConeGeometry(0.08, 1, 3);
const grassBladeMats = [
    new THREE.MeshStandardMaterial({ color: '#3D7A1A', flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#4A8C22', flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#5B9E2D', flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#2E6B12', flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#6BAF36', flatShading: true }),
];
const flowerMat = new THREE.MeshStandardMaterial({ color: '#F5F5F0', roughness: 0.6 });
const flowerCenterMat = new THREE.MeshStandardMaterial({ color: '#FFFFAA', roughness: 0.5 });

function spawnGrassPatch(cx, cz, patchRadius) {
    // Dense grass blades
    const bladeCount = 30 + Math.floor(Math.random() * 40);
    for (let b = 0; b < bladeCount; b++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * patchRadius;
        const bx = cx + Math.cos(angle) * dist;
        const bz = cz + Math.sin(angle) * dist;
        const h = 0.8 + Math.random() * 1.8;
        const mat = grassBladeMats[Math.floor(Math.random() * grassBladeMats.length)];
        const blade = new THREE.Mesh(grassBladeGeo, mat);
        blade.scale.set(1, h, 1);
        blade.position.set(bx, h * 0.4, bz);
        blade.rotation.x = (Math.random() - 0.5) * 0.4;
        blade.rotation.z = (Math.random() - 0.5) * 0.4;
        scene.add(blade);
    }

    // White wildflowers (small clusters)
    const flowerCount = Math.floor(Math.random() * 5);
    for (let f = 0; f < flowerCount; f++) {
        const fa = Math.random() * Math.PI * 2;
        const fd = Math.random() * patchRadius * 0.8;
        const fx = cx + Math.cos(fa) * fd;
        const fz = cz + Math.sin(fa) * fd;

        // Flower stem
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4),
            new THREE.MeshStandardMaterial({ color: '#3D7A1A' })
        );
        stem.position.set(fx, 0.6, fz);
        scene.add(stem);

        // White petals (small sphere cluster)
        for (let p = 0; p < 5; p++) {
            const petal = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 6, 4),
                flowerMat
            );
            const pa = (p / 5) * Math.PI * 2;
            petal.position.set(
                fx + Math.cos(pa) * 0.15,
                1.25,
                fz + Math.sin(pa) * 0.15
            );
            scene.add(petal);
        }
        // Yellow center
        const center = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 6, 4),
            flowerCenterMat
        );
        center.position.set(fx, 1.3, fz);
        scene.add(center);
    }
}

for (let i = 0; i < 350; i++) {
    const gx = (Math.random() - 0.5) * 1400;
    const gz = (Math.random() - 0.5) * 1400;
    if (!isNearRoad(gx, gz, 10)) {
        spawnGrassPatch(gx, gz, 3 + Math.random() * 5);
    }
}

// 6.5 Stylized Lantern Streetlights (like reference)
function spawnLantern(x, z) {
    // Wooden post
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), new THREE.MeshStandardMaterial({ color: '#5D4037', roughness: 0.9 }));
    pole.position.set(x, 2.5, z); pole.castShadow = true; scene.add(pole);
    // Lantern box
    const lanternMat = new THREE.MeshStandardMaterial({ color: '#FF6B35', emissive: '#FF6B35', emissiveIntensity: 0.8, flatShading: true });
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), lanternMat);
    lantern.position.set(x, 5.5, z); lantern.castShadow = true; scene.add(lantern);
    // Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 4), new THREE.MeshStandardMaterial({ color: '#8D6E63', flatShading: true }));
    roof.position.set(x, 6.4, z); roof.rotation.y = Math.PI / 4; scene.add(roof);
    // Glow
    const light = new THREE.PointLight('#FF9F43', 1.2, 30);
    light.position.set(x, 5.5, z); scene.add(light);
}
for (let idx = 0; idx < forbiddenPoints.length; idx += 50) {
    const pt = forbiddenPoints[idx];
    spawnLantern(pt.x + 10, pt.z);
}

// 6.6 Wooden Fences near sections
function spawnFence(x, z, length, rotY) {
    const fenceMat = new THREE.MeshStandardMaterial({ color: '#8D6E63', roughness: 0.9, flatShading: true });
    for (let i = 0; i < length; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), fenceMat);
        const ox = x + Math.cos(rotY) * i * 2;
        const oz = z + Math.sin(rotY) * i * 2;
        post.position.set(ox, 1, oz); post.castShadow = true; scene.add(post);
        if (i < length - 1) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.15), fenceMat);
            rail.position.set(ox + Math.cos(rotY), 1.5, oz + Math.sin(rotY));
            rail.rotation.y = rotY;
            scene.add(rail);
            const rail2 = rail.clone(); rail2.position.y = 0.7; scene.add(rail2);
        }
    }
}
spawnFence(-210, -200, 5, 0); spawnFence(-460, -450, 5, Math.PI / 2);
spawnFence(210, 200, 5, 0); spawnFence(460, 450, 5, Math.PI / 2);


// --- 7. PHYSICAL SIGNAGE MODULES ---
const triggers = [];

function spawn3DTextTrigger(x, z, titleText, htmlContent, themeColor, themeClass = '') {
    // Holographic pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.2, 32), new THREE.MeshStandardMaterial({ color: themeColor, emissive: themeColor, emissiveIntensity: 0.5 }));
    pad.position.set(x, 0.1, z); scene.add(pad);

    // Large floating 3D text proxy using a bright Canvas
    const cvs = document.createElement('canvas');
    cvs.width = 1024; cvs.height = 256;
    const ctx = cvs.getContext('2d');
    ctx.shadowColor = themeColor; ctx.shadowBlur = 40; // Neon glow
    ctx.fillStyle = "#ffffff"; ctx.font = 'bold 160px Outfit, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(titleText, 512, 180);

    const textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 4),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true })
    );
    textMesh.position.set(x, 5, z);
    scene.add(textMesh);

    // Glowing Diamond visible for the minimap
    const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(2),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    diamond.position.set(x, 15, z); // High up
    scene.add(diamond);

    // Light up the area
    const pLight = new THREE.PointLight(themeColor, 2, 20);
    pLight.position.set(x, 2, z);
    scene.add(pLight);

    triggers.push({ x, z, textMesh, diamond, content: htmlContent, title: titleText, color: themeColor, themeClass });
}

// Left Path Destinations pinned to rectangular corners
const aboutHTML = `
    <div class="about-container">
        <!-- Header -->
        <header class="about-header">
            <div class="about-logo">
                <span class="logo-circle">H</span> <strong>Hiramani Chauhan</strong>
            </div>
            <nav class="about-nav">
                <a href="#" data-nav="HOME">Home</a>
                <a href="#" data-nav="ABOUT">About</a>
                <a href="#" data-nav="GITHUB">GitHub</a>
                <a href="#" data-nav="PROJECTS">Projects</a>
                <a href="#" data-nav="RESUME">Resume</a>
                <a href="#" data-nav="SKILLS">Skills</a>
                <button class="about-contact-btn" data-nav="CONTACT">Contact</button>
            </nav>
        </header>

        <!-- Hero Content -->
        <div class="about-hero">
            <div class="about-content">
                <div class="hero-tag">WELCOME</div>
                <h1 class="hero-title">Hello, I'm <br>Hiramani Chauhan</h1>
                <p class="hero-description">
                    I'm a Full-Stack Web Developer, AI/ML Enthusiast, and HCL Institute Mentor, passionate about creating intelligent systems and modern web applications that combine performance with exceptional user experience
                </p>
                
            </div>
            <div class="about-image-side">
                <div class="hero-image-bg">
                    <img src="./IMG_1150-removebg-preview-removebg-preview.png" alt="Hiramani Chauhan">
                </div>
            </div>
        </div>

        <!-- Stats Section -->
        <div class="about-stats">
            <div class="stat-item">
                <span class="stat-num">1+ Y.</span>
                <span class="stat-label">Experience</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <span class="stat-num">5+</span>
                <span class="stat-label">Projects Completed</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
               
            </div>
        </div>
    </div>
`;
spawn3DTextTrigger(-200, -200, "ABOUT", aboutHTML, "#141618ff", "about-theme");
// --- GITHUB SECTION (Live Repos from API) ---
const GITHUB_USERNAME = 'hiramanichauhan'; // <-- Change this to your GitHub username

const githubHTML = `
    <div class="github-container">
        <div class="github-profile-bar" id="github-profile-bar">
            <div class="github-avatar-wrap">
                <img id="github-avatar" class="github-avatar" src="" alt="GitHub Avatar">
            </div>
            <div class="github-profile-info">
                <h3 class="github-profile-name" id="github-profile-name">Loading...</h3>
                <p class="github-profile-bio" id="github-profile-bio"></p>
                <div class="github-stats" id="github-stats"></div>
            </div>
            <a id="github-profile-link" href="#" target="_blank" class="github-visit-btn">Visit GitHub ↗</a>
        </div>
        <div class="github-repos-grid" id="github-repos-grid">
            <div class="github-loading">Loading repositories...</div>
        </div>
        <div class="github-repo-detail hidden" id="github-repo-detail">
            <button class="project-back-btn" id="github-back-btn">← Back to Repos</button>
            <div id="github-repo-detail-content"></div>
        </div>
    </div>
`;

// Language colors for GitHub
const langColors = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
    'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584',
    Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
    HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Jupyter: '#DA5B0B', R: '#198CE7',
    Vue: '#41b883', Svelte: '#ff3e00', null: '#8b8b8b'
};

let githubReposCache = [];

async function fetchGitHubData() {
    try {
        const profileUrl = 'https://api.github.com/users/' + GITHUB_USERNAME;
        const reposUrl = 'https://api.github.com/users/' + GITHUB_USERNAME + '/repos?sort=updated&per_page=30';
        const [profileRes, reposRes] = await Promise.all([
            fetch(profileUrl),
            fetch(reposUrl)
        ]);
        const profile = await profileRes.json();
        const repos = await reposRes.json();

        // Update profile bar
        const avatarEl = document.getElementById('github-avatar');
        const nameEl = document.getElementById('github-profile-name');
        const bioEl = document.getElementById('github-profile-bio');
        const statsEl = document.getElementById('github-stats');
        const linkEl = document.getElementById('github-profile-link');

        if (avatarEl) avatarEl.src = profile.avatar_url || '';
        if (nameEl) nameEl.textContent = profile.name || profile.login || GITHUB_USERNAME;
        if (bioEl) bioEl.textContent = profile.bio || '';
        if (linkEl) linkEl.href = profile.html_url || ('https://github.com/' + GITHUB_USERNAME);
        if (statsEl) {
            statsEl.innerHTML =
                '<span class="github-stat"><strong>' + (profile.public_repos || 0) + '</strong> repos</span>' +
                '<span class="github-stat"><strong>' + (profile.followers || 0) + '</strong> followers</span>' +
                '<span class="github-stat"><strong>' + (profile.following || 0) + '</strong> following</span>';
        }

        // Render repo cards
        const grid = document.getElementById('github-repos-grid');
        if (!grid) return;

        if (!Array.isArray(repos) || repos.length === 0) {
            grid.innerHTML = '<p style="color:#888;">No public repositories found.</p>';
            return;
        }

        githubReposCache = repos;

        grid.innerHTML = repos.map(function (repo, i) {
            var langHtml = '';
            if (repo.language) {
                var dotColor = langColors[repo.language] || '#8b8b8b';
                langHtml = '<span class="github-repo-lang"><span class="lang-dot" style="background:' + dotColor + '"></span>' + repo.language + '</span>';
            }
            return '<div class="github-repo-card" data-repo-idx="' + i + '">' +
                '<div class="github-repo-card-top">' +
                '<span class="github-repo-icon">📦</span>' +
                '<h4 class="github-repo-name">' + repo.name + '</h4>' +
                '</div>' +
                '<p class="github-repo-desc">' + (repo.description || 'No description') + '</p>' +
                '<div class="github-repo-meta">' +
                langHtml +
                '<span class="github-repo-stars">⭐ ' + repo.stargazers_count + '</span>' +
                '<span class="github-repo-forks">🍴 ' + repo.forks_count + '</span>' +
                '</div>' +
                '</div>';
        }).join('');
    } catch (err) {
        const grid = document.getElementById('github-repos-grid');
        if (grid) grid.innerHTML = '<p style="color:#ff6b6b;">Failed to load repositories. Check username or network.</p>';
    }
}

spawn3DTextTrigger(-450, -450, "GITHUB", githubHTML, "#08010cff");

// --- CONTACT SECTION ---
const contactHTML = `
    <div class="contact-container">
        <div class="contact-layout">
            <div class="contact-left">
                <h3 class="contact-heading">Let's Connect</h3>
                <p class="contact-subtext">Feel free to reach out via social media or drop me a message using the form.</p>

                <div class="contact-socials">
                    <a href="https://www.linkedin.com/in/hiramani-chauhan-768639313/" target="_blank" class="contact-social-link contact-social-linkedin" title="LinkedIn">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        <span>LinkedIn</span>
                    </a>
                    <a href="https://www.instagram.com/gangaa_maa_ka_ladlaa_2399/" target="_blank" class="contact-social-link contact-social-instagram" title="Instagram">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                        <span>Instagram</span>
                    </a>
                    <a href="https://www.facebook.com/hiramanichauhan2399/" target="_blank" class="contact-social-link contact-social-facebook" title="Facebook">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        <span>Facebook</span>
                    </a>
                    <a href="https://www.youtube.com/@HCLInstitute" target="_blank" class="contact-social-link contact-social-youtube" title="YouTube">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        <span>YouTube</span>
                    </a>
                </div>

                <div class="contact-email-info">
                    <span class="contact-email-label">Email</span>
                    <a href="mailto:hiramanichauhan2399@gmail.com" class="contact-email-link">hiramanichauhan2399@gmail.com</a>
                </div>
            </div>

            <div class="contact-right">
                <h3 class="contact-form-heading">Leave a Message</h3>
                <form id="contact-form" class="contact-form">
                    <div class="contact-field">
                        <label for="contact-name">Full Name</label>
                        <input type="text" id="contact-name" name="name" placeholder="Your full name" required autocomplete="name">
                    </div>
                    <div class="contact-field">
                        <label for="contact-email">Email</label>
                        <input type="email" id="contact-email" name="email" placeholder="your@email.com" required autocomplete="email">
                    </div>
                    <div class="contact-field">
                        <label for="contact-message">Message</label>
                        <textarea id="contact-message" name="message" rows="5" placeholder="Write your message here..." required></textarea>
                    </div>
                    <button type="submit" class="contact-submit-btn" id="contact-submit-btn">
                        <span>Send Message</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                    <p class="contact-form-status" id="contact-form-status"></p>
                </form>
            </div>
        </div>
    </div>
`;

spawn3DTextTrigger(-700, -650, "CONTACT", contactHTML, "#070501ff");

// Right Path Destinations pinned to rectangular corners
const projectsHTML = `
    <div class="projects-container">
        <div class="projects-grid" id="projects-grid">
            <div class="project-card" data-project="0">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">Movie You'll Love</h3>
                <span class="project-card-tag">AI / ML</span>
            </div>
            <div class="project-card" data-project="1">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">Real-Time Chat App</h3>
                <span class="project-card-tag">Full Stack</span>
            </div>
            <div class="project-card" data-project="2">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">Fraud Transaction Detection</h3>
                <span class="project-card-tag">Fintech-A-Thon</span>
            </div>
            <div class="project-card" data-project="3">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">HCL Institute</h3>
                <span class="project-card-tag">EdTech</span>
                <a href="https://hclinstitute.online/" target="_blank" class="project-live-btn" onclick="event.stopPropagation()">View Live ↗</a>
            </div>
             <div class="project-card" data-project="4">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">Facial Recognition System</h3>
                <span class="project-card-tag">Security</span>
            </div>
             <div class="project-card" data-project="5">
                <div class="project-card-icon"></div>
                <h3 class="project-card-title">Cinema Sensor Board System</h3>
                <span class="project-card-tag">Secure videos</span>
            </div>
        </div>
        <div class="project-detail hidden" id="project-detail">
            <button class="project-back-btn" id="project-back-btn">← Back to Projects</button>
            <div id="project-detail-content"></div>
        </div>
    </div>
`;

const projectsData = [
    {
        title: 'Movie You\'ll Love',
        subtitle: 'Movie Recommendation System',
        icon: '',
        color: '#e74c3c',
        liveUrl: '#',
        description: 'An intelligent movie recommendation system that leverages AI/ML algorithms to suggest personalized movie choices based on user preferences, viewing history, and collaborative filtering techniques.',
        tech: ['Python', 'Machine Learning', 'Recommendation Algorithms', 'Data Processing'],
        highlights: [
            'Content-based and collaborative filtering for accurate recommendations',
            'User preference learning through interaction history',
            'Dynamic suggestion engine that improves over time'
        ]
    },
    {
        title: 'Real-Time Chat Application',
        subtitle: 'Full-Stack Messaging Platform',
        icon: '',
        color: '#4facfe',
        liveUrl: '#',
        description: 'A real-time chat application enabling seamless instant messaging between users with live updates, message delivery status, and modern UI/UX.',
        tech: ['WebSockets', 'Node.js', 'React', 'MongoDB'],
        highlights: [
            'Real-time bidirectional communication via WebSockets',
            'Message delivery and read receipts',
            'Responsive and modern chat interface'
        ]
    },
    {
        title: 'Fraud Transaction Detection',
        subtitle: 'Fintech-A-Thon – Pragyan\'25, NIT Trichy · Feb 2025',
        icon: '',
        color: '#00ff88',
        liveUrl: '#',
        description: 'Worked on an AI/ML Fraud-Transaction-Detection project with a team of 4 people at Fintech-A-Thon: Pragyan\'25, NIT-Trichy (Feb 2025). The system checks for transaction fraud and predicts the success probability rate using different parameters related to transactions.',
        tech: ['XGBoost', 'FastAPI', 'NumPy', 'Pandas', 'Scikit-learn', 'Python'],
        highlights: [
            'Leveraged XGBoost as the ML model for high-accuracy fraud detection',
            'FastAPI framework for building a robust and scalable API',
            'NumPy, Pandas, Scikit-learn for data processing and feature engineering',
            'Model served via REST API for seamless deployment',
            'Predicts transaction success probability using multiple parameters'
        ]
    },
    {
        title: 'HCL Institute',
        subtitle: 'Educational Platform',
        icon: '',
        color: '#ff00dd',
        liveUrl: 'https://hclinstitute.online/',
        description: 'Built an educational website for HCL Institute that provides a comprehensive platform for lectures and tests, enabling students and instructors to interact through a structured learning environment.',
        tech: ['React.js', 'Node.js', 'WebSockets', 'DynamoDb', 'Express.js', 'JWT', 'JavaScript', 'Backend Integration'],
        highlights: [
            'Lecture management system with organized course content',
            'Online testing and assessment module',
            'Student progress tracking and analytics',
            'Responsive design for desktop and mobile access'
        ]
    },
    {
        title: 'Facial Recognition System',
        subtitle: 'Individual Project · March 2026',
        icon: '',
        color: '#00ff88',
        liveUrl: '#',
        description: 'Designed and implemented an AI/ML-based Facial Recognition system as an individual project (March 2026), utilizing computer vision and deep learning models for real-time face detection and identity recognition',
        tech: ['OpenCV', 'TensorFlow', 'NumPy', 'Pandas', 'Scikit-learn', 'Python'],
        highlights: [
            'Developed a deep learning-based facial recognition system for accurate face detection and identification',
            'Utilized OpenCV for real-time image processing and face detection',
            'Applied NumPy and Pandas for efficient data preprocessing and manipulation',
            'Implemented face encoding and matching techniques for identity verification',
            'Enabled real-time face recognition with optimized performance and accuracy'
        ]
    },
    {
        title: 'Cinema Sensor Board System',
        subtitle: '',
        icon: '',
        color: '#00ff88',
        liveUrl: '#',
        description: 'Individually built a real-time sensor-driven video processing system that identifies and blurs irrelevant or sensitive content in live video streams, leveraging computer vision for automated privacy filtering',
        tech: ['YOLOv5', 'OpenCV', 'NumPy', 'Python', 'Arduino', 'Embedded Systems', 'Computer Vision'],
        highlights: [
            'Leveraged YOLO for real-time object detection to identify unwanted or sensitive content in video streams',
            'Integrated sensor board (Arduino) for dynamic triggering and system control',
            'Used OpenCV for real-time video processing and selective blurring of detected regions',
            'Utilized NumPy for efficient data handling and frame manipulation',
            'Enabled automated, real-time content filtering to enhance privacy and video safety'
        ]
    }

];

spawn3DTextTrigger(200, 200, "PROJECTS", projectsHTML, "#130201ff");
// --- RESUME SECTION ---
const resumeHTML = `
    <div class="resume-container">
        <div class="resume-actions">
            <a href="./HiramaniChauhan_resume.pdf" download class="resume-download-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Download Resume</span>
            </a>
            <a href="./HiramaniChauhan_resume.pdf" target="_blank" class="resume-open-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                <span>Open in New Tab</span>
            </a>
        </div>
        <div class="resume-viewer">
            <iframe src="./HiramaniChauhan_resume.pdf" class="resume-iframe" title="Resume PDF Viewer"></iframe>
        </div>
    </div>
`;

spawn3DTextTrigger(450, 450, "RESUME", resumeHTML, "#060103ff");

// --- SKILLS SECTION ---
const skillsHTML = `
    <div class="skills-container">
        <div class="skills-section">
            <h3 class="skills-heading">Areas of Interest</h3>
            <div class="skills-grid">
                <div class="skill-card">
                    
                    <span class="skill-name">Data Structures & Algorithm</span>
                </div>
                <div class="skill-card">
                    
                    <span class="skill-name">Object Oriented Programming</span>
                </div>
                <div class="skill-card">
                    
                    <span class="skill-name">Operating System</span>
                </div>
                <div class="skill-card">
                    
                    <span class="skill-name">Database Management System</span>
                </div>
            </div>
        </div>

        <div class="skills-section" style="margin-top: 36px;">
            <h3 class="skills-heading">Technical Skills & Certifications</h3>
            
            <div class="skill-category">
                <h4 class="skill-subheading">Programming Languages</h4>
                <div class="skill-tags">
                    <span class="skill-tag">C</span>
                    <span class="skill-tag">C++</span>
                    <span class="skill-tag">Python</span>
                    <span class="skill-tag">Java</span>
                    <span class="skill-tag">JavaScript</span>
                </div>
            </div>

            <div class="skill-category">
                <h4 class="skill-subheading">Artificial Intelligence & Web Dev</h4>
                <div class="skill-tags">
                    <span class="skill-tag skill-tag-accent">Machine Learning</span>
                    <span class="skill-tag skill-tag-accent">HTML</span>
                    <span class="skill-tag skill-tag-accent">CSS</span>
                    <span class="skill-tag skill-tag-accent">SQL</span>
                </div>
            </div>

            <div class="skill-category">
                <h4 class="skill-subheading">Other Software</h4>
                <div class="skill-tags">
                    <span class="skill-tag">Microsoft Word</span>
                    <span class="skill-tag">PowerPoint</span>
                    <span class="skill-tag">Visual Studio</span>
                </div>
            </div>
        </div>
    </div>
`;

spawn3DTextTrigger(700, 650, "SKILLS", skillsHTML, "#0a0009ff");

function openSection(sectionName) {
    const tr = triggers.find(t => t.title === sectionName);
    if (!tr) return;

    document.getElementById('modal-title').innerText = tr.title;
    document.getElementById('modal-title').style.textShadow = `0px 0px 15px ${tr.color}`;
    document.getElementById('modal-body').innerHTML = tr.content;

    const modalContainer = document.getElementById('modal-container');
    modalContainer.className = tr.themeClass || '';
    modalContainer.classList.remove('hidden');

    // Section-specific logic
    if (sectionName === 'GITHUB') fetchGitHubData();
}

// Wire up header section buttons to open modals directly
document.querySelectorAll('.section-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        openSection(item.dataset.section);
        sectionsOpen = false;
        document.getElementById('sections-btn').classList.remove('active');
        document.getElementById('sections-panel').classList.add('hidden');
    });
});

// modal-body Navigation Delegation (for About section links)
document.getElementById('modal-body').addEventListener('click', (e) => {
    const navLink = e.target.closest('[data-nav]');
    if (navLink) {
        e.preventDefault();
        const section = navLink.dataset.nav;
        if (section === 'HOME') {
            document.getElementById('modal-container').classList.add('hidden');
        } else {
            openSection(section);
        }
        return;
    }
});

// HTML Integration
const modalContainer = document.getElementById('modal-container');
document.getElementById('close-btn').addEventListener('click', () => {
    modalContainer.className = 'hidden';

});

// Project Cards — Event Delegation (cards are injected dynamically)
document.getElementById('modal-body').addEventListener('click', (e) => {
    // Handle project card click
    // Ignore clicks on the View Live button (let it open the link naturally)
    if (e.target.closest('.project-live-btn')) return;

    const card = e.target.closest('.project-card');
    if (card) {
        const idx = parseInt(card.dataset.project);
        const proj = projectsData[idx];
        if (!proj) return;

        const grid = document.getElementById('projects-grid');
        const detail = document.getElementById('project-detail');
        const detailContent = document.getElementById('project-detail-content');

        if (grid && detail && detailContent) {
            grid.classList.add('hidden');
            detail.classList.remove('hidden');

            detailContent.innerHTML = `
                <div class="project-detail-header">
                    <span class="project-detail-icon" style="background:${proj.color}22;color:${proj.color}">${proj.icon}</span>
                    <div>
                        <h3 class="project-detail-title">${proj.title}</h3>
                        <p class="project-detail-subtitle">${proj.subtitle}</p>
                    </div>
                </div>
                <p class="project-detail-desc">${proj.description}</p>
                <div class="project-detail-section">
                    <h4 class="project-detail-label">Tech Stack</h4>
                    <div class="project-tech-tags">
                        ${proj.tech.map(t => `<span class="project-tech-tag" style="border-color:${proj.color}44;color:${proj.color}">${t}</span>`).join('')}
                    </div>
                </div>
                <div class="project-detail-section">
                    <h4 class="project-detail-label">Key Highlights</h4>
                    <ul class="project-highlights">
                        ${proj.highlights.map(h => `<li>${h}</li>`).join('')}
                    </ul>
                </div>
                ${proj.liveUrl ? `<div style="margin-top:28px;"><a href="${proj.liveUrl}" target="_blank" class="project-live-btn-detail" style="border-color:${proj.color}44;color:${proj.color}">View Deployed Website ↗</a></div>` : ''}
            `;
        }
        return;
    }

    // Handle project back button click
    const backBtn = e.target.closest('.project-back-btn');
    if (backBtn) {
        const grid = document.getElementById('projects-grid');
        const detail = document.getElementById('project-detail');
        if (grid && detail) {
            detail.classList.add('hidden');
            grid.classList.remove('hidden');
        }
        return;
    }

    // Handle GitHub repo card click
    const repoCard = e.target.closest('.github-repo-card');
    if (repoCard) {
        const idx = parseInt(repoCard.dataset.repoIdx);
        const repo = githubReposCache[idx];
        if (!repo) return;

        const grid = document.getElementById('github-repos-grid');
        const profileBar = document.getElementById('github-profile-bar');
        const detail = document.getElementById('github-repo-detail');
        const detailContent = document.getElementById('github-repo-detail-content');

        if (grid && detail && detailContent) {
            grid.classList.add('hidden');
            if (profileBar) profileBar.classList.add('hidden');
            detail.classList.remove('hidden');

            var langDot = '';
            if (repo.language) {
                var dc = langColors[repo.language] || '#8b8b8b';
                langDot = '<span class="github-repo-lang" style="font-size:14px;"><span class="lang-dot" style="background:' + dc + '"></span>' + repo.language + '</span>';
            }

            var topicsHtml = '';
            if (repo.topics && repo.topics.length > 0) {
                topicsHtml = '<div class="project-detail-section">' +
                    '<h4 class="project-detail-label">Topics</h4>' +
                    '<div class="project-tech-tags">' +
                    repo.topics.map(function (t) { return '<span class="project-tech-tag" style="border-color:#8e44ad44;color:#8e44ad">' + t + '</span>'; }).join('') +
                    '</div></div>';
            }

            var updatedDate = repo.updated_at ? new Date(repo.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

            detailContent.innerHTML =
                '<div class="project-detail-header">' +
                '<span class="project-detail-icon" style="background:#8e44ad22;color:#8e44ad">📦</span>' +
                '<div>' +
                '<h3 class="project-detail-title">' + repo.name + '</h3>' +
                '<p class="project-detail-subtitle">' + (repo.full_name || '') + '</p>' +
                '</div>' +
                '</div>' +
                '<p class="project-detail-desc">' + (repo.description || 'No description provided.') + '</p>' +
                '<div class="github-detail-stats">' +
                langDot +
                '<span class="github-repo-stars" style="font-size:14px;">⭐ ' + repo.stargazers_count + ' stars</span>' +
                '<span class="github-repo-forks" style="font-size:14px;">🍴 ' + repo.forks_count + ' forks</span>' +
                '<span style="font-size:13px;color:#888;">📅 Updated ' + updatedDate + '</span>' +
                '</div>' +
                topicsHtml +
                '<div style="margin-top:28px;">' +
                '<a href="' + repo.html_url + '" target="_blank" class="github-visit-btn" style="display:inline-block;">View on GitHub ↗</a>' +
                '</div>';
        }
        return;
    }

    // Handle GitHub back button click
    const githubBackBtn = e.target.closest('#github-back-btn');
    if (githubBackBtn) {
        const grid = document.getElementById('github-repos-grid');
        const profileBar = document.getElementById('github-profile-bar');
        const detail = document.getElementById('github-repo-detail');
        if (grid && detail) {
            detail.classList.add('hidden');
            grid.classList.remove('hidden');
            if (profileBar) profileBar.classList.remove('hidden');
        }
    }
});

// Contact Form — Event Delegation for submit
document.getElementById('modal-body').addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'contact-form') {
        e.preventDefault();
        var nameVal = document.getElementById('contact-name').value.trim();
        var emailVal = document.getElementById('contact-email').value.trim();
        var msgVal = document.getElementById('contact-message').value.trim();
        var statusEl = document.getElementById('contact-form-status');
        var submitBtn = document.getElementById('contact-submit-btn');

        if (!nameVal || !emailVal || !msgVal) {
            if (statusEl) {
                statusEl.textContent = 'Please fill in all fields.';
                statusEl.style.color = '#ff6b6b';
            }
            return;
        }

        // Disable button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'Sending...';
        }

        var subject = 'Portfolio Contact from ' + nameVal;

        // Send via Web3Forms API (free, no backend needed, sends directly to your Gmail)
        // Get your access key at https://web3forms.com — enter your Gmail and they email you the key
        var WEB3FORMS_ACCESS_KEY = 'e1182d5c-a794-4b6f-8e6d-1e0c63145c84';

        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                access_key: WEB3FORMS_ACCESS_KEY,
                name: nameVal,
                email: emailVal,
                message: msgVal,
                subject: subject,
                from_name: 'Portfolio Contact Form',
                botcheck: ''
            })
        }).then(function (res) {
            return res.json();
        }).then(function (data) {
            if (data.success) {
                if (statusEl) {
                    statusEl.textContent = '✓ Message sent successfully! I will reply soon.';
                    statusEl.style.color = '#00ff88';
                }
                e.target.reset();
            } else {
                throw new Error(data.message || 'Submission failed');
            }
        }).catch(function (err) {
            console.error('Contact form error:', err);
            // Fallback to mailto
            var body = 'Name: ' + nameVal + '%0D%0AEmail: ' + emailVal + '%0D%0A%0D%0AMessage:%0D%0A' + encodeURIComponent(msgVal);
            var mailtoLink = 'mailto:hiramanichauhan2399@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + body;
            window.open(mailtoLink, '_blank');
            if (statusEl) {
                statusEl.textContent = 'Opening email client as fallback...';
                statusEl.style.color = '#ffaa00';
            }
        }).finally(function () {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.querySelector('span').textContent = 'Send Message';
            }
        });
    }
});

function handleTriggers() {
    if (!modalContainer.classList.contains('hidden')) return;

    triggers.forEach(tr => {
        // Text always watches the camera
        tr.textMesh.lookAt(camera.position);

        // Spin the diamond
        tr.diamond.rotation.y += 0.05;

        const dx = chassisBody.position.x - tr.x;
        const dz = chassisBody.position.z - tr.z;
        if (Math.sqrt(dx * dx + dz * dz) < 4) {
            document.getElementById('modal-title').innerText = tr.title;
            document.getElementById('modal-title').style.textShadow = `0px 0px 15px ${tr.color}`;
            document.getElementById('modal-body').innerHTML = tr.content;

            modalContainer.className = tr.themeClass || '';
            modalContainer.classList.remove('hidden');

            // Fetch GitHub repos when GitHub section is triggered
            if (tr.title === 'GITHUB') fetchGitHubData();

            const instr = document.getElementById('instructions');
            if (instr) instr.classList.add('hidden');

            // Push away
            chassisBody.position.x += 4;
            chassisBody.velocity.set(0, 0, 0);
        }
    });
}

// UI Minimap Drawer
const mCanvas = document.getElementById('route-map');
const mCtx = mCanvas.getContext('2d');

function updateMinimap() {
    if (!mapMode) return;
    mCtx.clearRect(0, 0, 400, 400);

    // Map 3D coordinates (-800 to 800) to Canvas (0 to 400).
    function toMap(x, z) {
        return { cx: (x + 800) * (400 / 1600), cy: (z + 800) * (400 / 1600) };
    }

    // 1. Draw Route
    mCtx.beginPath();
    mCtx.strokeStyle = 'rgba(255,255,255,0.15)';
    mCtx.lineWidth = 14;
    mCtx.lineJoin = 'round';

    // Roundabout
    const { cx: hubX, cy: hubY } = toMap(0, 0);
    mCtx.arc(hubX, hubY, 13 * (400 / 600), 0, Math.PI * 2);
    mCtx.stroke();

    // Left & Right Curves
    mCtx.beginPath();
    leftCurve.getPoints(100).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    rightCurve.getPoints(100).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    loopCurve.getPoints(80).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    bridgeCurve.getPoints(80).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    mCtx.stroke();

    // Inner track line
    mCtx.beginPath();
    mCtx.strokeStyle = '#e74c3c';
    mCtx.lineWidth = 2;
    mCtx.arc(hubX, hubY, 13 * (400 / 600), 0, Math.PI * 2);
    mCtx.stroke();

    mCtx.beginPath();
    leftCurve.getPoints(100).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    rightCurve.getPoints(100).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    loopCurve.getPoints(80).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    bridgeCurve.getPoints(80).forEach((p, i) => { const { cx, cy } = toMap(p.x, p.z); if (i === 0) mCtx.moveTo(cx, cy); else mCtx.lineTo(cx, cy); });
    mCtx.stroke();

    // 2. Draw Sections
    triggers.forEach(tr => {
        const { cx, cy } = toMap(tr.x, tr.z);
        mCtx.beginPath();
        mCtx.fillStyle = tr.color;
        mCtx.arc(cx, cy, 10, 0, Math.PI * 2);
        mCtx.fill();

        mCtx.fillStyle = '#fff';
        mCtx.font = '14px Outfit, sans-serif';
        mCtx.textAlign = 'center';
        mCtx.fillText(tr.title, cx, cy - 15);
    });

    // 3. Draw Van Position
    const carPos = chassisBody.position;
    const { cx: carX, cy: carY } = toMap(carPos.x, carPos.z);

    // Get car rotation for direction pointer
    const euler = new CANNON.Vec3();
    chassisBody.quaternion.toEuler(euler);
    // euler.y represents heading. 

    mCtx.save();
    mCtx.translate(carX, carY);
    mCtx.rotate(-euler.y); // rotate context to match car heading

    // Massive glowing aura
    mCtx.beginPath();
    mCtx.fillStyle = 'rgba(255, 0, 50, 0.4)';
    const pulse = Math.abs(Math.sin(Date.now() / 200)) * 10;
    mCtx.arc(0, 0, 15 + pulse, 0, Math.PI * 2);
    mCtx.fill();

    // Core Vehicle Dot
    mCtx.beginPath();
    mCtx.fillStyle = '#ff003c';
    mCtx.arc(0, 0, 8, 0, Math.PI * 2);
    mCtx.fill();

    // Directional Pointer (Triangle pointing forward)
    mCtx.beginPath();
    mCtx.moveTo(0, -15); // Forward arrow tip
    mCtx.lineTo(6, -2);
    mCtx.lineTo(-6, -2);
    mCtx.closePath();
    mCtx.fillStyle = '#ffffff';
    mCtx.fill();

    mCtx.restore();
}


// --- 8. THE RENDER LOOP ---
const clock = new THREE.Clock();
document.getElementById('loading').style.display = 'none';


const cameraOffset = new THREE.Vector3(0, 10, -22);
let currentZoom = 22;
let flipTimer = 0;

window.addEventListener('wheel', (e) => {
    // Prevent default trackpad/browser actions like UI pinch-to-zoom
    if (e.ctrlKey) { e.preventDefault(); }

    currentZoom += e.deltaY * 0.05;
    currentZoom = Math.max(10, Math.min(320, currentZoom)); // Clamp exactly to boundary scale

    cameraOffset.y = currentZoom * 0.45;
    cameraOffset.z = -currentZoom;
}, { passive: false });

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    world.step(1 / 60, dt, 5); // 5 sub-steps for brick physics stability

    // Anchor visual car to physical body
    carGroup.position.copy(chassisBody.position);
    carGroup.quaternion.copy(chassisBody.quaternion);

    // Sync point light to car
    pointLight.position.set(chassisBody.position.x, chassisBody.position.y + 4, chassisBody.position.z);

    // Sync all smashable objects/cones
    physicalObjects.forEach(obj => {
        obj.mesh.position.copy(obj.body.position);

        // Handling cylinder orientation mismatch between Three.js and Cannon.js
        if (obj.isCylinder) {
            // Because Cannon.js Cylinder is Z-axis aligned and Three.js is Y-axis aligned
            const q = obj.body.quaternion;
            const qFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            const finalQ = new THREE.Quaternion(q.x, q.y, q.z, q.w).multiply(qFix);
            obj.mesh.quaternion.copy(finalQ);
        } else {
            obj.mesh.quaternion.copy(obj.body.quaternion);
        }
    });

    handleVehicleControls();
    handleTriggers();

    // Responsive Chase Camera
    const relativeCameraOffset = cameraOffset.clone().applyMatrix4(carGroup.matrixWorld);
    camera.position.lerp(relativeCameraOffset, 0.1);
    camera.lookAt(carGroup.position.x, carGroup.position.y + 2, carGroup.position.z);

    // Ambient Water Ripple Animation
    const time = clock.getElapsedTime();
    activePonds.forEach((pond, idx) => {
        const ripple = 1 + Math.sin(time * 1.5 + idx) * 0.04;
        pond.scale.set(ripple, 1, ripple);
    });

    // Respawn Safety Net (Falling off world)
    if (chassisBody.position.y < -10) {
        chassisBody.position.set(0, 10, 0);
        chassisBody.velocity.set(0, 0, 0);
        chassisBody.angularVelocity.set(0, 0, 0);
    }

    // Auto-Right Flip Mechanic
    const localUp = new CANNON.Vec3(0, 1, 0);
    chassisBody.quaternion.vmult(localUp, localUp);

    // If the car's roof is pointing mostly downwards, or it is stuck on its side
    if (localUp.y < 0.2) {
        flipTimer += dt;
        if (flipTimer > 1.5) { // Stuck for 1.5 seconds
            const currentEuler = new CANNON.Vec3();
            chassisBody.quaternion.toEuler(currentEuler);

            // Hard reset the rotation to be perfectly upright, but keep the direction it's facing (Y axis)
            chassisBody.quaternion.setFromEuler(0, currentEuler.y, 0);

            // Pop it up 2 meters into the air so it falls safely onto its wheels
            chassisBody.position.y += 2.5;

            // Kill any wild spinning
            chassisBody.velocity.set(0, 0, 0);
            chassisBody.angularVelocity.set(0, 0, 0);

            flipTimer = 0;
        }
    } else {
        flipTimer -= dt * 2; // Decay timer if upright
        if (flipTimer < 0) flipTimer = 0;
    }

    updateMinimap();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    renderer.setSize(w, h);
});


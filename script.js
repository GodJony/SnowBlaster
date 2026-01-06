import * as THREE from 'three';

// --- Elements ---
let startBtn, overlay, distDisplay, hpBarFill, damageOverlay, joyZone, joyKnob, shootBtnMobile, ammoContainer, loadingText;
let qaBtn, qaPanel, qaClose, stageDisplay;

// --- Game Config ---
const Config = {
    growthRate: 0.3,    
    shootCost: 0.3,     
    maxSize: 4.5        
};

const Stages = [
    { duration: 1500, startSpeed: 20, maxSpeed: 40, crystalMove: false },
    { duration: 2000, startSpeed: 25, maxSpeed: 50, crystalMove: true },
    { duration: 9999, startSpeed: 30, maxSpeed: 60, crystalMove: true },
];

// --- Game Variables ---
let scene, camera, renderer;
let playerMesh, playerPivot;
let obstacles = [];
let particles = [];
let bullets = []; 
let speedLines = [];

let currentStageIndex = 0;
let distInStage = 0;

let isGameOver = true;
let gameSpeed = 0;
let totalDist = 0;
let cameraShake = 0;

let LANE_WIDTH = 14; 
const INITIAL_SIZE = 1.2;
const MIN_SIZE_TO_SHOOT = 0.6;

let playerSize = INITIAL_SIZE;
let playerX = 0; 
let currentAmmo = 0;

const keys = { ArrowLeft: false, ArrowRight: false, Space: false };
let joyData = { active: false, x: 0 };
let canShoot = true;

// --- Audio Logic (Auto Load) ---
let bgmAudio = new Audio();
bgmAudio.src = 'bgm/music.mp3'; // ⚠️ 폴더 경로와 파일명이 정확해야 합니다.
bgmAudio.loop = true;
bgmAudio.volume = 0.5;

let audioCtx;

// SFX Generator
function playShootSound() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(800, audioCtx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15); 
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

function playExplosionSound() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

// Materials
const matCrystalNormal = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.2 });
const matCrystalGlow = new THREE.MeshStandardMaterial({ color: 0x00cec9, emissive: 0x00cec9, emissiveIntensity: 0.5, roughness: 0.1 });
const matDanger = new THREE.MeshStandardMaterial({ color: 0xd63031 }); 

function assignDOMElements() {
    startBtn = document.getElementById('start-btn');
    overlay = document.getElementById('message-overlay');
    distDisplay = document.getElementById('dist-display');
    stageDisplay = document.getElementById('stage-display');
    hpBarFill = document.getElementById('hp-bar-fill');
    damageOverlay = document.getElementById('damage-overlay');
    joyZone = document.getElementById('joystick-zone');
    joyKnob = document.getElementById('joystick-knob');
    shootBtnMobile = document.getElementById('shoot-btn-mobile');
    ammoContainer = document.getElementById('ammo-container');
    loadingText = document.getElementById('loading-text');

    qaBtn = document.getElementById('qa-btn');
    qaPanel = document.getElementById('qa-panel');
    qaClose = document.getElementById('qa-close');
}

function setupEventListeners() {
    startBtn.addEventListener('click', startGame);

    // QA Logic
    qaBtn.addEventListener('click', () => { qaPanel.style.display = 'block'; });
    qaClose.addEventListener('click', () => { qaPanel.style.display = 'none'; });

    document.getElementById('inp-growth').addEventListener('input', (e) => { Config.growthRate = parseFloat(e.target.value); document.getElementById('val-growth').innerText = Config.growthRate; });
    document.getElementById('inp-speed').addEventListener('input', (e) => { Config.startSpeed = parseFloat(e.target.value); document.getElementById('val-speed').innerText = Config.startSpeed; });
    document.getElementById('inp-cost').addEventListener('input', (e) => { Config.shootCost = parseFloat(e.target.value); document.getElementById('val-cost').innerText = Config.shootCost; });

    // BGM Load Check
    bgmAudio.addEventListener('canplaythrough', () => {
        loadingText.innerText = "BGM 준비 완료! (music.mp3)";
        loadingText.style.color = "#00b894";
    });
    bgmAudio.addEventListener('error', () => {
        loadingText.innerText = "BGM 파일 없음 (bgm/music.mp3를 확인하세요)";
        loadingText.style.color = "#d63031";
    });
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', e => { 
        if(e.code === 'Space') { if(canShoot) { shootBullet(); canShoot = false; } }
        if(keys.hasOwnProperty(e.code)) keys[e.code] = true; 
    });
    window.addEventListener('keyup', e => { 
        if(e.code === 'Space') canShoot = true;
        if(keys.hasOwnProperty(e.code)) keys[e.code] = false; 
    });

    joyZone.addEventListener('touchstart', e => { e.preventDefault(); joyData.active=true; updateJoystick(e.touches[0]); }, {passive:false});
    joyZone.addEventListener('touchmove', e => { e.preventDefault(); if(joyData.active) updateJoystick(e.touches[0]); }, {passive:false});
    joyZone.addEventListener('touchend', e => { e.preventDefault(); joyData.active=false; joyData.x=0; joyKnob.style.transform=`translate(-50%,-50%)`; });
    
    shootBtnMobile.addEventListener('touchstart', (e) => { e.preventDefault(); shootBullet(); });
}


// --- Init ---
function init() {
    assignDOMElements();
    setupEventListeners();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x81ecec);
    scene.fog = new THREE.Fog(0x81ecec, 20, 60);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 2, -5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; ground.receiveShadow = true;
    scene.add(ground);

    playerPivot = new THREE.Group();
    scene.add(playerPivot);
    
    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    playerMesh = new THREE.Mesh(sphereGeo, sphereMat);
    playerMesh.castShadow = true;
    playerPivot.add(playerMesh);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x2d3436 }));
    goggles.position.set(0, 0.2, 0.7);
    playerMesh.add(goggles);

    for(let i=0; i<30; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
        line.visible = false; scene.add(line); speedLines.push({ mesh: line, active: false });
    }

    animate();
}

function updateJoystick(touch) {
    const rect = joyZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const touchX = touch.clientX;

    // Knob's visual feedback remains analog
    const x = touchX - centerX;
    const maxDist = 50;
    const clampedX = Math.max(-maxDist, Math.min(maxDist, x));
    joyKnob.style.transform = `translate(calc(-50% + ${clampedX}px), -50%)`;

    // Player movement input is converted to digital (-1, 0, or 1) for a PC-like feel
    const deadzoneWidth = 10; // 10px deadzone in the center
    if (touchX < centerX - deadzoneWidth) {
        joyData.x = -1; // Left side
    } else if (touchX > centerX + deadzoneWidth) {
        joyData.x = 1;  // Right side
    } else {
        joyData.x = 0;  // Center deadzone
    }
}

function loadStage(stageIndex) {
    currentStageIndex = stageIndex;
    distInStage = 0;
    
    const stage = Stages[currentStageIndex];
    if (!stage) {
        gameOver(); // Or show a "You Win!" message
        return;
    }

    gameSpeed = stage.startSpeed;
    
    // Show stage message
    document.querySelector('#message-overlay h1').innerText = `Stage ${currentStageIndex + 1}`;
    document.querySelector('.instructions').innerHTML = `Speed up!`;
    overlay.style.display = 'flex';
    if(startBtn) startBtn.style.display = 'none';
    
    setTimeout(() => {
        overlay.style.display = 'none';
        if(startBtn) startBtn.style.display = 'block';
    }, 1500); // Show message for 1.5 seconds
}

function startGame() {
    // 화면 비율에 따라 맵 너비(LANE_WIDTH) 동적 조절
    if (window.innerHeight > window.innerWidth) {
        LANE_WIDTH = 9; // 세로 모드에서는 맵 너비를 좁게
    } else {
        LANE_WIDTH = 14; // 가로 모드에서는 기본값 사용
    }

    // Audio Context & Play
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play BGM with User Interaction
    bgmAudio.play().catch(err => {
        console.log("BGM 재생 실패 (파일 확인 필요):", err);
    });

    overlay.style.display = 'none';
    qaPanel.style.display = 'none'; 
    
    isGameOver = false;
    totalDist = 0;
    playerSize = INITIAL_SIZE;
    playerX = 0;
    playerPivot.position.set(0, 0, 0);
    
    obstacles.forEach(o => scene.remove(o.mesh));
    obstacles = [];
    bullets.forEach(b => scene.remove(b.mesh));
    bullets = [];
    
    loadStage(0);
    updatePlayerVisuals();
}

function updatePlayerVisuals() {
    const scale = playerSize;
    playerMesh.scale.set(scale, scale, scale);
    playerPivot.position.y = scale - 1;
    updateAmmoUI();
}

function updateAmmoUI() {
    const safeSize = Math.max(0, playerSize - MIN_SIZE_TO_SHOOT);
    const ammo = Math.floor(safeSize / Config.shootCost); 
    
    if (ammo !== currentAmmo) {
        currentAmmo = ammo;
        renderAmmoSlots(currentAmmo);
    }
    if (currentAmmo > 0) shootBtnMobile.classList.remove('disabled');
    else shootBtnMobile.classList.add('disabled');
}

function renderAmmoSlots(count) {
    ammoContainer.innerHTML = '';
    const displayCount = Math.min(count, 8);
    for(let i=0; i<displayCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'ammo-slot filled';
        ammoContainer.appendChild(slot);
    }
    if(count === 0) {
         const slot = document.createElement('div');
         slot.className = 'ammo-slot';
         ammoContainer.appendChild(slot);
    }
}

function shootBullet() {
    if (isGameOver || currentAmmo <= 0) return;
    
    playShootSound();

    playerSize -= Config.shootCost; 
    updatePlayerVisuals();
    cameraShake = 0.3; 
    triggerExplosion(playerPivot.position, 0xffffff, 0.5); 

    const geo = new THREE.SphereGeometry(0.4, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00cec9 });
    const bullet = new THREE.Mesh(geo, mat);
    bullet.position.copy(playerPivot.position);
    bullet.position.y += playerSize * 0.5;
    bullet.position.z -= playerSize; 
    scene.add(bullet);
    bullets.push(bullet);
}

function spawnObstacle() {
    const zPos = -80;
    const xPos = (Math.random() - 0.5) * LANE_WIDTH * 1.5; 
    const difficulty = Math.min(totalDist / 4000, 0.5); 
    const rand = Math.random();
    
    let type = 'crystal'; 
    if (rand < difficulty) type = 'wall';
    else if (rand < 0.7) type = 'crystal';
    else type = 'spike';

    let mesh;
    let size = 0.8 + Math.random() * 0.5;

    if (type === 'crystal') {
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), matCrystalNormal.clone());
        mesh.position.y = size - 1;
    } else if (type === 'spike') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(size*0.7, size*2.5, 8), matCrystalNormal.clone());
        mesh.position.y = size - 1;
    } else if (type === 'wall') {
        size = 2.2; 
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size*2.5, 1), matDanger);
        mesh.position.y = size - 1;
        const xMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const x1 = new THREE.Mesh(new THREE.BoxGeometry(size*0.8, 0.2, 0.2), xMat);
        x1.rotation.z = Math.PI/4; x1.position.z = 0.6;
        const x2 = new THREE.Mesh(new THREE.BoxGeometry(size*0.8, 0.2, 0.2), xMat);
        x2.rotation.z = -Math.PI/4; x2.position.z = 0.6;
        mesh.add(x1); mesh.add(x2);
    }

    mesh.position.x = xPos;
    mesh.position.z = zPos;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({ mesh, type, size, hit: false, initialTime: performance.now() / 1000 });
}

function triggerExplosion(pos, color, scale) {
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    for(let i=0; i<10; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.position.x += (Math.random()-0.5);
        const vel = new THREE.Vector3((Math.random()-0.5)*10, Math.random()*10, (Math.random()-0.5)*10);
        scene.add(mesh);
        particles.push({ mesh, vel, life: 0.8 });
    }
}

function gameOver() {
    isGameOver = true;
    bgmAudio.pause(); bgmAudio.currentTime = 0; // BGM 정지
    
    overlay.style.display = 'flex';
    document.querySelector('#message-overlay h1').innerText = "GAME OVER";
    document.querySelector('.instructions').innerHTML = `이동 거리: ${Math.floor(totalDist)}m`;
    startBtn.innerText = "RETRY";
}

let spawnTimer = 0;

function updateUI() {
    const stage = Stages[currentStageIndex];
    stageDisplay.innerText = `Stage ${currentStageIndex + 1}`;
    const distRemaining = stage.duration - distInStage;
    distDisplay.innerText = `${Math.floor(distRemaining)}m`;

    const hpPercent = Math.min((playerSize / Config.maxSize) * 100, 100);
    hpBarFill.style.width = `${hpPercent}%`;
    hpBarFill.style.background = playerSize < MIN_SIZE_TO_SHOOT ? '#ff7675' : 'linear-gradient(90deg, #00b894, #55efc4)';
}

function animate() {
    requestAnimationFrame(animate);
    if (isGameOver) return;
    
    const dt = 0.016;
    const stage = Stages[currentStageIndex];

    // Speed and Distance
    if (gameSpeed < stage.maxSpeed) {
        gameSpeed += dt * 0.3; 
    }
    totalDist += gameSpeed * dt;
    distInStage += gameSpeed * dt;

    // Stage Completion
    if (distInStage >= stage.duration) {
        loadStage(currentStageIndex + 1);
    }

    // Camera Logic
    const targetCamZ = 8 + (playerSize - INITIAL_SIZE) * 3.0; 
    const targetCamY = 4 + (playerSize - INITIAL_SIZE) * 1.5; 

    if (cameraShake > 0) {
        camera.position.x += (Math.random()-0.5) * cameraShake;
        camera.position.y += (Math.random()-0.5) * cameraShake;
        cameraShake -= dt * 2;
        if(cameraShake<0) cameraShake=0;
    } else {
        camera.position.x += (playerPivot.position.x * 0.4 - camera.position.x) * dt * 3;
        camera.position.y += (targetCamY - camera.position.y) * dt * 2;
        camera.position.z += (targetCamZ - camera.position.z) * dt * 2;
    }
    camera.lookAt(playerPivot.position.x*0.3, 1, -10);

    // Player Move
    let moveDir = 0;
    if (keys.ArrowLeft) moveDir = -1;
    if (keys.ArrowRight) moveDir = 1;
    if (joyData.active) moveDir = joyData.x;
    
    playerX += moveDir * dt * (2.5 + gameSpeed * 0.02);
    if (playerX < -1) playerX = -1;
    if (playerX > 1) playerX = 1;
    
    playerPivot.position.x = playerX * (LANE_WIDTH / 2);
    playerMesh.rotation.x -= gameSpeed * dt * 0.3;
    playerMesh.rotation.z = -moveDir * 0.3;

    // Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.position.z -= 40 * dt; 
        if (b.position.z < -90) { scene.remove(b); bullets.splice(i, 1); }
    }

    // Obstacles
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
        spawnObstacle();
        spawnTimer = 25 / gameSpeed; 
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.mesh.position.z += gameSpeed * dt;

        // Crystal Movement
        if (stage.crystalMove && obs.type === 'crystal') {
            const time = performance.now() / 1000;
            obs.mesh.position.x += Math.sin(time - obs.initialTime) * dt * 4;
        }

        if (obs.mesh.position.z > 10) {
            scene.remove(obs.mesh);
            obstacles.splice(i, 1);
            continue;
        }
        
        if (obs.type !== 'wall') {
            if (playerSize > obs.size * 1.0) {
                obs.mesh.material = matCrystalGlow;
                obs.mesh.rotation.y += dt * 2;
            } else {
                obs.mesh.material = matCrystalNormal;
            }
        }

        if (!obs.hit) {
            for (let j = bullets.length - 1; j >= 0; j--) {
                const b = bullets[j];
                if (b.position.distanceTo(obs.mesh.position) < obs.size + 0.5) {
                    obs.hit = true;
                    scene.remove(b); bullets.splice(j, 1);
                    scene.remove(obs.mesh); obstacles.splice(i, 1);
                    triggerExplosion(obs.mesh.position, 0x00cec9, 1.5);
                    playExplosionSound();
                    cameraShake = 0.2;
                    break;
                }
            }
        }
        if(obs.hit) continue;

        if (!obs.hit) {
            const dx = Math.abs(obs.mesh.position.x - playerPivot.position.x);
            const dz = Math.abs(obs.mesh.position.z - playerPivot.position.z);
            const threshold = (playerSize + obs.size) * 0.6;

            if (dz < threshold && dx < threshold) {
                obs.hit = true;
                
                if (obs.type === 'wall') {
                    playerSize -= 0.8;
                    triggerExplosion(obs.mesh.position, 0xd63031, 2.0);
                    playExplosionSound();
                    cameraShake = 0.8;
                    damageOverlay.style.opacity = 0.8; setTimeout(()=>damageOverlay.style.opacity=0, 100);
                    scene.remove(obs.mesh);
                } else {
                    if (playerSize > obs.size * 1.0) {
                        if(playerSize < Config.maxSize) playerSize += Config.growthRate;
                        triggerExplosion(obs.mesh.position, 0x00cec9, 1.0);
                        playExplosionSound();
                        cameraShake = 0.2;
                        scene.remove(obs.mesh);
                    } else {
                        playerSize -= 0.3;
                        triggerExplosion(playerPivot.position, 0xffffff, 1.0);
                        playExplosionSound();
                        damageOverlay.style.opacity = 0.5; setTimeout(()=>damageOverlay.style.opacity=0, 100);
                    }
                }

                if (playerSize < 0.4) gameOver();
                updatePlayerVisuals();
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 20 * dt;
        p.life -= dt * 2;
        p.mesh.scale.setScalar(p.life);
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }

    speedLines.forEach(line => {
        if(!line.active && Math.random() < 0.05 * (gameSpeed/20)) {
            line.active = true;
            line.mesh.visible = true;
            line.mesh.position.set(camera.position.x+(Math.random()-0.5)*20, camera.position.y+(Math.random()-0.5)*10, camera.position.z-5);
        }
        if(line.active) {
            line.mesh.position.z -= (gameSpeed*2)*dt;
            if(line.mesh.position.z < -20) { line.active = false; line.mesh.visible = false; }
        }
    });

    updateUI();
    
    renderer.render(scene, camera);
}

init();
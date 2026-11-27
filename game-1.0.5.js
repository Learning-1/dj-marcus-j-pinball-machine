;(() => {
'use strict';
if (window.__djMarcusJPinballSnippetBooted) return;
window.__djMarcusJPinballSnippetBooted = true;
const plungerTravel = .24;
const flipper = { x: .175, z: -.572, outline: [[-0.011098,-0.026793],[-0.020506,-0.020506],[-0.026793,-0.011098],[-0.029,0.0],[-0.026793,0.011098],[-0.020506,0.020506],[-0.011098,0.026793],[0.0,0.029],[0.127,0.013],[0.131975,0.01201],[0.136192,0.009192],[0.13901,0.004975],[0.14,0.0],[0.13901,-0.004975],[0.136192,-0.009192],[0.131975,-0.01201],[0.127,-0.013],[-0.0,-0.029]] };
const flipTime = .145;
const dropTargets = [[.161,-.059],[.234,-.059],[.307,-.059]];
const targetBank = [[-.125,.568],[0,.596],[.125,.568]];
const rollovers = [[-.116,-.205],[.116,-.205]];
const slingshots = [[-.259,-.408],[.259,-.408]];
const completeBank = (1 << targetBank.length) - 1;
const initialsPattern = /^[A-Z]{3}$/;
function rankScore(scores, initials, score) {
    return [...scores, { initials, score }].sort((a,b) => b.score - a.score).slice(0,3);
}
const points = { bumper: 100, slingshot: 50, standUp: 150, drop: 200, dropBank: 300, rollover: 75, rolloverBonus: 500 };
const cues = ["Launch","Flipper","Bumper","Drain","Slingshot","Target","Rollover","Bonus"];
const frontRim = [[-.1207,-.7505],[.11715,-.7505],[.20235,-.7031],[.2982,-.6004],[.3905,-.50165]];
const drain = { z: -.703, width: .190, depth: .066, duration: .24 };
const motionInterval = 33;
function spectatorMotion(previous, latest, now) {
    if (!previous || !latest || previous.state.motionPhase !== latest.state.motionPhase) return latest?.state;
    const elapsed = Math.max(0, now - latest.received);
    const interval = Math.max(1, Math.min(motionInterval, latest.sent - previous.sent));
    const blend = Math.min(1, elapsed / interval);
    const mix = key => previous.state[key] + (latest.state[key] - previous.state[key]) * blend;
    return { ...latest.state, x:mix("x"), z:mix("z"), pull:mix("pull"), sink:mix("sink"),
        left:mix("left"), right:mix("right") };
}
function flipperAngle(sign, remaining) {
    const stroke = Math.max(0, Math.min(1, (flipTime - remaining) / .028, remaining / .04));
    return sign * (-19 + 51 * stroke);
}
function createGame(geometry, onSound = () => {}, enableDropTargets = false) {
    const radius = .026;
    const startX = .451, startZ = -.687;
    const state = { x: startX, z: startZ, balls: 3, score: 0, left: 0, right: 0, pull: 0, sink: 0, bank: 0, rolloverMask: 0, slingMask: 0, drops: 0 };
    const walls = geometry.rails.map(([a, b]) => ({ a, b }));
    for (let i = 1; i < frontRim.length; i++) walls.push({ a: frontRim[i-1], b: frontRim[i] });
    const bumpers = geometry.bumpers.map(([x, z]) => ({ x, z, cooldown: 0 }));
    const targetTimers = targetBank.map(() => 0);
    const slingTimers = slingshots.map(() => 0);
    const rolloverTimers = rollovers.map(() => 0);
    let rolloverInside = 0;
    let vx = 0, vz = 0, progress = 0, shooterSpeed = 0;
    let phase = "ready", rest = 0;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

    function ready() {
        Object.assign(state, { x: startX, z: startZ, pull: 0, left: 0, right: 0, sink: 0 });
        state.drops = 0;
        rolloverInside = 0;
        state.rolloverMask = state.slingMask = 0;
        rolloverTimers.fill(0);
        slingTimers.fill(0);
        targetTimers.fill(0);
        vx = vz = rest = 0;
        phase = state.balls ? "ready" : "over";
    }

    function reset() {
        state.balls = 3;
        state.score = 0;
        state.bank = 0;
        for (const bumper of bumpers) bumper.cooldown = 0;
        ready();
    }

    function launch(pull) {
        if (phase !== "ready" || !Number.isFinite(pull) || pull < .004) return false;
        shooterSpeed = .95 + 4.35 * clamp(pull / plungerTravel, 0, 1);
        state.pull = 0;
        progress = 0;
        phase = "shooter";
        onSound("Launch");
        return true;
    }

    function flip(side) {
        if (phase === "over" || (side !== "left" && side !== "right")) return;
        state[side] = flipTime;
        onSound("Flipper");
    }

    function contact(x, z, distance, bounce) {
        const dx = state.x - x, dz = state.z - z;
        const length = Math.hypot(dx, dz);
        if (length >= distance || length < 1e-7) return false;
        const nx = dx / length, nz = dz / length;
        state.x = x + nx * distance;
        state.z = z + nz * distance;
        const inbound = vx * nx + vz * nz;
        if (inbound < 0) {
            vx -= (1 + bounce) * inbound * nx;
            vz -= (1 + bounce) * inbound * nz;
        }
        return true;
    }

    function step(dt) {
        const previousLeft = state.left, previousRight = state.right;
        state.left = Math.max(0, state.left - dt);
        state.right = Math.max(0, state.right - dt);
        if (phase === "shooter") {
            shooterSpeed -= 1.35 * dt;
            progress += shooterSpeed * dt;
            if (progress <= 0) return ready();
            const curve = clamp((progress - .69) / .30, 0, 1);
            state.x = startX - .115 * curve * curve;
            state.z = startZ + Math.min(progress, .99);
            if (curve === 1) {
                vx = -.61 * shooterSpeed;
                vz = .79 * shooterSpeed;
                phase = "field";
            }
            return;
        }
        if (phase === "drain") {
            state.sink += dt / drain.duration;
            if (state.sink >= 1) {
                state.balls--;
                ready();
            }
            return;
        }
        if (phase !== "field") return;
        const damping = Math.exp(-.28 * dt);
        vx *= damping;
        vz = (vz - 9.81 * Math.sin(Math.PI / 30) * dt) * damping;
        const maxSpeed = Math.max(1, Math.hypot(vx, vz) / 6);
        vx /= maxSpeed;
        vz /= maxSpeed;
        if (state.z < -.655) vx += clamp(-state.x * 55, -9, 9) * dt;
        state.x += vx * dt;
        state.z += vz * dt;

        for (const { a, b } of walls) {
            const dx = b[0] - a[0], dz = b[1] - a[1];
            const t = clamp(((state.x - a[0]) * dx + (state.z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
            contact(a[0] + dx * t, a[1] + dz * t, radius + .010, .72);
        }
        for (const bumper of bumpers) {
            bumper.cooldown = Math.max(0, bumper.cooldown - dt);
            if (contact(bumper.x, bumper.z, radius + .063, .75) && !bumper.cooldown) {
                const dx = state.x - bumper.x, dz = state.z - bumper.z;
                const length = Math.hypot(dx, dz);
                vx += 1.65 * dx / length;
                vz += 1.65 * dz / length;
                state.score += points.bumper;
                bumper.cooldown = .14;
                onSound("Bumper");
            }
        }

        for (const [index, [x, z]] of slingshots.entries()) {
            slingTimers[index] = Math.max(0, slingTimers[index] - dt);
            if (contact(x, z, radius + .034, .55) && slingTimers[index] === 0) {
                vx = -Math.sign(x) * Math.max(1.55, Math.abs(vx));
                vz = Math.max(.55, vz);
                slingTimers[index] = .18;
                state.score += points.slingshot;
                onSound("Slingshot");
            }
        }
        state.slingMask = slingTimers.reduce((mask, timer, index) => timer > .07 ? mask | (1 << index) : mask, 0);
        for (const [index, [x, z]] of targetBank.entries()) {
            targetTimers[index] = Math.max(0, targetTimers[index] - dt);
            if (!contact(x, z, radius + .030, .67) || targetTimers[index] > 0) continue;
            targetTimers[index] = .20;
            state.bank |= 1 << index;
            state.score += points.standUp;
            onSound("Target");
        }
        if (enableDropTargets) {
            for (const [index, [x, z]] of dropTargets.entries()) {
                const bit = 1 << index;
                if ((state.drops & bit) || !contact(x, z, radius + .021, .48)) continue;
                state.drops |= bit;
                state.score += points.drop;
                onSound("Target");
                if (state.drops === 7) {
                    state.score += points.dropBank;
                    onSound("Bonus");
                }
                break;
            }
        }
        let switchMask = 0;
        for (const [index, [x, z]] of rollovers.entries()) {
            const bit = 1 << index;
            if (Math.hypot(state.x - x, state.z - z) > .036) continue;
            switchMask |= bit;
            if (rolloverInside & bit) continue;
            rolloverTimers[index] = .23;
            if (state.bank === completeBank) {
                state.score += points.rolloverBonus;
                state.bank = 0;
                onSound("Bonus");
            } else {
                state.score += points.rollover;
                onSound("Rollover");
            }
        }
        rolloverInside = switchMask;
        state.rolloverMask = rolloverTimers.reduce((mask, timer, index) => timer > 0 ? mask | (1 << index) : mask, 0);

        // The shooter-lane gate opens for the guided launch and closes once
        // the ball is in the field, like a one-way lane flap.
        if (state.z > -.08 && state.z < .19 && state.x > .37) {
            state.x = .37;
            vx = -Math.max(.32, Math.abs(vx) * .72);
        }

        for (const sign of [-1, 1]) {
            const side = sign < 0 ? "left" : "right";
            const previous = sign < 0 ? previousLeft : previousRight;
            const angle = flipperAngle(sign, state[side]);
            const radians = angle * Math.PI / 180;
            const c = Math.cos(radians), q = Math.sin(radians);
            const dx = state.x - sign * flipper.x, dz = state.z - flipper.z;
            const x = -sign * (c * dx - q * dz), z = q * dx + c * dz;
            let nearestX = 0, nearestZ = 0, distance = Infinity;
            let inside = true, outwardX = 0, outwardZ = 0;
            const outline = flipper.outline;
            for (let i = 0; i < outline.length; i++) {
                const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
                const ex = bx - ax, ez = bz - az;
                const cross = ex * (z - az) - ez * (x - ax);
                if (cross > 0) inside = false;
                const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
                const px = ax + t * ex, pz = az + t * ez;
                const squared = (x - px) ** 2 + (z - pz) ** 2;
                if (squared >= distance) continue;
                distance = squared;
                nearestX = px;
                nearestZ = pz;
                const length = Math.hypot(ex, ez);
                outwardX = -ez / length;
                outwardZ = ex / length;
            }
            if (inside || distance < radius * radius) {
                if (!inside && distance > 1e-12) {
                    const length = Math.sqrt(distance);
                    outwardX = (x - nearestX) / length;
                    outwardZ = (z - nearestZ) / length;
                }
                const nx = -sign * c * outwardX + q * outwardZ;
                const nz = sign * q * outwardX + c * outwardZ;
                state.x = sign * flipper.x - sign * c * nearestX + q * nearestZ + radius * nx;
                state.z = flipper.z + sign * q * nearestX + c * nearestZ + radius * nz;
                const inbound = vx * nx + vz * nz;
                if (inbound < 0) {
                    vx -= 1.45 * inbound * nx;
                    vz -= 1.45 * inbound * nz;
                }
                if (sign * (angle - flipperAngle(sign, previous)) > 0) {
                    vz = Math.max(vz, 2.65);
                    vx = -sign * Math.max(.16, Math.abs(vx) * .35);
                }
            }
        }
        const overDrain = Math.abs(state.x) < drain.width / 2 - .008
            && Math.abs(state.z - drain.z) < drain.depth / 2;
        if (overDrain) {
            phase = "drain";
            vx = vz = 0;
            onSound("Drain");
            return;
        }
        if (state.z < -.795 || state.z > .82 || Math.abs(state.x) > .55) {
            state.x = 0;
            state.z = drain.z;
            phase = "drain";
            onSound("Drain");
            return;
        }
        rest = Math.hypot(vx, vz) < .06 ? rest + dt : 0;
        if (rest > 2.5) ready();
    }

    return { state, reset, launch, flip, step, ready, phase: () => phase };
}


const element = document.querySelector('bs-snippet[name="dj-marcus-j-pinball-machine"]');
if (!element) return;
const releaseScript = new URL(document.currentScript.src);
const cabinetVersion = "1.0.0";
function triple(attribute, fallback) {
    const raw = element.getAttribute(attribute)?.trim();
    if (!raw) return fallback;
    const parts = raw.split(/\s+/).map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
}
const [x, floorY, z] = triple("position", [0,0,0]);
const origin = [x, floorY + .22, z];
const yaw = triple("rotation", [0,0,0])[1];
const instance = "dj-marcus-j-pinball-machine" + (element.getAttribute("instance") || "default");
const config = { dropTargets: element.getAttribute("drop-targets") !== "false", soloInUnity:false };
const stagedNames = ["Standalone Pinball Left paddle", "Standalone Pinball Right paddle", "Standalone Pinball Quest Audio"];

async function loadCabinet(scene) {
    const platform = await scene.IsAndroid() ? "quest" : "windows";
    const asset = document.createElement("bs-snippet");
    asset.setAttribute("name", "dj-marcus-j-pinball-machine-cabinet");
    asset.setAttribute("asset", new URL("pinball-" + cabinetVersion + "-" + platform + ".bundle", releaseScript).href);
    asset.setAttribute("position", origin.join(" "));
    asset.setAttribute("rotation", "0 " + yaw + " 0");
    element.after(asset);
    try {
        for (let attempt=0; attempt<120; attempt++) {
            if (!element.isConnected) throw Error("Pinball snippet was removed");
            const objects = Object.values(scene.objects ?? {});
            if (stagedNames.every(name => objects.some(obj => obj?.name === name))) return;
            await new Promise(resolve => setTimeout(resolve,250));
        }
        throw Error("Standalone cabinet did not finish loading");
    } catch (error) {
        asset.remove();
        throw error;
    }
}

const pitch = Math.PI / 30;
const radians = yaw * Math.PI / 180;
const channels = { action: instance + ":action", state: instance + ":state" };
let starting = false;

function boot() {
    if (starting) return;
    starting = true;
    const scene = BS.Scene.GetInstance();
    start(scene).catch(error => console.error("Pinball setup", error));
}

if (window.BS?.Scene) boot();
else window.addEventListener("bs-loaded", boot, { once: true });

async function start(scene) {
    await scene.WaitForUnityLoaded();
    await loadCabinet(scene);
    const geometry = {"rails": [[[-0.1207, -0.7505000000000001], [-0.22365000000000002, -0.6399]], [[-0.22365000000000002, -0.6399], [-0.31595, -0.54115]], [[-0.31595, -0.54115], [-0.37985, -0.46610000000000007]], [[-0.37985, -0.46610000000000007], [-0.4047, -0.4187]], [[-0.4047, -0.4187], [-0.4118, -0.36340000000000006]], [[-0.4118, -0.36340000000000006], [-0.4118, 0.34365]], [[-0.4118, 0.34365], [-0.40825, 0.4187]], [[-0.40825, 0.4187], [-0.38695, 0.49375]], [[-0.38695, 0.49375], [-0.35500000000000004, 0.5569500000000001]], [[-0.35500000000000004, 0.5569500000000001], [-0.3124, 0.6122500000000001]], [[-0.3124, 0.6122500000000001], [-0.25915, 0.6596500000000001]], [[-0.25915, 0.6596500000000001], [-0.1988, 0.69915]], [[-0.1988, 0.69915], [-0.13490000000000002, 0.7268000000000001]], [[-0.13490000000000002, 0.7268000000000001], [-0.06745000000000001, 0.7426]], [[-0.06745000000000001, 0.7426], [0.0, 0.7505000000000001]], [[0.0, 0.7505000000000001], [0.07100000000000001, 0.7426]], [[0.07100000000000001, 0.7426], [0.13845000000000002, 0.7268000000000001]], [[0.13845000000000002, 0.7268000000000001], [0.2059, 0.69915]], [[0.2059, 0.69915], [0.2627, 0.6596500000000001]], [[0.2627, 0.6596500000000001], [0.3124, 0.6122500000000001]], [[0.3124, 0.6122500000000001], [0.35500000000000004, 0.5569500000000001]], [[0.35500000000000004, 0.5569500000000001], [0.38695, 0.49375]], [[0.38695, 0.49375], [0.40825, 0.4187]], [[0.40825, 0.4187], [0.41535, 0.33575000000000005]], [[0.41535, 0.33575000000000005], [0.41535, 0.20540000000000003]], [[0.41535, 0.20540000000000003], [0.43665000000000004, 0.14220000000000002]], [[0.43665000000000004, 0.14220000000000002], [0.47215, 0.07505]], [[0.47215, 0.07505], [0.50055, 0.011850000000000001]], [[0.50055, 0.011850000000000001], [0.50055, -0.69915]], [[0.50055, -0.69915], [0.48635, -0.74655]], [[0.40825, -0.011850000000000001], [0.4118, -0.7426]], [[-0.40115, -0.059250000000000004], [-0.35500000000000004, -0.33575000000000005]], [[-0.35500000000000004, -0.33575000000000005], [-0.16685, -0.5174500000000001]], [[0.4047, -0.059250000000000004], [0.35500000000000004, -0.33575000000000005]], [[0.35500000000000004, -0.33575000000000005], [0.16685, -0.5174500000000001]], [[-0.31595, 0.0158], [-0.19525, 0.1501]], [[0.31595, 0.0158], [0.19525, 0.1501]]], "bumpers": [[-0.16, 0.24], [0.08, 0.18], [-0.04, 0.44]]};
    const vector = (x, y, z) => new BS.Vector3(x, y, z);
    const player = () => scene.localUser?.id;
    const send = message => scene.OneShot(message).catch(error => console.warn("Pinball network", error));
    const update = promise => Promise.resolve(promise).catch(error => console.warn("Pinball transform", error));
    const place = (x, y, z) => vector(x, .08 + Math.cos(pitch) * y + Math.sin(pitch) * z,
        Math.cos(pitch) * z - Math.sin(pitch) * y);
    const local = point => {
        const dx = point.x - origin[0], dz = point.z - origin[2];
        return { x: Math.cos(radians) * dx - Math.sin(radians) * dz, y: point.y - origin[1],
            z: Math.sin(radians) * dx + Math.cos(radians) * dz };
    };

    async function object(name, parent, point, options = {}) {
        const obj = new BS.GameObject({ name, parent, localPosition: point, ...options });
        await obj.Async();
        return obj;
    }

    async function visual(name, parent, point, shape, rgb, options = {}) {
        const obj = await object(name, parent, point, options);
        await obj.AddComponent(shape);
        await obj.AddComponent(new BS.Material({ color: new BS.Vector4(...rgb, 1) }));
        return obj;
    }

    const root = await object(instance, undefined, vector(...origin), { localEulerAngles: vector(0, yaw, 0) });
    const authorityObject = await object("Pinball game authority", root, vector(0, 0, 0));
    authorityObject.networkId = instance + "-authority";
    const authority = await authorityObject.AddComponent(new BS.SyncedObject({
        takeOwnershipOnCollision: false, takeOwnershipOnProximity: false, takeOwnershipOnGrab: false
    }));
    const staged = name => Object.values(scene.objects ?? {}).find(obj => obj?.name === name);
    let audio;
    const red = [.91,.08,.19];
    const ball = await visual("Steel ball", root, place(.451,.886,-.687),
        new BS.Sphere({ radius: .026, widthSegments: 16, heightSegments: 8 }), [.60,.68,.75]);
    const plungerZ = -.770;
    const grabHome = place(.451,.88,plungerZ);
    const handle = await visual("Plunger handle", root, grabHome,
        new BS.Cylinder({ radiusTop: .024, radiusBottom: .024, height: .046, radialSegments: 16 }), red);
    const grab = await object("Plunger grab zone", root, grabHome, { layer: BS.L.Grabbable });
    await grab.AddComponent(new BS.SphereCollider({ radius: .063 }));
    const grabBody = await grab.AddComponent(new BS.Rigidbody({
        mass: .1, useGravity: false, isKinematic: false,
        freezePositionX: yaw === 0, freezePositionY: true,
        freezeRotationX: true, freezeRotationY: true, freezeRotationZ: true
    }));
    const shaft = await visual("Plunger shaft", handle, vector(0,0,.047),
        new BS.Cylinder({radiusTop:.008, radiusBottom:.008, height:.11, radialSegments:10}),
        [.62,.68,.76], {localEulerAngles:vector(90,0,0)});
    await grab.AddComponent(new BS.Grababble({ grabType: BS.BSGrabType.Point }));

    const buttons = [
        { side: "left", x: -.18, y: .920, z: -.855 },
        { side: "right", x: .18, y: .920, z: -.855 }
    ];
    const flippers = {};
    for (const { side, x, y, z } of buttons) {
        const button = await object(side + " button click zone", root, vector(x, y, z),
            { layer: BS.L.UI });
        await button.AddComponent(new BS.BoxCollider({ size: vector(.170,.090,.170) }));
        button.On("click", () => {
            if (![...triggerTargets.values()].some(target => target === side)) submitFlip(side);
        });
    }

    const label = await object("Pinball score", root, place(0,1.022,.718));
    const scoreText = await label.AddComponent(new BS.Text({
        text: "SCORE  00000\nBALLS  3", color: new BS.Vector4(1,.83,.52,1), fontSize: .31,
        enableWordWrapping: false, rectTransformSizeDelta: new BS.Vector2(.60,.30)
    }));

    const leaderboard = await object("Pinball high scores", root, place(0,1.222,.718));
    const leaderboardText = await leaderboard.AddComponent(new BS.Text({
        text: "HIGH SCORES\n1  ---\n2  ---\n3  ---", color: new BS.Vector4(.49,.91,1,1),
        fontSize: .275, enableWordWrapping:false, rectTransformSizeDelta:new BS.Vector2(.58,.20)
    }));

    let isAuthority = Boolean(config.soloInUnity), activePlayer = null, ownerId = null;
    let turnId = null, initials = null, leaders = [];
    let namePanel, lastLeaderboard = leaderboardText.text, keyboardLetter = 0;
    const initialsDraft = [0,0,0], initialsLetters = [];
    let snapshot, lastStateKey = "", holding = null, latestPose, lastRenderedPull = -1;
    let lastActionTime = Date.now(), lastRemoteFrame = 0;
    let previousMotion, latestMotion, incomingSequence = -1, outgoingSequence = 0;
    const hitTimes = { left: -Infinity, right: -Infinity };
    const lastPaddleAngle = {};
    const triggerTargets = new Map();
    const triggerDown = new Set();
    const handPresses = [{ previous: null, latched: false }, { previous: null, latched: false }];
    const sounds = [];
    const play = cue => {
        const cueIndex = cues.indexOf(cue);
        if (audio && cueIndex >= 0) Promise.resolve(audio.PlayOneShot(cueIndex))
            .catch(error => console.warn("Pinball audio", cue, error));
    };
    const game = createGame(geometry, cue => { play(cue); sounds.push(cue); }, config.dropTargets === true);

    function clearTurn() {
        activePlayer = turnId = initials = null;
    }

    function processAction(id, action, value) {
        if (!isAuthority || !id) return;
        if (action === "claim" || action === "launch") {
            if (activePlayer && activePlayer !== id) return;
            if (turnId !== id) {
                turnId = id;
                initials = null;
            }
            if (game.phase() === "over") game.reset();
            activePlayer = id;
            lastActionTime = Date.now();
            if (action === "launch" && initials) game.launch(value);
            return;
        }
        if (action === "initials") {
            if (id !== activePlayer || id !== turnId || initials || typeof value !== "string" || !initialsPattern.test(value))
                return;
            initials = value;
            lastActionTime = Date.now();
            return;
        }
        if (action === "cancel" && id === activePlayer && !initials) {
            clearTurn();
            return;
        }
        if (action === "flip") {
            if (activePlayer && id !== activePlayer) return;
            lastActionTime = Date.now();
            game.flip(value);
            return;
        }
        if (id !== activePlayer) return;
        lastActionTime = Date.now();
        if (action === "pull" && game.phase() === "ready" && Number.isFinite(value))
            game.state.pull = Math.min(plungerTravel, Math.max(0, value));
    }

    function action(type, value) {
        if (isAuthority) processAction(player() ?? "unity", type, value);
        else send({ channel: channels.action, type, value });
    }

    function submitFlip(side) {
        if (activePlayer && activePlayer !== (player() ?? "unity")) return;
        const now = performance.now();
        if (now - hitTimes[side] < 75) return;
        hitTimes[side] = now;
        action("flip", side);
    }

    scene.On("one-shot", event => {
        let message;
        try { message = JSON.parse(event.detail.data); } catch { return; }
        if (message.channel === channels.action)
            processAction(event.detail.fromId, message.type, message.value);
        if (message.channel !== channels.state || isAuthority) return;
        const now = Date.now();
        if (ownerId && ownerId !== event.detail.fromId && now - lastRemoteFrame < 1400) return;
        if (ownerId !== event.detail.fromId) {
            previousMotion = latestMotion = undefined;
            incomingSequence = -1;
        }
        if (!message.state || !Number.isFinite(message.sent) || !Number.isSafeInteger(message.sequence) || message.sequence <= incomingSequence) return;
        incomingSequence = message.sequence;
        ownerId = event.detail.fromId;
        lastRemoteFrame = now;
        previousMotion = latestMotion;
        latestMotion = { state:message.state, received:performance.now(), sent:message.sent };
        activePlayer = message.activePlayer;
        snapshot = message.state;
        turnId = message.turnId ?? null;
        initials = message.initials ?? null;
        if (Array.isArray(message.leaders)) leaders = message.leaders.filter(entry =>
            entry && typeof entry.initials === "string" && initialsPattern.test(entry.initials) &&
            Number.isSafeInteger(entry.score) && entry.score >= 0).slice(0,3);
        for (const cue of message.sounds ?? []) play(cue);
    });

    scene.On("user-left", event => {
        if (event.detail.id === ownerId) {
            ownerId = null;
            previousMotion = latestMotion = undefined;
            incomingSequence = -1;
        }
        if (event.detail.id === turnId) {
            if (isAuthority && activePlayer) game.reset();
            clearTurn();
        }
    });

    grab.On("grab", event => {
        const me = player() ?? "unity";
        if (activePlayer && activePlayer !== me) {
            update(grab.ReleaseGrab());
            return;
        }
        action("claim");
        if (turnId !== me || !initials) {
            update(grab.ReleaseGrab());
            return;
        }
        const left = event.detail.side === BS.HandSide.LEFT;
        const hand = left ? latestPose?.leftHand : latestPose?.rightHand;
        holding = { left, start: hand?.position ? local(hand.position).z : undefined,
            proxyStart: undefined, handPull: 0, proxyPull: 0, pull: 0 };
    });

    grab.On("drop", () => {
        if (!holding) return;
        action("launch", holding.pull);
        action("pull", 0);
        holding = null;
        grabBody.velocity = vector(0,0,0);
        update(grab.SetLocalPosition(grabHome));
    });

    await grab.WatchTransform([BS.PN.position], transform => {
        if (!transform.position) return;
        const position = local(transform.position);
        if (!holding) {
            if (Math.hypot(position.x - grabHome.x, position.y - grabHome.y, position.z - grabHome.z) > .025) {
                grabBody.velocity = vector(0,0,0);
                update(grab.SetLocalPosition(grabHome));
            }
            return;
        }
        const z = position.z;
        holding.proxyStart ??= z;
        holding.proxyPull = Math.min(plungerTravel, Math.max(0, holding.proxyStart - z));
        holding.pull = Math.max(holding.proxyPull, holding.handPull);
    });

    scene.On("pose-update", event => {
        latestPose = event.detail;
        for (const [index, hand] of [latestPose.leftHand, latestPose.rightHand].entries()) {
            const input = handPresses[index];
            if (!hand?.position) {
                input.previous = null;
                input.latched = false;
                continue;
            }
            const point = local(hand.position);
            const previous = input.previous;
            input.previous = point;
            const pressHeight = buttons[0].y + .035;
            if (point.y >= pressHeight + .025) input.latched = false;
            if (input.latched || !previous || previous.y <= pressHeight || point.y > pressHeight) continue;
            const fraction = (previous.y - pressHeight) / (previous.y - point.y);
            const x = previous.x + (point.x - previous.x) * fraction;
            const z = previous.z + (point.z - previous.z) * fraction;
            for (const button of buttons) {
                if (Math.hypot(x - button.x, z - button.z) > .078) continue;
                input.latched = true;
                submitFlip(button.side);
                break;
            }
        }
        if (!holding) return;
        const hand = holding.left ? latestPose.leftHand : latestPose.rightHand;
        if (!hand?.position) return;
        const z = local(hand.position).z;
        holding.start ??= z;
        holding.handPull = Math.min(plungerTravel, Math.max(0, holding.start - z));
        holding.pull = Math.max(holding.proxyPull, holding.handPull);
    });

    function triggerTarget(hand) {
        if (!hand?.position) return;
        const point = local(hand.position);
        let target, nearest = .190;
        for (const button of buttons) {
            const distance = Math.hypot(point.x - button.x, point.y - button.y, point.z - button.z);
            if (distance >= nearest) continue;
            nearest = distance;
            target = button.side;
        }
        if (target || !hand.rotation) return target;

        // Unity's controller forward axis (+Z), converted to cabinet coordinates.
        const { x, y, z, w } = hand.rotation;
        const dx = 2 * (x * z + w * y), dy = 2 * (y * z - w * x);
        const dz = 1 - 2 * (x * x + y * y);
        const fx = Math.cos(radians) * dx - Math.sin(radians) * dz;
        const fz = Math.sin(radians) * dx + Math.cos(radians) * dz;
        if (!(dy < -.05)) return;
        for (const button of buttons) {
            const distance = (button.y - point.y) / dy;
            if (distance < 0 || distance > 1.6) continue;
            if (Math.hypot(point.x + fx * distance - button.x, point.z + fz * distance - button.z) <= .085)
                return button.side;
        }
    }

    function pressTrigger(handSide) {
        if (triggerDown.has(handSide)) return;
        triggerDown.add(handSide);
        const hand = handSide === BS.HandSide.LEFT ? latestPose?.leftHand : latestPose?.rightHand;
        const side = triggerTarget(hand);
        if (!side) return;
        triggerTargets.set(handSide, side);
        submitFlip(side);
    }

    function releaseTrigger(handSide) {
        triggerDown.delete(handSide);
        triggerTargets.delete(handSide);
    }

    scene.On("button-pressed", ({ detail }) => {
        if (detail.button === BS.ButtonType.TRIGGER) pressTrigger(detail.side);
    });
    scene.On("button-released", ({ detail }) => {
        if (detail.button === BS.ButtonType.TRIGGER) releaseTrigger(detail.side);
    });
    // The analog stream can recover a missed discrete press or release. The
    // separate thresholds keep one physical squeeze from firing twice.
    scene.On("trigger-axis-update", ({ detail }) => {
        if (detail.value >= .32) pressTrigger(detail.hand);
        else if (detail.value <= .12) releaseTrigger(detail.hand);
    });

    const draftText = () => initialsDraft.map(value => String.fromCharCode(65 + value)).join("");
    function updateDraft() {
        initialsLetters.forEach((letter, i) => { letter.text = String.fromCharCode(65 + initialsDraft[i]); });
    }

    async function buildNamePanel() {
        const panel = await visual("Enter pinball initials", root, vector(0,1.035,-1.040),
            new BS.Box({width:.45,height:.265,depth:.018}), [.075,.045,.105]);
        panel.active = false;
        async function textAt(name, x, y, text, fontSize, width) {
            const item = await object(name, panel, vector(x,y,-.022));
            return await item.AddComponent(new BS.Text({
                text, fontSize, color:new BS.Vector4(1,.86,.56,1), enableWordWrapping:false,
                rectTransformSizeDelta:new BS.Vector2(width,.050)
            }));
        }
        async function key(name, x, y, text, width, callback) {
            const item = await visual(name, panel, vector(x,y,-.013),
                new BS.Box({width,height:.038,depth:.008}), [.22,.12,.30], {layer:BS.L.UI});
            await item.AddComponent(new BS.BoxCollider({size:vector(width,.044,.023)}));
            item.On("click", callback);
            await textAt(name + " text", x,y,text,.24,width);
        }
        await textAt("Initials prompt",0,.103,"ENTER THREE INITIALS",.24,.43);

        for (let i=0; i<3; i++) {
            const x = (i-1)*.11;
            initialsLetters.push(await textAt("Initial " + (i+1),x,.003,"A",.31,.08));
            for (const [y,delta,symbol] of [[.055,1,"+"],[-.045,-1,"-"]]) {
                await key("Initials " + i + " " + symbol,x,y,symbol,.083,() => {
                    if (activePlayer !== (player() ?? "unity") || initials) return;
                    initialsDraft[i] = (initialsDraft[i] + delta + 26) % 26;
                    updateDraft();
                });
            }
        }
        await key("Save initials",.095,-.100,"PLAY",.15,() => action("initials", draftText()));
        await key("Cancel initials",-.095,-.100,"CANCEL",.15,() => action("cancel"));
        namePanel = panel;
    }
    buildNamePanel().catch(error => console.warn("Pinball initials panel",error));

    let desktopCharge = null;
    scene.On("key-press", event => {
        const key = event.detail.key;
        if (activePlayer === (player() ?? "unity") && !initials) {
            if (key >= BS.KeyCode.A && key <= BS.KeyCode.Z) {
                initialsDraft[keyboardLetter++ % 3] = key - BS.KeyCode.A;
                updateDraft();
            }
            return;
        }
        if (key === BS.KeyCode.A) submitFlip("left");
        if (event.detail.key === BS.KeyCode.D) submitFlip("right");
        if (event.detail.key === BS.KeyCode.Space) {
            action("claim");
            if (initials && activePlayer === (player() ?? "unity")) desktopCharge = performance.now();
        }
    });
    scene.On("key-release", event => {
        if (event.detail.key !== BS.KeyCode.Space || desktopCharge === null) return;
        action("launch", Math.max(.004, (performance.now() - desktopCharge) * .00024));
        desktopCharge = null;
    });

    async function checkAuthority() {
        if (config.soloInUnity) return;
        const owns = await authority.DoIOwn();
        if (isAuthority && !owns) sounds.length = 0;
        if (owns && !isAuthority) {
            game.reset();
            if (activePlayer !== turnId) activePlayer = null;
        }
        isAuthority = owns;
    }
    const refreshAuthority = () => checkAuthority().catch(error => console.warn("Pinball ownership", error));
    refreshAuthority();
    setInterval(refreshAuthority, 750);

    const inserts = [];
    const trialPaddles = [];
    const rolloverLabels = [];
    let rolloverBonusShown = false;
    async function insert(name, x, z, hue, isLit) {
        const base = await visual(name, root, place(x,.860,z),
            new BS.Cylinder({ radiusTop:.023, radiusBottom:.023, height:.004, radialSegments:12 }), [.13,.19,.22],
            { localEulerAngles:vector(-6,0,0) });
        const lit = await visual(name + " lit", base, vector(0,.003,0),
            new BS.Cylinder({ radiusTop:.020, radiusBottom:.020, height:.004, radialSegments:12 }), hue);
        lit.active = false;
        inserts.push({ lit, isLit, active:false });
        return base;
    }
    const boldPoints = value => "<b>" + value + "</b>";

    async function pointLabel(name, parent, value, position, angle, width, fontSize) {
        const label = await object(name, parent, position, { localEulerAngles: vector(angle,0,0) });
        return label.AddComponent(new BS.Text({
            text:boldPoints(value), richText:true, color:new BS.Vector4(1,1,1,1), fontSize,
            enableWordWrapping:false, rectTransformSizeDelta:new BS.Vector2(width,.034)
        }));
    }

    async function addFirstPassPieces() {
        for (const [index, [x, z]] of geometry.bumpers.entries()) {
            const badge = await visual("Bumper " + (index + 1) + " point badge", root, place(x,.940,z),
                new BS.Cylinder({ radiusTop:.038, radiusBottom:.038, height:.002, radialSegments:16 }),
                [.12,.07,.16], { localEulerAngles:vector(-6,0,0) });
            await pointLabel("Bumper points", badge, points.bumper, vector(0,.002,0), 90, .074, .36);
        }
        if (config.dropTargets === true) {
            for (const [index, [x,z]] of dropTargets.entries()) {
                await visual("Drop target slot " + (index + 1), root, place(x,.859,z),
                    new BS.Box({width:.061, height:.004, depth:.032}), [.10,.075,.12],
                    {localEulerAngles:vector(-6,0,0)});
                const face = await visual("Drop target " + (index + 1), root, place(x,.886,z),
                    new BS.Box({width:.049, height:.053, depth:.019}), [.94,.20,.18],
                    {localEulerAngles:vector(-6,0,0)});
                await pointLabel("Drop target points", face, points.drop, vector(0,0,-.0105), 0, .047, .27);
                trialPaddles.push({ index, face, x, z, down:false });
            }
        }

        for (const [index, [x, z]] of targetBank.entries()) {
            const face = await visual("Stand-up target " + (index + 1), root, place(x,.889,z),
                new BS.Box({ width:.058, height:.062, depth:.021 }), [.22,.67,.86],
                { localEulerAngles:vector(-6,0,0) });
            await pointLabel("Stand-up target points", face, points.standUp, vector(0,0,-.0115), 0, .055, .31);
            await insert("Target insert " + (index + 1), x, z - .049, [.23,.87,1], s => (s.bank & (1 << index)) !== 0);
        }
        for (const [index, [x, z]] of rollovers.entries()) {
            const face = await insert("Bonus rollover " + (index + 1), x, z, [1,.76,.19],
                s => s.bank === completeBank || (s.rolloverMask & (1 << index)) !== 0);
            const badge = await visual("Rollover point badge", face, vector(0,.0055,0),
                new BS.Cylinder({ radiusTop:.0165, radiusBottom:.0165, height:.001, radialSegments:12 }), [.13,.19,.22]);
            rolloverLabels.push(await pointLabel("Rollover points", badge, points.rollover, vector(0,.001,0), 90, .033, .20));
        }
        for (const [index, [x, z]] of slingshots.entries()) {
            const sign = Math.sign(x);
            const sling = await visual("Slingshot " + (index + 1), root, place(x,.879,z),
                new BS.Box({ width:.064, height:.042, depth:.053 }), [.94,.18,.34],
                { localEulerAngles:vector(-6,-sign*44,0) });
            await pointLabel("Slingshot points", sling, points.slingshot, vector(-sign*.012,.022,.013), 90, .035, .19);
            await insert("Slingshot insert " + (index + 1), x - sign * .052, z, [1,.35,.42],
                s => (s.slingMask & (1 << index)) !== 0);
        }
    }

    async function attachPresentation() {
        audio = staged("Standalone Pinball Quest Audio")?.GetComponent(BS.CT.AudioSource);
        for (const [side, sign] of [["left", -1], ["right", 1]]) {
            const paddleName = "Standalone Pinball " + (sign < 0 ? "Left" : "Right") + " paddle";
            const paddle = staged(paddleName);
            if (paddle) {
                flippers[side] = paddle;
                continue;
            }
            const pivot = await object(side + " fallback paddle pivot", root, place(sign * flipper.x,.884,flipper.z));
            await visual(side + " fallback paddle body", pivot, vector(-sign * .063,0,0),
                new BS.Box({ width: .124, height: .042, depth: .024 }), red);
            await visual(side + " fallback paddle heel", pivot, vector(0,0,0),
                new BS.Cylinder({ radiusTop: .029, radiusBottom: .029, height: .042, radialSegments: 12 }), red);
            await visual(side + " fallback paddle tip", pivot, vector(-sign * .127,0,0),
                new BS.Cylinder({ radiusTop: .013, radiusBottom: .013, height: .042, radialSegments: 10 }), red);
            flippers[side] = pivot;
            console.warn("Pinball using fallback paddle", side);
        }
    }
    addFirstPassPieces().catch(error => console.warn("Pinball playfield pieces", error));
    setTimeout(() => attachPresentation().catch(error => console.warn("Pinball presentation", error)), 1800);

    function renderMotion(s) {
        update(ball.SetLocalPosition(place(s.x,.886 - .11 * (s.sink ?? 0),s.z)));
        const pull = holding?.pull ?? s.pull;
        if (Math.abs(pull - lastRenderedPull) >= .001) {
            lastRenderedPull = pull;
            update(handle.SetLocalPosition(place(.451,.88,plungerZ - pull)));
            update(shaft.SetLocalPosition(vector(0,0,.047 + pull*.5)));
            update(shaft.SetLocalScale(vector(1,1 + pull/.11,1)));
        }
        for (const [side, sign] of [["left", -1], ["right", 1]]) {
            const angle = flipperAngle(sign, s[side]);
            if (!flippers[side] || lastPaddleAngle[side] === angle) continue;
            lastPaddleAngle[side] = angle;
            update(flippers[side].SetLocalEulerAngles(vector(-6, angle, 0)));
        }
    }
    setInterval(() => {
        if (isAuthority || !latestMotion) return;
        renderMotion(spectatorMotion(previousMotion, latestMotion, performance.now()));
    }, 16);

    let previousTick = performance.now(), accumulated = 0, lastPullSent = -1;
    let lastBroadcast = "", lastBroadcastTime = 0, ballVisible = true, panelVisible = false;
    setInterval(() => {
        const now = performance.now();
        accumulated += Math.min((now - previousTick) / 1000, .09);
        previousTick = now;
        if (isAuthority) {
            if (activePlayer && Date.now() - lastActionTime > 120000) {
                clearTurn();
                game.reset();
            }
            while (accumulated >= 1/240) {
                game.step(1/240);
                accumulated -= 1/240;
            }
            if (game.phase() === "over" && activePlayer) {
                if (initials) leaders = rankScore(leaders, initials, game.state.score);
                activePlayer = null;
            }
            snapshot = { ...game.state, motionPhase:game.phase() };
        } else accumulated = 0;

        if (holding && Math.abs(holding.pull - lastPullSent) >= .001) {
            lastPullSent = holding.pull;
            action("pull", holding.pull);
        } else if (!holding) lastPullSent = -1;
        if (isAuthority && !config.soloInUnity) {
            const frame = JSON.stringify([activePlayer, turnId, initials, leaders, snapshot]);
            if (frame !== lastBroadcast || sounds.length || now - lastBroadcastTime > 1000) {
                send({ channel:channels.state, sequence:++outgoingSequence, sent:now, activePlayer,
                    turnId, initials, leaders, state:snapshot, sounds:sounds.splice(0) });
                lastBroadcast = frame;
                lastBroadcastTime = now;
            }
        } else if (isAuthority) sounds.length = 0;

        const showPanel = activePlayer === (player() ?? "unity") && !initials;
        if (namePanel && showPanel !== panelVisible) {
            panelVisible = namePanel.active = showPanel;
            if (showPanel) {
                initialsDraft.fill(0);
                keyboardLetter = 0;
                updateDraft();
            }
        }
        const board = "HIGH SCORES\n" + [0,1,2].map(index => {
            const entry = leaders[index];
            return (index+1) + "   " + (entry ? entry.initials + "   " + entry.score : "---");
        }).join("\n");
        if (board !== lastLeaderboard) {
            leaderboardText.text = board;
            lastLeaderboard = board;
        }
        if (!snapshot) return;
        const s = isAuthority ? snapshot : spectatorMotion(previousMotion, latestMotion, now) ?? snapshot;
        for (const target of trialPaddles) {
            const down = (s.drops & (1 << target.index)) !== 0;
            if (down === target.down) continue;
            target.down = down;
            update(target.face.SetLocalPosition(place(target.x, down ? .830 : .886, target.z)));
        }
        for (const insert of inserts) {
            const active = insert.isLit(s);
            if (active === insert.active) continue;
            insert.active = insert.lit.active = active;
        }
        const rolloverBonusReady = s.bank === completeBank;
        if (rolloverBonusReady !== rolloverBonusShown) {
            rolloverBonusShown = rolloverBonusReady;
            for (const label of rolloverLabels) {
                label.text = boldPoints(rolloverBonusReady ? points.rolloverBonus : points.rollover);
            }
        }
        if (ballVisible !== (s.balls > 0)) {
            ballVisible = s.balls > 0;
            ball.active = ballVisible;
        }
        if (isAuthority) renderMotion(s);
        const scoreLine = "SCORE  " + String(s.score).padStart(5,"0");
        const line = s.balls === 0
            ? "GAME OVER\n" + scoreLine
            : scoreLine + "\nBALLS  " + s.balls;
        if (line !== lastStateKey) {
            scoreText.text = line;
            lastStateKey = line;
        }
    }, motionInterval);
}



})();

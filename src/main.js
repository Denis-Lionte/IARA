import * as THREE from 'three';
import { App } from 'locar';

const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const statusText = document.getElementById('status-text');

// Telemetry DOM elements
const elLat = document.getElementById('val-lat');
const elLon = document.getElementById('val-lon');
const elAlt = document.getElementById('val-alt');
const elAcc = document.getElementById('val-acc');
const elAx = document.getElementById('val-ax');
const elAy = document.getElementById('val-ay');
const elAz = document.getElementById('val-az');
const elAlpha = document.getElementById('val-alpha');
const elBeta = document.getElementById('val-beta');
const elGamma = document.getElementById('val-gamma');
const compassDial = document.getElementById('compass-dial');
const headingValue = document.getElementById('heading-value');

// Modal Elements
const modalOverlay = document.getElementById('modal-overlay');
const inputTitle = document.getElementById('input-title');
const inputDesc = document.getElementById('input-desc');
const inputLat = document.getElementById('input-lat');
const inputLon = document.getElementById('input-lon');
const inputAlt = document.getElementById('input-alt');
const inputColor = document.getElementById('input-color');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSubmitBtn = document.getElementById('modal-submit-btn');

// Action Buttons
const addMarkerBtn = document.getElementById('add-marker-btn');
const customCoordsBtn = document.getElementById('custom-coords-btn');

// Info Card Elements
const markerInfoCard = document.getElementById('marker-info-card');
const markerInfoTitle = document.getElementById('marker-info-title');
const markerInfoDesc = document.getElementById('marker-info-desc');
const markerInfoCoords = document.getElementById('marker-info-coords');
const markerInfoClose = document.getElementById('marker-info-close');

// Global State
let currentLat = null;
let currentLon = null;
let currentAlt = null; // Stores actual real-world GPS altitude (e.g. ~400m)
let locarInstance = null;
let appInstance = null;
const interactiveMarkers = []; // Stores meshes eligible for tap
const allCustomMarkers = []; // { group, lat, lon, targetAlt }

// 4 Cardinal markers that dynamic follow player
let cardinalMarkers = {
  N: null,
  S: null,
  E: null,
  W: null
};

markerInfoClose.addEventListener('click', (e) => {
  e.stopPropagation();
  markerInfoCard.style.display = 'none';
});

// Convert heading degrees to Cardinal abbreviation
function getCardinalDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
  return directions[index];
}

// Generate a 3D Marker
function createInteractiveMarker({ title, description, lat, lon, alt = 0, colorHex = 0x00e5ff, isCardinal = false }) {
  const group = new THREE.Group();

  // Vertical pole
  const poleHeight = isCardinal ? 3.0 : 3.5;
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, poleHeight, 16);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.y = poleHeight / 2;
  group.add(poleMesh);

  // Top sphere pin
  const sphereGeo = new THREE.SphereGeometry(isCardinal ? 0.75 : 0.85, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.45,
    roughness: 0.2
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.y = poleHeight + 0.5;
  group.add(sphereMesh);

  // Billboard sprite with text
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 364, 140, 24);
  ctx.fill();
  ctx.strokeStyle = typeof colorHex === 'number' ? `#${colorHex.toString(16).padStart(6, '0')}` : colorHex;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = isCardinal ? 'bold 50px sans-serif' : 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayTitle = title.length > 18 ? title.slice(0, 16) + '...' : title;
  ctx.fillText(displayTitle, 192, isCardinal ? 80 : 60);

  if (!isCardinal) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px sans-serif';
    ctx.fillText('Tap for info', 192, 108);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3.2, 1.33, 1);
  sprite.position.y = poleHeight + 1.8;
  group.add(sprite);

  // Attach metadata
  const markerData = {
    title,
    description: description || 'No extra description provided.',
    lat,
    lon,
    alt
  };
  group.userData = markerData;
  sphereMesh.userData = markerData;
  poleMesh.userData = markerData;
  sprite.userData = markerData;

  interactiveMarkers.push(sphereMesh, poleMesh, sprite);

  return group;
}

// Display Info Card
function showMarkerDetails(data) {
  markerInfoTitle.innerText = data.title;
  markerInfoDesc.innerText = data.description;
  markerInfoCoords.innerText = `Lat: ${data.lat.toFixed(5)} | Lon: ${data.lon.toFixed(5)} | Alt: ${Math.round(data.alt)}m`;
  markerInfoCard.style.display = 'block';
}

// Open modal for adding a marker
function openMarkerModal(prefillLat = null, prefillLon = null, prefillAlt = null) {
  inputTitle.value = '';
  inputDesc.value = '';
  inputLat.value = prefillLat !== null ? prefillLat.toFixed(5) : (currentLat !== null ? currentLat.toFixed(5) : '');
  inputLon.value = prefillLon !== null ? prefillLon.toFixed(5) : (currentLon !== null ? currentLon.toFixed(5) : '');
  
  // Prefill with actual measured GPS altitude if available, otherwise round to 0
  const defaultAlt = prefillAlt !== null ? Math.round(prefillAlt) : (currentAlt !== null ? Math.round(currentAlt) : 0);
  inputAlt.value = defaultAlt;
  modalOverlay.style.display = 'flex';
}

// Button Listeners
function bindTapOrClick(el, handler) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    handler(e);
  });
}

bindTapOrClick(addMarkerBtn, () => {
  if (currentLat === null || currentLon === null) {
    alert('Still waiting for initial GPS position...');
    return;
  }
  openMarkerModal(currentLat, currentLon, currentAlt);
});

bindTapOrClick(customCoordsBtn, () => {
  openMarkerModal();
});

bindTapOrClick(modalCancelBtn, () => {
  modalOverlay.style.display = 'none';
});

bindTapOrClick(modalSubmitBtn, () => {
  const title = inputTitle.value.trim() || 'Custom Landmark';
  const desc = inputDesc.value.trim();
  const lat = parseFloat(inputLat.value);
  const lon = parseFloat(inputLon.value);
  const targetAlt = parseFloat(inputAlt.value) || 0;
  const color = inputColor.value;

  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid numerical latitude and longitude.');
    return;
  }

  if (!locarInstance) {
    alert('AR system is not running yet.');
    return;
  }

  // Calculate relative 3D height in camera scene:
  // If player is at 390m and marker is placed at 400m, relative height is +10m in the air!
  const playerAlt = currentAlt !== null ? currentAlt : 0;
  const relativeY = targetAlt - playerAlt;

  const markerObj = createInteractiveMarker({
    title,
    description: desc,
    lat,
    lon,
    alt: targetAlt,
    colorHex: color
  });

  // Add to locar at calculated relative elevation
  locarInstance.add(markerObj, lon, lat, relativeY);
  allCustomMarkers.push({ group: markerObj, lat, lon, targetAlt });

  modalOverlay.style.display = 'none';
  statusText.innerText = `Placed "${title}" at ${lat.toFixed(4)}, ${lon.toFixed(4)} (Alt ${Math.round(targetAlt)}m)`;
});

// Update custom markers' relative Y position if player altitude changes
function updateCustomMarkersElevation(playerAlt) {
  if (playerAlt === null) return;
  for (const item of allCustomMarkers) {
    item.group.position.y = item.targetAlt - playerAlt;
  }
}

// Update cardinal markers so they constantly follow the player (~20 meters away)
function updateCardinalPositions(playerLat, playerLon) {
  if (!locarInstance || playerLat === null || playerLon === null) return;

  const latOffset = 0.00018; // ~20m North / South
  const lonOffset = 0.00018 / Math.cos((playerLat * Math.PI) / 180); // ~20m East / West

  const cardinals = [
    { key: 'N', title: 'NORTH', desc: 'True North (~20m ahead)', lat: playerLat + latOffset, lon: playerLon, color: 0xff4757 },
    { key: 'S', title: 'SOUTH', desc: 'True South (~20m behind)', lat: playerLat - latOffset, lon: playerLon, color: 0x3742fa },
    { key: 'E', title: 'EAST', desc: 'True East (~20m right)', lat: playerLat, lon: playerLon + lonOffset, color: 0xffa502 },
    { key: 'W', title: 'WEST', desc: 'True West (~20m left)', lat: playerLat, lon: playerLon - lonOffset, color: 0x2ed573 }
  ];

  for (const c of cardinals) {
    if (!cardinalMarkers[c.key]) {
      const marker = createInteractiveMarker({
        title: c.title,
        description: c.desc,
        lat: c.lat,
        lon: c.lon,
        alt: currentAlt !== null ? currentAlt : 0,
        colorHex: c.color,
        isCardinal: true
      });
      locarInstance.add(marker, c.lon, c.lat, 0);
      cardinalMarkers[c.key] = marker;
    } else {
      try {
        const [x, z] = locarInstance.lonLatToWorldCoords(c.lon, c.lat);
        const marker = cardinalMarkers[c.key];
        marker.position.x = x;
        marker.position.z = z;
        marker.position.y = 0; // eye/ground level
        marker.userData.lat = c.lat;
        marker.userData.lon = c.lon;
        marker.userData.alt = currentAlt !== null ? currentAlt : 0;
      } catch (e) {
        // origin not determined yet
      }
    }
  }
}

startBtn.addEventListener('click', async () => {
  overlay.style.display = 'none';
  statusText.innerText = 'Requesting camera & sensor permissions...';

  // Request iOS DeviceOrientation/Motion permission if required
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permissionState = await DeviceOrientationEvent.requestPermission();
      if (permissionState !== 'granted') {
        alert('Permission for device orientation was denied');
      }
    } catch (err) {
      console.warn('DeviceOrientation permission request error:', err);
    }
  }

  // Device Motion (Accelerometer)
  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (acc) {
      if (acc.x !== null) elAx.innerText = acc.x.toFixed(2);
      if (acc.y !== null) elAy.innerText = acc.y.toFixed(2);
      if (acc.z !== null) elAz.innerText = acc.z.toFixed(2);
    }
  });

  // Device Orientation (Compass Heading / Angles)
  window.addEventListener('deviceorientation', (event) => {
    let heading = null;

    if (typeof event.webkitCompassHeading !== 'undefined') {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      heading = (360 - event.alpha) % 360;
    }

    if (heading !== null) {
      const cardinal = getCardinalDirection(heading);
      headingValue.innerText = `${Math.round(heading)}° ${cardinal}`;
      compassDial.style.transform = `rotate(${-heading}deg)`;
    }

    if (event.alpha !== null) elAlpha.innerText = event.alpha.toFixed(1);
    if (event.beta !== null) elBeta.innerText = event.beta.toFixed(1);
    if (event.gamma !== null) elGamma.innerText = event.gamma.toFixed(1);
  });

  try {
    const app = new App({
      gpsOptions: {
        gpsMinAccuracy: 1000,
        gpsMinDistance: 0
      }
    });
    appInstance = app;
    const locar = await app.start();
    locarInstance = locar;

    // Ensure three.js canvas doesn't block touch/clicks on HUD action buttons
    if (app.renderer && app.renderer.domElement) {
      app.renderer.domElement.style.zIndex = '1';
    }

    // Scene lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    app.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0, 10, 5);
    app.scene.add(dirLight);

    // Click / Tap Raycaster to inspect markers
    const raycaster = new THREE.Raycaster();
    const touchCoords = new THREE.Vector2();

    const handleTap = (clientX, clientY) => {
      touchCoords.x = (clientX / window.innerWidth) * 2 - 1;
      touchCoords.y = -(clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(touchCoords, app.camera);
      const intersects = raycaster.intersectObjects(interactiveMarkers, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object && hit.object.userData && hit.object.userData.title) {
          showMarkerDetails(hit.object.userData);
        }
      }
    };

    window.addEventListener('click', (e) => {
      // Don't intercept if clicking buttons or modals
      if (e.target.closest('#hud-top') || e.target.closest('#action-bar') || e.target.closest('#modal-overlay') || e.target.closest('#marker-info-card')) {
        return;
      }
      handleTap(e.clientX, e.clientY);
    });

    // Handle GPS coordinate update
    const handleGpsUpdate = (coords) => {
      if (!coords) return;
      currentLat = coords.latitude;
      currentLon = coords.longitude;
      
      // Store actual measured altitude if provided by device GPS
      if (coords.altitude !== null && !isNaN(coords.altitude)) {
        currentAlt = coords.altitude;
        elAlt.innerText = `${Math.round(currentAlt)}m`;
      }

      const acc = coords.accuracy;

      if (currentLat != null) elLat.innerText = currentLat.toFixed(5);
      if (currentLon != null) elLon.innerText = currentLon.toFixed(5);
      if (acc != null) elAcc.innerText = `±${Math.round(acc)}m`;

      statusText.innerText = `GPS Active (±${Math.round(acc || 0)}m)`;

      // Dynamic repositioning of cardinal coordinates
      updateCardinalPositions(currentLat, currentLon);

      // Adjust custom markers if altitude shifted
      updateCustomMarkersElevation(currentAlt);
    };

    // 1. Browser Geolocation watcher
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => handleGpsUpdate(pos.coords),
        (err) => {
          console.warn('Direct geolocation error:', err);
          statusText.innerText = `GPS Warning: ${err.message}`;
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }

    // 2. LocAR GPS listener
    locar.on('gpsupdate', (data) => {
      const coords = data?.position?.coords || data?.coords;
      handleGpsUpdate(coords);
    });

    locar.on('gpserror', (err) => {
      console.warn('LocAR GPS Error:', err);
      statusText.innerText = `LocAR GPS: ${err.message || err}`;
    });

    await locar.startGps();
  } catch (err) {
    console.error('AR initialization error:', err);
    statusText.innerText = `Error: ${err.message || err.code || err}`;
    alert(`Could not start AR: ${err.message || err.code || err}`);
    overlay.style.display = 'flex';
  }
});

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
const markerList = document.getElementById('marker-list');

// Global State
let currentLat = null;
let currentLon = null;
let currentAlt = null;
let locarInstance = null;
let appInstance = null;
const interactiveMarkers = []; // Stores meshes eligible for tap
const allCustomMarkers = []; // { id, group, lat, lon, alt, title, description, colorHex }
const markerStorageKey = 'iara-custom-markers-v1';

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

function formatCoordinate(value, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number(value).toFixed(digits);
}

function formatAltitude(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${Number(value).toFixed(1)}m`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function getBearingDegrees(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  let bearing = Math.atan2(y, x);
  bearing = toDeg(bearing);
  return (bearing + 360) % 360;
}

function getCompassLabel(angle) {
  if (angle === null || !Number.isFinite(angle)) return '—';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(angle / 45) % 8;
  return directions[idx];
}

function persistCustomMarkers() {
  const snapshot = allCustomMarkers.map(({ title, description, lat, lon, alt, colorHex }) => ({
    title,
    description,
    lat,
    lon,
    alt,
    colorHex
  }));
  localStorage.setItem(markerStorageKey, JSON.stringify(snapshot));
}

function removeMarkerFromList(markerId) {
  const markerIndex = allCustomMarkers.findIndex((marker) => marker.id === markerId);
  if (markerIndex === -1) return;

  const [markerToRemove] = allCustomMarkers.splice(markerIndex, 1);
  if (markerToRemove?.group) {
    if (markerToRemove.group.children) {
      markerToRemove.group.children.forEach((child) => {
        const idx = interactiveMarkers.indexOf(child);
        if (idx !== -1) interactiveMarkers.splice(idx, 1);
      });
    }
    if (locarInstance) {
      try {
        locarInstance.remove(markerToRemove.group);
      } catch (err) {
        console.warn('Marker removal failed:', err);
      }
    }
  }

  persistCustomMarkers();
  updateMarkerList();
}

function updateMarkerList() {
  if (!markerList) return;

  if (!allCustomMarkers.length) {
    markerList.innerHTML = '<div class="marker-list-sub">No saved markers yet.</div>';
    return;
  }

  markerList.innerHTML = allCustomMarkers.map((marker) => {
    const distance = currentLat !== null && currentLon !== null
      ? getDistanceMeters(currentLat, currentLon, marker.lat, marker.lon)
      : null;
    const distanceText = distance !== null ? formatDistance(distance) : 'Awaiting GPS';
    return `
      <div class="marker-list-item" data-id="${marker.id}">
        <div class="marker-list-meta">
          <div class="marker-list-name">${marker.title}</div>
          <div class="marker-list-sub">${distanceText} • ${formatCoordinate(marker.lat, 5)}, ${formatCoordinate(marker.lon, 5)}</div>
        </div>
        <button class="marker-list-delete" data-delete-id="${marker.id}" type="button">Delete</button>
      </div>
    `;
  }).join('');

  markerList.querySelectorAll('.marker-list-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('.marker-list-delete')) return;
      const marker = allCustomMarkers.find((entry) => entry.id === item.dataset.id);
      if (marker) showMarkerDetails(marker.group.userData);
    });
  });

  markerList.querySelectorAll('.marker-list-delete').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      removeMarkerFromList(button.dataset.deleteId);
    });
  });
}

function getMarkerRelativeAltitude(altitude) {
  if (currentAlt === null || currentAlt === undefined || !Number.isFinite(currentAlt)) {
    return altitude || 0;
  }
  return (Number(altitude) || 0) - currentAlt;
}

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
  if (!data) return;

  const distance = currentLat !== null && currentLon !== null
    ? getDistanceMeters(currentLat, currentLon, data.lat, data.lon)
    : null;
  const bearing = currentLat !== null && currentLon !== null
    ? getBearingDegrees(currentLat, currentLon, data.lat, data.lon)
    : null;

  markerInfoTitle.innerText = data.title;
  markerInfoDesc.innerText = data.description;
  const distanceText = distance !== null ? ` | Dist: ${formatDistance(distance)} | Bearing: ${getCompassLabel(bearing)}` : '';
  markerInfoCoords.innerText = `Lat: ${formatCoordinate(data.lat, 6)} | Lon: ${formatCoordinate(data.lon, 6)} | Alt: ${formatAltitude(data.alt)}${distanceText}`;
  markerInfoCard.style.display = 'block';
}

function addMarkerToScene({ title, description, lat, lon, alt, colorHex, persist = true }) {
  const markerObj = createInteractiveMarker({
    title,
    description,
    lat,
    lon,
    alt,
    colorHex
  });

  const relativeY = getMarkerRelativeAltitude(alt);
  locarInstance.add(markerObj, lon, lat, relativeY);

  const markerRecord = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    group: markerObj,
    title,
    description,
    lat,
    lon,
    alt,
    colorHex
  };

  allCustomMarkers.push(markerRecord);
  if (persist) persistCustomMarkers();
  updateMarkerList();
  return markerRecord;
}

function updateCustomMarkerHeights() {
  if (!allCustomMarkers.length || currentAlt === null || currentAlt === undefined || !Number.isFinite(currentAlt)) return;

  allCustomMarkers.forEach((marker) => {
    if (marker.group) {
      marker.group.position.y = getMarkerRelativeAltitude(marker.alt);
    }
  });
}

function restoreSavedMarkers() {
  if (!locarInstance) return;

  try {
    const raw = localStorage.getItem(markerStorageKey);
    if (!raw) return;
    const savedMarkers = JSON.parse(raw);
    if (!Array.isArray(savedMarkers)) return;

    savedMarkers.forEach((item) => {
      if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
      addMarkerToScene({
        title: item.title || 'Saved Marker',
        description: item.description || 'Saved from a previous session.',
        lat: Number(item.lat),
        lon: Number(item.lon),
        alt: Number(item.alt) || 0,
        colorHex: item.colorHex || '#00e5ff',
        persist: false
      });
    });
  } catch (err) {
    console.warn('Could not restore saved markers:', err);
  }
}

// Open modal for adding a marker
function openMarkerModal(prefillLat = null, prefillLon = null, prefillAlt = 0) {
  inputTitle.value = '';
  inputDesc.value = '';
  inputLat.value = prefillLat !== null ? prefillLat.toFixed(5) : (currentLat !== null ? currentLat.toFixed(5) : '');
  inputLon.value = prefillLon !== null ? prefillLon.toFixed(5) : (currentLon !== null ? currentLon.toFixed(5) : '');
  const defaultAlt = prefillAlt !== null && prefillAlt !== undefined && Number.isFinite(prefillAlt)
    ? prefillAlt
    : (currentAlt !== null && currentAlt !== undefined && Number.isFinite(currentAlt) ? currentAlt : 0);
  inputAlt.value = defaultAlt;
  modalOverlay.style.display = 'flex';
}

// Button Listeners (supporting click and touchstart for instant response)
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
  const alt = parseFloat(inputAlt.value) || 0;
  const color = inputColor.value;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    alert('Please enter valid numerical latitude and longitude.');
    return;
  }

  if (!locarInstance) {
    alert('AR system is not running yet.');
    return;
  }

  addMarkerToScene({
    title,
    description: desc,
    lat,
    lon,
    alt,
    colorHex: color
  });

  modalOverlay.style.display = 'none';
  statusText.innerText = `Placed "${title}" at ${formatCoordinate(lat, 5)}, ${formatCoordinate(lon, 5)} (Alt ${formatAltitude(alt)})`;
});

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
      // First time create
      const marker = createInteractiveMarker({
        title: c.title,
        description: c.desc,
        lat: c.lat,
        lon: c.lon,
        alt: 0,
        colorHex: c.color,
        isCardinal: true
      });
      locarInstance.add(marker, c.lon, c.lat, 0);
      cardinalMarkers[c.key] = marker;
    } else {
      // Reposition in world coords relative to current GPS origin
      try {
        const [x, z] = locarInstance.lonLatToWorldCoords(c.lon, c.lat);
        const marker = cardinalMarkers[c.key];
        marker.position.x = x;
        marker.position.z = z;
        marker.userData.lat = c.lat;
        marker.userData.lon = c.lon;
      } catch (e) {
        // origin not set yet
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
    restoreSavedMarkers();

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
      currentLat = Number.isFinite(coords.latitude) ? coords.latitude : null;
      currentLon = Number.isFinite(coords.longitude) ? coords.longitude : null;
      currentAlt = Number.isFinite(coords.altitude) ? coords.altitude : null;
      const acc = Number.isFinite(coords.accuracy) ? coords.accuracy : null;

      if (currentLat != null) elLat.innerText = formatCoordinate(currentLat, 6);
      if (currentLon != null) elLon.innerText = formatCoordinate(currentLon, 6);
      elAlt.innerText = currentAlt !== null ? formatAltitude(currentAlt) : 'N/A';
      elAcc.innerText = acc !== null ? `±${Math.round(acc)}m` : 'N/A';

      statusText.innerText = acc !== null ? `GPS Active (±${Math.round(acc)}m)` : 'GPS Active';

      updateCustomMarkerHeights();
      updateMarkerList();
      updateCardinalPositions(currentLat, currentLon);
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

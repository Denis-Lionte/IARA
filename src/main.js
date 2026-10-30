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

// State
let currentLat = null;
let currentLon = null;
let currentAlt = 0;
let locarInstance = null;
let appInstance = null;
const interactiveMarkers = []; // Stores meshes eligible for raycasting / tap

markerInfoClose.addEventListener('click', () => {
  markerInfoCard.style.display = 'none';
});

// Convert heading degrees to Cardinal abbreviation
function getCardinalDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
  return directions[index];
}

// Generate a 3D Marker with customizable title, description, and color
function createInteractiveMarker({ title, description, lat, lon, alt = 0, colorHex = 0x00e5ff }) {
  const group = new THREE.Group();

  // Vertical pole
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.5, 16);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.y = 1.75;
  group.add(poleMesh);

  // Top sphere pin
  const sphereGeo = new THREE.SphereGeometry(0.85, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.45,
    roughness: 0.2
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.y = 3.8;
  group.add(sphereMesh);

  // Billboard sprite with title
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Background bubble
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 364, 140, 24);
  ctx.fill();
  ctx.strokeStyle = typeof colorHex === 'number' ? `#${colorHex.toString(16).padStart(6, '0')}` : colorHex;
  ctx.lineWidth = 6;
  ctx.stroke();

  // Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayTitle = title.length > 18 ? title.slice(0, 16) + '...' : title;
  ctx.fillText(displayTitle, 192, 60);

  // Subtext hint
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  ctx.fillText('Tap for info', 192, 108);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3.2, 1.33, 1);
  sprite.position.y = 5.4;
  group.add(sprite);

  // Attach metadata to group and all child meshes
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

// Display the Info Card for a tapped marker
function showMarkerDetails(data) {
  markerInfoTitle.innerText = data.title;
  markerInfoDesc.innerText = data.description;
  markerInfoCoords.innerText = `Lat: ${data.lat.toFixed(5)} | Lon: ${data.lon.toFixed(5)} | Alt: ${data.alt}m`;
  markerInfoCard.style.display = 'block';
}

// Open modal for adding a marker
function openMarkerModal(prefillLat = null, prefillLon = null, prefillAlt = 0) {
  inputTitle.value = '';
  inputDesc.value = '';
  inputLat.value = prefillLat !== null ? prefillLat.toFixed(5) : (currentLat !== null ? currentLat.toFixed(5) : '');
  inputLon.value = prefillLon !== null ? prefillLon.toFixed(5) : (currentLon !== null ? currentLon.toFixed(5) : '');
  inputAlt.value = prefillAlt || 0;
  modalOverlay.style.display = 'flex';
}

addMarkerBtn.addEventListener('click', () => {
  if (currentLat === null || currentLon === null) {
    alert('Waiting for GPS lock before placing at current location...');
    return;
  }
  openMarkerModal(currentLat, currentLon, currentAlt);
});

customCoordsBtn.addEventListener('click', () => {
  openMarkerModal();
});

modalCancelBtn.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
});

modalSubmitBtn.addEventListener('click', () => {
  const title = inputTitle.value.trim() || 'Custom Landmark';
  const desc = inputDesc.value.trim();
  const lat = parseFloat(inputLat.value);
  const lon = parseFloat(inputLon.value);
  const alt = parseFloat(inputAlt.value) || 0;
  const color = inputColor.value;

  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid numerical latitude and longitude coordinates.');
    return;
  }

  if (!locarInstance) {
    alert('AR system is not running yet.');
    return;
  }

  // Create marker and add to LocAR geospatial scene
  const markerObj = createInteractiveMarker({
    title,
    description: desc,
    lat,
    lon,
    alt,
    colorHex: color
  });

  locarInstance.add(markerObj, lon, lat, alt);
  modalOverlay.style.display = 'none';
  statusText.innerText = `Placed "${title}" at ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
});

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

  // Set up Device Motion (Accelerometer) listener
  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (acc) {
      if (acc.x !== null) elAx.innerText = acc.x.toFixed(2);
      if (acc.y !== null) elAy.innerText = acc.y.toFixed(2);
      if (acc.z !== null) elAz.innerText = acc.z.toFixed(2);
    }
  });

  // Set up Device Orientation (Compass Heading / Angles) listener
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
      // Don't intercept if clicking HUD UI elements
      if (e.target.closest('#hud-top') || e.target.closest('#action-bar') || e.target.closest('#modal-overlay') || e.target.closest('#marker-info-card')) {
        return;
      }
      handleTap(e.clientX, e.clientY);
    });

    let cardinalPlaced = false;

    // Helper to update GPS UI and spawn initial cardinal coordinates
    const handleGpsUpdate = (coords) => {
      if (!coords) return;
      currentLat = coords.latitude;
      currentLon = coords.longitude;
      currentAlt = coords.altitude || 0;
      const acc = coords.accuracy;

      if (currentLat != null) elLat.innerText = currentLat.toFixed(5);
      if (currentLon != null) elLon.innerText = currentLon.toFixed(5);
      if (coords.altitude != null) elAlt.innerText = `${Math.round(coords.altitude)}m`;
      else elAlt.innerText = 'N/A';
      if (acc != null) elAcc.innerText = `±${Math.round(acc)}m`;

      statusText.innerText = `GPS Active (±${Math.round(acc || 0)}m)`;

      // Place 4 3D Cardinal Coordinate markers once we get initial location
      if (!cardinalPlaced && currentLat != null && currentLon != null) {
        const latOffset = 0.00018; // ~20 meters
        const lonOffset = 0.00018 / Math.cos((currentLat * Math.PI) / 180);

        // North
        const markerN = createInteractiveMarker({
          title: 'NORTH',
          description: 'True North direction (~20m distance)',
          lat: currentLat + latOffset,
          lon: currentLon,
          alt: 0,
          colorHex: 0xff4757
        });
        locar.add(markerN, currentLon, currentLat + latOffset, 0);

        // South
        const markerS = createInteractiveMarker({
          title: 'SOUTH',
          description: 'True South direction (~20m distance)',
          lat: currentLat - latOffset,
          lon: currentLon,
          alt: 0,
          colorHex: 0x3742fa
        });
        locar.add(markerS, currentLon, currentLat - latOffset, 0);

        // East
        const markerE = createInteractiveMarker({
          title: 'EAST',
          description: 'True East direction (~20m distance)',
          lat: currentLat,
          lon: currentLon + lonOffset,
          alt: 0,
          colorHex: 0xffa502
        });
        locar.add(markerE, currentLon + lonOffset, currentLat, 0);

        // West
        const markerW = createInteractiveMarker({
          title: 'WEST',
          description: 'True West direction (~20m distance)',
          lat: currentLat,
          lon: currentLon - lonOffset,
          alt: 0,
          colorHex: 0x2ed573
        });
        locar.add(markerW, currentLon - lonOffset, currentLat, 0);

        cardinalPlaced = true;
        statusText.innerText = 'Cardinal markers placed ~20m around you! Tap any marker to view info.';
      }
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

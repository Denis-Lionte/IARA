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

// Convert heading degrees to Cardinal abbreviation
function getCardinalDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
  return directions[index];
}

// Generate a 3D Cardinal Pin / Marker with a text label
function createCardinalMarker(text, colorHex) {
  const group = new THREE.Group();

  // Vertical pole
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.5, 16);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.y = 1.75;
  group.add(poleMesh);

  // Colored sphere on top
  const sphereGeo = new THREE.SphereGeometry(0.8, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.45,
    roughness: 0.2
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.y = 3.6;
  group.add(sphereMesh);

  // Canvas billboard with cardinal letter
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(16, 16, 224, 224, 32);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2.4, 2.4, 1);
  sprite.position.y = 5.2;
  group.add(sprite);

  return group;
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
    // Pass generous GPS accuracy threshold so indoor/initial readings aren't rejected
    const app = new App({
      gpsOptions: {
        gpsMinAccuracy: 1000,
        gpsMinDistance: 0
      }
    });
    const locar = await app.start();

    // Scene lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    app.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0, 10, 5);
    app.scene.add(dirLight);

    let markersPlaced = false;

    // Helper to update GPS UI and spawn markers
    const handleGpsUpdate = (coords) => {
      if (!coords) return;
      const lat = coords.latitude;
      const lon = coords.longitude;
      const alt = coords.altitude;
      const acc = coords.accuracy;

      if (lat != null) elLat.innerText = lat.toFixed(5);
      if (lon != null) elLon.innerText = lon.toFixed(5);
      if (alt != null) elAlt.innerText = `${Math.round(alt)}m`;
      else elAlt.innerText = 'N/A';
      if (acc != null) elAcc.innerText = `±${Math.round(acc)}m`;

      statusText.innerText = `GPS Active (±${Math.round(acc || 0)}m)`;

      // Place 4 3D Cardinal Coordinate markers once we get initial location
      if (!markersPlaced && lat != null && lon != null) {
        // ~20 meters offset distance in latitude/longitude
        const latOffset = 0.00018; // ~20 meters
        const lonOffset = 0.00018 / Math.cos((lat * Math.PI) / 180);

        // North (Red)
        const markerN = createCardinalMarker('NORTH', 0xff4757);
        locar.add(markerN, lon, lat + latOffset, 0);

        // South (Blue)
        const markerS = createCardinalMarker('SOUTH', 0x3742fa);
        locar.add(markerS, lon, lat - latOffset, 0);

        // East (Yellow/Orange)
        const markerE = createCardinalMarker('EAST', 0xffa502);
        locar.add(markerE, lon + lonOffset, lat, 0);

        // West (Green)
        const markerW = createCardinalMarker('WEST', 0x2ed573);
        locar.add(markerW, lon - lonOffset, lat, 0);

        markersPlaced = true;
        statusText.innerText = 'Cardinal markers placed ~20m around you!';
      }
    };

    // 1. Direct browser Geolocation watcher (guaranteed immediate updates)
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

    // 2. LocAR event listener (handles both pos and { position } shape)
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

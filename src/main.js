import * as THREE from 'three';
import { App } from 'locar';

const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const statusText = document.getElementById('status-text');

// Telemetry DOM elements
const elLat = document.getElementById('val-lat');
const elLon = document.getElementById('val-lon');
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
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 16);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const poleMesh = new THREE.Mesh(poleGeo, poleMat);
  poleMesh.position.y = 1.5;
  group.add(poleMesh);

  // Colored sphere on top
  const sphereGeo = new THREE.SphereGeometry(0.7, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.35,
    roughness: 0.2
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.y = 3.2;
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
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 130);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2, 2, 1);
  sprite.position.y = 4.6;
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

    // Webkit (iOS Safari) provides compass heading directly
    if (typeof event.webkitCompassHeading !== 'undefined') {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      // Android / standards fallback
      heading = (360 - event.alpha) % 360;
    }

    if (heading !== null) {
      const cardinal = getCardinalDirection(heading);
      headingValue.innerText = `${Math.round(heading)}° ${cardinal}`;
      // Rotate compass dial
      compassDial.style.transform = `rotate(${-heading}deg)`;
    }

    if (event.alpha !== null) elAlpha.innerText = event.alpha.toFixed(1);
    if (event.beta !== null) elBeta.innerText = event.beta.toFixed(1);
    if (event.gamma !== null) elGamma.innerText = event.gamma.toFixed(1);
  });

  try {
    const app = new App({});
    const locar = await app.start();

    // Scene lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    app.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0, 10, 5);
    app.scene.add(dirLight);

    let markersPlaced = false;

    // GPS updates
    locar.on('gpsupdate', (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      elLat.innerText = lat.toFixed(5);
      elLon.innerText = lon.toFixed(5);
      elAcc.innerText = `±${Math.round(acc)}m`;

      statusText.innerText = `GPS Active (±${Math.round(acc)}m)`;

      // Place 4 3D Cardinal Coordinate markers once we get initial location
      if (!markersPlaced) {
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
    });

    locar.on('gpserror', (err) => {
      statusText.innerText = `GPS Error: ${err.message}`;
    });

    await locar.startGps();
  } catch (err) {
    console.error('AR initialization error:', err);
    statusText.innerText = `Error: ${err.message || err.code || err}`;
    alert(`Could not start AR: ${err.message || err.code || err}`);
    overlay.style.display = 'flex';
  }
});

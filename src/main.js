import * as THREE from 'three';
import { App } from 'locar';

const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const infoPanel = document.getElementById('info-panel');

startBtn.addEventListener('click', async () => {
  overlay.style.display = 'none';
  infoPanel.innerText = 'Initializing camera and sensors...';

  try {
    const app = new App({});
    const locar = await app.start();

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    app.scene.add(ambientLight);

    // Create a 3D Object (Box representing a Point of Interest)
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshNormalMaterial();
    const poiMesh = new THREE.Mesh(geometry, material);

    let poiPlaced = false;

    // Track GPS Location
    locar.on('gpsupdate', (pos) => {
      infoPanel.innerText = `GPS: Lat ${pos.coords.latitude.toFixed(5)}, Lon ${pos.coords.longitude.toFixed(5)}`;

      if (!poiPlaced) {
        const offsetLat = pos.coords.latitude + 0.00015; // ~16m North
        const offsetLon = pos.coords.longitude;
        locar.add(poiMesh, offsetLon, offsetLat, 0);
        poiPlaced = true;
        infoPanel.innerText += ' | Target placed ~16m ahead';
      }
    });

    locar.on('gpserror', (err) => {
      infoPanel.innerText = `GPS Error: ${err.message}`;
    });

    await locar.startGps();
  } catch (err) {
    console.error('AR initialization error:', err);
    infoPanel.innerText = `Initialization error: ${err.message || err.code || err}`;
    alert(`Could not start AR: ${err.message || err.code || err}`);
    overlay.style.display = 'flex';
  }
});
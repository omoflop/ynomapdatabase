// ==UserScript==
// @name        Yume Nikki Online Minimap for 2kki
// @namespace   omo
// @match       https://ynoproject.net/*
// @grant       none
// @version     1.0
// @author      omoflop
// @description 1/5/2025, 6:39:47 PM
// ==/UserScript==

const minimapButtonHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M4 12L20 12M12 4L12 20M6.2 20H17.8C18.9201 20 19.4802 20 19.908 19.782C20.2843 19.5903 20.5903 19.2843 20.782 18.908C21 18.4802 21 17.9201 21 16.8V7.2C21 6.0799 21 5.51984 20.782 5.09202C20.5903 4.71569 20.2843 4.40973 19.908 4.21799C19.4802 4 18.9201 4 17.8 4H6.2C5.0799 4 4.51984 4 4.09202 4.21799C3.71569 4.40973 3.40973 4.71569 3.21799 5.09202C3 5.51984 3 6.07989 3 7.2V16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.71569 19.5903 4.09202 19.782C4.51984 20 5.07989 20 6.2 20Z" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
const updatesPerSecond = 60

const minimapToggleButton = document.createElement("button");
minimapToggleButton.classList.add("iconButton");
minimapToggleButton.innerHTML = minimapButtonHTML;
minimapToggleButton.style.display = 'none'

minimapToggleButton.onclick = function() {
  mapForceHidden = !mapForceHidden;

  if (mapForceHidden) {
      document.getElementById("locationLabel").textContent = `Location:`;
  }

}

document.getElementById("rightControls").insertBefore(minimapToggleButton, document.getElementById("controls-fullscreen"));

const mapCanvas = document.createElement("canvas")
mapCanvas.width = 512;
mapCanvas.height = 512;

mapCanvas.style.marginBottom = '10px';
mapCanvas.style.userSelect = 'none';
mapCanvas.style.display = 'none'

// Insert minimap above chat
document.getElementById("chatbox").insertBefore(mapCanvas, document.getElementById("chatboxContent"))

var mapMouseDown = false;
var mouseOffsetX = 0;
var mouseOffsetY = 0;
var imagePanX = 0;
var imagePanY = 0;
var zoom = 1;

var canvasMouseX = 0;
var canvasMouseY = 0;

const ctx = mapCanvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
var previousMap = null

var mapImage = undefined;
var mapImageReady = false

const assetServerAddress = "https://raw.githubusercontent.com/omoflop/ynomapdatabase/refs/heads/main/maps";
const assetServerAddressSuffix = "?not-from-cache-please";
var mapLoopType = "none"
var mapTeleports = [];

var px = 0
var py = 0
var lockedOnPlayer = true;
var mapForceHidden = true;

var pingX = undefined;
var pingY = undefined;

const pings = [];

function addPing(mapId, x, y, expireAt) {
  pings.add({
    x: x,
    y: y,
    mapId: mapId,
    expireAt: expireAt
  })
}

mapCanvas.addEventListener("wheel", function(event) {
  var isZoomingIn = event.deltaY < 0;
  var rect = mapCanvas.getBoundingClientRect()
  var mouseX = event.offsetX * mapCanvas.width / rect.width;
  var mouseY = event.offsetY * mapCanvas.height / rect.height;
  var zoomFactor = isZoomingIn ? 2 : 0.5;

  var worldMouseX = (mouseX - imagePanX) / zoom;
  var worldMouseY = (mouseY - imagePanY) / zoom;

  zoom *= zoomFactor;

  imagePanX = mouseX - worldMouseX * zoom;
  imagePanY = mouseY - worldMouseY * zoom;
  event.preventDefault();
});

mapCanvas.addEventListener("mousedown", function(event) {
  if (event.button == 0) {
    mapMouseDown = true;
    mouseOffsetX = event.clientX - imagePanX;
    mouseOffsetY = event.clientY - imagePanY;
    lockedOnPlayer = false;
  } else if (event.button == 1) {
    var rect = mapCanvas.getBoundingClientRect()
    var mouseX = event.offsetX * mapCanvas.width / rect.width;
    var mouseY = event.offsetY * mapCanvas.height / rect.height;
    var worldMouseX = (mouseX - imagePanX) / zoom;
    var worldMouseY = (mouseY - imagePanY) / zoom;
    pingX = worldMouseX;
    pingY = worldMouseY;
  }
});

mapCanvas.addEventListener("contextmenu", function(event) {
  lockedOnPlayer = true;
  event.preventDefault();
});

document.addEventListener("mouseup", function(event) {
   mapMouseDown = false;
});

document.addEventListener("mousemove", function(event) {
  if (mapMouseDown) {
    imagePanX = event.clientX - mouseOffsetX;
    imagePanY = event.clientY - mouseOffsetY;
  }

  var rect = mapCanvas.getBoundingClientRect()
  var mouseX = event.offsetX * mapCanvas.width / rect.width;
  var mouseY = event.offsetY * mapCanvas.height / rect.height;
  canvasMouseX = (mouseX - imagePanX) / zoom;
  canvasMouseY = (mouseY - imagePanY) / zoom;
});


function update() {
  try {
    let mapId = getMapId()
    if (mapId != null) {
      let temp = getPlayerPos()
      updateMap(mapId, temp[0], temp[1]);
      if (!mapForceHidden) {
        document.getElementById("locationLabel").textContent = `Location: (${mapId}, ${temp[0]}, ${temp[1]})`;
      }
    }
  } catch (e) {
    console.log("Not in game yet", e)
  } finally {

  }
  setTimeout(update, 1000 / updatesPerSecond)
}

function centerOnPlayer() {
    // Calculate the center of the viewport
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;

    // Update pan values to center on player position
    imagePanX = centerX - (px + 8) * zoom;
    imagePanY = centerY - (py + 8) * zoom;
}

function updateMap(mapId, playerX, playerY) {
  if (previousMap != mapId) {
    console.log(`New Map Loaded: ${mapId} (prev ${previousMap})`)
    loadMapImage(mapId);
    px = playerX*16;
    py = playerY*16;
  }
  previousMap = mapId;

  mapCanvas.style.display = mapForceHidden || !mapImageReady ? 'none' : '';

  // Update player position if they're too far
  if (dist(playerX*16, px, playerY*16, py) > 16 * 4) {
    px = playerX*16;
    py = playerY*16;
  }

  px = approach(px, playerX*16, 2)
  py = approach(py, playerY*16, 2)

  if (lockedOnPlayer)
    centerOnPlayer();

  // Clear the entire canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
  ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

  // Set up the transform for this frame
  ctx.setTransform(
    zoom, 0,    // Scale X
    0, zoom,    // Scale Y
    imagePanX,  // Translate X
    imagePanY   // Translate Y
  );

  if (mapImageReady) {
    let xx = 0;
    let yy = 0;
    if (mapLoopType == "both" || mapLoopType == "horizontal") xx = 1;
    if (mapLoopType == "both" || mapLoopType == "vertical") yy = 1;

    let pingExists = pingX != undefined && pingY != undefined;
    let closestPingX = pingX
    let closestPingY = pingY
    let closestDist = 99999;
    for (let x = -xx; x <= xx; x++) {
      for (let y = -yy; y <= yy; y++) {
        ctx.drawImage(
          mapImage,
          mapImage.width * x,
          mapImage.height * y,
          mapImage.width,
          mapImage.height
        );

        let loopedPingX = pingX + mapImage.width * x;
        let loopedPingY = pingY + mapImage.height * y;

        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(loopedPingX, loopedPingY, 8, 0, Math.PI * 2);
        ctx.fill();

        if (pingExists) {
          let pingDist = dist(px, loopedPingX, py, loopedPingY);
          if (pingDist < closestDist) {
            closestPingX = loopedPingX;
            closestPingY = loopedPingY;
            closestDist = pingDist;
          }
        }


        mapTeleports.forEach(teleportData => {
            ctx.fillStyle = "green";
            ctx.beginPath();
            ctx.arc(teleportData.x*16 + 8 + mapImage.width * x, teleportData.y*16 + 8 + mapImage.height * y, 2, 0, Math.PI * 2);
            ctx.fill();

            let tx = teleportData.x*16 + 8 + mapImage.width * x;
            let ty = teleportData.y*16 + 4 + mapImage.height * y;
            let textSize = 24/zoom;

            // Text settings
            ctx.font = `bold ${Math.round(textSize)}px Arial`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 1;

            let warpText = teleportData.destination_name ?? teleportData.destination_map_id;


            // Draw the outline
            ctx.strokeStyle = 'black';
            ctx.strokeText(warpText, tx, ty);

            // Draw the fill
            ctx.fillStyle = 'white';
            ctx.fillText(warpText, tx, ty);
        });
      }
    }

    if (pingExists) {
        ctx.strokeStyle = "white";
        ctx.beginPath();
        ctx.moveTo(closestPingX, closestPingY);
        ctx.lineTo(px + 8, py + 8);
        ctx.stroke();

        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(closestPingX, closestPingY, 8, 0, Math.PI * 2);  // +8 to center the circle
        ctx.fill();
    }

    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(px + 8, py + 8, 8, 0, Math.PI * 2);  // +8 to center the circle
    ctx.fill();
  }
}

function loadMapImage(mapId) {
  const mapImageUrl = `${assetServerAddress}/${gameId}/${mapId}/map.png${assetServerAddressSuffix}`;
  const mapMetaUrl = `${assetServerAddress}/${gameId}/${mapId}/metadata.json${assetServerAddressSuffix}`;

  mapImageReady = false;
  mapImage = new Image();
  mapImage.crossOrigin = 'anonymous';
  mapImage.onload = function() {
      mapImageReady = true;
      if (!mapForceHidden) {
        mapCanvas.style.display = ''
      }
      minimapToggleButton.style.display = ''
  };
  mapImage.onerror = function() {
    mapCanvas.style.display = 'none'
    minimapToggleButton.style.display = 'none'
    console.log(`Failed to load map from url: ${mapImageUrl}`)
  }
  mapImage.src = mapImageUrl;

   fetch(mapMetaUrl)
    .then(response => {
        if (!response.ok) throw new Error(`Failed to load metadata from url: ${mapMetaUrl}`);
        return response.json();
    })
    .then(data => {
      mapLoopType = data.loop_type ?? "both"
      mapTeleports = data.teleport_data ?? []

      // Attempt to use yno's api to get the location name of each teleport
      for (let i = 0; i < mapTeleports.length; i++) {
        let curTp = mapTeleports[i];
        let temp = getLocalizedMapLocationsHtml(gameId, curTp.destination_map_id, curTp.destination_map_id, curTp.destination_x, curTp.destination_y, '<br>')
        mapTeleports[i].destination_name = temp.substring(temp.indexOf(">")+1, temp.lastIndexOf("<")).replace("Unknown Location", "?");
      }
    })
    .catch(error => {
      console.error('Failed to fetch metadata for map ', mapId);
      mapLoopType = "both"
    });
}

function clamp(a, min, max) {
  if (a > max) return max;
  if (a < min) return min;
  return a;
}

function dist(x1, x2, y1, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function lerp(start, goal, delta) {
  return start + (goal - start) * delta;
}

function approach(val, goal, step) {
  return val < goal ? Math.min(goal, val + step) : Math.max(goal, val - step);
}

function getMapId() {
  return cachedMapId;
}

function getPlayerPos() {
  return easyrpgPlayer.api.getPlayerCoords();
}

setTimeout(update, 1000 / updatesPerSecond);

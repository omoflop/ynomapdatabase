// ==UserScript==
// @name         YnoProject Minimap
// @namespace    https://github.com/omoflop
// @version      2025-01-10
// @description  A live, interactive minimap for ynoproject
// @author       omoflop
// @match        https://ynoproject.net/*
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  // src/lazyimage.ts
  var LazyImage = class {
    value;
    imageReady = false;
    constructor(url = void 0, onLoad = void 0) {
      if (url) this.loadNewImage(url, onLoad);
    }
    loadNewImage(url = void 0, onLoad = void 0) {
      this.imageReady = false;
      this.value = new Image();
      this.value.crossOrigin = "anonymous";
      this.value.onload = () => {
        this.imageReady = true;
        if (values.debug) console.log(`Loaded image from url: ${url}`);
        if (onLoad) onLoad();
      };
      this.value.onerror = () => {
        if (values.debug) console.error(`Failed to load image from url: ${url}`);
      };
      this.value.src = url;
    }
  };

  // src/game.ts
  var isGameLoaded = () => typeof gameId !== "undefined" && typeof cachedMapId !== "undefined" && typeof easyrpgPlayer !== "undefined" && typeof easyrpgPlayer.api !== "undefined";
  var getGameId = () => gameId;
  var getMapId = () => cachedMapId;
  var getPlayerCoords = () => easyrpgPlayer.api.getPlayerCoords();
  var getPrevMapId = () => typeof cachedPrevMapId !== "undefined" ? cachedPrevMapId : "0000";

  // src/util.ts
  var dist = (x1, x2, y1, y2) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };
  var approach = (val, goal, step) => {
    return val < goal ? Math.min(goal, val + step) : Math.max(goal, val - step);
  };
  var wrapText = (text, maxCharsPerLine = 16) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";
    words.forEach((word) => {
      const testLine = currentLine + (currentLine ? " " : "") + word;
      if (testLine.length > maxCharsPerLine && currentLine !== "") {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  };
  var generateRandomColor = () => {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
  };

  // src/minimaptypes.ts
  var areBidirectional = (teleport1, teleport2, currentMapId, maxDistance = 1) => {
    if (teleport1.destination_map_id !== currentMapId || teleport2.destination_map_id !== currentMapId)
      return false;
    const distanceFromT1ToT2Dest = dist(
      teleport1.x,
      teleport2.destination_x,
      teleport1.y,
      teleport2.destination_y
    );
    const distanceFromT2ToT1Dest = dist(
      teleport2.x,
      teleport1.destination_x,
      teleport2.y,
      teleport1.destination_y
    );
    return distanceFromT1ToT2Dest <= maxDistance && distanceFromT2ToT1Dest <= maxDistance;
  };

  // src/minimap.ts
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  canvas.style.userSelect = "none";
  canvas.style.display = "none";
  canvas.style.marginBottom = "2px";
  document.getElementById("chatbox")?.insertBefore(canvas, document.getElementById("chatboxContent"));
  var ctx = canvas.getContext("2d");
  var textLineHeight = ctx.measureText("M").width * 1.5;
  ctx.imageSmoothingEnabled = false;
  var panX = 0;
  var panY = 0;
  var zoom = 1;
  var mouseX = 0;
  var mouseY = 0;
  var panOffsetX = 0;
  var panOffsetY = 0;
  var mouseDown = false;
  var mapImage = new LazyImage();
  var previousMapId = "";
  var displayPlayerX = 0;
  var displayPlayerY = 0;
  var lockOnPlayer = true;
  var loopType = "none" /* None */;
  var exitTeleports = [];
  var mapTeleports = [];
  canvas.addEventListener("wheel", (event) => {
    const rect = canvas.getBoundingClientRect();
    const mx = event.offsetX * canvas.width / rect.width;
    const my = event.offsetY * canvas.height / rect.height;
    const worldMouseX = (mx - panX) / zoom;
    const worldMouseY = (my - panY) / zoom;
    const isZoomingIn = event.deltaY < 0;
    zoom *= isZoomingIn ? 2 : 0.5;
    panX = mx - worldMouseX * zoom;
    panY = my - worldMouseY * zoom;
    event.preventDefault();
  });
  canvas.addEventListener("mousedown", (event) => {
    if (event.button == 0) {
      mouseDown = true;
      panOffsetX = event.clientX - panX;
      panOffsetY = event.clientY - panY;
      lockOnPlayer = false;
    } else if (event.button == 1) {
      const [worldMouseX, worldMouseY] = calculateWorldMousePos(event);
    }
  });
  canvas.addEventListener("contextmenu", (event) => {
    lockOnPlayer = true;
    event.preventDefault();
  });
  document.addEventListener("mouseup", (event) => {
    mouseDown = false;
  });
  document.addEventListener("mousemove", (event) => {
    if (mouseDown) {
      panX = event.clientX - panOffsetX;
      panY = event.clientY - panOffsetY;
    }
    [mouseX, mouseY] = calculateWorldMousePos(event);
  });
  var updateVisbility = () => {
    if (values.hideMinimap || !isGameLoaded()) {
      canvas.style.display = "none";
      if (values.debug) console.log("Minimap hidden. Either Settings.values.hideMinimap is true or the game is not loaded!");
      return;
    }
    if (!(mapImage?.imageReady ?? false) && values.hideMinimapIfNoMap) {
      canvas.style.display = "none";
      if (values.debug) console.log("Minimap hidden. Either the image isn't ready or hideMinimapIfNoMap is true");
      return;
    }
    if (values.debug) console.log("Minimap visible!");
    canvas.style.display = "";
  };
  var centerOnPlayer = () => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    panX = centerX - (displayPlayerX + 8) * zoom;
    panY = centerY - (displayPlayerY + 8) * zoom;
  };
  var update = () => {
    let mapId = getMapId();
    if (mapId && mapId != previousMapId) {
      if (values.debug) console.log(`New map loaded: ${mapId} (prev ${previousMapId})`);
      onMapChanged(mapId);
    }
    previousMapId = mapId;
    let [playerX, playerY] = getPlayerCoords();
    if (dist(playerY * 16, displayPlayerX, playerY * 16, displayPlayerY) > 16 * 4) {
      displayPlayerX = playerX * 16;
      displayPlayerY = playerY * 16;
    }
    const framerateDelta = values.updatesPerSecond / 30;
    displayPlayerX = approach(displayPlayerX, playerX * 16, framerateDelta);
    displayPlayerY = approach(displayPlayerY, playerY * 16, framerateDelta);
    if (lockOnPlayer) centerOnPlayer();
  };
  var draw = () => {
    if (canvas.style.display == "none") return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      zoom,
      0,
      // Scale X
      0,
      zoom,
      // Scale Y
      panX,
      // Translate X
      panY
      // Translate Y
    );
    let xx = 0;
    let yy = 0;
    if (values.enableLooping && mapImage.imageReady) {
      if (loopType == "both" /* Both */ || loopType == "horizontal" /* Horizontal */) xx = 1;
      if (loopType == "both" /* Both */ || loopType == "vertical" /* Vertical */) yy = 1;
    }
    if (mapImage.imageReady) {
      for (let x = -xx; x <= xx; x++)
        for (let y = -yy; y <= yy; y++) {
          const loopX = mapImage.value.width * x;
          const loopY = mapImage.value.height * y;
          ctx.drawImage(mapImage.value, loopX, loopY);
        }
    }
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(displayPlayerX + 8, displayPlayerY + 8, 8, 0, Math.PI * 2);
    ctx.fill();
    for (let x = -xx; x <= xx; x++)
      for (let y = -yy; y <= yy; y++) {
        if (x == 0 && y == 0 || values.showWarpsInLoops && mapImage.imageReady) {
          const loopX = mapImage.value.width * x;
          const loopY = mapImage.value.height * y;
          mapTeleports.forEach((warp) => {
            const warpX = warp.x * 16 + 8 + loopX;
            const warpY = warp.y * 16 + 8 + loopY;
            const warpDestX = warp.destinationX * 16 + 8 + loopX;
            const warpDestY = warp.destinationY * 16 + 8 + loopY;
            ctx.fillStyle = warp.color;
            ctx.beginPath();
            ctx.arc(warpX, warpY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = warp.color;
            ctx.beginPath();
            ctx.arc(warpDestX, warpDestY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = warp.color;
            ctx.beginPath();
            ctx.moveTo(warpX, warpY);
            ctx.lineTo(warpDestX, warpDestY);
            ctx.stroke();
          });
          exitTeleports.forEach((exit) => {
            const tx = exit.x * 16 + 8 + loopX;
            const ty = exit.y * 16 + 8 + loopY;
            let textSize = 18 / zoom;
            ctx.font = `bold ${Math.round(textSize)}px Arial`;
            ctx.textAlign = "center";
            ctx.lineWidth = 1;
            const maxDistance = 200;
            const minScale = 0.5;
            const minAlpha = values.farWarpVisibility;
            exit.destinationNameLines.forEach((text, lineIndex) => {
              const y2 = ty + lineIndex * textLineHeight / zoom;
              const distance = dist(tx, mouseX, y2, mouseY);
              const distanceRatio = Math.min(distance / maxDistance, 1);
              const scale = 1 - distanceRatio * (1 - minScale);
              const alpha = 1 - distanceRatio * (1 - minAlpha);
              ctx.save();
              ctx.translate(tx, y2);
              ctx.scale(scale, scale);
              ctx.translate(-tx, -y2);
              ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
              ctx.strokeText(text, tx, y2);
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.fillText(text, tx, y2);
              ctx.restore();
            });
          });
        }
      }
  };
  var onMapChanged = (mapId) => {
    const gameId2 = getGameId();
    if (values.debug) console.log("Loading new map image");
    mapImage.loadNewImage(`${values.assetServerAddress}/${gameId2}/${mapId}/map.png?idk-what-im-doing`, updateVisbility);
    loopType = "none" /* None */;
    exitTeleports.length = 0;
    mapTeleports.length = 0;
    const [playerX, playerY] = getPlayerCoords();
    const mapMetaUrl = `${values.assetServerAddress}/${gameId2}/${mapId}/metadata.json?idk-what-im-doing`;
    fetch(mapMetaUrl).then((response) => {
      if (!response.ok) throw new Error(`Failed to load metadata from url: ${mapMetaUrl}`);
      return response.json();
    }).then((data) => {
      loopType = data.loop_type ?? "none" /* None */;
      const teleportData = data.teleport_data ?? [];
      const colorMap = /* @__PURE__ */ new Map();
      const processedPairs = /* @__PURE__ */ new Set();
      const MAX_CONNECTED_DISTANCE = 2;
      const mapTeleportData = teleportData.filter(
        (teleport) => teleport.destination_map_id == mapId
      );
      mapTeleportData.forEach((teleport, index) => {
        const teleportKey = `${teleport.x},${teleport.y}`;
        if (processedPairs.has(teleportKey)) return;
        const locationKey = [
          teleport.x,
          teleport.y,
          teleport.destination_x,
          teleport.destination_y
        ].join(",");
        const reverseKey = [
          teleport.destination_x,
          teleport.destination_y,
          teleport.x,
          teleport.y
        ].join(",");
        let color;
        if (colorMap.has(locationKey)) {
          color = colorMap.get(locationKey);
        } else if (colorMap.has(reverseKey)) {
          color = colorMap.get(reverseKey);
        } else {
          color = generateRandomColor();
          colorMap.set(locationKey, color);
        }
        const partner = mapTeleportData.find((otherTeleport, otherIndex) => index !== otherIndex && areBidirectional(teleport, otherTeleport, mapId), MAX_CONNECTED_DISTANCE);
        if (partner) {
          processedPairs.add(teleportKey);
          processedPairs.add(`${partner.x},${partner.y}`);
          mapTeleports.push({
            x: teleport.x,
            y: teleport.y,
            destinationX: partner.x,
            destinationY: partner.y,
            color,
            biDirectional: true
          });
        } else {
          mapTeleports.push({
            x: teleport.x,
            y: teleport.y,
            destinationX: teleport.destination_x,
            destinationY: teleport.destination_y,
            color,
            biDirectional: false
          });
        }
      });
      const exitTeleportData = teleportData.filter(
        (teleport) => teleport.destination_map_id != mapId
      );
      exitTeleportData.forEach((teleport) => {
        const destinationName = teleport.destination_name ? teleport.destination_name : findNameForMap(mapId, playerX, playerY);
        exitTeleports.push({
          x: teleport.x,
          y: teleport.y,
          destinationNameLines: wrapText(destinationName)
        });
      });
    }).catch((error) => {
      if (values.debug) console.error(error);
    });
  };
  var findNameForMap = (mapId, playerX, playerY) => {
    return getLocalizedMapLocations(getGameId(), mapId, getPrevMapId(), playerX, playerY);
  };
  var calculateWorldMousePos = (event) => {
    const rect = canvas.getBoundingClientRect();
    const mx = event.offsetX * canvas.width / rect.width;
    const my = event.offsetY * canvas.height / rect.height;
    var worldMouseX = (mx - panX) / zoom;
    var worldMouseY = (my - panY) / zoom;
    return [worldMouseX, worldMouseY];
  };

  // src/settings.ts
  var intSetting = (name, onChanged = void 0) => {
    return {
      name,
      onChanged,
      type: 0 /* Int */,
      extra: void 0
    };
  };
  var timeSetting = (name, onChanged = void 0) => {
    return {
      name,
      onChanged,
      type: 1 /* Time */,
      extra: void 0
    };
  };
  var boolSetting = (name, onChanged = void 0) => {
    return {
      name,
      onChanged,
      type: 2 /* Bool */,
      extra: void 0
    };
  };
  var textSetting = (name, onChanged = void 0, regex = void 0) => {
    return {
      name,
      onChanged,
      type: 3 /* Text */,
      extra: regex
    };
  };
  var percentSetting = (name, onChanged = void 0) => {
    return {
      name,
      onChanged,
      type: 4 /* Percentage */,
      extra: void 0
    };
  };
  var values = {
    // General
    hideMinimap: false,
    updatesPerSecond: 60,
    enableLooping: true,
    extraLocationInfo: true,
    hideMinimapIfNoMap: true,
    // Pings
    pingLifetime: 10,
    drawLineToPings: true,
    // Warps
    showWarps: true,
    farWarpVisibility: 0.1,
    showWarpsInLoops: true,
    // Party
    partyName: "",
    partyPassword: "",
    // Debug
    debug: true,
    assetServerAddress: "https://raw.githubusercontent.com/omoflop/ynomapdatabase/refs/heads/main/maps"
  };
  var menuMetadata = {
    structure: {
      general: [
        boolSetting("hideMinimap", updateVisbility),
        intSetting("updatesPerSecond"),
        boolSetting("enableLooping"),
        boolSetting("extraLocationInfo", updateExtraLocationInfo),
        boolSetting("hideMinimapIfNoMap", updateVisbility)
      ],
      pings: [
        timeSetting("pingLifetime"),
        boolSetting("drawLineToPings")
      ],
      warps: [
        boolSetting("showWarps"),
        percentSetting("farWarpVisibility"),
        boolSetting("showWarpsInLoops")
      ],
      party: [
        textSetting("partyName"),
        textSetting("partyPassword")
      ],
      debug: [
        boolSetting("debug"),
        textSetting("assetServerAddress")
      ]
    },
    descriptions: {
      // General
      hideMinimap: "Enables/disables the visibility of the minimap",
      updatesPerSecond: "How many times per second the map is refreshed",
      enableLooping: "Should the minimap loop if the current room supports it?",
      extraLocationInfo: "Show extra location info below the minimap, including the map id, and the player's position",
      hideMinimapIfNoMap: "Should the minimap hide if the game map image couldn't be loaded?",
      // Pings
      pingLifetime: "How many seconds pings last before dissapearing",
      drawLineToPings: "Should lines be shown between the player and pings?",
      // Warps
      showWarps: "Should warps be displayed on the minimap?",
      farWarpVisibility: "Determines the visiblility of warps far from the mouse, player, or pings. Ignored if warps are disabled.",
      showWarpsInLoops: "Should warps be shown in loops? Ignored if warps or loops are disabled.",
      // Party
      partyName: "The name of the party you want to join",
      partyPassword: "The password of the party you want to join",
      // Debug       
      debug: "Enables/disables debug information",
      assetServerAddress: "The address of the server used to fetch map images and data"
    }
  };

  // src/pageutil.ts
  var createButton = (iconHtml, side, addBefore = void 0) => {
    const newButton = document.createElement("button");
    newButton.classList.add("iconButton");
    newButton.innerHTML = iconHtml;
    const controlsElement = document.getElementById(`${side}Controls`);
    if (addBefore) {
      controlsElement?.insertBefore(newButton, document.getElementById(addBefore));
    } else {
      controlsElement?.appendChild(newButton);
    }
    return newButton;
  };

  // src/main.ts
  var minimapButtonHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M4 12L20 12M12 4L12 20M6.2 20H17.8C18.9201 20 19.4802 20 19.908 19.782C20.2843 19.5903 20.5903 19.2843 20.782 18.908C21 18.4802 21 17.9201 21 16.8V7.2C21 6.0799 21 5.51984 20.782 5.09202C20.5903 4.71569 20.2843 4.40973 19.908 4.21799C19.4802 4 18.9201 4 17.8 4H6.2C5.0799 4 4.51984 4 4.09202 4.21799C3.71569 4.40973 3.40973 4.71569 3.21799 5.09202C3 5.51984 3 6.07989 3 7.2V16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.71569 19.5903 4.09202 19.782C4.51984 20 5.07989 20 6.2 20Z" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  var minimapToggleButton = createButton(minimapButtonHTML, "right" /* Right */, "controls-fullscreen");
  minimapToggleButton.style.display = "";
  var extraLocationInfo = document.createElement("span");
  extraLocationInfo.classList.add("infoText");
  extraLocationInfo.classList.add("nofilter");
  extraLocationInfo.style.marginBottom = "8px";
  extraLocationInfo.style.display = "none";
  extraLocationInfo.style.textShadow = "2px 4px 4px black";
  canvas.after(extraLocationInfo);
  minimapToggleButton.onclick = () => {
    values.hideMinimap = !values.hideMinimap;
    updateVisbility();
    updateExtraLocationInfo();
  };
  var updateExtraLocationInfo = () => {
    const shouldBeVisible = values.extraLocationInfo && !values.hideMinimap;
    extraLocationInfo.style.display = shouldBeVisible ? "" : "none";
    if (shouldBeVisible) {
      const [px, py] = getPlayerCoords();
      extraLocationInfo.textContent = `Map Id: ${getMapId()}, x: ${px}, y: ${py}`;
    }
    if (values.debug) console.log(`Updated extra location info: Visible: ${shouldBeVisible}, Text: ${extraLocationInfo.textContent}`);
  };
  var wasGameLoaded = false;
  var update2 = () => {
    if (isGameLoaded()) {
      if (!wasGameLoaded) {
        wasGameLoaded = true;
        onGameLoaded();
      }
      update();
      draw();
    }
    setTimeout(update2, 1e3 / values.updatesPerSecond);
  };
  var onGameLoaded = () => {
    updateVisbility();
    updateExtraLocationInfo();
  };
  setTimeout(update2, 1e3 / values.updatesPerSecond);
  setInterval(updateExtraLocationInfo, 1e3 / 20);
})();

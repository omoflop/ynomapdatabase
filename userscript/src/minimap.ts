import { LazyImage } from "./lazyimage";
import * as Settings from "./settings";
import * as Game from "./game";
import { ExitTeleport, MapLoopType, MapTeleport, ProtoTeleport, areBidirectional } from "./minimaptypes";
import * as Util from "./util";

// The element used for displaying the minimap, can be disabled and customized in the settings. Hidden by default until a map is loaded in-game
export const canvas = document.createElement("canvas");
canvas.width = 512;
canvas.height = 512;

canvas.style.userSelect = "none";
canvas.style.display = "none";
canvas.style.marginBottom = "2px";

// Inserted above chat
document.getElementById("chatbox")?.insertBefore(canvas, document.getElementById("chatboxContent"));

// The context for the canvas used for drawing the minimap
const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;
const textLineHeight = ctx.measureText('M').width * 1.5;
ctx.imageSmoothingEnabled = false;


// How far the map has been panned in both directions
let panX: number = 0;
let panY: number = 0;

// How far the map is zoomed in or out
let zoom: number = 1;

// The mouse position in map-space
let mouseX: number = 0;
let mouseY: number = 0;

// Used to determine how far to offset the mouse when panning the minimap
let panOffsetX: number = 0;
let panOffsetY: number = 0;

// Saves whether the mouse has been pressed ontop of the minimap element (used for dragging the map)
let mouseDown: boolean = false;

// The game map image displayed on the minimap 
let mapImage: LazyImage | undefined;

// The id of the map on the previous update. Used to determine when the map switches
let previousMapId: string = "";

// The position of the player, but smoothed between whole numbers given by the game to give the illusion of more precise movement
let displayPlayerX = 0;
let displayPlayerY = 0;

// Determines whether the map should be centered on the player (set to false when the map is panned by the user, true when map is right-clicked)
let lockOnPlayer: boolean = true;

// Determines how the map loops on the minimap
let loopType: MapLoopType = MapLoopType.None;

// A list of teleports that lead to new maps
const exitTeleports: Array<ExitTeleport> = [];

// A list of teleports that lead to the same map, seperated so they get drawn differently
const mapTeleports: Array<MapTeleport> = [];

export const updateVisbility = () => {
    // Hide the minimap if it's set in the settings, or if the game isn't even loaded
    if (Settings.values.hideMinimap || Game.isGameLoaded()) {
        canvas.style.visibility = "none";
        return;
    }

    // Hide the minimap if the image isn't loaded AND the related setting is enabled 
    if ((mapImage == undefined || !mapImage.imageReady) && Settings.values.hideMinimapIfNoMap) {
        canvas.style.visibility = "none";
        return;
    }

    canvas.style.visibility = "";
};

const centerOnPlayer = () => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    panX = centerX - (displayPlayerX + 8) * zoom;
    panY = centerY - (displayPlayerY + 8) * zoom;
};

export const update = () => {
    let mapId = Game.getMapId();
    if (mapId && mapId != previousMapId) {
        if (Settings.values.debug) {
            console.log(`New map loaded: ${mapId} (prev ${previousMapId})`);
            onMapChanged(mapId);
        }
    }
    previousMapId = mapId;

    let [playerX, playerY]: Array<number> = Game.getPlayerCoords();

    // Update player position if they're too far
    if (Util.dist(playerY * 16, displayPlayerX, playerY * 16, displayPlayerY) > 16 * 4) {
        displayPlayerX = playerX * 16;
        displayPlayerY = playerY * 16;
    }

    const framerateDelta = Settings.values.updatesPerSecond / 30;

    displayPlayerX = Util.approach(displayPlayerX, playerX * 16, framerateDelta);
    displayPlayerY = Util.approach(displayPlayerY, playerY * 16, framerateDelta);

    if (lockOnPlayer) centerOnPlayer();
};

export const draw = () => {
    // Skip drawing if the minimap isn't visible
    if (canvas.style.visibility == "") return;

    let [playerX, playerY]: Array<Number> = Game.getPlayerCoords();

    // Setup draw transforms
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(
        zoom, 0,    // Scale X
        0, zoom,    // Scale Y
        panX,  // Translate X
        panY   // Translate Y
    );
    
    let xx = 0;
    let yy = 0;
    
    if (Settings.values.enableLooping) {
        if (loopType == MapLoopType.Both || loopType == MapLoopType.Horizontal) xx = 1;
        if (loopType == MapLoopType.Both || loopType == MapLoopType.Vertical) yy = 1;
    }

    if (mapImage?.imageReady) {
        for (let x = -xx; x <= xx; x++) 
        for (let y = -yy; y <= yy; y++) {
            const loopX = canvas.width * x;
            const loopY = canvas.height * y;
                
            ctx.drawImage(mapImage.value, loopX, loopY, canvas.width, canvas.height);
        }
    }
    
    for (let x = -xx; x <= xx; x++) 
    for (let y = -yy; y <= yy; y++) {
        const inLoop = x != 0 || y != 0;
        const loopX = canvas.width * x;
        const loopY = canvas.height * y;

        if (!inLoop || Settings.values.showWarpsInLoops) {
            mapTeleports.forEach(warp => {
                const warpX = warp.x*16 + 8 + loopX;
                const warpY = warp.y*16 + 8 + loopY;

                ctx.fillStyle = warp.color;
                ctx.beginPath();
                ctx.arc(warpX, warpY, 8, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "white";
                ctx.beginPath();
                ctx.moveTo(warpX, warpY);
                ctx.lineTo(warp.destinationX * 16 + 8 + loopX, warp.destinationY * 16 + 8 + loopY);
                ctx.stroke();
            });

            exitTeleports.forEach(exit => {
                const tx = exit.x * 16 + 8 + loopX;
                const ty = exit.y * 16 + 8 + loopY;
                
                let textSize = 18 / zoom;

                ctx.font = `bold ${Math.round(textSize)}px Arial`;
                ctx.textAlign = 'center';
                ctx.lineWidth = 1;

                const maxDistance = 200;
                const minScale = 0.5;
                const minAlpha = Settings.values.farWarpVisibility;

                exit.destinationNameLines.forEach((text, lineIndex) => {
                    const y = ty + (lineIndex * textLineHeight / zoom);
                    const distance = Util.dist(tx, mouseX, y, mouseY);

                    // Calculate scale and alpha based on distance
                    const distanceRatio = Math.min(distance / maxDistance, 1);
                    const scale = 1 - (distanceRatio * (1 - minScale));
                    const alpha = 1 - (distanceRatio * (1 - minAlpha));

                    // Save the current context state
                    ctx.save();

                    // Apply transformations
                    ctx.translate(tx, y);
                    ctx.scale(scale, scale);
                    ctx.translate(-tx, -y);

                    // Draw the outline with adjusted alpha
                    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                    ctx.strokeText(text, tx, y);

                    // Draw the fill with adjusted alpha
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.fillText(text, tx, y);

                    // Restore the context state
                    ctx.restore();
                });
            });
        }
    }
};

const onMapChanged = (mapId: string) => {

    mapImage = new LazyImage(`${Settings.values.assetServerAddress}/${gameId}/${mapId}/map.png?idk-what-im-doing`);
    mapImage.onLoad = () => {
        updateVisbility();
    };

    loopType = MapLoopType.None;
    exitTeleports.length = 0;
    mapTeleports.length = 0;

    const mapMetaUrl = `${Settings.values.assetServerAddress}/${gameId}/${mapId}/metadata.json?idk-what-im-doing`;
    fetch(mapMetaUrl)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load metadata from url: ${mapMetaUrl}`);
            return response.json();
        })
        .then(data => {
            loopType = (data.loop_type ?? MapLoopType.None) as MapLoopType;
            const teleportData = (data.teleportData ?? []) as Array<ProtoTeleport>;
            const colorMap = new Map<string, string>();

            const mapTeleportData = teleportData.filter(
                teleport => teleport.destination_map_id == mapId
            );

            mapTeleportData.forEach((teleport, index) => {
                const locationKey = [
                    teleport.x,
                    teleport.y,
                    teleport.destination_x,
                    teleport.destination_y,
                ].join(',');
                const reverseKey = [
                    teleport.destination_x,
                    teleport.destination_y,
                    teleport.x,
                    teleport.y,
                ].join(',');

                let color: string;

                if (colorMap.has(locationKey)) {
                    color = colorMap.get(locationKey)!;
                } else if (colorMap.has(reverseKey)) {
                    color = colorMap.get(reverseKey)!;
                } else {
                    const partner = mapTeleportData.find((otherTeleport, otherIndex) => index !== otherIndex && areBidirectional(teleport, otherTeleport, mapId));
                    color = Util.generateRandomColor();
                    colorMap.set(locationKey, color);
                    if (partner) {
                        const partnerKey = [
                            partner.x,
                            partner.y,
                            partner.destination_x,
                            partner.destination_y,
                        ].join(',');
                        colorMap.set(partnerKey, color);
                    }
                }

                mapTeleports.push({
                    x: teleport.x,
                    y: teleport.y,
                    destinationX: teleport.destination_x,
                    destinationY: teleport.destination_y,
                    color: color
                });
            });

            const exitTeleportData = teleportData.filter(
                teleport => teleport.destination_map_id != mapId
            );

            exitTeleportData.forEach((teleport) => {
                const destinationName = teleport.destination_name ? teleport.destination_name : teleport.destination_map_id;

                exitTeleports.push({
                    x: teleport.x,
                    y: teleport.y,
                    destinationNameLines: Util.wrapText(destinationName)
                });
            });
        })
        .catch(error => {
            if (Settings.values.debug) console.error(error);
        });
};
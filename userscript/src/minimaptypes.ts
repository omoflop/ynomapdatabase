export enum MapLoopType {
    None = "none",
    Vertical = "vertical",
    Horizontal = "horizontal",
    Both = "both"
}

export interface ExitTeleport {
    x : number,
    y : number,
    destinationNameLines : string[]
}

export interface MapTeleport {
    x : number,
    y : number,
    destinationX : number,
    destinationY : number,
    color : string
}

export interface ProtoTeleport {
    x : number,
    y : number,
    destination_x : number,
    destination_y : number,
    destination_map_id : string,
    destination_name : string | undefined
}

export const areBidirectional = (teleport1 : ProtoTeleport, teleport2 : ProtoTeleport, currentMapId: string) => {
    return (
        teleport1.destination_map_id === currentMapId &&
        teleport2.destination_map_id === currentMapId &&
        teleport1.x === teleport2.destination_x &&
        teleport1.y === teleport2.destination_y &&
        teleport2.x === teleport1.destination_x &&
        teleport2.y === teleport1.destination_y
    );
};
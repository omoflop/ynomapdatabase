export const isGameLoaded = () => {
    return typeof gameId !== 'undefined' && typeof cachedMapId !== 'undefined' && typeof easyrpgPlayer !== 'undefined' && typeof easyrpgPlayer.api !== 'undefined';
};

export const getGameId = () => gameId;
export const getMapId = () => cachedMapId;
export const getPlayerCoords = () => easyrpgPlayer.api.getPlayerCoords();
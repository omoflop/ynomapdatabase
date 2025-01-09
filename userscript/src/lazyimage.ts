import * as Settings from "./settings";

export class LazyImage {
    value: HTMLImageElement;

    imageReady : boolean = false;
    onLoad : Function | undefined = undefined
    constructor(url : string) {
        this.value = new Image();
        this.value.crossOrigin = "anonymous";
        this.value.onload = () => {
            this.imageReady = true;
            if (this.onLoad) this.onLoad();
        };
        this.value.onerror = () => {
            if (Settings.values.debug) console.error(`Failed to load image from url: ${url}`);
        };
        this.value.src = url;
    }
}
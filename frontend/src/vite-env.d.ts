/// <reference types="vite/client" />

declare module 'gif.js' {
  export default class GIF {
    constructor(options?: Record<string, any>);
    addFrame(element: CanvasImageSource | ImageData, options?: Record<string, any>): void;
    on(event: string, callback: (...args: any[]) => void): void;
    render(): void;
    abort(): void;
  }
}

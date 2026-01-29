const ingestionBus = new EventTarget();

export function emitIngestionEvent(type, detail = {}) {
  ingestionBus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onIngestionEvent(type, listener) {
  ingestionBus.addEventListener(type, listener);
}

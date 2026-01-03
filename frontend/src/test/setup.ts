import "@testing-library/jest-dom/vitest";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}
	observe() {}
	unobserve() {}
	disconnect() {}
};

// Mock scrollTo
Element.prototype.scrollTo = () => {};

// Mock HTMLDialogElement methods
HTMLDialogElement.prototype.showModal = function () {};
HTMLDialogElement.prototype.close = function () {};

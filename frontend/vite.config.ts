/// <reference types="vitest" />
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			"/api": "http://localhost:4000",
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
	},
});

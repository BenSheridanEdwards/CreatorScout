import type { VisionData } from "../../shared/types/types.ts";
import { isConfirmedCreator } from "../vision/vision.ts";

/**
 * Call the TypeScript vision pipeline for an image and return a normalized result.
 * Only use when other analysis methods are inconclusive (confidence < 70%).
 */
export async function classifyWithVision(
	imagePath: string,
	threshold: number = 60, // Lower threshold since vision is used as fallback
): Promise<{ ok: boolean; data: VisionData }> {
	try {
		const [isConfirmed, data] = await isConfirmedCreator(imagePath, threshold);

		if (!data) {
			return {
				ok: false,
				data: { error: "vision_analysis_failed" } as VisionData,
			};
		}

		return {
			ok: isConfirmed,
			data: {
				confidence: data.confidence,
				reason: data.reason,
				indicators: data.indicators,
			} as VisionData,
		};
	} catch (e) {
		return {
			ok: false,
			data: { error: `vision_error: ${e}` } as VisionData,
		};
	}
}

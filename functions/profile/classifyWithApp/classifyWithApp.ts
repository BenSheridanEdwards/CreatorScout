import type { VisionData } from '../../shared/types/types.ts';
import { isConfirmedCreator } from '../vision/vision.ts';

/**
 * Call the TypeScript vision pipeline.
 * This replaces the Python version.
 */
export async function classifyWithApp(
  imagePath: string,
  threshold: number = 70
): Promise<{ ok: boolean; data: VisionData }> {
  try {
    const [isConfirmed, data] = await isConfirmedCreator(imagePath, threshold);

    if (!data) {
      return {
        ok: false,
        data: { error: 'vision_analysis_failed' } as VisionData,
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

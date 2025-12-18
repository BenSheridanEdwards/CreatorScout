/**
 * Vision AI for analyzing DM proof screenshots.
 * Verifies that a DM was successfully sent by analyzing the screenshot.
 */
import { readFileSync } from "node:fs";
import { OpenAI } from "openai";
import {
	OPENROUTER_API_KEY,
	VISION_MODEL,
} from "../../shared/config/config.ts";

const client = new OpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: OPENROUTER_API_KEY,
});

const DM_PROOF_PROMPT = `You are analyzing a screenshot of an Instagram Direct Message (DM) thread to verify if a message was successfully sent.

Your task is to determine if:
1. The screenshot shows a DM thread (not login page, error page, or other page)
2. A message appears in the thread that was sent by the current user
3. The message appears to be successfully delivered (not pending, not failed)

STRONG INDICATORS that DM was sent successfully:
- The screenshot shows a DM conversation thread (messages visible, input field at bottom)
- A message bubble appears on the right side (sent messages appear on right)
- The message text is visible and readable
- No error messages visible (like "Couldn't send", "Message failed", "Try again")
- No "pending" or "sending" indicators on the message
- The message appears in the conversation history

STRONG INDICATORS that DM failed or screenshot is wrong:
- Login page is visible
- Error page or "Something went wrong" message
- "Couldn't send" or "Message failed" error text
- Message appears on left side (received messages, not sent)
- No message visible in the thread
- Screenshot shows wrong page (profile, feed, etc.)

MODERATE INDICATORS:
- Input field is visible at bottom (good sign - we're in DM thread)
- Message timestamp is visible
- "Seen" or "Delivered" status visible
- Other messages in thread (indicates we're in correct thread)

Return EXACTLY this JSON:
{
  "dm_sent": true or false,
  "confidence": 0-100,
  "is_dm_thread": true or false,
  "message_visible": true or false,
  "error_detected": true or false,
  "indicators": ["Message visible on right side", "No error messages", "DM thread confirmed", ...] or [],
  "reason": "brief explanation of what you see (max 20 words)"
}`;

export interface DmProofAnalysisResult {
	dm_sent: boolean;
	confidence: number;
	is_dm_thread: boolean;
	message_visible: boolean;
	error_detected: boolean;
	indicators: string[];
	reason: string;
}

export async function analyzeDmProof(
	imagePath: string,
): Promise<DmProofAnalysisResult | null> {
	try {
		const imageBuffer = readFileSync(imagePath);
		const base64 = imageBuffer.toString("base64");

		const response = await client.chat.completions.create({
			model: VISION_MODEL,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: DM_PROOF_PROMPT },
						{
							type: "image_url",
							image_url: { url: `data:image/png;base64,${base64}` },
						},
					],
				},
			],
			max_tokens: 400,
			temperature: 0.0,
		});

		let text = response.choices[0]?.message?.content || "";
		text = text
			.trim()
			.replace(/^```json/, "")
			.replace(/^```/, "")
			.replace(/```$/, "");

		try {
			const parsed = JSON.parse(text.trim()) as DmProofAnalysisResult;
			return parsed;
		} catch (parseError) {
			console.error("Failed to parse DM proof vision response:", text);
			return null;
		}
	} catch (error) {
		console.error("DM proof vision analysis error:", error);
		return null;
	}
}



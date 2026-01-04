/**
 * Circuit Breaker Pattern for Instagram API rate limiting.
 *
 * Prevents cascading failures by temporarily stopping operations when Instagram
 * is returning errors or rate limiting us.
 */

export enum CircuitState {
	OPEN = "OPEN", // Allow requests (normal operation)
	CLOSED = "CLOSED", // Block requests (failure threshold reached)
	HALF_OPEN = "HALF_OPEN", // Test if service recovered
}

export interface CircuitBreakerConfig {
	/**
	 * Number of failures before opening circuit
	 */
	failureThreshold: number;

	/**
	 * Time in milliseconds before trying half-open state
	 */
	recoveryTimeout: number;

	/**
	 * Number of successes required to close circuit from half-open
	 */
	successThreshold: number;

	/**
	 * Time window in milliseconds to track failures
	 */
	timeWindow: number;
}

export interface CircuitBreakerStats {
	state: CircuitState;
	failures: number;
	successes: number;
	lastFailureTime: number | null;
	lastSuccessTime: number | null;
	totalRequests: number;
	totalFailures: number;
	totalSuccesses: number;
}

export class InstagramCircuitBreaker {
	private config: CircuitBreakerConfig;
	private state: CircuitState = CircuitState.OPEN;
	private failures = 0;
	private successes = 0;

	getConfig(): CircuitBreakerConfig {
		return this.config;
	}
	private lastFailureTime: number | null = null;
	private lastSuccessTime: number | null = null;
	private totalRequests = 0;
	private totalFailures = 0;
	private totalSuccesses = 0;
	private failureTimestamps: number[] = [];

	constructor(config: Partial<CircuitBreakerConfig> = {}) {
		this.config = {
			failureThreshold: 5,
			recoveryTimeout: 60000, // 1 minute
			successThreshold: 3,
			timeWindow: 300000, // 5 minutes
			...config,
		};
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		this.totalRequests++;

		if (!this.canExecute()) {
			throw new Error(
				`Circuit breaker is ${this.state}. Instagram appears to be rate limiting.`,
			);
		}

		try {
			const result = await fn();
			this.recordSuccess();
			return result;
		} catch (error) {
			this.recordFailure();
			throw error;
		}
	}

	/**
	 * Check if we can execute requests
	 */
	canExecute(): boolean {
		switch (this.state) {
			case CircuitState.CLOSED:
				if (this.shouldAttemptRecovery()) {
					this.state = CircuitState.HALF_OPEN;
					this.successes = 0;
					return true;
				}
				return false;

			case CircuitState.HALF_OPEN:
				return true;
			default:
				return true;
		}
	}

	/**
	 * Record a successful operation
	 */
	recordSuccess(): void {
		this.totalSuccesses++;
		this.lastSuccessTime = Date.now();

		if (this.state === CircuitState.HALF_OPEN) {
			this.successes++;
			if (this.successes >= this.config.successThreshold) {
				this.reset();
			}
		} else if (this.state === CircuitState.CLOSED) {
			// Unexpected success in closed state - reset
			this.reset();
		}
	}

	/**
	 * Record a failed operation
	 */
	recordFailure(): void {
		this.totalFailures++;
		this.failures++;
		this.lastFailureTime = Date.now();

		// Track failure timestamps for time window
		this.failureTimestamps.push(Date.now());

		// Remove old failures outside time window
		const cutoff = Date.now() - this.config.timeWindow;
		this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);

		// Check if we should open the circuit
		if (this.shouldOpenCircuit()) {
			this.state = CircuitState.CLOSED;
		}
	}

	/**
	 * Get current circuit breaker statistics
	 */
	getStats(): CircuitBreakerStats {
		return {
			state: this.state,
			failures: this.failures,
			successes: this.successes,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime,
			totalRequests: this.totalRequests,
			totalFailures: this.totalFailures,
			totalSuccesses: this.totalSuccesses,
		};
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.state = CircuitState.OPEN;
		this.failures = 0;
		this.successes = 0;
		this.lastFailureTime = null;
		this.lastSuccessTime = null;
		this.failureTimestamps = [];
	}

	/**
	 * Force the circuit breaker to open
	 */
	forceOpen(): void {
		this.state = CircuitState.CLOSED;
		this.lastFailureTime = Date.now();
	}

	/**
	 * Check if we should open the circuit based on failure threshold
	 */
	private shouldOpenCircuit(): boolean {
		return this.failureTimestamps.length >= this.config.failureThreshold;
	}

	/**
	 * Check if we should attempt recovery from closed state
	 */
	private shouldAttemptRecovery(): boolean {
		if (!this.lastFailureTime) return false;
		return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
	}
}

// Global circuit breaker instance for Instagram operations
let globalCircuitBreaker: InstagramCircuitBreaker | null = null;

/**
 * Get the global Instagram circuit breaker instance
 */
export function getInstagramCircuitBreaker(): InstagramCircuitBreaker {
	if (!globalCircuitBreaker) {
		globalCircuitBreaker = new InstagramCircuitBreaker({
			failureThreshold: 10, // 10 failures in time window
			recoveryTimeout: 120000, // 2 minutes recovery time
			successThreshold: 5, // 5 successes to close
			timeWindow: 600000, // 10 minute window
		});
	}
	return globalCircuitBreaker;
}

/**
 * Execute Instagram operation with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
	fn: () => Promise<T>,
	context: string = "instagram_operation",
): Promise<T> {
	const circuitBreaker = getInstagramCircuitBreaker();

	try {
		return await circuitBreaker.execute(fn);
	} catch (error) {
		const stats = circuitBreaker.getStats();
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes("Circuit breaker is CLOSED")) {
			console.warn(
				`🚫 ${context}: Circuit breaker open - Instagram rate limiting detected`,
			);
			console.warn(
				`   State: ${stats.state}, Failures: ${stats.failures}, Total: ${stats.totalFailures}`,
			);
			console.warn(
				`   Will retry in ${Math.ceil(circuitBreaker.getConfig().recoveryTimeout / 60000)} minutes`,
			);
		}

		throw error;
	}
}

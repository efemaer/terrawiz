/**
 * Mock implementations for testing
 */

import { ILogger, LogLevel, LogContext } from '../../src/interfaces/logger';
import {
  IHttpClient,
  HttpResponse,
  HttpRequestConfig,
  HttpHeaders,
} from '../../src/interfaces/http-client';
import { IVcsCache, IVcsRetryStrategy } from '../../src/interfaces/vcs-service';

/**
 * Mock logger implementation for testing
 */
export class MockLogger implements ILogger {
  public logs: Array<{
    level: string;
    message: string;
    context?: LogContext;
    error?: Error;
  }> = [];

  debug(message: string, context?: LogContext): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: LogContext): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: LogContext): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, context?: LogContext): void {
    this.logs.push({ level: 'error', message, context });
  }

  errorWithStack(message: string, error: Error, context?: LogContext): void {
    this.logs.push({ level: 'error', message, context, error });
  }

  child(_context: LogContext): ILogger {
    const child = new MockLogger();
    child.logs = this.logs; // Share logs array
    return child;
  }

  isLevelEnabled(_level: LogLevel): boolean {
    return true;
  }

  setLevel(_level: LogLevel): void {
    // Mock implementation
  }

  // Test utilities
  getLogs(
    level?: string
  ): Array<{ level: string; message: string; context?: LogContext; error?: Error }> {
    return level ? this.logs.filter(log => log.level === level) : this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }

  hasLogWithMessage(message: string, level?: string): boolean {
    const logs = this.getLogs(level);
    return logs.some(log => log.message.includes(message));
  }
}

/**
 * Mock HTTP client implementation for testing
 */
export class MockHttpClient implements IHttpClient {
  private responses = new Map<string, HttpResponse>();
  private requests: HttpRequestConfig[] = [];
  private defaultHeaders: HttpHeaders = {};
  private baseUrl = '';

  // Mock configuration methods
  setMockResponse(url: string, response: HttpResponse): void {
    this.responses.set(this.normalizeUrl(url), response);
  }

  setMockResponses(responses: Record<string, HttpResponse>): void {
    Object.entries(responses).forEach(([url, response]) => {
      this.setMockResponse(url, response);
    });
  }

  clearMockResponses(): void {
    this.responses.clear();
  }

  getRequests(): HttpRequestConfig[] {
    return [...this.requests];
  }

  clearRequests(): void {
    this.requests = [];
  }

  getLastRequest(): HttpRequestConfig | undefined {
    return this.requests[this.requests.length - 1];
  }

  // HTTP client implementation
  async get<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  async post<T = unknown>(
    url: string,
    data?: string | object | FormData | ArrayBuffer,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', body: data });
  }

  async put<T = unknown>(
    url: string,
    data?: string | object | FormData | ArrayBuffer,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', body: data });
  }

  async patch<T = unknown>(
    url: string,
    data?: string | object | FormData | ArrayBuffer,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', body: data });
  }

  async delete<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push(config);

    const normalizedUrl = this.normalizeUrl(config.url);
    const mockResponse = this.responses.get(normalizedUrl);

    if (!mockResponse) {
      throw new Error(`No mock response configured for ${config.method} ${config.url}`);
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    return {
      ...mockResponse,
      data: mockResponse.data as T,
    };
  }

  setDefaultHeaders(headers: HttpHeaders): void {
    this.defaultHeaders = { ...headers };
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  addRequestInterceptor(
    _interceptor: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>
  ): void {
    // Mock implementation - could store interceptors for testing
  }

  addResponseInterceptor(
    _onSuccess: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>,
    _onError?: (error: Error) => Promise<Error>
  ): void {
    // Mock implementation - could store interceptors for testing
  }

  private normalizeUrl(url: string): string {
    // Remove base URL and query parameters for matching
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    return fullUrl.split('?')[0];
  }
}

/**
 * Mock cache implementation for testing
 */
export class MockCache implements IVcsCache {
  private cache = new Map<string, { value: unknown; expiry?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiry = ttlMs ? Date.now() + ttlMs : undefined;
    this.cache.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  // Test utilities
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Mock retry strategy implementation for testing
 */
export class MockRetryStrategy implements IVcsRetryStrategy {
  public attempts: Array<{
    operation: string;
    attemptNumber: number;
    error?: Error;
    success: boolean;
  }> = [];

  private maxRetries: number;
  private retryDelay: number;

  constructor(maxRetries = 3, retryDelay = 100) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async execute<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const result = await operation();
        this.attempts.push({
          operation: context || 'unknown',
          attemptNumber: attempt,
          success: true,
        });
        return result;
      } catch (error) {
        lastError = error as Error;
        this.attempts.push({
          operation: context || 'unknown',
          attemptNumber: attempt,
          error: lastError,
          success: false,
        });

        if (attempt <= this.maxRetries && this.shouldRetry(lastError, attempt)) {
          await new Promise(resolve => setTimeout(resolve, this.getRetryDelay(attempt)));
          continue;
        }

        throw lastError;
      }
    }

    throw new Error(lastError?.message || 'Unknown error occurred');
  }

  shouldRetry(error: Error, attemptNumber: number): boolean {
    // Mock implementation - retry on network errors
    return (
      attemptNumber <= this.maxRetries &&
      (error.message.includes('network') || error.message.includes('timeout'))
    );
  }

  getRetryDelay(attemptNumber: number): number {
    return this.retryDelay * Math.pow(2, attemptNumber - 1);
  }

  // Test utilities
  getAttempts(): typeof this.attempts {
    return [...this.attempts];
  }

  clearAttempts(): void {
    this.attempts = [];
  }

  getTotalAttempts(): number {
    return this.attempts.length;
  }

  getSuccessfulAttempts(): number {
    return this.attempts.filter(a => a.success).length;
  }

  getFailedAttempts(): number {
    return this.attempts.filter(a => !a.success).length;
  }
}

/**
 * Mock factory for creating commonly used mock objects
 */
export class MockFactory {
  static createLogger(): MockLogger {
    return new MockLogger();
  }

  static createHttpClient(responses?: Record<string, HttpResponse>): MockHttpClient {
    const client = new MockHttpClient();
    if (responses) {
      client.setMockResponses(responses);
    }
    return client;
  }

  static createCache(): MockCache {
    return new MockCache();
  }

  static createRetryStrategy(maxRetries = 3, retryDelay = 100): MockRetryStrategy {
    return new MockRetryStrategy(maxRetries, retryDelay);
  }

  static createSuccessResponse<T>(data: T, status = 200): HttpResponse<T> {
    return {
      data,
      status,
      statusText: 'OK',
      headers: {},
      duration: 100,
      requestId: 'req-123',
    };
  }

  static createErrorResponse(status: number, statusText: string): HttpResponse {
    return {
      data: { error: statusText },
      status,
      statusText,
      headers: {},
      duration: 100,
      requestId: 'req-123',
    };
  }
}
